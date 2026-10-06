import { SupabaseClient } from '@supabase/supabase-js';

/**
 * Enforces the hard stop for line checks. If the current time is past the hard stop,
 * any stations that have not been completed are marked as missed.
 */
export async function enforceLineCheckMisses(
  db: SupabaseClient,
  outletId: string,
  runDate: string
) {
  // Try to find the line_check_runs for outlet_id and runDate
  const { data: run } = await db
    .from('line_check_runs')
    .select('id')
    .eq('outlet_id', outletId)
    .eq('run_date', runDate)
    .single();

  if (!run) {
    // If it doesn't exist, create it, and insert 3 stations (1, 2, 3) with status = 'missed' and pause_reason = 'Never started'
    const { data: newRun, error: insertError } = await db
      .from('line_check_runs')
      .insert({ outlet_id: outletId, run_date: runDate })
      .select('id')
      .single();

    if (newRun && !insertError) {
      await db.from('line_check_stations').insert([
        { run_id: newRun.id, station_no: 1, status: 'missed', pause_reason: 'Never started' },
        { run_id: newRun.id, station_no: 2, status: 'missed', pause_reason: 'Never started' },
        { run_id: newRun.id, station_no: 3, status: 'missed', pause_reason: 'Never started' },
      ]);
    }
  } else {
    // If it does exist, update any line_check_stations for this run where status is in ('idle', 'in_progress', 'paused').
    const { data: stations } = await db
      .from('line_check_stations')
      .select('id, status, pause_reason')
      .eq('run_id', run.id)
      .in('status', ['idle', 'in_progress', 'paused']);

    if (stations && stations.length > 0) {
      for (const station of stations) {
        await db
          .from('line_check_stations')
          .update({
            status: 'missed',
            pause_reason: (station.status === 'idle' || station.status === 'in_progress')
              ? 'Unfinished at deadline'
              : station.pause_reason
          })
          .eq('id', station.id);
      }
    }
  }
}

/**
 * Per-shift deadline: once a shift's deadline has passed, every station of that shift's run
 * that is not complete is marked missed (paused stations keep the reason they were paused
 * for). A shift nobody started gets a run with every station missed. Unlike the older
 * enforceLineCheckMisses this looks at one shift only, so Opening's deadline never touches
 * the Closing run.
 */
export async function enforceShiftMisses(
  db: SupabaseClient,
  outletId: string,
  runDate: string,
  shift: string,
  stationCount: number
) {
  let { data: run } = await db
    .from('line_check_runs')
    .select('id')
    .eq('outlet_id', outletId)
    .eq('run_date', runDate)
    .eq('shift', shift)
    .maybeSingle();

  if (!run) {
    const { data: created } = await db
      .from('line_check_runs')
      .insert({ outlet_id: outletId, run_date: runDate, shift })
      .select('id')
      .single();
    run = created;
  }
  if (!run) return;

  const { data: stations } = await db
    .from('line_check_stations')
    .select('id, station_no, status, pause_reason')
    .eq('run_id', run.id);

  const have = new Map((stations ?? []).map((s: any) => [s.station_no, s]));
  const toInsert: any[] = [];
  for (let n = 1; n <= stationCount; n++) {
    const s = have.get(n);
    if (!s) {
      toInsert.push({ run_id: run.id, station_no: n, status: 'missed', pause_reason: 'Never started' });
    } else if (s.status === 'idle' || s.status === 'in_progress') {
      await db.from('line_check_stations').update({ status: 'missed', pause_reason: 'Unfinished at deadline' }).eq('id', s.id);
    } else if (s.status === 'paused') {
      await db.from('line_check_stations').update({ status: 'missed' }).eq('id', s.id);
    }
  }
  if (toInsert.length) await db.from('line_check_stations').insert(toInsert);
}

/**
 * On-demand version of the deadline job: for brands with per-shift deadlines, marks
 * unfinished stations missed for any shift whose deadline has passed, for today and
 * yesterday only (older days are never touched). Safe to call on every dashboard load —
 * it only writes when something is still open. Never throws.
 */
export async function enforceDueShifts(
  db: SupabaseClient,
  orgId: string,
  outlets: { id: string; timezone: string | null; station_count: number | null }[]
) {
  try {
    const { data: org } = await db.from('organisations').select('line_check_config').eq('id', orgId).maybeSingle();
    const config = org?.line_check_config as any;
    if (!config?.shiftDeadlines) return;
    const { deadlineFor } = await import('./bank');
    const { activeShiftsOf } = await import('./shifts');
    const { todayIn, zonedToUtc } = await import('../time');
    for (const o of outlets) {
      const tz = o.timezone || 'UTC';
      const today = todayIn(tz);
      const yesterday = new Date(Date.parse(`${today}T00:00:00Z`) - 86400000).toISOString().slice(0, 10);
      for (const date of [yesterday, today]) {
        for (const shift of activeShiftsOf(config)) {
          const dl = deadlineFor(config, shift);
          if (!dl || zonedToUtc(date, dl, tz).getTime() > Date.now()) continue;
          await enforceShiftMisses(db, o.id, date, shift, o.station_count ?? 1);
        }
      }
    }
  } catch (e) {
    console.error('enforceDueShifts failed:', e);
  }
}
