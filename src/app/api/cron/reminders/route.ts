import { json } from '@/lib/no-store';
import { cronTokenMatches } from '@/lib/cron-auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { pushToUsers } from '@/lib/push';
import { todayIn } from '@/lib/time';
import { activeShiftsOf } from '@/lib/line-check/shifts';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Call every 5 minutes. Per shift (times from the brand's config):
//  - start nudges, to L1, at the start time and 45 and 55 minutes after it, while unfinished
//  - deadline warnings, to L1, L2 and L3, 120/60/15/5 minutes before the deadline, while unfinished
//  - "check delayed", to L1, L2 and L3, at the deadline if a check is still going on
// Each falls in its own 5-minute window, so a 5-minute scheduler hits it once, and
// reminder_log makes sure it is never sent twice.
const START_AFTER = [0, 45, 55];
const DEADLINE_BEFORE = [120, 60, 15, 5];
const DELAYED_KEY = 1000;
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
        const label = labels[shift] ?? shift;
        const start = starts[shift];
        const deadline = deadlines[shift];

        // What is due in this run of the job: [log key, kind, title, body].
        const due: { key: number; kind: 'start' | 'deadline' | 'delayed'; title: string; body: string }[] = [];
        if (start) {
          const elapsed = now - minutesOf(start);
          for (const a of START_AFTER) {
            if (elapsed >= a && elapsed < a + WINDOW) {
              due.push({
                key: a, kind: 'start',
                title: a === 0 ? `${label} checklist starts now` : `${label} checklist: started ${a} min ago`,
                body: `${outlet.name}: ${a === 0 ? 'start' : 'finish'} the ${label} line check${deadline ? ` (deadline ${deadline})` : ''}.`,
              });
            }
          }
        }
        if (deadline) {
          const until = minutesOf(deadline) - now;
          for (const o of DEADLINE_BEFORE) {
            if (until > o - WINDOW && until <= o) {
              due.push({
                key: -o, kind: 'deadline',
                title: `${label} checklist: ${o} min left`,
                body: `${outlet.name}: finish the ${label} line check before the ${deadline} deadline.`,
              });
            }
          }
          const over = now - minutesOf(deadline);
          if (over >= 0 && over < WINDOW) {
            due.push({
              key: DELAYED_KEY, kind: 'delayed',
              title: `${label} check delayed`,
              body: `${outlet.name}: the ${label} line check is still going past its ${deadline} deadline. L1: add the reason for the delay when you finish.`,
            });
          }
        }
        if (!due.length) continue;

        // Where this shift's check stands.
        const { data: run } = await db.from('line_check_runs').select('id')
          .eq('outlet_id', outlet.id).eq('run_date', today).eq('shift', shift).maybeSingle();
        let complete = 0, going = 0;
        if (run) {
          const { data: sts } = await db.from('line_check_stations').select('status').eq('run_id', run.id);
          complete = (sts ?? []).filter((x: any) => x.status === 'complete').length;
          going = (sts ?? []).filter((x: any) => x.status === 'in_progress' || x.status === 'paused').length;
        }
        const finished = complete >= (outlet.station_count ?? 1);

        for (const d of due) {
          if (finished) continue;
          if (d.kind === 'delayed' && going === 0) continue; // nothing started: that is "missed", not "delayed"

          // Send each reminder once: the insert fails on the primary key if it already went out.
          const { error: dup } = await db.from('reminder_log')
            .insert({ outlet_id: outlet.id, run_date: today, shift, offset_min: d.key });
          if (dup) continue;

          const { data: staff } = await db.from('user_outlets')
            .select('users!inner(id, is_active, roles!inner(level))').eq('outlet_id', outlet.id);
          const ids = (staff ?? [])
            .map((r: any) => (Array.isArray(r.users) ? r.users[0] : r.users))
            .filter((u: any) => u?.is_active && (d.kind !== 'start' || (Array.isArray(u.roles) ? u.roles[0] : u.roles)?.level === 1))
            .map((u: any) => u.id);

          const n = await pushToUsers(db, ids, {
            title: d.title, body: d.body, url: '/l1', tag: `${d.kind}-${outlet.id}-${shift}-${d.key}`,
          });
          sent.push(`${outlet.name} ${label} ${d.kind} ${d.key} -> ${n}`);
        }
      }
    }
  }
  return json({ ok: true, sent });
}
