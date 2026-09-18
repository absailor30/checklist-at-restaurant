import { NextResponse } from 'next/server';
import { json } from '@/lib/no-store';
import { createAdminClient } from '@/lib/supabase/admin';
import { encodeSession, readSession, sessionCookie } from '@/lib/session';

// These routes read a session cookie and live database state, so they must run
// per-request. Without this Next.js tries to execute them at build time, which
// fails because no configuration or request exists yet.
export const dynamic = 'force-dynamic';

// Which shifts are running today at this outlet, so staff can say which one
// they are on. No rostering: restaurants already run their rota elsewhere.
export async function GET() {
  const session = await readSession();
  if (!session) return json({ error: 'Not signed in.' }, { status: 401 });

  const db = createAdminClient();
  const { data, error } = await db
    .from('shifts')
    .select('id, name, start_time, end_time')
    .eq('outlet_id', session.outletId)
    .eq('is_active', true)
    .order('sort_order');

  if (error) return json({ error: error.message }, { status: 500 });
  return json({ shifts: data });
}

export async function POST(request: Request) {
  const session = await readSession();
  if (!session) return json({ error: 'Not signed in.' }, { status: 401 });

  const { shiftId } = await request.json();
  const db = createAdminClient();

  // Verify the shift belongs to this outlet before trusting the id.
  const { data: shift } = await db
    .from('shifts').select('id')
    .eq('id', shiftId).eq('outlet_id', session.outletId).maybeSingle();
  if (!shift) return json({ error: 'Unknown shift.' }, { status: 400 });

  const { exp, ...rest } = session;
  // Session responses carry a cookie and must never be cached either.
  const response = NextResponse.json({ ok: true });
  response.headers.set('Cache-Control', 'no-store');
  response.cookies.set(sessionCookie(encodeSession({ ...rest, shiftId })));
  return response;
}
