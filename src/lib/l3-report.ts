import { enforceDueShifts } from '@/lib/line-check/cron';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Manager } from '@/lib/supabase/server';
import { loadBank } from '@/lib/line-check/bank';
import { formatCheckTime } from '@/lib/line-check/time';
import { scoreAnswer, type LineCheckAnswer } from '@/lib/line-check/score-answer';
import { bandOf } from '@/lib/scoring';
import { finishedAfterDeadline } from '@/lib/line-check/delay';
import { l3ItemsOf } from '@/lib/l3-checklist';

// L3's report: how every outlet's L1 shifts went over a date range, with the
// same period before it for comparison. Built on the line_check_* tables.

export interface L3ReportRow {
  date: string; outletId: string; outletName: string; shift: string; checkTime: string | null;
  stationsComplete: number; stationCount: number; l1Complete: boolean; outOfRange: number; missed: number;
  percent: number | null; band: string | null; onTime: boolean | null;
  l2Complete: boolean; l3Complete: boolean; delayReason: string | null;
}

export interface Kpis {
  completionPct: number | null; onTimePct: number | null; tempFails: number; missed: number;
  stationsDone: number; stationsExpected: number; shiftsOnTime: number; shiftsLate: number;
}

export type HeatCell = { s: 'done' | 'missed' | 'partial' | 'none'; f: number };

export interface L3Insights {
  kpis: Kpis;
  previous: Kpis;
  range: { from: string; to: string; days: number; previousFrom: string; previousTo: string; capped: boolean };
  daily: { date: string; complete: number; missed: number; tempFails: number; completionPct: number | null }[];
  byStation: { name: string; complete: number; missed: number; tempFails: number }[];
  byShift: { label: string; runs: number; complete: number; missed: number; late: number }[];
  byOutlet: { id: string; name: string; completionPct: number | null; onTimePct: number | null; tempFails: number; missed: number; avgScore: number | null; shifts: number }[];
  topFails: { prompt: string; station: string; count: number }[];
  corrective: { total: number; withComment: number; withPhoto: number };
  heat: { stations: string[]; dates: string[]; cells: Record<string, Record<string, HeatCell>> };
}

export interface L3ChecklistSummary {
  entries: number; expected: number;
  items: { key: string; prompt: string; yes: number; no: number }[];
  recentNos: { date: string; outlet: string; prompt: string; comment: string | null }[];
}

export interface L3Report {
  insights?: L3Insights;
  l3Checklist?: L3ChecklistSummary;
  orgName: string;
  outlets: { id: string; name: string }[];
  selectedOutletId: string | null;
  rows: L3ReportRow[];
  headline: {
    date: string; shiftsExpected: number; shiftsL1Complete: number;
    pendingL2: number; pendingL3: number; late: number;
  };
}

export interface RangeOpts { days?: number; from?: string; to?: string; outletId?: string | null; all?: boolean; yesterday?: boolean }

