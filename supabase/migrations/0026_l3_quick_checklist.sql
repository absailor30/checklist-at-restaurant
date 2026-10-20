-- L3's quick oversight checklist: one entry per outlet per day, yes/no with a comment per item.
create table if not exists l3_checks (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organisations(id) on delete cascade,
  outlet_id uuid not null references outlets(id) on delete cascade,
  check_date date not null,
  user_id uuid references users(id),
  created_at timestamptz not null default now(),
  unique (outlet_id, check_date)
);
create table if not exists l3_check_answers (
  check_id uuid not null references l3_checks(id) on delete cascade,
  item_key text not null,
  yes_no text,
  comment text,
  primary key (check_id, item_key)
);
alter table l3_checks enable row level security;
alter table l3_check_answers enable row level security;
