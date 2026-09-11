import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

// A plain-English status check, for when something is wrong and the person
// looking is not a developer. Reports what is configured and what the database
// actually contains — never the values of any secret.
export async function GET() {
  const checks: { name: string; ok: boolean; detail: string }[] = [];

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const secret = process.env.APP_SESSION_SECRET;
  const setup = process.env.SETUP_PASSWORD;

  checks.push({
    name: 'Supabase URL',
    ok: Boolean(url),
    detail: url ? `Set (${url})` : 'Missing NEXT_PUBLIC_SUPABASE_URL',
  });
  checks.push({
    name: 'Public key',
    ok: Boolean(anon),
    detail: anon ? 'Set' : 'Missing NEXT_PUBLIC_SUPABASE_ANON_KEY',
  });
  checks.push({
    name: 'Service role key',
    ok: Boolean(service),
    detail: service ? 'Set' : 'Missing SUPABASE_SERVICE_ROLE_KEY',
  });
  checks.push({
    name: 'Session secret',
    ok: Boolean(secret && secret.length >= 32),
    detail: !secret
      ? 'Missing APP_SESSION_SECRET'
      : secret.length < 32
        ? `Too short (${secret.length} characters, needs 32 or more)`
        : 'Set',
  });
  checks.push({
    name: 'Setup password',
    ok: Boolean(setup),
    detail: setup ? 'Set' : 'Missing SETUP_PASSWORD — the /setup page will not work',
  });

  // Only try the database once the configuration is actually present.
  if (url && service) {
    try {
      const { createAdminClient } = await import('@/lib/supabase/admin');
      const db = createAdminClient();

      const { count: outletCount, error: outletError } = await db
        .from('outlets').select('*', { count: 'exact', head: true });

      if (outletError) {
        checks.push({
          name: 'Database tables',
          ok: false,
          detail: /does not exist/i.test(outletError.message)
            ? 'Tables are missing — run 0001_initial_schema.sql and 0002_rls.sql in the Supabase SQL Editor'
            : outletError.message,
        });
      } else {
        checks.push({ name: 'Database tables', ok: true, detail: 'Reachable' });

        const [{ count: users }, { count: submissions }] = await Promise.all([
          db.from('users').select('*', { count: 'exact', head: true }),
          db.from('submissions').select('*', { count: 'exact', head: true }),
        ]);

        checks.push({
          name: 'Demo data',
          ok: (outletCount ?? 0) > 0,
          detail: (outletCount ?? 0) > 0
            ? `${outletCount} outlets, ${users ?? 0} staff, ${submissions ?? 0} submissions`
            : 'No outlets yet — open /setup and create the demo data',
        });
      }

      const { data: buckets, error: bucketError } = await db.storage.listBuckets();
      checks.push({
        name: 'Photo storage',
        ok: !bucketError && Boolean(buckets?.some((b) => b.name === 'checklist-photos')),
        detail: bucketError
          ? bucketError.message
          : buckets?.some((b) => b.name === 'checklist-photos')
            ? 'Bucket ready'
            : 'Bucket missing — run /setup, which creates it',
      });
    } catch (e: any) {
      checks.push({
        name: 'Database connection',
        ok: false,
        detail: e?.message ?? 'Could not connect to Supabase',
      });
    }
  }

  const healthy = checks.every((c) => c.ok);
  return NextResponse.json({ healthy, checks }, { status: healthy ? 200 : 503 });
}