const DAY = 86400000;
const addDays = (date: string, n: number) => new Date(Date.parse(`${date}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10);
const spanDays = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY) + 1;
const isDate = (s: unknown): s is string => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
const MAX_SPAN = 366;
const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 1000) / 10 : null);

/** Reads ?days= | ?from=&to= | ?all=1 and ?outletId= from a request URL. */
export function parseRange(url: URL): RangeOpts {
  const q = url.searchParams;
  const from = q.get('from'), to = q.get('to');
  return {
    days: Math.min(Math.max(Number(q.get('days') ?? 7) || 7, 1), MAX_SPAN),
    from: isDate(from) ? from : undefined, to: isDate(to) ? to : undefined,
    all: q.get('all') === '1', yesterday: q.get('yesterday') === '1', outletId: q.get('outletId') || null,
  };
}

const CHUNK = 150;
async function runsPage(db: SupabaseClient, select: string, outletIds: string[], from: string, to: string) {
  const out: any[] = [];
  for (let offset = 0; ; offset += 200) {
    const { data, error } = await db.from('line_check_runs').select(select)
      .in('outlet_id', outletIds).gte('run_date', from).lte('run_date', to)
      .order('run_date').range(offset, offset + 199);
    if (error) throw new Error(error.message);
    out.push(...(data ?? []));
    if ((data ?? []).length < 200) break;
  }
  return out;
}

async function oorByStation(db: SupabaseClient, stationIds: string[]) {
  const map = new Map<string, any[]>();
  for (let i = 0; i < stationIds.length; i += CHUNK) {
    const { data } = await db.from('line_check_answers')
      .select('station_id, question_id, reason, correction_photo_path')
      .eq('out_of_range', true).in('station_id', stationIds.slice(i, i + CHUNK));
    for (const a of data ?? []) (map.get(a.station_id) ?? map.set(a.station_id, []).get(a.station_id)!).push(a);
  }
  return map;
}

export async function buildL3Report(
  db: SupabaseClient, manager: Manager, opts: number | RangeOpts
): Promise<L3Report> {
  const o: RangeOpts = typeof opts === 'number' ? { days: opts } : opts;
  const { data: orgOutlets } = await db
    .from('outlets').select('id, name, timezone, station_count')
    .eq('org_id', manager.orgId).eq('is_active', true).order('name');

  // L3 and Admin see the whole business. L2 sees only the outlets they are assigned to.
  let allOutlets = orgOutlets;
  if (orgOutlets && manager.level < 3 && manager.roleName !== 'Admin') {
    const { data: mine } = await db.from('user_outlets').select('outlet_id').eq('user_id', manager.id);
    const ids = new Set((mine ?? []).map((r: any) => r.outlet_id));
    allOutlets = orgOutlets.filter((o) => ids.has(o.id));
  }

  if (!allOutlets || allOutlets.length === 0) {
    return {
      orgName: manager.name, outlets: [], selectedOutletId: null, rows: [],
      headline: { date: '', shiftsExpected: 0, shiftsL1Complete: 0, pendingL2: 0, pendingL3: 0, late: 0 },
    };
  }

  await enforceDueShifts(db, manager.orgId, allOutlets);

  const outlets = o.outletId ? allOutlets.filter((x) => x.id === o.outletId) : allOutlets;
  const selected = outlets.length ? outlets : allOutlets;
  const outletIds = selected.map((x) => x.id);
  const outletById = new Map(allOutlets.map((x) => [x.id, x]));
  const tz0 = allOutlets[0].timezone || 'UTC';
  const todayLocal = new Intl.DateTimeFormat('en-CA', { timeZone: tz0, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());

  // ---- range ----
  let from: string, to: string, capped = false;
  if (o.yesterday) {
    to = addDays(todayLocal, -1); from = to;
  } else if (o.from && o.to) {
    to = o.to > todayLocal ? todayLocal : o.to;
    from = o.from > to ? to : o.from;
  } else if (o.all) {
    const { data: first } = await db.from('line_check_runs').select('run_date').in('outlet_id', outletIds).order('run_date').limit(1);
    from = first?.[0]?.run_date ?? todayLocal; to = todayLocal;
  } else {
    to = todayLocal; from = addDays(todayLocal, -((o.days ?? 7) - 1));
  }
  if (spanDays(from, to) > MAX_SPAN) { from = addDays(to, -(MAX_SPAN - 1)); capped = true; }
  const days = spanDays(from, to);
  const previousTo = addDays(from, -1), previousFrom = addDays(previousTo, -(days - 1));

  // The bank is per brand, so scoring uses each station's own questions.
  const bank = await loadBank(db, manager.orgId, allOutlets[0].station_count ?? 3);
  const questionsAt = (no: number) => (bank.stations.find((s) => s.no === no) ?? bank.stations[0])?.questions ?? [];
  const stationName = (no: number) => bank.stations.find((s) => s.no === no)?.name ?? `Station ${no}`;
  const deadlineOf = (shift: string) => (shift in bank.shiftDeadlines ? bank.shiftDeadlines[shift] : bank.hardStop);

  const runs = await runsPage(db, `
      id, outlet_id, run_date, shift, check_time, l2_completed_at, l3_completed_at, delay_reason,
      line_check_stations (
        id, station_no, status, completed_at,
        line_check_answers ( question_id, yes_no, value_number, photo_path, reason, out_of_range, correction_photo_path )
      )`, outletIds, from, to);

  // ---- per-run rows (as before) ----
  const lateRun = new Map<string, boolean>();
  const rows: L3ReportRow[] = runs.map((r: any) => {
    const outlet = outletById.get(r.outlet_id);
    const deadline = deadlineOf(r.shift);
    const stations = r.line_check_stations ?? [];
    const missed = stations.filter((s: any) => s.status === 'missed').length;
    const stationCount = bank.own ? bank.stations.length : (outlet?.station_count ?? 3);
    const completed = stations.filter((s: any) => s.status === 'complete');
    const outOfRange = stations.reduce((n: number, s: any) => n + (s.line_check_answers ?? []).filter((a: any) => a.out_of_range).length, 0);

    let scoredTotal = 0, pointsTotal = 0, lateAny = false;
    for (const st of completed) {
      const answers: Record<string, LineCheckAnswer> = {};
      for (const a of st.line_check_answers ?? []) {
        answers[a.question_id] = { questionId: a.question_id, yesNo: a.yes_no, value: a.value_number, photoDataUrl: a.photo_path ? 'x' : null, reason: a.reason };
      }
      for (const q of questionsAt(st.station_no)) {
        const s = scoreAnswer(q, answers[q.id]);
        if (s !== null) { scoredTotal++; pointsTotal += s; }
      }
      if (st.completed_at && outlet && finishedAfterDeadline(st.completed_at, r.run_date, deadline, outlet.timezone || 'UTC')) lateAny = true;
    }
    lateRun.set(r.id, lateAny);
    const percent = scoredTotal ? Math.round((pointsTotal / scoredTotal) * 1000) / 10 : null;
    return {
      date: r.run_date, outletId: r.outlet_id, outletName: outlet?.name ?? '',
      shift: bank.shiftLabels[r.shift] ?? r.shift, checkTime: formatCheckTime(r.check_time),
      stationsComplete: completed.length, stationCount, l1Complete: completed.length === stationCount,
      outOfRange, missed, percent, band: percent !== null ? bandOf(percent) : null,
      onTime: completed.length > 0 && deadline ? !lateAny : null,
      l2Complete: !!r.l2_completed_at, l3Complete: !!r.l3_completed_at, delayReason: r.delay_reason ?? null,
    };
  }).sort((a, b) => a.date === b.date ? a.outletName.localeCompare(b.outletName) : a.date < b.date ? 1 : -1);

  // The charts are an extra: if building them ever fails, the table and headline still load.
  let insights: L3Insights | undefined;
  try {
    // ---- KPIs: this period and the one before it ----
    // An open station on a past day counts as missed; today's open stations are still in play, so left out.
    const kpiOf = (rs: any[], oorOf: (s: any) => number): Kpis => {
      let done = 0, missed = 0, fails = 0, onT = 0, late = 0;
      for (const r of rs) {
        let anyDone = false;
        for (const s of r.line_check_stations ?? []) {
          if (s.status === 'complete') { done++; anyDone = true; } else if (s.status === 'missed' || r.run_date < todayLocal) missed++;
          fails += oorOf(s);
        }
        const dl = deadlineOf(r.shift), outlet = outletById.get(r.outlet_id);
        const isLate = (r.line_check_stations ?? []).some((s: any) => s.status === 'complete' && s.completed_at && outlet && finishedAfterDeadline(s.completed_at, r.run_date, dl, outlet.timezone || 'UTC'));
        if (anyDone && dl) { if (isLate) late++; else onT++; }
      }
      return { completionPct: pct(done, done + missed), onTimePct: pct(onT, onT + late), tempFails: fails, missed, stationsDone: done, stationsExpected: done + missed, shiftsOnTime: onT, shiftsLate: late };
    };
    const nestedOor = (s: any) => (s.line_check_answers ?? []).filter((a: any) => a.out_of_range).length;
    const kpis = kpiOf(runs, nestedOor);

    const prevRuns = await runsPage(db, 'id, outlet_id, run_date, shift, line_check_stations ( id, status, completed_at )', outletIds, previousFrom, previousTo);
    const prevOor = await oorByStation(db, prevRuns.flatMap((r: any) => (r.line_check_stations ?? []).map((s: any) => s.id)));
    const previous = kpiOf(prevRuns, (s) => prevOor.get(s.id)?.length ?? 0);

    // ---- detail for the charts ----
    const daily = new Map<string, { complete: number; missed: number; tempFails: number }>();
    const byStation = new Map<number, { complete: number; missed: number; tempFails: number }>();
    const byShift = new Map<string, { runs: number; complete: number; missed: number; late: number }>();
    const fails = new Map<string, { prompt: string; station: string; count: number }>();
    const corrective = { total: 0, withComment: 0, withPhoto: 0 };
    const heatCells: Record<string, Record<string, HeatCell & { d: number; m: number; t: number }>> = {};
    const outletAgg = new Map<string, { done: number; missed: number; fails: number; onT: number; late: number; shifts: number }>();
    const allQuestions = bank.stations.flatMap((b) => b.questions);

    for (const r of runs) {
      const dRow = daily.get(r.run_date) ?? { complete: 0, missed: 0, tempFails: 0 };
      const shRow = byShift.get(r.shift) ?? { runs: 0, complete: 0, missed: 0, late: 0 };
      const oa = outletAgg.get(r.outlet_id) ?? { done: 0, missed: 0, fails: 0, onT: 0, late: 0, shifts: 0 };
      shRow.runs++; oa.shifts++;
      let anyDone = false;
      for (const s of r.line_check_stations ?? []) {
        const row = byStation.get(s.station_no) ?? { complete: 0, missed: 0, tempFails: 0 };
        const isDone = s.status === 'complete';
        const isMissed = !isDone && (s.status === 'missed' || r.run_date < todayLocal);
        if (isDone) { row.complete++; dRow.complete++; shRow.complete++; oa.done++; anyDone = true; }
        else if (isMissed) { row.missed++; dRow.missed++; shRow.missed++; oa.missed++; }
        const hc = ((heatCells[stationName(s.station_no)] ??= {})[r.run_date] ??= { s: 'none', f: 0, d: 0, m: 0, t: 0 });
        hc.t++; if (isDone) hc.d++; else if (isMissed) hc.m++;
        for (const a of s.line_check_answers ?? []) {
          if (!a.out_of_range) continue;
          row.tempFails++; dRow.tempFails++; oa.fails++; hc.f++;
          corrective.total++;
          if (a.reason && String(a.reason).trim()) corrective.withComment++;
          if (a.correction_photo_path) corrective.withPhoto++;
          const q = allQuestions.find((x) => x.id === a.question_id);
          const f = fails.get(a.question_id) ?? { prompt: (q?.prompt ?? a.question_id).replace(/ — .*$/, ''), station: stationName(s.station_no), count: 0 };
          f.count++; fails.set(a.question_id, f);
        }
        byStation.set(s.station_no, row);
      }
      if (lateRun.get(r.id)) { shRow.late++; oa.late++; } else if (anyDone && deadlineOf(r.shift)) oa.onT++;
      daily.set(r.run_date, dRow); byShift.set(r.shift, shRow); outletAgg.set(r.outlet_id, oa);
    }
    for (const byDate of Object.values(heatCells)) for (const c of Object.values(byDate)) {
      c.s = c.m > 0 ? 'missed' : c.d === c.t && c.t > 0 ? 'done' : c.d > 0 ? 'partial' : 'none';
    }
    const avgScore = new Map<string, number[]>();
    for (const r of rows) if (r.percent !== null) (avgScore.get(r.outletId) ?? avgScore.set(r.outletId, []).get(r.outletId)!).push(r.percent);

    const dates = [...new Set(runs.map((r: any) => r.run_date as string))].sort().slice(-31);
    insights = {
      kpis, previous,
      range: { from, to, days, previousFrom, previousTo, capped },
      daily: [...daily.entries()].sort(([a], [b]) => (a < b ? -1 : 1)).map(([date, v]) => ({ date, ...v, completionPct: pct(v.complete, v.complete + v.missed) })),
      byStation: [...byStation.entries()].sort(([a], [b]) => a - b).map(([no, v]) => ({ name: stationName(no), ...v })),
      byShift: [...byShift.entries()].map(([k, v]) => ({ label: bank.shiftLabels[k] ?? k, ...v })),
      byOutlet: selected.map((x) => {
        const a = outletAgg.get(x.id) ?? { done: 0, missed: 0, fails: 0, onT: 0, late: 0, shifts: 0 };
        const sc = avgScore.get(x.id) ?? [];
        return { id: x.id, name: x.name, completionPct: pct(a.done, a.done + a.missed), onTimePct: pct(a.onT, a.onT + a.late), tempFails: a.fails, missed: a.missed, avgScore: sc.length ? Math.round((sc.reduce((p, c) => p + c, 0) / sc.length) * 10) / 10 : null, shifts: a.shifts };
      }),
      topFails: [...fails.values()].sort((a, b) => b.count - a.count).slice(0, 8),
      corrective,
      heat: {
        stations: bank.stations.map((b) => b.name), dates,
        cells: Object.fromEntries(Object.entries(heatCells).map(([st, byDate]) => [st, Object.fromEntries(Object.entries(byDate).map(([d, c]) => [d, { s: c.s, f: c.f }]))])),
      },
    };
  } catch (e) {
    console.error('L3 insights failed:', e);
  }

  // L3's quick checklist over the same range and outlets.
  let l3Checklist: L3ChecklistSummary | undefined;
  try {
    const { data: org } = await db.from('organisations').select('line_check_config').eq('id', manager.orgId).maybeSingle();
    const items = l3ItemsOf(org?.line_check_config);
    const { data: checks } = await db.from('l3_checks').select('id, outlet_id, check_date')
      .in('outlet_id', outletIds).gte('check_date', from).lte('check_date', to);
    const ids = (checks ?? []).map((c: any) => c.id);
    const { data: ans } = ids.length
      ? await db.from('l3_check_answers').select('check_id, item_key, yes_no, comment').in('check_id', ids)
      : { data: [] as any[] };
    const checkById = new Map((checks ?? []).map((c: any) => [c.id, c]));
    l3Checklist = {
      entries: ids.length,
      expected: days * selected.length,
      items: items.map((i) => ({
        key: i.key, prompt: i.prompt,
        yes: (ans ?? []).filter((a: any) => a.item_key === i.key && a.yes_no === 'yes').length,
        no: (ans ?? []).filter((a: any) => a.item_key === i.key && a.yes_no === 'no').length,
      })),
      recentNos: (ans ?? []).filter((a: any) => a.yes_no === 'no').map((a: any) => {
        const c: any = checkById.get(a.check_id);
        return { date: c?.check_date ?? '', outlet: outletById.get(c?.outlet_id)?.name ?? '', prompt: items.find((i) => i.key === a.item_key)?.prompt ?? a.item_key, comment: a.comment ?? null };
      }).sort((x: any, y: any) => (x.date < y.date ? 1 : -1)).slice(0, 10),
    };
  } catch (e) {
    console.error('L3 checklist summary failed:', e);
  }

  const todayRows = rows.filter((r) => r.date === todayLocal);
  const headline = {
    date: todayLocal,
    shiftsExpected: selected.length * bank.activeShifts.length,
    shiftsL1Complete: todayRows.filter((r) => r.l1Complete).length,
    pendingL2: todayRows.filter((r) => r.l1Complete && !r.l2Complete).length,
    pendingL3: todayRows.filter((r) => r.l2Complete && !r.l3Complete).length,
    late: todayRows.filter((r) => r.onTime === false).length,
  };

  return {
    insights, l3Checklist, orgName: manager.name, outlets: allOutlets.map((x) => ({ id: x.id, name: x.name })),
    selectedOutletId: o.outletId && outlets.length ? o.outletId : null, rows, headline,
  };
}
