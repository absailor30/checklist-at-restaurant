import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { currentManager } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

// Approve or reject a submission that required review.
export async function POST(request: Request) {
  const manager = await currentManager();
  if (!manager) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
  if (!manager.canReview) {
    return NextResponse.json({ error: 'Your role cannot review submissions.' }, { status: 403 });
  }

  const { submissionId, decision, note } = await request.json();
  if (decision !== 'approved' && decision !== 'rejected') {
    return NextResponse.json({ error: 'Unknown decision.' }, { status: 400 });
  }

  // A rejection tells a staff member their work was not acceptable. Saying why
  // is the difference between coaching and an unexplained black mark.
  const reviewNote = String(note ?? '').trim();
  if (decision === 'rejected' && reviewNote.length < 5) {
    return NextResponse.json(
      { error: 'Say what was wrong so the staff member knows what to fix.' },
      { status: 400 }
    );
  }

  const db = createAdminClient();
  const { data: submission } = await db
    .from('submissions').select('id, status, run_id, checklist_item_id, user_id')
    .eq('id', submissionId).eq('org_id', manager.orgId).maybeSingle();
  if (!submission) return NextResponse.json({ error: 'Submission not found.' }, { status: 404 });

  const { error } = await db.from('submissions').update({
    status: decision,
    reviewed_by: manager.id,
    reviewed_at: new Date().toISOString(),
    review_note: reviewNote || null,
  }).eq('id', submission.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Tell the staff member either way. Silent approval leaves them unsure
  // whether anyone looked.
  await db.from('notifications').insert({
    org_id: manager.orgId,
    user_id: submission.user_id,
    kind: decision === 'approved' ? 'approved' : 'rejected',
    title: decision === 'approved' ? 'Task approved' : 'Task sent back',
    body: reviewNote || (decision === 'approved' ? 'Approved by your manager.' : ''),
    payload: { submissionId: submission.id },
  });

  return NextResponse.json({ ok: true });
}
