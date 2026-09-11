import { json } from '@/lib/no-store';
import { createAdminClient } from '@/lib/supabase/admin';
import { provisionOrganisation } from '@/lib/provision';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Creating a new restaurant group and its owner account.
export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const organisationName = String(body.organisationName ?? '').trim();
  const ownerName = String(body.ownerName ?? '').trim();
  const email = String(body.email ?? '').trim().toLowerCase();
  const password = String(body.password ?? '');
  const timezone = String(body.timezone ?? 'Asia/Kolkata');
  const outletNames = (Array.isArray(body.outletNames) ? body.outletNames : [])
    .map((n: unknown) => String(n ?? '').trim())
    .filter(Boolean);

  if (organisationName.length < 2) {
    return json({ error: 'Enter the restaurant or group name.' }, { status: 400 });
  }
  if (ownerName.length < 2) {
    return json({ error: 'Enter your name.' }, { status: 400 });
  }
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return json({ error: 'Enter a valid email address.' }, { status: 400 });
  }
  if (password.length < 10) {
    return json({ error: 'Use a password of at least 10 characters.' }, { status: 400 });
  }
  if (outletNames.length === 0) {
    return json({ error: 'Add at least one outlet.' }, { status: 400 });
  }
  if (outletNames.length > 20) {
    return json({ error: 'Add up to 20 outlets here; more can be added later.' }, { status: 400 });
  }

  const db = createAdminClient();

  // One organisation per name keeps the demo and real accounts from colliding
  // and makes a repeated submission obvious rather than silently duplicating.
  const { data: clash } = await db
    .from('organisations').select('id').eq('name', organisationName).maybeSingle();
  if (clash) {
    return json(
      { error: 'An account with that name already exists. Sign in instead, or use a different name.' },
      { status: 409 }
    );
  }

  const { data: created, error: authError } = await db.auth.admin.createUser({
    email, password, email_confirm: true, user_metadata: { name: ownerName },
  });
  if (authError || !created?.user) {
    const already = /already|registered/i.test(authError?.message ?? '');
    return json(
      {
        error: already
          ? 'That email already has an account. Sign in instead.'
          : (authError?.message ?? 'Could not create the account.'),
      },
      { status: already ? 409 : 500 }
    );
  }

  try {
    const result = await provisionOrganisation(db, {
      organisationName, outletNames, timezone,
      owner: { name: ownerName, email, authUserId: created.user.id },
    });
    return json({ ok: true, ...result });
  } catch (e: any) {
    // Do not leave a sign-in that has no restaurant behind it — that is the
    // half-created state that wasted so much time with the demo data.
    await db.auth.admin.deleteUser(created.user.id).catch(() => {});
    return json({ error: e?.message ?? 'Setup failed.' }, { status: 500 });
  }
}
