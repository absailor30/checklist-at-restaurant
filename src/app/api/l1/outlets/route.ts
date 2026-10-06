import { json } from '@/lib/no-store';
import { createAdminClient } from '@/lib/supabase/admin';
import { activeShiftsOf } from '@/lib/line-check/shifts';

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
    .select('id, name, org_id, timezone, is_active, station_count')
    .order('name');

  if (error) return json({ error: error.message }, { status: 500 });

  // Filter here rather than in the query. A row whose is_active is null —
  // possible if it was written before the column existed, or by a path that
  // omitted it — would be excluded by `.eq('is_active', true)` and the outlet
  // would silently vanish from the picker. Only an explicit false hides it.
  const visible = (data ?? []).filter((o) => o.is_active !== false);

  // A brand may rename the three shift slots (e.g. Opening / Mid Shift / Closing).
  // Read separately so a problem here can never hide the outlet list.
  const orgIds = [...new Set(visible.map((o) => o.org_id))];
  const { data: orgs } = await db.from('organisations').select('id, line_check_config').in('id', orgIds);
  const labelsByOrg = new Map((orgs ?? []).map((o: any) => [o.id, o.line_check_config?.shiftLabels ?? null]));
  const shiftsByOrg = new Map((orgs ?? []).map((o: any) => [o.id, activeShiftsOf(o.line_check_config)]));
  const outlets = visible.map((o) => ({ ...o, shift_labels: labelsByOrg.get(o.org_id) ?? null, active_shifts: shiftsByOrg.get(o.org_id) ?? null }));

  // serverTime proves the response is fresh rather than a cached copy.
  return json({
    outlets,
    totalRows: data?.length ?? 0,
    serverTime: new Date().toISOString(),
  });
}
