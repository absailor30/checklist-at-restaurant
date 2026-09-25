import { json } from '@/lib/no-store';
import bcrypt from 'bcryptjs';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

// L1 self-service signup: not yet on the roster, so they enter their name,
// shift and choose their own PIN. Created but unapproved — invisible in the
// device picker (and rejected at login) until L2/L3 approves the request.
export async function POST(request: Request) {
  const { outletId, name, shift, pin } = await request.json().catch(() => ({}));

  if (!outletId) return json({ error: 'outletId required.' }, { status: 400 });
  if (!name?.trim() || name.trim().length < 2) return json({ error: 'Enter your name.' }, { status: 400 });
  if (!['morning', 'afternoon', 'evening'].includes(shift)) return json({ error: 'Choose a shift.' }, { status: 400 });
  if (!/^\d{4,6}$/.test(pin ?? '')) return json({ error: 'A 4 to 6 digit PIN is required.' }, { status: 400 });

  const db = createAdminClient();
  const { data: outlet } = await db.from('outlets').select('org_id').eq('id', outletId).maybeSingle();
  if (!outlet) return json({ error: 'Outlet not found.' }, { status: 404 });

  const { data: role } = await db.from('roles').select('id').eq('org_id', outlet.org_id).eq('name', 'L1 Manager').maybeSingle();
  if (!role) return json({ error: 'L1 Manager role not found for this brand.' }, { status: 500 });

  const pinHash = await bcrypt.hash(pin, 10);
  const { data: user, error } = await db
    .from('users')
    .insert({
      org_id: outlet.org_id, role_id: role.id, name: name.trim(), shift,
      pin_hash: pinHash, pin_set_at: new Date().toISOString(), approved: false,
    })
    .select('id')
    .single();

  if (error || !user) return json({ error: error?.message ?? 'Could not submit request.' }, { status: 500 });

  await db.from('user_outlets').insert({ user_id: user.id, outlet_id: outletId });

  return json({ ok: true });
}
