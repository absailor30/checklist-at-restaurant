import { json } from '@/lib/no-store';
import { cronTokenMatches } from '@/lib/cron-auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { pushToUsers } from '@/lib/push';
import { todayIn } from '@/lib/time';
import { activeShiftsOf } from '@/lib/line-check/shifts';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Call every 5 minutes. Sends L1 staff a reminder 60, 15 and 5 minutes before
// each shift's start time (config.shiftStarts, e.g. {"morning":"09:00"}).
// Each reminder falls in its own 5-minute window, so a 5-minute scheduler hits
// it once. A shift whose checklist is already complete is skipped.
const OFFSETS = [60, 15, 5];
const WINDOW = 5;

const minutesOf = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));

function localMinutes(tz: string): number {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false })
      .formatToParts(new Date()).map((x) => [x.type, x.value])
  );
  return (Number(p.hour) % 24) * 60 + Number(p.minute);
}

export async function GET(request: Request) {
  const provided = (request.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
  try {
    if (!cronTokenMatches(provided)) return json({ error: 'Not authorised.' }, { status: 401 });
  } catch (e: any) {
    return json({ error: e?.message ?? 'Not configured.' }, { status: 500 });
  }

  const db = createAdminClient();
  const sent: string[] = [];
  const { data: orgs } = await db.from('organisations').select('id, line_check_config');

  for (const org of orgs ?? []) {
    const config = (org.line_check_config ?? {}) as any;
    const starts = (config.shiftStarts ?? {}) as Record<string, string>;
    const deadlines = (config.shiftDeadlines ?? {}) as Record<string, string>;
    if (!config.shiftStarts && !config.shiftDeadlines) continue;
    const labels = (config.shiftLabels ?? {}) as Record<string, string>;

    const { data: outlets } = await db.from('outlets')
      .select('id, name, timezone, station_count').eq('org_id', org.id).eq('is_active', true);

    for (const outlet of outlets ?? []) {
      const tz = outlet.timezone || 'UTC';
      const now = localMinutes(tz);
      const today = todayIn(tz);

      for (const shift of activeShiftsOf(config)) {
       // Two kinds of reminder per shift: before it starts, and before its deadline (only if still unfinished).
       for (const kind of ['start', 'deadline'] as const) {
        const at = kind === 'start' ? starts[shift] : deadlines[shift];
        if (!at) continue;
        const until = minutesOf(at) - now;
        const offset = OFFSETS.find((o) => until > o - WINDOW && until <= o);
        if (offset === undefined) continue;

        // Skip if this shift's checklist is already done.
        const { data: run } = await db.from('line_check_runs').select('id')
          .eq('outlet_id', outlet.id).eq('run_date', today).eq('shift', shift).maybeSingle();
        if (run) {
          const { count } = await db.from('line_check_stations').select('id', { count: 'exact', head: true })
            .eq('run_id', run.id).eq('status', 'complete');
          if ((count ?? 0) >= (outlet.station_count ?? 1)) continue;
        }

        // Send each reminder once: the insert fails on the primary key if it already went out.
        const { error: dup } = await db.from('reminder_log')
          .insert({ outlet_id: outlet.id, run_date: today, shift, offset_min: kind === 'start' ? offset : -offset });
        if (dup) continue;

        const { data: l1 } = await db.from('user_outlets')
          .select('users!inner(id, is_active, roles!inner(level))').eq('outlet_id', outlet.id);
        const ids = (l1 ?? [])
          .map((r: any) => (Array.isArray(r.users) ? r.users[0] : r.users))
          .filter((u: any) => u?.is_active && (Array.isArray(u.roles) ? u.roles[0] : u.roles)?.level === 1)
          .map((u: any) => u.id);

        const label = labels[shift] ?? shift;
        const n = await pushToUsers(db, ids, {
          title: kind === 'start' ? `${label} checklist starts in ${offset} min` : `${label} checklist: ${offset} min left`,
          body: kind === 'start'
            ? `${outlet.name}: the ${label} line check starts at ${at}.`
            : `${outlet.name}: finish the ${label} line check before the ${at} deadline.`,
          url: '/l1',
          tag: `${kind}-${outlet.id}-${shift}`,
        });
        sent.push(`${outlet.name} ${label} ${kind} ${offset}min -> ${n}`);
       }
      }
    }
  }
  return json({ ok: true, sent });
}
