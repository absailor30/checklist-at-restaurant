-- The three helper functions used by the row-level security policies are
-- SECURITY DEFINER, which means they run with the definer's privileges. That
-- is necessary — they read the users table to resolve the caller's identity,
-- and the policies that protect that table would otherwise recurse.
--
-- Being SECURITY DEFINER, they must not be callable as arbitrary RPC
-- endpoints. Supabase exposes every function in the public schema at
-- /rest/v1/rpc/<name>, so by default anyone holding the anon key could invoke
-- them. They return only the caller's own identity, so the exposure is small,
-- but an unauthenticated caller has no reason to reach them at all.
--
-- EXECUTE is revoked from everyone and granted back only to authenticated,
-- which is the role whose queries actually evaluate the policies.

-- anon and authenticated are created by Supabase. Guarding on their existence
-- keeps this migration runnable against a plain PostgreSQL instance, which is
-- how it gets tested before being applied to the project.
do $$
declare
  fn text;
begin
  foreach fn in array array[
    'public.current_org_id()',
    'public.current_app_user_id()',
    'public.current_user_can(text)'
  ]
  loop
    execute format('revoke execute on function %s from public', fn);
    if exists (select 1 from pg_roles where rolname = 'anon') then
      execute format('revoke execute on function %s from anon', fn);
    end if;
    if exists (select 1 from pg_roles where rolname = 'authenticated') then
      execute format('grant execute on function %s to authenticated', fn);
    end if;
  end loop;
end $$;
