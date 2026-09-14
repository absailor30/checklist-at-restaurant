import { NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';

export async function GET(request: Request) {
  try {
    const supabase = await createServerSupabase();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const level = searchParams.get('level');

    if (level === 'L2' || level === 'L3') {
      const { data: profile } = await supabase
        .from('users')
        .select('roles(name)')
        .eq('auth_user_id', user.id)
        .single();
      const roleName = Array.isArray(profile?.roles) ? profile.roles[0]?.name : (profile?.roles as any)?.name;
      const allowed = level === 'L2'
        ? roleName === 'Shift Manager'
        : roleName === 'General Manager' || roleName === 'Owner';
      if (!allowed) {
        return NextResponse.json({ error: `${level} review is not available for your role.` }, { status: 403 });
      }
    }

    let query = supabase
      .from('line_check_questions')
      .select('*')
      .order('sort_order');

    if (level) {
      query = query.eq('level', level);
    } else {
      query = query.in('level', ['L2', 'L3']);
    }

    const { data: questions, error } = await query;

    if (error) throw error;

    return NextResponse.json({ questions });
  } catch (error: any) {
    console.error('Questions error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
