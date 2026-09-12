import crypto from 'crypto';
import { json } from '@/lib/no-store';
import { cronToken, cronTokenIsExplicit } from '@/lib/cron-auth';

export const dynamic = 'force-dynamic';

// Reveals the scheduled job's token to whoever holds the setup password, so it
// can be pasted into an external scheduler.
//
// Behind the setup password rather than on the health page: /health is public,
// and anything printed there is printed to the internet.
export async function POST(request: Request) {
  const expected = process.env.SETUP_PASSWORD;
  if (!expected) {
    return json({ error: 'SETUP_PASSWORD is not configured.' }, { status: 500 });
  }

  const { password } = await request.json().catch(() => ({}));
  const a = Buffer.from(String(password ?? ''));
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return json({ error: 'Wrong setup password.' }, { status: 401 });
  }

  try {
    return json({
      token: cronToken(),
      explicit: cronTokenIsExplicit(),
      path: '/api/cron/refresh',
    });
  } catch (e: any) {
    return json({ error: e?.message ?? 'Not configured.' }, { status: 500 });
  }
}
