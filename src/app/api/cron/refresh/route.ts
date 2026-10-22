import { json } from '@/lib/no-store';
import { cronTokenMatches } from '@/lib/cron-auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { todayIn, zonedToUtc } from '@/lib/time';
import { deadlineFor, hardStopOf } from '@/lib/line-check/bank';
import { activeShiftsOf } from '@/lib/line-check/shifts';
import { purgeOldPhotos } from '@/lib/photo-retention';
import { enforceLineCheckMisses, enforceShiftMisses } from '@/lib/line-check/cron';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// The daily job: marks stations nobody started as missed once a shift's deadline has passed
// (per shift when the brand has deadlines), and removes photo files past their retention.
// The 5-minute reminders are a separate job: /api/cron/reminders.
export async function GET(request: Request) {
  const denied = authorise(request);
  if (denied) return denied;

  const db = createAdminClient();
  const startedAt = Date.now();

  const { data: orgs, error: orgError } = await db
    .from('organisations')
    .select('id, name');
  if (orgError) return json({ error: orgError.message }, { status: 500 });

  const summary = {
    organisations: 0, outlets: 0,
    errors: [] as string[],
  };

  for (const org of orgs ?? []) {
    summary.organisations++;

    const { data: outlets } = await db
      .from('outlets')
      .select('id, org_id, name, timezone, station_count')
      .eq('org_id', org.id)
      .eq('is_active', true);

    // Read separately so a missing column can never take the whole cron down.
    const { data: cfgRow } = await db
      .from('organisations').select('line_check_config').eq('id', org.id).maybeSingle();
    const lineCheckHardStop = hardStopOf(cfgRow?.line_check_config);
    // A brand with per-shift deadlines (e.g. Opening 12:00, Closing 20:00) is enforced shift by shift.
    const perShift = Boolean((cfgRow?.line_check_config as any)?.shiftDeadlines);
    const shifts = activeShiftsOf(cfgRow?.line_check_config);

    for (const outlet of outlets ?? []) {
      summary.outlets++;
      const date = todayIn(outlet.timezone);

      try {
        if (perShift) {
          for (const shift of shifts) {
            const deadline = deadlineFor(cfgRow?.line_check_config, shift);
            if (deadline && Date.now() >= zonedToUtc(date, deadline, outlet.timezone).getTime()) {
              await enforceShiftMisses(db, outlet.id, date, shift, outlet.station_count ?? 3);
            }
          }
        } else if (lineCheckHardStop) {
          const cutoff = zonedToUtc(date, lineCheckHardStop, outlet.timezone);
          if (Date.now() >= cutoff.getTime()) {
            await enforceLineCheckMisses(db, outlet.id, date);
          }
        }
      } catch (e: any) {
        // One bad outlet must not stop the rest of the estate being processed.
        summary.errors.push(`${outlet.name}: ${e?.message ?? 'failed'}`);
      }
    }
  }

  const photosRemoved = await purgeOldPhotos(db);
  return json({ ok: true, ms: Date.now() - startedAt, photosRemoved, ...summary });
}

// Vercel Cron sends `Authorization: Bearer <CRON_SECRET>` when that variable is
// set. The same token works for an external scheduler, which is how this gets a
// useful interval on a plan whose own cron runs only once a day.
function authorise(request: Request) {
  const header = request.headers.get('authorization') ?? '';
  const provided = header.replace(/^Bearer\s+/i, '');

  try {
    return cronTokenMatches(provided)
      ? null
      : json({ error: 'Not authorised.' }, { status: 401 });
  } catch (e: any) {
    return json({ error: e?.message ?? 'Not configured.' }, { status: 500 });
  }
}
