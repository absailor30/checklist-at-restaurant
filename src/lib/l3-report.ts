import { enforceDueShifts } from '@/lib/line-check/cron';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Manager } from '@/lib/supabase/server';
import { loadBank } from '@/lib/line-check/bank';
import { formatCheckTime } from '@/lib/line-check/time';
import { scoreAnswer, type LineCheckAnswer } from '@/lib/line-check/score-answer';
import { bandOf } from '@/lib/scoring';
import { finishedAfterDeadline } from '@/lib/line-check/delay';

// The report: how every outlet's L1 checks went over a date range, with the same
// period before it for comparison. Checks are often filled in only partly, so the
// numbers are built from the questions actually answered, not only from stations
// that were marked complete. A station counts as: done (marked complete), partly
// filled (some answers), or not started (no answers by the deadline or a past day).

export interface L3ReportRow {
  date: string; outletId: string; outletName: string; shift: string; checkTime: string | null;
  stationsComplete: number; stationCount: number; l1Complete: boolean; outOfRange: number; missed: number;
  percent: number | null; filledPct: number | null; band: string | null; onTime: boolean | null;
  l2Complete: boolean; l3Complete: boolean; delayReason: string | null;
  shiftKey: string;   // 'morning' | 'evening' ...
  recorded: boolean;  // false = nobody opened this shift at all (counted as not started)
}

export interface Kpis {
  coveragePct: number | null;   // questions answered / questions expected
  passPct: number | null;       // quality of what was answered (yes / scored answers)
  completionPct: number | null; // stations marked complete / stations in play
  onTimePct: number | null;
  tempFails: number; notStarted: number;
  stationsDone: number; stationsPartial: number; stationsInPlay: number;
  shiftsOnTime: number; shiftsLate: number; answered: number; expectedAnswers: number;
}

export type HeatCell = { s: 'done' | 'partial' | 'missed' | 'none'; f: number; p: number | null };

export interface L3Insights {
  kpis: Kpis;
  previous: Kpis;
  range: { from: string; to: string; days: number; previousFrom: string; previousTo: string; capped: boolean; hasPrevious: boolean };
  daily: { date: string; done: number; partial: number; notStarted: number; tempFails: number; coveragePct: number | null; passPct: number | null }[];
  byStation: { name: string; done: number; partial: number; notStarted: number; tempFails: number; coveragePct: number | null }[];
  byShift: { label: string; runs: number; done: number; partial: number; notStarted: number; late: number; coveragePct: number | null }[];
  byOutlet: { id: string; name: string; location: string | null; coveragePct: number | null; passPct: number | null; completionPct: number | null; onTimePct: number | null; tempFails: number; notStarted: number; avgScore: number | null; shifts: number }[];
  topFails: { prompt: string; station: string; count: number }[];
  corrective: { total: number; withComment: number; withPhoto: number };
  heat: { stations: string[]; dates: string[]; cells: Record<string, Record<string, HeatCell>> };
}

export interface L3Report {
  insights?: L3Insights;
  orgName: string;
  outlets: { id: string; name: string; location: string | null }[];
  locations: string[];
  selectedOutletId: string | null;
  selectedLocation: string | null;
  rows: L3ReportRow[];
  filterOptions: { shifts: { key: string; label: string }[]; stations: { no: number; name: string }[] };
  headline: {
    date: string; shiftsExpected: number; shiftsL1Complete: number;
    pendingL2: number; pendingL3: number; late: number;
  };
}

export interface RangeOpts {
  days?: number; from?: string; to?: string; outletId?: string | null; location?: string | null; all?: boolean; yesterday?: boolean;
  month?: string;        // 'YYYY-MM'
  monthOffset?: number;  // 0 = this month, -1 = last month
  shift?: string | null; // 'morning' | 'evening' ...
  station?: number | null;
}

