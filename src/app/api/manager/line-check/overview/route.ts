import { NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';

export async function GET(request: Request) {
  try {
    const supabase = await createServerSupabase();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from('users')
      .select('org_id')
      .eq('auth_user_id', user.id)
      .single();

    if (!profile) {
      return NextResponse.json({ error: 'User profile not found' }, { status: 404 });
    }

    const { searchParams } = new URL(request.url);
    let dateStr = searchParams.get('date');

    const { data: outlets, error: outletsError } = await supabase
      .from('outlets')
      .select(`
        id,
        name,
        timezone
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
          l2_completed_at,
          l3_completed_at,
          line_check_stations (
            station_no,
            status,
            pause_reason
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
            l2_completed_at,
            l3_completed_at,
            line_check_stations (
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

    const outletsWithRuns = outlets.map((outlet: any) => ({
      ...outlet,
      line_check_runs: runs?.filter((r: any) => r.outlet_id === outlet.id) || []
    }));

    return NextResponse.json({ outlets: outletsWithRuns });
  } catch (error: any) {
    console.error('Manager overview error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
