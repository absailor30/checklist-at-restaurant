-- L1/L2/L3 hierarchy rework: each outlet has 3 L1 managers, one per shift
-- (morning/afternoon/evening), each running the full 3-station L1 pass once
-- per shift per day. Previously there was one run per outlet per day; now
-- there are up to three (one per shift).

alter table line_check_runs add column if not exists shift text
  check (shift in ('morning', 'afternoon', 'evening')) not null default 'morning';

alter table line_check_runs drop constraint if exists line_check_runs_outlet_id_run_date_key;
alter table line_check_runs add constraint line_check_runs_outlet_shift_date_key
  unique (outlet_id, run_date, shift);

-- L1 users are tagged with the shift they work, so the app knows which
-- shift's run to sync to without guessing.
alter table users add column if not exists shift text
  check (shift in ('morning', 'afternoon', 'evening'));
