-- One row per reminder actually sent, so a shift's 60/15/5-minute reminder is never sent twice.
create table if not exists reminder_log (
  outlet_id uuid not null references outlets(id) on delete cascade,
  run_date date not null,
  shift text not null,
  offset_min int not null,
  sent_at timestamptz not null default now(),
  primary key (outlet_id, run_date, shift, offset_min)
);
alter table reminder_log enable row level security;
