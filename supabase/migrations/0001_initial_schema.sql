-- Restaurant Checklist & Audit App — initial schema
--
-- Design notes for future readers:
--  * Every tenant-owned table carries org_id. Multi-tenancy is by column, not
--    by separate databases. Row-level security is defined in 0002_rls.sql.
--  * checklist_runs are materialised (one row per template/outlet/shift/date)
--    rather than computed on read. Overdue detection, dashboards and reports
--    all become plain indexed queries instead of date arithmetic at read time.
--  * submissions.id is supplied by the client, not generated here. That makes
--    every write idempotent and is the single foundation that lets offline
--    support be added later without redesigning the write path.
--  * lock_events is append-only. Nothing in the accountability trail is ever
--    updated or deleted; a correction is a new event.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------- tenancy

create table organisations (
  id                          uuid primary key default gen_random_uuid(),
  name                        text not null,
  -- how long an unlocked item stays open before it re-freezes
  default_unlock_window_minutes int not null default 30,
  -- how long after freezing before the next level up also gains unlock rights
  unlock_escalation_minutes   int not null default 60,
  -- how long after a due time before an item is considered missed
  overdue_grace_minutes       int not null default 15,
  settings                    jsonb not null default '{}'::jsonb,
  is_demo                     boolean not null default false,
  created_at                  timestamptz not null default now()
);

create table outlets (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references organisations(id) on delete cascade,
  name        text not null,
  timezone    text not null default 'Asia/Kolkata',
  address     text,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);
create index on outlets (org_id);

-- Roles are data, not an enum: every restaurant names its hierarchy
-- differently. `level` orders the chain; higher means more senior.
create table roles (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references organisations(id) on delete cascade,
  name        text not null,
  level       int not null,
  can_review  boolean not null default false,
  can_unlock  boolean not null default false,
  can_manage  boolean not null default false,   -- edit templates, staff, outlets
  created_at  timestamptz not null default now(),
  unique (org_id, name)
);
create index on roles (org_id, level);

create table users (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references organisations(id) on delete cascade,
  role_id       uuid not null references roles(id),
  -- auth_user_id links managers/owners to Supabase Auth (email+password).
  -- Floor staff have no auth row: they sign in by name + PIN on a shared
  -- device. A manager approving work must have a real account, not a 4-digit
  -- PIN, or the audit trail is worthless.
  auth_user_id  uuid unique,
  name          text not null,
  phone         text,
  email         text,
  pin_hash      text,
  pin_set_at    timestamptz,
  is_active     boolean not null default true,
  created_at    timestamptz not null default now()
);
create index on users (org_id, is_active);

create table user_outlets (
  user_id   uuid not null references users(id) on delete cascade,
  outlet_id uuid not null references outlets(id) on delete cascade,
  primary key (user_id, outlet_id)
);

-- Who is notified about whom, and how long before it climbs a level.
create table reporting_chain (
  id                      uuid primary key default gen_random_uuid(),
  org_id                  uuid not null references organisations(id) on delete cascade,
  role_id                 uuid not null references roles(id) on delete cascade,
  reports_to_role_id      uuid references roles(id) on delete cascade,
  reports_to_user_id      uuid references users(id) on delete cascade,
  escalation_after_minutes int not null default 60,
  created_at              timestamptz not null default now(),
  constraint reports_to_exactly_one check (
    (reports_to_role_id is not null)::int + (reports_to_user_id is not null)::int = 1
  ),
  unique (org_id, role_id)
);

-- ---------------------------------------------------------------- checklists

create table shifts (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references organisations(id) on delete cascade,
  outlet_id     uuid not null references outlets(id) on delete cascade,
  name          text not null,                    -- Opening / Mid / Closing
  start_time    time not null,
  end_time      time not null,
  -- ISO weekdays this shift runs; 1 = Monday .. 7 = Sunday
  days_of_week  int[] not null default '{1,2,3,4,5,6,7}',
  sort_order    int not null default 0,
  is_active     boolean not null default true,
  created_at    timestamptz not null default now()
);
create index on shifts (outlet_id, is_active);

create table checklist_templates (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references organisations(id) on delete cascade,
  -- null outlet_id means the template applies to every outlet in the org
  outlet_id   uuid references outlets(id) on delete cascade,
  role_id     uuid not null references roles(id) on delete cascade,
  shift_id    uuid not null references shifts(id) on delete cascade,
  title       text not null,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);
create index on checklist_templates (org_id, shift_id, role_id) where is_active;

create type proof_type as enum ('none', 'photo', 'number', 'text');

create table checklist_items (
  id                 uuid primary key default gen_random_uuid(),
  org_id             uuid not null references organisations(id) on delete cascade,
  template_id        uuid not null references checklist_templates(id) on delete cascade,
  title              text not null,
  description        text,
  sort_order         int not null default 0,
  proof              proof_type not null default 'none',
  proof_required     boolean not null default false,
  requires_approval  boolean not null default false,
  -- minutes after the shift's start_time by which this must be done
  due_offset_minutes int not null default 0,
  -- for proof = 'number', e.g. a fridge that must read between -22 and -18
  min_value          numeric,
  max_value          numeric,
  unit               text,
  is_active          boolean not null default true,
  created_at         timestamptz not null default now()
);
create index on checklist_items (template_id, sort_order);

-- ---------------------------------------------------------------- runs

create type run_status as enum ('pending', 'in_progress', 'complete', 'missed');

