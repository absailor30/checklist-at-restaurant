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
      .select('org_id, roles(name)')
      .eq('auth_user_id', user.id)
      .single();
    if (!profile) return NextResponse.json({ error: 'User profile not found' }, { status: 404 });

    const { searchParams } = new URL(request.url);
    const level = searchParams.get('level');

    if (level === 'L2' || level === 'L3') {
      const roleName = Array.isArray(profile.roles) ? profile.roles[0]?.name : (profile.roles as any)?.name;
      const allowed = level === 'L2'
        ? roleName === 'L2 Manager' || roleName === 'Shift Manager'
        : roleName === 'L3 Owner' || roleName === 'General Manager' || roleName === 'Owner';
      if (!allowed) {
        return NextResponse.json({ error: `${level} review is not available for your role.` }, { status: 403 });
      }
    }

    // A custom question is additive: every org sees the global defaults
    // (org_id null) plus only its own custom rows, never another org's.
    let query = supabase
      .from('line_check_questions')
      .select('*')
      .or(`org_id.is.null,org_id.eq.${profile.org_id}`)
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

// Add a custom question to L2 or L3 for the manager's own org. Never
// touches or removes the global defaults.
export async function POST(request: Request) {
  try {
    const supabase = await createServerSupabase();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from('users')
      .select('org_id, roles(name)')
      .eq('auth_user_id', user.id)
      .single();
    if (!profile) return NextResponse.json({ error: 'User profile not found' }, { status: 404 });

    const roleName = Array.isArray(profile.roles) ? profile.roles[0]?.name : (profile.roles as any)?.name;
    const canManage = roleName === 'L3 Owner' || roleName === 'General Manager' || roleName === 'Owner';
    if (!canManage) {
      return NextResponse.json({ error: 'Only L3 can add questions.' }, { status: 403 });
    }

    const { level, prompt } = await request.json();
    if ((level !== 'L2' && level !== 'L3') || !prompt || String(prompt).trim().length < 3) {
      return NextResponse.json({ error: 'A level (L2 or L3) and a prompt are required.' }, { status: 400 });
    }

    const { data: existing } = await supabase
      .from('line_check_questions')
      .select('sort_order')
      .or(`org_id.is.null,org_id.eq.${profile.org_id}`)
      .eq('level', level)
      .order('sort_order', { ascending: false })
      .limit(1);
    const nextSort = (existing?.[0]?.sort_order ?? 0) + 1;

    const { error } = await supabase.from('line_check_questions').insert({
      id: `${level.toLowerCase()}-custom-${profile.org_id}-${Date.now()}`,
      org_id: profile.org_id,
      level,
      sort_order: nextSort,
      kind: 'yes_no',
      prompt: String(prompt).trim(),
      photo_required: false,
      reason_on_no: false,
    });

    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (error: any) {
    console.error('Add question error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
