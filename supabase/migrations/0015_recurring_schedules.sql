-- Recurring schedule builder (#3): named recurring tasks (weekly audits,
-- monthly deep-cleans, etc.) that sit alongside the fixed daily L1/L2/L3
-- line check — a separate system entirely, so the existing daily flow is
-- untouched.

create table if not exists schedules (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organisations(id) on delete cascade,
  outlet_id uuid references outlets(id) on delete cascade, -- null = every outlet
  title text not null,
  frequency text not null check (frequency in ('daily','weekly','monthly')),
  day_of_week int check (day_of_week between 0 and 6), -- weekly only, 0=Sun
  day_of_month int check (day_of_month between 1 and 31), -- monthly only
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists schedule_completions (
  id uuid primary key default gen_random_uuid(),
  schedule_id uuid not null references schedules(id) on delete cascade,
  outlet_id uuid not null references outlets(id) on delete cascade,
  period_key text not null, -- e.g. '2026-09-22', '2026-W38', '2026-09'
  completed_by text,
  completed_at timestamptz not null default now(),
  note text,
  unique (schedule_id, outlet_id, period_key)
);

alter table schedules enable row level security;
alter table schedule_completions enable row level security;

create policy "Users can view schedules for their org" on schedules
  for select to authenticated using (org_id = current_org_id());
create policy "L3 can manage schedules for their org" on schedules
  for all to authenticated using (org_id = current_org_id() and current_user_can('manage'))
  with check (org_id = current_org_id() and current_user_can('manage'));

create policy "Users can view completions for their org" on schedule_completions
  for select to authenticated using (
    exists (select 1 from schedules s where s.id = schedule_completions.schedule_id and s.org_id = current_org_id())
  );
create policy "Users can record completions for their org" on schedule_completions
  for insert to authenticated with check (
    exists (select 1 from schedules s where s.id = schedule_completions.schedule_id and s.org_id = current_org_id())
  );
