import { NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { PHOTO_BUCKET } from '@/lib/storage';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

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

    if (!profile) {
      return NextResponse.json({ error: 'User profile not found' }, { status: 404 });
    }

    const form = await request.formData();
    const run_id = form.get('run_id') as string | null;
    const level = form.get('level') as string | null;
    const answers = JSON.parse((form.get('answers') as string) ?? '[]');

    if (!run_id || !level || !Array.isArray(answers)) {
      return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
    }

    if (level !== 'L2' && level !== 'L3') {
      return NextResponse.json({ error: 'Invalid level' }, { status: 400 });
    }

    const roleName = Array.isArray(profile.roles) ? profile.roles[0]?.name : (profile.roles as any)?.name;
    const allowed = level === 'L2'
      ? roleName === 'L2 Manager' || roleName === 'Shift Manager'
      : roleName === 'L3 Owner' || roleName === 'General Manager' || roleName === 'Owner';
    if (!allowed) {
      return NextResponse.json({ error: `${level} review is not available for your role.` }, { status: 403 });
    }

    // Verify run_id belongs to the manager's org
    const { data: run, error: runError } = await supabase
      .from('line_check_runs')
      .select('outlet_id, outlets(org_id)')
      .eq('id', run_id)
      .single();

    const runOrgId = Array.isArray(run?.outlets) ? run.outlets[0]?.org_id : (run?.outlets as any)?.org_id;

    if (runError || !run || runOrgId !== profile.org_id) {
       return NextResponse.json({ error: 'Invalid run_id' }, { status: 403 });
    }

    // Photos go to the same private bucket as L1 evidence, so uploading needs
    // the admin client — the manager's own RLS session has no storage grant.
    const admin = createAdminClient();

    const answersToInsert = [];
    for (const a of answers) {
      const photoFile = form.get(`photo_${a.question_id}`) as File | null;
      let photoPath: string | null = null;
      if (photoFile && photoFile.size > 0) {
        photoPath = `${profile.org_id}/${run.outlet_id}/${run_id}/${level.toLowerCase()}_${a.question_id}_${Date.now()}.jpg`;
        const { error: uploadError } = await admin.storage
          .from(PHOTO_BUCKET)
          .upload(photoPath, photoFile, { contentType: 'image/jpeg', upsert: true });
        if (uploadError) {
          console.error('Photo upload failed:', uploadError);
          photoPath = null;
        }
      }
      answersToInsert.push({
        run_id,
        question_id: a.question_id,
        yes_no: a.yes_no,
        value_number: a.value_number,
        reason: a.reason,
        flagged: Boolean(a.flagged),
        ...(photoPath ? { photo_path: photoPath } : {}),
      });
    }

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

    // A flagged answer becomes an open corrective action one tier up (L3
    // flags stay with L3 — there's no tier above it).
    const flaggedAnswers = answers.filter((a: any) => a.flagged);
    if (flaggedAnswers.length) {
      const assignedRole = level === 'L2' ? 'L3 Owner' : 'L3 Owner';
      const today = new Date().toISOString().slice(0, 10);
      for (const a of flaggedAnswers) {
        const { data: existing } = await admin
          .from('corrective_actions')
          .select('id')
          .eq('outlet_id', run.outlet_id)
          .eq('question_id', a.question_id)
          .eq('source', level.toLowerCase())
          .eq('status', 'open')
          .gte('created_at', `${today}T00:00:00Z`)
          .maybeSingle();
        if (!existing) {
          await admin.from('corrective_actions').insert({
            org_id: profile.org_id,
            outlet_id: run.outlet_id,
            source: level.toLowerCase(),
            question_id: a.question_id,
            description: a.reason || a.question_id,
            assigned_role: assignedRole,
          });
        }
      }
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Manager submit error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
