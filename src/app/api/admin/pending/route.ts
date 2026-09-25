import { json } from '@/lib/no-store';
import crypto from 'crypto';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

// Platform admin: approve/reject any pending L1 or L2 across every brand.
// Same password convention as /setup (SETUP_PASSWORD) rather than a whole
// separate super-admin auth system.
function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a); const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

function checkPassword(password: string): string | null {
  const expected = process.env.SETUP_PASSWORD;
  if (!expected) return 'SETUP_PASSWORD is not configured on the server.';
  if (!safeEqual(String(password ?? ''), expected)) return 'Wrong password.';
  return null;
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const authError = checkPassword(body.password);
  if (authError) return json({ error: authError }, { status: 401 });

  const db = createAdminClient();

  if (body.action === 'list' || !body.action) {
    const { data: pending, error } = await db
      .from('users')
      .select('id, name, email, shift, org_id, roles(name, level), organisations(name)')
      .eq('approved', false)
      .eq('is_active', true);
    if (error) return json({ error: error.message }, { status: 500 });

    return json({
      pending: (pending ?? []).map((u: any) => ({
        id: u.id, name: u.name, email: u.email, shift: u.shift,
        role: Array.isArray(u.roles) ? u.roles[0]?.name : u.roles?.name,
        level: Array.isArray(u.roles) ? u.roles[0]?.level : u.roles?.level,
        brand: Array.isArray(u.organisations) ? u.organisations[0]?.name : u.organisations?.name,
      })),
    });
  }

  if (body.action === 'approve') {
    const { userId } = body;
    if (!userId) return json({ error: 'userId required.' }, { status: 400 });
    const { data: target } = await db.from('users').select('org_id, roles(level)').eq('id', userId).maybeSingle();
    if (!target) return json({ error: 'User not found.' }, { status: 404 });

    await db.from('users').update({ approved: true }).eq('id', userId);

    const level = Array.isArray(target.roles) ? (target.roles[0] as any)?.level : (target.roles as any)?.level;
    if (level && level >= 2) {
      const { data: existing } = await db.from('user_outlets').select('outlet_id').eq('user_id', userId);
      if (!existing?.length) {
        const { data: outlets } = await db.from('outlets').select('id').eq('org_id', target.org_id);
        if (outlets?.length) {
          await db.from('user_outlets').insert(outlets.map((o) => ({ user_id: userId, outlet_id: o.id })));
        }
      }
    }
    return json({ ok: true });
  }

  if (body.action === 'reject') {
    const { userId } = body;
    if (!userId) return json({ error: 'userId required.' }, { status: 400 });
    const { data: target } = await db.from('users').select('approved, auth_user_id').eq('id', userId).maybeSingle();
    if (!target) return json({ error: 'User not found.' }, { status: 404 });
    if (target.approved) return json({ error: 'Already approved.' }, { status: 400 });
    await db.from('user_outlets').delete().eq('user_id', userId);
    await db.from('users').delete().eq('id', userId);
    if (target.auth_user_id) await db.auth.admin.deleteUser(target.auth_user_id).catch(() => {});
    return json({ ok: true });
  }

  return json({ error: 'Unknown action.' }, { status: 400 });
}
