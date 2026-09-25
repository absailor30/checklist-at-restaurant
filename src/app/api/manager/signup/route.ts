import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

// L2 self-service signup: not yet on the roster for their brand, so they
// enter the brand name plus their own email/password. Created but
// unapproved (org-wide access, i.e. all outlets, is only granted once
// L3 — or the platform admin — approves them).
export async function POST(request: Request) {
  const { brandName, name, email, password } = await request.json().catch(() => ({}));

  if (!brandName?.trim()) return NextResponse.json({ error: 'Enter your brand name.' }, { status: 400 });
  if (!name?.trim() || name.trim().length < 2) return NextResponse.json({ error: 'Enter your name.' }, { status: 400 });
  const cleanEmail = String(email ?? '').trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(cleanEmail)) return NextResponse.json({ error: 'Enter a valid email.' }, { status: 400 });
  if (!password || password.length < 6) return NextResponse.json({ error: 'Password needs at least 6 characters.' }, { status: 400 });

  const db = createAdminClient();
  const { data: org } = await db.from('organisations').select('id').ilike('name', brandName.trim()).maybeSingle();
  if (!org) return NextResponse.json({ error: 'Brand not found — check the exact name with your L3 owner.' }, { status: 404 });

  const { data: role } = await db.from('roles').select('id').eq('org_id', org.id).eq('name', 'L2 Manager').maybeSingle();
  if (!role) return NextResponse.json({ error: 'L2 Manager role not found for this brand.' }, { status: 500 });

  const { data: authUser, error: authError } = await db.auth.admin.createUser({
    email: cleanEmail, password, email_confirm: true, user_metadata: { name: name.trim() },
  });
  if (authError || !authUser?.user) {
    const already = /already|registered/i.test(authError?.message ?? '');
    return NextResponse.json(
      { error: already ? 'That email already has an account. Sign in instead.' : (authError?.message ?? 'Could not create account.') },
      { status: already ? 409 : 500 }
    );
  }

  const { error: insertError } = await db.from('users').insert({
    org_id: org.id, role_id: role.id, name: name.trim(), email: cleanEmail,
    auth_user_id: authUser.user.id, approved: false,
  });
  if (insertError) {
    await db.auth.admin.deleteUser(authUser.user.id).catch(() => {});
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
