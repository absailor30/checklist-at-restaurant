-- Row-level security: tenant isolation enforced by the database itself.
--
-- Two classes of caller:
--   1. Managers and owners sign in with Supabase Auth. Their requests carry a
--      JWT, auth.uid() resolves to users.auth_user_id, and the policies below
--      confine them to their own organisation.
--   2. Floor staff have no auth session — they tap a name and a PIN on a
--      shared device. Their requests go through this app's own server routes,
--      which verify the PIN and use the service role key. The service role
--      bypasses RLS by design, so every staff-facing server route MUST scope
--      its own queries by org_id and outlet_id explicitly. RLS is the safety
--      net for authenticated clients; it is not a substitute for correct
--      server-side scoping.
--
-- Anything not matched by a policy is denied. There is no default-allow here.

-- The organisation of the currently authenticated user. Marked stable so
-- Postgres evaluates it once per statement rather than once per row.
create or replace function current_org_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select org_id from users where auth_user_id = auth.uid() limit 1;
$$;

create or replace function current_app_user_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id from users where auth_user_id = auth.uid() limit 1;
$$;

-- True when the signed-in user's role carries the named permission.
create or replace function current_user_can(permission text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select case permission
              when 'review' then r.can_review
              when 'unlock' then r.can_unlock
              when 'manage' then r.can_manage
              else false
            end
       from users u join roles r on r.id = u.role_id
      where u.auth_user_id = auth.uid()
      limit 1),
    false);
$$;

do $$
declare t text;
begin
  foreach t in array array[
    'organisations','outlets','roles','users','user_outlets','reporting_chain',
    'shifts','checklist_templates','checklist_items','checklist_runs',
    'submissions','item_locks','lock_events','notifications','push_subscriptions'
  ]
  loop
    execute format('alter table %I enable row level security', t);
    execute format('alter table %I force row level security', t);
  end loop;
end $$;

-- Read access: any authenticated member of the organisation may read that
-- organisation's rows. Deliberately broad on reads — a manager needs to see
-- staff, outlets, templates and history to do their job at all.
do $$
declare t text;
begin
  foreach t in array array[
    'outlets','roles','users','reporting_chain','shifts','checklist_templates',
    'checklist_items','checklist_runs','submissions','item_locks','lock_events'
  ]
  loop
    execute format(
      'create policy %I on %I for select to authenticated using (org_id = current_org_id())',
      t || '_read_own_org', t);
  end loop;
end $$;

create policy organisations_read_own on organisations
  for select to authenticated using (id = current_org_id());

create policy user_outlets_read_own on user_outlets
  for select to authenticated using (
    exists (select 1 from users u where u.id = user_outlets.user_id
              and u.org_id = current_org_id()));

-- Configuration is writable only by roles flagged can_manage.
do $$
declare t text;
begin
  foreach t in array array[
    'outlets','roles','users','reporting_chain','shifts',
    'checklist_templates','checklist_items'
  ]
  loop
    execute format(
      'create policy %I on %I for all to authenticated
         using (org_id = current_org_id() and current_user_can(''manage''))
         with check (org_id = current_org_id() and current_user_can(''manage''))',
      t || '_manage', t);
  end loop;
end $$;

-- Reviewing a submission: approve, reject, or record a manager completion.
-- Confined to the reviewer's own organisation and to roles that may review.
create policy submissions_review on submissions
  for update to authenticated
  using (org_id = current_org_id() and current_user_can('review'))
  with check (org_id = current_org_id() and current_user_can('review'));

-- Managers may insert a submission directly (the manager-completion and
-- waiver paths described in the spec).
create policy submissions_manager_insert on submissions
  for insert to authenticated
  with check (org_id = current_org_id() and current_user_can('review'));

-- Unlocking is restricted to roles that may unlock. Whether *this particular*
-- manager is high enough up the chain for *this particular* lock's escalation
-- level is decided in application code, which has the reporting chain to hand;
-- this policy is the coarse gate, not the whole rule.
create policy item_locks_unlock on item_locks
  for update to authenticated
  using (org_id = current_org_id() and current_user_can('unlock'))
  with check (org_id = current_org_id() and current_user_can('unlock'));

-- lock_events is append-only for everyone. The rules in 0001 already block
-- UPDATE and DELETE; this allows inserts by staff of the organisation.
create policy lock_events_insert on lock_events
  for insert to authenticated
  with check (org_id = current_org_id());

-- Notifications and push subscriptions are private to the recipient.
create policy notifications_own on notifications
  for select to authenticated using (user_id = current_app_user_id());

create policy notifications_mark_read on notifications
  for update to authenticated
  using (user_id = current_app_user_id())
  with check (user_id = current_app_user_id());

create policy push_subscriptions_own on push_subscriptions
  for all to authenticated
  using (user_id = current_app_user_id())
  with check (user_id = current_app_user_id());
