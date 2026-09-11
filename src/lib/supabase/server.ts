import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { env } from '@/lib/env';

// Server-side client carrying the manager's own Supabase Auth session, so
// every query runs under the row-level security policies rather than
// bypassing them. Managers approve and unlock work, so their actions must be
// attributable to a real account, not a shared device PIN.
export function createServerSupabase() {
  const store = cookies();
  return createServerClient(env.supabaseUrl, env.supabaseAnonKey, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list: { name: string; value: string; options: CookieOptions }[]) => {
        try {
          for (const { name, value, options } of list) store.set(name, value, options);
        } catch {
          // Called from a Server Component, where cookies are read-only.
          // Session refresh is handled in route handlers instead.
        }
      },
    },
  });
}

/** The app-level user row for the signed-in manager, or null. */
export async function currentManager() {
  const supabase = createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from('users')
    .select('id, org_id, name, email, role_id, roles!inner(id, name, level, can_review, can_unlock, can_manage)')
    .eq('auth_user_id', user.id)
    .maybeSingle();
  if (!data) return null;

  const role: any = Array.isArray(data.roles) ? data.roles[0] : data.roles;
  return {
    id: data.id, orgId: data.org_id, name: data.name, email: data.email,
    roleId: data.role_id, roleName: role.name, level: role.level,
    canReview: role.can_review, canUnlock: role.can_unlock, canManage: role.can_manage,
  };
}

export type Manager = NonNullable<Awaited<ReturnType<typeof currentManager>>>;
