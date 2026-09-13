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
