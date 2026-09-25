import { NextResponse } from 'next/server';
import { currentManager } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

// Team management for L3: list who's on the team, add an L1 manager to an
// outlet+shift, or deactivate someone who left. Does not touch the 3 fixed
// roles (L1 Manager/L2 Manager/L3 Owner) themselves.
export async function GET() {
  const manager = await currentManager();
  if (!manager) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
  if (!manager.canManage) return NextResponse.json({ error: 'L3 owner access required.' }, { status: 403 });

  const db = createAdminClient();
  const { data: users, error } = await db
    .from('users')
    .select('id, name, email, shift, is_active, approved, roles(name, level), user_outlets(outlets(id, name))')
    .eq('org_id', manager.orgId)
    .order('is_active', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const { data: outlets } = await db.from('outlets').select('id, name').eq('org_id', manager.orgId).eq('is_active', true);

  return NextResponse.json({
    outlets: outlets ?? [],
    users: (users ?? []).map((u: any) => ({
      id: u.id, name: u.name, email: u.email, shift: u.shift, isActive: u.is_active, approved: u.approved,
      role: Array.isArray(u.roles) ? u.roles[0]?.name : u.roles?.name,
      level: Array.isArray(u.roles) ? u.roles[0]?.level : u.roles?.level,
      outlets: (u.user_outlets ?? []).map((uo: any) => (Array.isArray(uo.outlets) ? uo.outlets[0] : uo.outlets)?.name).filter(Boolean),
    })),
  });
}

export async function POST(request: Request) {
  const manager = await currentManager();
  if (!manager) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
  if (!manager.canManage) return NextResponse.json({ error: 'L3 owner access required.' }, { status: 403 });

  const body = await request.json().catch(() => ({}));
  const db = createAdminClient();

  if (body.action === 'add_l1') {
    const { name, shift, outletId } = body;
    if (!name?.trim() || !['morning', 'afternoon', 'evening'].includes(shift) || !outletId) {
      return NextResponse.json({ error: 'Name, shift and outlet are required.' }, { status: 400 });
    }
    const { data: outlet } = await db.from('outlets').select('id').eq('id', outletId).eq('org_id', manager.orgId).maybeSingle();
    if (!outlet) return NextResponse.json({ error: 'Outlet not found.' }, { status: 404 });

    const { data: role } = await db.from('roles').select('id').eq('org_id', manager.orgId).eq('name', 'L1 Manager').maybeSingle();
    if (!role) return NextResponse.json({ error: 'L1 Manager role not found for this brand.' }, { status: 500 });

    const { data: user, error: insertError } = await db
      .from('users')
      .insert({ org_id: manager.orgId, role_id: role.id, name: name.trim(), shift })
      .select('id')
      .single();
    if (insertError || !user) return NextResponse.json({ error: insertError?.message ?? 'Could not create user.' }, { status: 500 });

    await db.from('user_outlets').insert({ user_id: user.id, outlet_id: outletId });
    return NextResponse.json({ ok: true });
  }

  if (body.action === 'approve') {
    const { userId } = body;
    if (!userId) return NextResponse.json({ error: 'userId required.' }, { status: 400 });
    const { data: target } = await db.from('users').select('org_id').eq('id', userId).maybeSingle();
    if (!target || target.org_id !== manager.orgId) return NextResponse.json({ error: 'User not found.' }, { status: 404 });
    await db.from('users').update({ approved: true }).eq('id', userId);
    return NextResponse.json({ ok: true });
  }

  if (body.action === 'reject') {
    const { userId } = body;
    if (!userId) return NextResponse.json({ error: 'userId required.' }, { status: 400 });
    const { data: target } = await db.from('users').select('org_id, approved').eq('id', userId).maybeSingle();
    if (!target || target.org_id !== manager.orgId) return NextResponse.json({ error: 'User not found.' }, { status: 404 });
    if (target.approved) return NextResponse.json({ error: 'Already approved — deactivate instead.' }, { status: 400 });
    await db.from('user_outlets').delete().eq('user_id', userId);
    await db.from('users').delete().eq('id', userId);
    return NextResponse.json({ ok: true });
  }

  if (body.action === 'deactivate') {
    const { userId } = body;
    if (!userId) return NextResponse.json({ error: 'userId required.' }, { status: 400 });

    const { data: target } = await db.from('users').select('org_id').eq('id', userId).maybeSingle();
    if (!target || target.org_id !== manager.orgId) return NextResponse.json({ error: 'User not found.' }, { status: 404 });

    await db.from('users').update({ is_active: false }).eq('id', userId);
    await db.from('user_outlets').delete().eq('user_id', userId);
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: 'Unknown action.' }, { status: 400 });
}
