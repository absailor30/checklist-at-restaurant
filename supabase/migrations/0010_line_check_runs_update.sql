-- 0009 enabled RLS on line_check_runs with only a SELECT policy, which
-- silently blocked the manager L2/L3 submit route's UPDATE (l2/l3_completed_at).

create policy "Users can update runs for their org" on line_check_runs
  for update to authenticated using (
    exists (
      select 1 from outlets o
      where o.id = line_check_runs.outlet_id and o.org_id = current_org_id()
    )
  );
