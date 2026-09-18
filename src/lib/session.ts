import crypto from 'crypto';
import { cookies } from 'next/headers';

// Floor staff sign in with a name and a PIN on a shared device, so there is no
// Supabase Auth session. This is a small signed cookie instead: tamper-proof
// (HMAC), short-lived, and holding only ids — never the PIN.
//
// Deliberately short expiry. On a shared tablet the next person must not
// inherit the last person's identity, or the audit trail records the wrong
// name against the work.

const COOKIE = 'staff_session';
const TTL_MINUTES = 90;

export interface StaffSession {
  userId: string;
  orgId: string;
  outletId: string;
  roleId: string;
  name: string;
  shiftId?: string;
  l1Shift?: 'morning' | 'afternoon' | 'evening';
  exp: number;
}

function secret(): string {
  const s = process.env.APP_SESSION_SECRET;
  if (!s || s.length < 32) {
    throw new Error(
      'APP_SESSION_SECRET is missing or too short (needs 32+ characters). See SETUP.md.'
    );
  }
  return s;
}

function sign(payload: string): string {
  return crypto.createHmac('sha256', secret()).update(payload).digest('base64url');
}

export function encodeSession(s: Omit<StaffSession, 'exp'>): string {
  const full: StaffSession = { ...s, exp: Date.now() + TTL_MINUTES * 60_000 };
  const body = Buffer.from(JSON.stringify(full)).toString('base64url');
  return `${body}.${sign(body)}`;
}

export function decodeSession(token: string | undefined): StaffSession | null {
  if (!token) return null;
  const [body, mac] = token.split('.');
  if (!body || !mac) return null;

  const expected = sign(body);
  // Constant-time compare so a wrong signature cannot be guessed byte by byte.
  if (
    mac.length !== expected.length ||
    !crypto.timingSafeEqual(Buffer.from(mac), Buffer.from(expected))
  ) {
    return null;
  }

  try {
    const s = JSON.parse(Buffer.from(body, 'base64url').toString()) as StaffSession;
    return s.exp > Date.now() ? s : null;
  } catch {
    return null;
  }
}

export async function readSession(): Promise<StaffSession | null> {
  return decodeSession(cookies().get(COOKIE)?.value);
}

export function sessionCookie(token: string) {
  return {
    name: COOKIE,
    value: token,
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: TTL_MINUTES * 60,
  };
}

export const clearedCookie = { name: COOKIE, value: '', path: '/', maxAge: 0 };