create table checklist_runs (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references organisations(id) on delete cascade,
  outlet_id    uuid not null references outlets(id) on delete cascade,
  template_id  uuid not null references checklist_templates(id) on delete cascade,
  shift_id     uuid not null references shifts(id) on delete cascade,
  run_date     date not null,
  status       run_status not null default 'pending',
  -- absolute deadline boundaries, resolved from the shift in the outlet's
  -- timezone at creation time so later timezone or shift edits cannot
  -- retroactively change whether past work was on time
  starts_at    timestamptz not null,
  ends_at      timestamptz not null,
  created_at   timestamptz not null default now(),
  unique (template_id, outlet_id, run_date)
);
create index on checklist_runs (outlet_id, run_date);
create index on checklist_runs (org_id, status);

create type submission_status as enum (
  'submitted',            -- done by staff, no approval needed or not yet reviewed
  'approved',
  'rejected',
  'completed_by_manager', -- manager did the task themselves
  'waived'                -- genuinely not applicable today
);

create table submissions (
  -- client-generated: makes retries idempotent and enables offline later
  id                 uuid primary key,
  org_id             uuid not null references organisations(id) on delete cascade,
  outlet_id          uuid not null references outlets(id) on delete cascade,
  run_id             uuid not null references checklist_runs(id) on delete cascade,
  checklist_item_id  uuid not null references checklist_items(id) on delete cascade,
  user_id            uuid not null references users(id),
  value_number       numeric,
  value_text         text,
  photo_path         text,
  comment            text,
  status             submission_status not null default 'submitted',
  -- true when value_number fell outside the item's min/max bounds
  out_of_bounds      boolean not null default false,
  -- true when submitted after the item's due time (via an unlock)
  was_late           boolean not null default false,
  device_captured_at timestamptz,
  submitted_at       timestamptz not null default now(),
  reviewed_by        uuid references users(id),
  reviewed_at        timestamptz,
  review_note        text,
  -- one live submission per item per run; corrections supersede via
  -- superseded_by rather than deleting history
  superseded_by      uuid references submissions(id)
);
create unique index submissions_one_live_per_item
  on submissions (run_id, checklist_item_id) where superseded_by is null;
create index on submissions (org_id, submitted_at desc);
create index on submissions (outlet_id, submitted_at desc);
create index on submissions (user_id, submitted_at desc);

-- ---------------------------------------------------------------- lockout

create type lock_state as enum ('locked', 'unlocked', 'resolved');

-- Current lock state for one item within one run. Exactly one row per
-- (run, item) that has ever frozen.
create table item_locks (
  id                 uuid primary key default gen_random_uuid(),
  org_id             uuid not null references organisations(id) on delete cascade,
  outlet_id          uuid not null references outlets(id) on delete cascade,
  run_id             uuid not null references checklist_runs(id) on delete cascade,
  checklist_item_id  uuid not null references checklist_items(id) on delete cascade,
  state              lock_state not null default 'locked',
  locked_at          timestamptz not null default now(),
  -- 0 = only the direct manager (M1) may unlock
  -- 1 = M2 may unlock as well (M1 keeps the right), and so on up the chain
  escalation_level   int not null default 0,
  escalates_at       timestamptz,     -- when the next level gains unlock rights
  unlocked_by        uuid references users(id),
  unlocked_at        timestamptz,
  unlock_expires_at  timestamptz,     -- after this it re-freezes
  unlock_comment     text,
  resolved_at        timestamptz,
  unique (run_id, checklist_item_id)
);
create index on item_locks (org_id, state);
create index on item_locks (state, escalates_at) where state = 'locked';
create index on item_locks (state, unlock_expires_at) where state = 'unlocked';

create type lock_event_kind as enum (
  'frozen', 'unlocked', 'refrozen', 'escalated', 'manager_completed', 'waived'
);

-- Append-only audit trail. Never updated, never deleted. This is the record
-- that has to stand up in a food-safety inspection or a staff dispute.
create table lock_events (
  id                 uuid primary key default gen_random_uuid(),
  org_id             uuid not null references organisations(id) on delete cascade,
  run_id             uuid not null references checklist_runs(id) on delete cascade,
  checklist_item_id  uuid not null references checklist_items(id) on delete cascade,
  event              lock_event_kind not null,
  actor_user_id      uuid references users(id),   -- null for system events
  from_level         int,
  to_level           int,
  comment            text,
  created_at         timestamptz not null default now()
);
create index on lock_events (run_id, created_at);
create index on lock_events (org_id, created_at desc);

-- Append-only is enforced by row-level security in 0002: lock_events grants
-- only SELECT and INSERT, and UPDATE and DELETE are denied outright.
--
-- Rewrite rules were used here originally and had to be removed: they also
-- rewrite the system's referential-integrity queries, which made it impossible
-- to delete an organisation once it had any lock events. See 0003.

-- ---------------------------------------------------------------- notifications

create table notifications (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references organisations(id) on delete cascade,
  user_id       uuid not null references users(id) on delete cascade,
  kind          text not null,
  title         text not null,
  body          text,
  payload       jsonb not null default '{}'::jsonb,
  sent_channels text[] not null default '{}',
  read_at       timestamptz,
  created_at    timestamptz not null default now()
);
create index on notifications (user_id, read_at, created_at desc);

create table push_subscriptions (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references organisations(id) on delete cascade,
  user_id     uuid not null references users(id) on delete cascade,
  endpoint    text not null unique,
  p256dh      text not null,
  auth        text not null,
  created_at  timestamptz not null default now()
);
