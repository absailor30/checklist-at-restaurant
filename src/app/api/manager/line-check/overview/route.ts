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
    if (!dateStr) {
      // Default to today in UTC if no date provided
      dateStr = new Date().toISOString().split('T')[0];
    }

    const { data: outlets, error: outletsError } = await supabase
      .from('outlets')
      .select(`
        id,
        name,
        timezone,
        line_check_runs (
          id,
          run_date,
          l2_completed_at,
          l3_completed_at,
          line_check_stations (
            station_no,
            status,
            pause_reason
          )
        )
      `)
      .eq('org_id', profile.org_id)
      .eq('line_check_runs.run_date', dateStr)
      .order('name');

    if (outletsError) throw outletsError;

    return NextResponse.json({ outlets });
  } catch (error: any) {
    console.error('Manager overview error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
