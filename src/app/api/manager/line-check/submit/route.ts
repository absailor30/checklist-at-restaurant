import { NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';

export async function POST(request: Request) {
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

    const body = await request.json();
    const { run_id, level, answers } = body;

    if (!run_id || !level || !answers || !Array.isArray(answers)) {
      return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
    }

    // Verify run_id belongs to the manager's org
    const { data: run, error: runError } = await supabase
      .from('line_check_runs')
      .select('outlets(org_id)')
      .eq('id', run_id)
      .single();

    const runOrgId = Array.isArray(run?.outlets) ? run.outlets[0]?.org_id : (run?.outlets as any)?.org_id;

    if (runError || !run || runOrgId !== profile.org_id) {
       return NextResponse.json({ error: 'Invalid run_id' }, { status: 403 });
    }

    // Insert answers
    const answersToInsert = answers.map((a: any) => ({
      run_id,
      question_id: a.question_id,
      yes_no: a.yes_no,
      value_number: a.value_number,
      photo_path: a.photo_path,
      reason: a.reason
    }));

    const { error: insertError } = await supabase
      .from('line_check_manager_answers')
      .upsert(answersToInsert, { onConflict: 'run_id,question_id' });

    if (insertError) throw insertError;

    // Update run completion timestamp
    const updatePayload: any = {};
    if (level === 'L2') updatePayload.l2_completed_at = new Date().toISOString();
    if (level === 'L3') updatePayload.l3_completed_at = new Date().toISOString();

    const { error: updateError } = await supabase
      .from('line_check_runs')
      .update(updatePayload)
      .eq('id', run_id);

    if (updateError) throw updateError;

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Manager submit error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
