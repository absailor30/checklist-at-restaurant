import { json } from '@/lib/no-store';
import { createAdminClient } from '@/lib/supabase/admin';

// These routes read a session cookie and live database state, so they must run
// per-request. Without this Next.js tries to execute them at build time, which
// fails because no configuration or request exists yet.
export const dynamic = 'force-dynamic';

// Device setup: which outlet is this tablet in. Returns nothing sensitive —
// outlet names only — because it is called before anyone has signed in.
export async function GET() {
  const db = createAdminClient();
  const { data, error } = await db
    .from('outlets')
    .select('id, name, org_id, timezone')
    .eq('is_active', true)
    .order('name');

  if (error) return json({ error: error.message }, { status: 500 });
  return json({ outlets: data });
}
