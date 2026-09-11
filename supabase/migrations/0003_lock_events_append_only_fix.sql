-- Fix: the append-only RULEs on lock_events blocked cascade deletes.
--
-- 0001 enforced "never update, never delete" with rewrite rules. Those rules
-- apply to the system's own referential-integrity queries too, so deleting an
-- organisation failed with:
--
--   referential integrity query on "organisations" from constraint
--   "lock_events_org_id_fkey" on "lock_events" gave unexpected result
--
-- meaning an organisation could never be removed once it had any lock events.
--
-- Append-only is still enforced, by row-level security rather than by rules:
-- 0002 grants lock_events only SELECT and INSERT to authenticated users, and
-- with no UPDATE or DELETE policy those operations are denied. The practical
-- guarantee is unchanged for every application caller; what changes is that
-- the database can once again cascade a delete, and an administrator holding
-- the service role can remove an organisation outright.

drop rule if exists lock_events_no_update on lock_events;
drop rule if exists lock_events_no_delete on lock_events;

-- Deny update and delete explicitly, so the intent is visible in the schema
-- rather than implied by the absence of a policy.
drop policy if exists lock_events_no_update on lock_events;
drop policy if exists lock_events_no_delete on lock_events;

create policy lock_events_no_update on lock_events
  for update to authenticated using (false) with check (false);

create policy lock_events_no_delete on lock_events
  for delete to authenticated using (false);