const DAY = 86400000;
const addDays = (date: string, n: number) => new Date(Date.parse(`${date}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10);
const spanDays = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY) + 1;
const isDate = (s: unknown): s is string => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
const MAX_SPAN = 366;
const PREVIOUS_MAX_SPAN = 120; // the comparison needs every answer, so it is skipped for very long ranges
const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 1000) / 10 : null);

const emptyKpis = (): Kpis => ({
  coveragePct: null, passPct: null, completionPct: null, onTimePct: null, tempFails: 0, notStarted: 0,
  stationsDone: 0, stationsPartial: 0, stationsInPlay: 0, shiftsOnTime: 0, shiftsLate: 0, answered: 0, expectedAnswers: 0,
});

/** Reads ?days= | ?from=&to= | ?all=1 | ?yesterday=1 and ?outletId= ?location= from a request URL. */
export function parseRange(url: URL): RangeOpts {
  const q = url.searchParams;
  const from = q.get('from'), to = q.get('to');
  return {
    days: Math.min(Math.max(Number(q.get('days') ?? 7) || 7, 1), MAX_SPAN),
    from: isDate(from) ? from : undefined, to: isDate(to) ? to : undefined,
    all: q.get('all') === '1', yesterday: q.get('yesterday') === '1',
    outletId: q.get('outletId') || null, location: q.get('location') || null,
    month: /^\d{4}-\d{2}$/.test(q.get('month') ?? '') ? q.get('month')! : undefined,
    monthOffset: q.get('monthOffset') !== null && Number.isFinite(Number(q.get('monthOffset'))) ? Math.max(-24, Math.min(0, Number(q.get('monthOffset')))) : undefined,
    shift: q.get('shift') || null, station: Number.isInteger(Number(q.get('station'))) && Number(q.get('station')) > 0 ? Number(q.get('station')) : null,
  };
}

const RUN_SELECT = `
  id, outlet_id, run_date, shift, check_time, l2_completed_at, l3_completed_at, delay_reason,
  line_check_stations (
    id, station_no, status, completed_at,
    line_check_answers ( question_id, yes_no, value_number, photo_path, reason, out_of_range, correction_photo_path )
  )`;

async function runsPage(db: SupabaseClient, outletIds: string[], from: string, to: string, shift?: string | null, station?: number | null) {
  const out: any[] = [];
  for (let offset = 0; ; offset += 200) {
    let q = db.from('line_check_runs').select(RUN_SELECT)
      .in('outlet_id', outletIds).gte('run_date', from).lte('run_date', to);
    if (shift) q = q.eq('shift', shift);
    const { data, error } = await q.order('run_date').range(offset, offset + 199);
    if (error) throw new Error(error.message);
    for (const r of data ?? []) {
      if (station) r.line_check_stations = (r.line_check_stations ?? []).filter((s: any) => s.station_no === station);
      out.push(r);
    }
    if ((data ?? []).length < 200) break;
  }
  return out;
}

export async function buildL3Report(
  db: SupabaseClient, manager: Manager, opts: number | RangeOpts
): Promise<L3Report> {
  const o: RangeOpts = typeof opts === 'number' ? { days: opts } : opts;
  const { data: orgOutlets } = await db
    .from('outlets').select('id, name, timezone, station_count, location')
    .eq('org_id', manager.orgId).eq('is_active', true).order('name');

  // L3 and Admin see every outlet and location. L2 sees only the outlets they are assigned to.
  let allOutlets = orgOutlets;
  if (orgOutlets && manager.level < 3 && manager.roleName !== 'Admin') {
    const { data: mine } = await db.from('user_outlets').select('outlet_id').eq('user_id', manager.id);
    const ids = new Set((mine ?? []).map((r: any) => r.outlet_id));
    allOutlets = orgOutlets.filter((x) => ids.has(x.id));
  }

  if (!allOutlets || allOutlets.length === 0) {
    return {
      orgName: manager.name, outlets: [], locations: [], selectedOutletId: null, selectedLocation: null, rows: [],
      filterOptions: { shifts: [], stations: [] },
      headline: { date: '', shiftsExpected: 0, shiftsL1Complete: 0, pendingL2: 0, pendingL3: 0, late: 0 },
    };
  }

  await enforceDueShifts(db, manager.orgId, allOutlets);

  const locations = [...new Set(allOutlets.map((x: any) => x.location).filter(Boolean))].sort() as string[];
  let pool = o.location ? allOutlets.filter((x: any) => x.location === o.location) : allOutlets;
  if (o.outletId) pool = pool.filter((x) => x.id === o.outletId);
  const selected = pool.length ? pool : allOutlets;
  const outletIds = selected.map((x) => x.id);
  const outletById = new Map(allOutlets.map((x) => [x.id, x]));
  const tz0 = allOutlets[0].timezone || 'UTC';
  const todayLocal = new Intl.DateTimeFormat('en-CA', { timeZone: tz0, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());

  // ---- range ----
  let from: string, to: string, capped = false;
  const monthStart = (ym: string) => `${ym}-01`;
  const monthEnd = (ym: string) => addDays(`${new Date(Date.UTC(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)), 1)).toISOString().slice(0, 7)}-01`, -1);
  const shiftMonth = (ym: string, n: number) => new Date(Date.UTC(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)) - 1 + n, 1)).toISOString().slice(0, 7);
  const monthRange = (ym: string): [string, string] => {
    const f = monthStart(ym);
    const l = monthEnd(ym);
    return f > todayLocal ? [todayLocal, todayLocal] : [f, l > todayLocal ? todayLocal : l];
  };
  if (o.month || o.monthOffset !== undefined) {
    const ym = o.month ?? shiftMonth(todayLocal.slice(0, 7), o.monthOffset ?? 0);
    [from, to] = monthRange(ym);
  } else if (o.yesterday) {
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
  const allQuestions = bank.stations.flatMap((b) => b.questions);

  // A shift nobody opened leaves no record at all. For the report it still counts: every station
  // of a past (or overdue) shift with no record is "not started". Days before an outlet's first
  // ever run are left out, so a new client's report does not start with imaginary misses.
  const firstRun = new Map<string, string>();
  for (const x of selected) {
    const { data: f } = await db.from('line_check_runs').select('run_date').eq('outlet_id', x.id).order('run_date').limit(1);
    if (f?.[0]?.run_date) firstRun.set(x.id, f[0].run_date);
  }
  const withMissing = (rs: any[], f: string, t: string) => {
    const have = new Set(rs.map((r) => `${r.outlet_id}|${r.run_date}|${r.shift}`));
    const out = [...rs];
    for (const ol of selected) {
      const first = firstRun.get(ol.id);
      if (!first) continue;
      const tz = ol.timezone || 'UTC';
      const nos = bank.own ? bank.stations.map((b) => b.no) : Array.from({ length: ol.station_count ?? 3 }, (_, i) => i + 1);
      for (let d = f < first ? first : f; d <= t; d = addDays(d, 1)) {
        for (const sh of bank.activeShifts) {
          if (o.shift && sh !== o.shift) continue;
          if (have.has(`${ol.id}|${d}|${sh}`)) continue;
          const due = d < todayLocal || (d === todayLocal && finishedAfterDeadline(new Date(), d, deadlineOf(sh), tz));
          if (!due) continue;
          out.push({
            id: `none-${ol.id}-${d}-${sh}`, outlet_id: ol.id, run_date: d, shift: sh, check_time: null,
            l2_completed_at: null, l3_completed_at: null, delay_reason: null, noRecord: true,
            line_check_stations: (o.station ? nos.filter((n) => n === o.station) : nos).map((n) => ({ id: `none-${ol.id}-${d}-${sh}-${n}`, station_no: n, status: 'missed', completed_at: null, line_check_answers: [] })),
          });
        }
      }
    }
    return out;
  };
  const runs = withMissing(await runsPage(db, outletIds, from, to, o.shift, o.station), from, to);

  // What one station contributed: questions answered of those expected, and how well the answered ones went.
  const statsOf = (s: any) => {
    const qs = questionsAt(s.station_no);
    const byId = new Map<string, any>((s.line_check_answers ?? []).map((a: any) => [a.question_id, a]));
    let answered = 0, pts = 0, scored = 0;
    for (const q of qs) {
      const a = byId.get(q.id);
      if (!a || ((a.yes_no === null || a.yes_no === undefined) && (a.value_number === null || a.value_number === undefined))) continue;
      answered++;
      const ans: LineCheckAnswer = { questionId: a.question_id, yesNo: a.yes_no, value: a.value_number, photoDataUrl: a.photo_path ? 'x' : null, reason: a.reason };
      const sc = scoreAnswer(q, ans);
      if (sc !== null) { scored++; pts += sc; }
    }
    const fails = (s.line_check_answers ?? []).filter((a: any) => a.out_of_range).length;
    return { answered, expected: qs.length, pts, scored, fails };
  };
  const classify = (s: any, runDate: string, answered: number): 'done' | 'partial' | 'notStarted' | 'ignore' =>
    s.status === 'complete' ? 'done' : answered > 0 ? 'partial' : (s.status === 'missed' || runDate < todayLocal) ? 'notStarted' : 'ignore';
  const isLate = (r: any) => (r.line_check_stations ?? []).some((s: any) => {
    const outlet = outletById.get(r.outlet_id);
    return s.status === 'complete' && s.completed_at && outlet && finishedAfterDeadline(s.completed_at, r.run_date, deadlineOf(r.shift), outlet.timezone || 'UTC');
  });

  // ---- per-run rows ----
  const lateRun = new Map<string, boolean>();
  const rows: L3ReportRow[] = runs.map((r: any) => {
    const outlet = outletById.get(r.outlet_id);
    const deadline = deadlineOf(r.shift);
    const stations = r.line_check_stations ?? [];
    const stationCount = bank.own ? bank.stations.length : (outlet?.station_count ?? 3);
    const completed = stations.filter((s: any) => s.status === 'complete');
    let answered = 0, expected = 0, pts = 0, scored = 0, outOfRange = 0;
    for (const s of stations) { const st = statsOf(s); answered += st.answered; expected += st.expected; pts += st.pts; scored += st.scored; outOfRange += st.fails; }
    const late = isLate(r);
    lateRun.set(r.id, late);
    // What a fully filled run would hold: every question of every station.
    let fullExpected = 0;
    for (let n = 1; n <= stationCount; n++) fullExpected += questionsAt(n).length;
    const percent = scored ? Math.round((pts / scored) * 1000) / 10 : null;
    return {
      date: r.run_date, outletId: r.outlet_id, outletName: outlet?.name ?? '',
      shift: bank.shiftLabels[r.shift] ?? r.shift, checkTime: formatCheckTime(r.check_time),
      stationsComplete: completed.length, stationCount, l1Complete: completed.length === stationCount,
      outOfRange, missed: stations.filter((s: any) => s.status === 'missed').length,
      percent, filledPct: pct(answered, fullExpected), band: percent !== null ? bandOf(percent) : null,
      onTime: completed.length > 0 && deadline ? !late : null,
      l2Complete: !!r.l2_completed_at, l3Complete: !!r.l3_completed_at, delayReason: r.delay_reason ?? null,
      shiftKey: r.shift, recorded: !r.noRecord,
    };
  }).sort((a, b) => a.date !== b.date ? (a.date < b.date ? 1 : -1)
    : a.outletName !== b.outletName ? a.outletName.localeCompare(b.outletName)
    : bank.activeShifts.indexOf(a.shiftKey) - bank.activeShifts.indexOf(b.shiftKey)); // Opening before Closing, always

  // ---- KPIs: this period and the one before ----
  const kpiOf = (rs: any[]): Kpis => {
    const k = emptyKpis();
    let pts = 0, scored = 0;
    for (const r of rs) {
      let anyDone = false;
      for (const s of r.line_check_stations ?? []) {
        const st = statsOf(s);
        const c = classify(s, r.run_date, st.answered);
        if (c === 'ignore') continue;
        k.stationsInPlay++; k.answered += st.answered; k.expectedAnswers += st.expected; pts += st.pts; scored += st.scored; k.tempFails += st.fails;
        if (c === 'done') { k.stationsDone++; anyDone = true; } else if (c === 'partial') k.stationsPartial++; else k.notStarted++;
      }
      if (anyDone && deadlineOf(r.shift)) { if (isLate(r)) k.shiftsLate++; else k.shiftsOnTime++; }
    }
    k.coveragePct = pct(k.answered, k.expectedAnswers);
    k.passPct = scored ? Math.round((pts / scored) * 1000) / 10 : null;
    k.completionPct = pct(k.stationsDone, k.stationsInPlay);
    k.onTimePct = pct(k.shiftsOnTime, k.shiftsOnTime + k.shiftsLate);
    return k;
  };

  // The charts are an extra: if building them ever fails, the table and headline still load.
  let insights: L3Insights | undefined;
  try {
    const kpis = kpiOf(runs);
    const hasPrevious = days <= PREVIOUS_MAX_SPAN;
    const previous = hasPrevious ? kpiOf(withMissing(await runsPage(db, outletIds, previousFrom, previousTo, o.shift, o.station), previousFrom, previousTo)) : emptyKpis();

    type Acc = { done: number; partial: number; notStarted: number; answered: number; expected: number; fails: number; pts: number; scored: number };
    const acc = (): Acc => ({ done: 0, partial: 0, notStarted: 0, answered: 0, expected: 0, fails: 0, pts: 0, scored: 0 });
    const daily = new Map<string, Acc>(), byStation = new Map<number, Acc>(), byShift = new Map<string, Acc & { runs: number; late: number }>();
    const byOutlet = new Map<string, Acc & { onT: number; late: number; shifts: number }>();
    const fails = new Map<string, { prompt: string; station: string; count: number }>();
    const corrective = { total: 0, withComment: 0, withPhoto: 0 };
    const heatAcc: Record<string, Record<string, { t: number; d: number; ns: number; ans: number; exp: number; f: number }>> = {};

    for (const r of runs) {
      const dA = daily.get(r.run_date) ?? acc();
      const shA = byShift.get(r.shift) ?? { ...acc(), runs: 0, late: 0 };
      const oA = byOutlet.get(r.outlet_id) ?? { ...acc(), onT: 0, late: 0, shifts: 0 };
      shA.runs++; oA.shifts++;
      let anyDone = false;
      for (const s of r.line_check_stations ?? []) {
        const st = statsOf(s);
        const c = classify(s, r.run_date, st.answered);
        const sA = byStation.get(s.station_no) ?? acc();
        const hc = ((heatAcc[stationName(s.station_no)] ??= {})[r.run_date] ??= { t: 0, d: 0, ns: 0, ans: 0, exp: 0, f: 0 });
        hc.f += st.fails;
        if (c !== 'ignore') {
          for (const a of [dA, shA, oA, sA]) {
            a.answered += st.answered; a.expected += st.expected; a.pts += st.pts; a.scored += st.scored; a.fails += st.fails;
            if (c === 'done') a.done++; else if (c === 'partial') a.partial++; else a.notStarted++;
          }
          hc.t++; hc.ans += st.answered; hc.exp += st.expected;
          if (c === 'done') { hc.d++; anyDone = true; } else if (c === 'notStarted') hc.ns++;
        }
        for (const a of s.line_check_answers ?? []) {
          if (!a.out_of_range) continue;
          corrective.total++;
          if (a.reason && String(a.reason).trim()) corrective.withComment++;
          if (a.correction_photo_path) corrective.withPhoto++;
          const q = allQuestions.find((x) => x.id === a.question_id);
          const f = fails.get(a.question_id) ?? { prompt: (q?.prompt ?? a.question_id).replace(/ — .*$/, ''), station: stationName(s.station_no), count: 0 };
          f.count++; fails.set(a.question_id, f);
        }
        byStation.set(s.station_no, sA);
      }
      if (lateRun.get(r.id)) { shA.late++; oA.late++; } else if (anyDone && deadlineOf(r.shift)) oA.onT++;
      daily.set(r.run_date, dA); byShift.set(r.shift, shA); byOutlet.set(r.outlet_id, oA);
    }

    const cells: Record<string, Record<string, HeatCell>> = {};
    for (const [st, byDate] of Object.entries(heatAcc)) {
      cells[st] = {};
      for (const [d, c] of Object.entries(byDate)) {
        cells[st][d] = { s: c.t > 0 && c.d === c.t ? 'done' : c.ans > 0 ? 'partial' : c.ns > 0 ? 'missed' : 'none', f: c.f, p: pct(c.ans, c.exp) };
      }
    }
    const avgScore = new Map<string, number[]>();
    for (const row of rows) if (row.percent !== null) (avgScore.get(row.outletId) ?? avgScore.set(row.outletId, []).get(row.outletId)!).push(row.percent);
    const passOf = (a: Acc) => (a.scored ? Math.round((a.pts / a.scored) * 1000) / 10 : null);
    const dates = [...new Set(runs.map((r: any) => r.run_date as string))].sort().slice(-31);

    insights = {
      kpis, previous,
      range: { from, to, days, previousFrom, previousTo, capped, hasPrevious },
      daily: [...daily.entries()].sort(([a], [b]) => (a < b ? -1 : 1)).map(([date, a]) => ({ date, done: a.done, partial: a.partial, notStarted: a.notStarted, tempFails: a.fails, coveragePct: pct(a.answered, a.expected), passPct: passOf(a) })),
      byStation: [...byStation.entries()].sort(([a], [b]) => a - b).map(([no, a]) => ({ name: stationName(no), done: a.done, partial: a.partial, notStarted: a.notStarted, tempFails: a.fails, coveragePct: pct(a.answered, a.expected) })),
      byShift: [...byShift.entries()].map(([k, a]) => ({ label: bank.shiftLabels[k] ?? k, runs: a.runs, done: a.done, partial: a.partial, notStarted: a.notStarted, late: a.late, coveragePct: pct(a.answered, a.expected) })),
      byOutlet: selected.map((x: any) => {
        const a = byOutlet.get(x.id) ?? { ...acc(), onT: 0, late: 0, shifts: 0 };
        const sc = avgScore.get(x.id) ?? [];
        return {
          id: x.id, name: x.name, location: x.location ?? null, coveragePct: pct(a.answered, a.expected), passPct: passOf(a),
          completionPct: pct(a.done, a.done + a.partial + a.notStarted), onTimePct: pct(a.onT, a.onT + a.late), tempFails: a.fails, notStarted: a.notStarted,
          avgScore: sc.length ? Math.round((sc.reduce((p, c) => p + c, 0) / sc.length) * 10) / 10 : null, shifts: a.shifts,
        };
      }),
      topFails: [...fails.values()].sort((a, b) => b.count - a.count).slice(0, 8),
      corrective,
      heat: { stations: bank.stations.map((b) => b.name), dates, cells },
    };
  } catch (e) {
    console.error('L3 insights failed:', e);
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
    insights, orgName: manager.name,
    outlets: allOutlets.map((x: any) => ({ id: x.id, name: x.name, location: x.location ?? null })),
    locations, selectedOutletId: o.outletId && pool.length ? o.outletId : null, selectedLocation: o.location && pool.length ? o.location : null,
    rows, headline,
    filterOptions: {
      shifts: bank.activeShifts.map((k) => ({ key: k, label: bank.shiftLabels[k] ?? k })),
      stations: bank.stations.map((b) => ({ no: b.no, name: b.name })),
    },
  };
}
