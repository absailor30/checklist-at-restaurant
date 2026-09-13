-- Fix: manager dashboard couldn't see staff-submitted stations/answers because
-- line_check_runs/stations/answers had no RLS policies (staff writes go through
-- the admin client, but manager reads use the RLS-bound client).

alter table line_check_runs enable row level security;
alter table line_check_stations enable row level security;
alter table line_check_answers enable row level security;
alter table line_check_questions enable row level security;

create policy "Users can view runs for their org" on line_check_runs
  for select to authenticated using (
    exists (
      select 1 from outlets o
      where o.id = line_check_runs.outlet_id and o.org_id = current_org_id()
    )
  );

create policy "Users can view stations for their org" on line_check_stations
  for select to authenticated using (
    exists (
      select 1 from line_check_runs r
      join outlets o on r.outlet_id = o.id
      where r.id = line_check_stations.run_id and o.org_id = current_org_id()
    )
  );

create policy "Users can view answers for their org" on line_check_answers
  for select to authenticated using (
    exists (
      select 1 from line_check_stations s
      join line_check_runs r on s.run_id = r.id
      join outlets o on r.outlet_id = o.id
      where s.id = line_check_answers.station_id and o.org_id = current_org_id()
    )
  );

create policy "Authenticated users can view questions" on line_check_questions
  for select to authenticated using (true);
