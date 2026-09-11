import { json } from '@/lib/no-store';
import { createAdminClient } from '@/lib/supabase/admin';
import { currentManager } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

// Managing staff: who works here, in what role, at which outlets.
export async function GET() {
  const manager = await currentManager();
  if (!manager) return json({ error: 'Not signed in.' }, { status: 401 });
  if (!manager.canManage) {
    return json({ error: 'Manager access required.' }, { status: 403 });
  }

  const db = createAdminClient();
  const [{ data: staff }, { data: roles }, { data: outlets }] = await Promise.all([
    db.from('users')
      .select('id, name, email, is_active, pin_set_at, role_id, user_outlets(outlet_id)')
      .eq('org_id', manager.orgId).order('name'),
    db.from('roles').select('id, name, level, can_review').eq('org_id', manager.orgId).order('level'),
    db.from('outlets').select('id, name').eq('org_id', manager.orgId).eq('is_active', true).order('name'),
  ]);

  return json({
    staff: (staff ?? []).map((u: any) => ({
      id: u.id, name: u.name, email: u.email, isActive: u.is_active,
      hasPin: Boolean(u.pin_set_at), roleId: u.role_id,
      outletIds: (Array.isArray(u.user_outlets) ? u.user_outlets : [u.user_outlets])
        .filter(Boolean).map((o: any) => o.outlet_id),
    })),
    roles: roles ?? [],
    outlets: outlets ?? [],
  });
}

export async function POST(request: Request) {
  const manager = await currentManager();
  if (!manager) return json({ error: 'Not signed in.' }, { status: 401 });
  if (!manager.canManage) {
    return json({ error: 'Manager access required.' }, { status: 403 });
  }

  const { action, userId, name, roleId, outletIds } = await request.json();
  const db = createAdminClient();

  if (action === 'add') {
    const staffName = String(name ?? '').trim();
    if (staffName.length < 2) return json({ error: 'Enter a name.' }, { status: 400 });

    const { data: role } = await db
      .from('roles').select('id').eq('id', roleId).eq('org_id', manager.orgId).maybeSingle();
    if (!role) return json({ error: 'Pick a role.' }, { status: 400 });

    const ids = Array.isArray(outletIds) ? outletIds : [];
    if (!ids.length) return json({ error: 'Pick at least one outlet.' }, { status: 400 });

    const { data: valid } = await db
      .from('outlets').select('id').eq('org_id', manager.orgId).in('id', ids);
    if ((valid?.length ?? 0) !== ids.length) {
      return json({ error: 'One of those outlets is not yours.' }, { status: 400 });
    }

    const id = crypto.randomUUID();
    // No PIN: staff set their own the first time they sign in, so nobody else
    // ever knows it.
    const { error } = await db.from('users').insert({
      id, org_id: manager.orgId, role_id: roleId, name: staffName,
      email: null, auth_user_id: null, pin_hash: null, pin_set_at: null,
    });
    if (error) return json({ error: error.message }, { status: 500 });

    await db.from('user_outlets').insert(
      ids.map((outletId: string) => ({ user_id: id, outlet_id: outletId }))
    );
    return json({ ok: true, id });
  }

  if (action === 'reset_pin') {
    // Clearing the PIN makes the next sign-in set a new one. Used when a staff
    // member forgets theirs.
    const { error } = await db.from('users')
      .update({ pin_hash: null, pin_set_at: null })
      .eq('id', userId).eq('org_id', manager.orgId);
    if (error) return json({ error: error.message }, { status: 500 });
    return json({ ok: true });
  }

  if (action === 'deactivate' || action === 'reactivate') {
    // Staff are deactivated, never deleted: their submissions are the audit
    // trail and must keep pointing at a real person.
    const { error } = await db.from('users')
      .update({ is_active: action === 'reactivate' })
      .eq('id', userId).eq('org_id', manager.orgId);
    if (error) return json({ error: error.message }, { status: 500 });
    return json({ ok: true });
  }

  return json({ error: 'Unknown action.' }, { status: 400 });
}
