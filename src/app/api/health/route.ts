import { json } from '@/lib/no-store';

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
    name: 'Scheduled job secret',
    ok: Boolean(process.env.CRON_SECRET),
    detail: process.env.CRON_SECRET
      ? 'Set — the overdue and escalation job can run'
      : 'Missing CRON_SECRET — nothing will freeze or escalate while nobody has the app open',
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

      // Fetch the rows themselves, not just a count. A count that disagrees
      // with the rows points at the query; rows that disagree between two
      // endpoints point at the connection.
      const { data: outletRows, error: outletError } = await db
        .from('outlets').select('id, name, is_active, org_id');
      const outletCount = outletRows?.length ?? 0;

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

        // Ask for rows, not counts. An exact count is returned in the
        // Content-Range header, and a stripped or absent header reads as zero —
        // indistinguishable from an empty database. Rows cannot lie that way.
        const [{ data: userRows }, { count: submissionCount }, { data: orgs }] =
          await Promise.all([
            db.from('users').select('id'),
            db.from('submissions').select('id', { count: 'exact', head: true }),
            db.from('organisations').select('id, name, is_demo'),
          ]);
        const users = userRows?.length ?? 0;
        const submissions = submissionCount === null || submissionCount === undefined
          ? 'unknown'
          : submissionCount;

        checks.push({
          name: 'Demo data',
          ok: outletCount > 0,
          detail: outletCount > 0
            ? `${outletCount} outlets, ${users ?? 0} staff, ${submissions ?? 0} submissions`
            : 'No outlets yet — open /setup and create the demo data',
        });

        checks.push({
          name: 'Organisations found',
          ok: (orgs ?? []).length > 0,
          detail: (orgs ?? []).length
            ? (orgs ?? []).map((o: any) => `${o.name}${o.is_demo ? ' (demo)' : ''}`).join(', ')
            : 'None',
        });

        checks.push({
          name: 'Outlet rows',
          ok: outletCount > 0,
          detail: outletCount
            ? (outletRows ?? []).map((o: any) =>
                `${o.name}${o.is_active ? '' : ' [INACTIVE]'}`).join(' · ')
            : 'None returned by this connection',
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

  // Identify which deployment and which Supabase project answered, so two
  // endpoints that disagree can be compared directly rather than argued about.
  checks.push({
    name: 'This response',
    ok: true,
    detail:
      `${new Date().toISOString()} · project ${projectRef(url)} · ` +
      `deployment ${(process.env.VERCEL_DEPLOYMENT_ID ?? 'local').slice(-8)} · ` +
      `commit ${(process.env.VERCEL_GIT_COMMIT_SHA ?? 'local').slice(0, 7)}`,
  });

  const healthy = checks.every((c) => c.ok);
  return json({ healthy, checks }, { status: healthy ? 200 : 503 });
}

// The project reference embedded in a Supabase URL, so two endpoints pointing
// at different projects become obvious.
function projectRef(url?: string): string {
  if (!url) return 'unknown';
  return url.replace('https://', '').split('.')[0];
}
