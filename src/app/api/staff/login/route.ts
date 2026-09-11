import { NextResponse } from 'next/server';
import { json } from '@/lib/no-store';
import bcrypt from 'bcryptjs';
import { createAdminClient } from '@/lib/supabase/admin';
import { encodeSession, sessionCookie } from '@/lib/session';

// These routes read a session cookie and live database state, so they must run
// per-request. Without this Next.js tries to execute them at build time, which
// fails because no configuration or request exists yet.
export const dynamic = 'force-dynamic';

// GET: the staff picker for one outlet. Names only — never PIN hashes.
export async function GET(request: Request) {
  const outletId = new URL(request.url).searchParams.get('outletId');
  if (!outletId) return json({ error: 'outletId required' }, { status: 400 });

  const db = createAdminClient();
  const { data, error } = await db
    .from('user_outlets')
    .select('users!inner(id, name, is_active, pin_set_at, roles!inner(id, name, level))')
    .eq('outlet_id', outletId);
  if (error) return json({ error: error.message }, { status: 500 });

  const staff = (data ?? [])
    .map((r: any) => (Array.isArray(r.users) ? r.users[0] : r.users))
    .filter((u: any) => u?.is_active)
    .map((u: any) => {
      const role = Array.isArray(u.roles) ? u.roles[0] : u.roles;
      return {
        id: u.id,
        name: u.name,
        role: role.name,
        level: role.level,
        // Drives "set your PIN" vs "enter your PIN" on first use.
        needsPin: !u.pin_set_at,
      };
    })
    .sort((a: any, b: any) => a.level - b.level || a.name.localeCompare(b.name));

  return json({ staff });
}

// POST: verify the PIN (or set it the first time) and start a session.
export async function POST(request: Request) {
  const { userId, outletId, pin } = await request.json();
  if (!userId || !outletId || !/^\d{4,6}$/.test(pin ?? '')) {
    return json({ error: 'A 4 to 6 digit PIN is required.' }, { status: 400 });
  }

  const db = createAdminClient();
  const { data: user, error } = await db
    .from('users')
    .select('id, org_id, name, role_id, pin_hash, pin_set_at, is_active')
    .eq('id', userId)
    .single();

  if (error || !user?.is_active) {
    return json({ error: 'Staff member not found.' }, { status: 404 });
  }

  // Confirm this person actually works at this outlet. Without this check a
  // crafted request could start a session at any outlet in the group.
  const { count } = await db
    .from('user_outlets')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('outlet_id', outletId);
  if (!count) {
    return json({ error: 'Not assigned to this outlet.' }, { status: 403 });
  }

  if (!user.pin_set_at || !user.pin_hash) {
    // First use: this PIN becomes theirs.
    const hash = await bcrypt.hash(pin, 10);
    await db.from('users')
      .update({ pin_hash: hash, pin_set_at: new Date().toISOString() })
      .eq('id', userId);
  } else if (!(await bcrypt.compare(pin, user.pin_hash))) {
    // Deliberately vague: saying "wrong PIN" versus "no such user" tells an
    // attacker which half they got right.
    return json({ error: 'Incorrect PIN.' }, { status: 401 });
  }

  const token = encodeSession({
    userId: user.id, orgId: user.org_id, outletId,
    roleId: user.role_id, name: user.name,
  });

  // Session responses carry a cookie and must never be cached either.
  const response = NextResponse.json({ ok: true, name: user.name });
  response.headers.set('Cache-Control', 'no-store');
  response.cookies.set(sessionCookie(token));
  return response;
}
