import { NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';
import { deadlineFor, hardStopOf } from '@/lib/line-check/bank';
import { activeShiftsOf } from '@/lib/line-check/shifts';

export async function GET(request: Request) {
  try {
    const supabase = await createServerSupabase();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from('users')
      .select('org_id, approved, name, email, roles(name)')
      .eq('auth_user_id', user.id)
      .single();

    if (!profile) {
      return NextResponse.json({ error: 'User profile not found' }, { status: 404 });
    }

    const roleName = Array.isArray(profile.roles) ? profile.roles[0]?.name : (profile.roles as any)?.name;

    if (!profile.approved) {
      return NextResponse.json({ outlets: [], role: roleName || null, approved: false, name: profile.name, email: profile.email });
    }

    const { data: orgRow } = await supabase
      .from('organisations')
      .select('line_check_config')
      .eq('id', profile.org_id)
      .maybeSingle();
    const orgConfig = (orgRow?.line_check_config ?? {}) as { stationNames?: string[]; hardStop?: string };
    const stationNames = orgConfig.stationNames ?? [];
    const shiftLabels = (orgConfig as any).shiftLabels ?? {};
    const activeShifts = activeShiftsOf(orgConfig as any);
    const shiftDeadlines = Object.fromEntries(activeShifts.map((s) => [s, deadlineFor(orgConfig as any, s)]));
    const hardStop = hardStopOf(orgConfig);

    const { searchParams } = new URL(request.url);
    let dateStr = searchParams.get('date');

    const { data: outlets, error: outletsError } = await supabase
      .from('outlets')
      .select(`
        id,
        name,
        timezone,
        station_count
      `)
      .eq('org_id', profile.org_id)
      .order('name');

    if (outletsError) throw outletsError;

    if (!outlets || outlets.length === 0) {
      return NextResponse.json({ outlets: [] });
    }

    let runs: any[] = [];

    if (dateStr) {
      const { data, error } = await supabase
        .from('line_check_runs')
        .select(`
          id,
          outlet_id,
          run_date,
          shift,
          check_time,
          l2_completed_at,
          l3_completed_at,
          line_check_stations (
            id,
            station_no,
            status,
            pause_reason,
            completed_at
          )
        `)
        .in('outlet_id', outlets.map((o: any) => o.id))
        .eq('run_date', dateStr);

      if (error) throw error;
      runs = data || [];
    } else {
      const queries = outlets.map((outlet: any) => {
        const tz = outlet.timezone || 'UTC';
        const localDate = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
        return supabase
          .from('line_check_runs')
          .select(`
            id,
            outlet_id,
            run_date,
            shift,
            check_time,
            l2_completed_at,
            l3_completed_at,
            line_check_stations (
              id,
              station_no,
              status,
              pause_reason
            )
          `)
          .eq('outlet_id', outlet.id)
          .eq('run_date', localDate);
      });

      const results = await Promise.all(queries);
      for (const res of results) {
        if (res.error) throw res.error;
        if (res.data) {
          runs = runs.concat(res.data);
        }
      }
    }

    // Temperature readings outside the acceptable range, so L2/L3 see them
    // on the shift card and again when they open the review. Never allowed to
    // break the overview itself.
    const exceptionsByRun = new Map<string, any[]>();
    try {
      const stationRun = new Map<string, { runId: string; stationNo: number }>();
      for (const r of runs) for (const s of r.line_check_stations ?? []) stationRun.set(s.id, { runId: r.id, stationNo: s.station_no });
      if (stationRun.size) {
        const { data: oor } = await supabase
          .from('line_check_answers')
          .select('station_id, question_id, value_number, reason, photo_path, correction_photo_path')
          .in('station_id', [...stationRun.keys()])
          .eq('out_of_range', true);
        const qIds = [...new Set((oor ?? []).map((a: any) => a.question_id))];
        const { data: qs } = qIds.length
          ? await supabase.from('line_check_questions').select('id, prompt, min_value, max_value, unit').in('id', qIds)
          : { data: [] as any[] };
        const qById = new Map((qs ?? []).map((q: any) => [q.id, q]));
        for (const a of oor ?? []) {
          const where = stationRun.get(a.station_id);
          const q = qById.get(a.question_id);
          if (!where) continue;
          const list = exceptionsByRun.get(where.runId) ?? [];
          list.push({
            stationNo: where.stationNo,
            prompt: q?.prompt ?? a.question_id,
            value: a.value_number,
            unit: q?.unit ?? '',
            min: q?.min_value ?? null,
            max: q?.max_value ?? null,
            reason: a.reason,
            photoPath: a.photo_path,
            correctionPhotoPath: a.correction_photo_path,
          });
          exceptionsByRun.set(where.runId, list);
        }
      }
    } catch (e) {
      console.error('Exceptions lookup failed:', e);
    }

    const outletsWithRuns = outlets.map((outlet: any) => ({
      ...outlet,
      line_check_runs: (runs?.filter((r: any) => r.outlet_id === outlet.id) || []).map((r: any) => ({ ...r, exceptions: exceptionsByRun.get(r.id) ?? [] })),
    }));

    return NextResponse.json({ outlets: outletsWithRuns, role: roleName || null, approved: true, name: profile.name, email: profile.email, stationNames, hardStop, shiftLabels, activeShifts, shiftDeadlines });
  } catch (error: any) {
    console.error('Manager overview error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
