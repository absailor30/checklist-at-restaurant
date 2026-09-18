import { NextResponse } from 'next/server';
import { json } from '@/lib/no-store';
import { clearedCookie } from '@/lib/session';

// These routes read a session cookie and live database state, so they must run
// per-request. Without this Next.js tries to execute them at build time, which
// fails because no configuration or request exists yet.
export const dynamic = 'force-dynamic';

export async function POST() {
  // Session responses carry a cookie and must never be cached either.
  const response = NextResponse.json({ ok: true });
  response.headers.set('Cache-Control', 'no-store');
  response.cookies.set(clearedCookie);
  return response;
}
