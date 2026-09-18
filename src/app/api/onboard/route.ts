import { json } from '@/lib/no-store';
import { createAdminClient } from '@/lib/supabase/admin';
import { provisionBrand, SHIFTS, type OutletInput } from '@/lib/provision';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Onboarding a new brand: a brand name, its outlets (with optional per-outlet
// station count and L1 manager names), and one L2 + one L3 real account.
export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const brandName = String(body.brandName ?? '').trim();
  const timezone = String(body.timezone ?? 'Asia/Kolkata');

  const outlets: OutletInput[] = (Array.isArray(body.outlets) ? body.outlets : [])
    .map((o: any) => {
      const name = String(o?.name ?? '').trim();
      if (!name) return null;
      const stationCount = Number(o?.stationCount);
      const l1: OutletInput['l1'] = {};
      for (const shift of SHIFTS) {
        const n = String(o?.l1?.[shift]?.name ?? '').trim();
        if (n) l1[shift] = { name: n };
      }
      return {
        name,
        stationCount: Number.isFinite(stationCount) ? stationCount : undefined,
        l1: Object.keys(l1).length ? l1 : undefined,
      };
    })
    .filter(Boolean);

  const l2Name = String(body.l2Name ?? '').trim();
  const l2Email = String(body.l2Email ?? '').trim().toLowerCase();
  const l2Password = String(body.l2Password ?? '');
  const l3Name = String(body.l3Name ?? '').trim();
  const l3Email = String(body.l3Email ?? '').trim().toLowerCase();
  const l3Password = String(body.l3Password ?? '');

  if (brandName.length < 2) {
    return json({ error: 'Enter the brand name.' }, { status: 400 });
  }
  if (outlets.length === 0) {
    return json({ error: 'Add at least one outlet.' }, { status: 400 });
  }
  if (outlets.length > 200) {
    return json({ error: 'Add up to 200 outlets here; more can be added later.' }, { status: 400 });
  }
  const emailRe = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
  for (const [label, name, email, password] of [
    ['L2 manager', l2Name, l2Email, l2Password],
    ['L3 owner', l3Name, l3Email, l3Password],
  ] as const) {
    if (name.length < 2) return json({ error: `Enter the ${label}'s name.` }, { status: 400 });
    if (!emailRe.test(email)) return json({ error: `Enter a valid ${label} email.` }, { status: 400 });
    if (password.length < 10) return json({ error: `${label} password needs at least 10 characters.` }, { status: 400 });
  }
  if (l2Email === l3Email) {
    return json({ error: 'L2 and L3 need different email addresses.' }, { status: 400 });
  }

  const db = createAdminClient();

  const { data: clash } = await db
    .from('organisations').select('id').eq('name', brandName).maybeSingle();
  if (clash) {
    return json(
      { error: 'A brand with that name already exists. Sign in instead, or use a different name.' },
      { status: 409 }
    );
  }

  const createdIds: string[] = [];
  try {
    const { data: l2User, error: l2Err } = await db.auth.admin.createUser({
      email: l2Email, password: l2Password, email_confirm: true, user_metadata: { name: l2Name },
    });
    if (l2Err || !l2User?.user) throw new Error(l2Err?.message ?? 'Could not create the L2 manager account.');
    createdIds.push(l2User.user.id);

    const { data: l3User, error: l3Err } = await db.auth.admin.createUser({
      email: l3Email, password: l3Password, email_confirm: true, user_metadata: { name: l3Name },
    });
    if (l3Err || !l3User?.user) throw new Error(l3Err?.message ?? 'Could not create the L3 owner account.');
    createdIds.push(l3User.user.id);

    const result = await provisionBrand(db, {
      brandName, timezone, outlets,
      l2: { name: l2Name, email: l2Email, authUserId: l2User.user.id },
      l3: { name: l3Name, email: l3Email, authUserId: l3User.user.id },
    });
    return json({ ok: true, ...result });
  } catch (e: any) {
    // Do not leave sign-ins that have no brand behind them.
    for (const id of createdIds) await db.auth.admin.deleteUser(id).catch(() => {});
    return json({ error: e?.message ?? 'Setup failed.' }, { status: 500 });
  }
}
