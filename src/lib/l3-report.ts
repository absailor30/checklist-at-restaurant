import type { SupabaseClient } from '@supabase/supabase-js';
import type { Manager } from '@/lib/supabase/server';
import { L1_QUESTIONS } from '@/lib/line-check/questions';
import { scoreAnswer, type LineCheckAnswer } from '@/lib/line-check/score-answer';
import { bandOf } from '@/lib/scoring';

// L3's report: how every outlet's L1 shifts scored, and where L2/L3 review is
// still pending, over a date range. Built on the line_check_* tables.

export interface L3ReportRow {
  date: string; outletId: string; outletName: string; shift: string;
  stationsComplete: number; stationCount: number; l1Complete: boolean;
  percent: number | null; band: string | null; onTime: boolean | null;
  l2Complete: boolean; l3Complete: boolean;
}

export interface L3Report {
  orgName: string;
  outlets: { id: string; name: string }[];
  rows: L3ReportRow[];
  headline: {
    date: string; shiftsExpected: number; shiftsL1Complete: number;
    pendingL2: number; pendingL3: number; late: number;
  };
}

export async function buildL3Report(
  db: SupabaseClient, manager: Manager, days: number
): Promise<L3Report> {
  const { data: outlets } = await db
    .from('outlets')
    .select('id, name, timezone, station_count')
    .eq('org_id', manager.orgId)
    .eq('is_active', true)
    .order('name');

  if (!outlets || outlets.length === 0) {
    return {
      orgName: manager.name, outlets: [], rows: [],
      headline: { date: '', shiftsExpected: 0, shiftsL1Complete: 0, pendingL2: 0, pendingL3: 0, late: 0 },
    };
  }

  const todayLocal = new Intl.DateTimeFormat('en-CA', {
    timeZone: outlets[0].timezone || 'UTC', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());
  const from = new Date(`${todayLocal}T00:00:00Z`);
  from.setDate(from.getDate() - (days - 1));
  const fromDate = from.toISOString().slice(0, 10);

  const { data: runs, error } = await db
    .from('line_check_runs')
    .select(`
      id, outlet_id, run_date, shift, l2_completed_at, l3_completed_at,
      line_check_stations (
        station_no, status, completed_at,
        line_check_answers ( question_id, yes_no, value_number, photo_path, reason )
      )
    `)
    .in('outlet_id', outlets.map((o) => o.id))
    .gte('run_date', fromDate)
    .lte('run_date', todayLocal);

  if (error) throw new Error(error.message);

  const outletById = new Map(outlets.map((o) => [o.id, o]));

  const rows: L3ReportRow[] = (runs ?? []).map((r: any) => {
    const outlet = outletById.get(r.outlet_id);
    const stationCount = outlet?.station_count ?? 3;
    const stations = r.line_check_stations ?? [];
    const completed = stations.filter((s: any) => s.status === 'complete');

    let scoredTotal = 0, pointsTotal = 0, lateAny = false;
    for (const st of completed) {
      const answers: Record<string, LineCheckAnswer> = {};
      for (const a of st.line_check_answers ?? []) {
        answers[a.question_id] = {
          questionId: a.question_id,
          yesNo: a.yes_no, value: a.value_number,
          photoDataUrl: a.photo_path ? 'x' : null,
          reason: a.reason,
        };
      }
      for (const q of L1_QUESTIONS) {
        const s = scoreAnswer(q, answers[q.id]);
        if (s !== null) { scoredTotal++; pointsTotal += s; }
      }
      if (st.completed_at && outlet) {
        const local = localClock(st.completed_at, outlet.timezone || 'UTC');
        if (local >= `${r.run_date} 12:00`) lateAny = true;
      }
    }
    const percent = scoredTotal ? Math.round((pointsTotal / scoredTotal) * 1000) / 10 : null;

    return {
      date: r.run_date,
      outletId: r.outlet_id,
      outletName: outlet?.name ?? '',
      shift: r.shift,
      stationsComplete: completed.length,
      stationCount,
      l1Complete: completed.length === stationCount,
      percent,
      band: percent !== null ? bandOf(percent) : null,
      onTime: completed.length > 0 ? !lateAny : null,
      l2Complete: !!r.l2_completed_at,
      l3Complete: !!r.l3_completed_at,
    };
  }).sort((a, b) => a.date === b.date ? a.outletName.localeCompare(b.outletName) : a.date < b.date ? 1 : -1);

  const todayRows = rows.filter((r) => r.date === todayLocal);
  const headline = {
    date: todayLocal,
    shiftsExpected: outlets.length * 3,
    shiftsL1Complete: todayRows.filter((r) => r.l1Complete).length,
    pendingL2: todayRows.filter((r) => r.l1Complete && !r.l2Complete).length,
    pendingL3: todayRows.filter((r) => r.l2Complete && !r.l3Complete).length,
    late: todayRows.filter((r) => r.onTime === false).length,
  };

  return { orgName: manager.name, outlets: outlets.map((o) => ({ id: o.id, name: o.name })), rows, headline };
}

function localClock(iso: string, tz: string): string {
  const formatter = new Intl.DateTimeFormat('en-GB', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  });
  const parts = Object.fromEntries(formatter.formatToParts(new Date(iso)).map((p) => [p.type, p.value]));
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}`;
}
