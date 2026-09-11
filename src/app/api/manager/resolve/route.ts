import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { currentManager } from '@/lib/supabase/server';
import { canUnlock, chainContext, unlockRefusalReason } from '@/lib/authority';

export const dynamic = 'force-dynamic';

// A manager resolving a frozen item themselves, in one of two ways:
//
//   complete — they did the task. Recorded as completed_by_manager, kept
//              distinct from a staff completion so it never inflates a staff
//              member's completion rate.
//   waive    — the task genuinely did not apply today. Never counted as done,
//              and surfaced on the owner dashboard, because a manager who
//              waives everything is precisely what this app exists to expose.
//
// Both require a comment.
export async function POST(request: Request) {
  const manager = await currentManager();
  if (!manager) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
  if (!manager.canUnlock) {
    return NextResponse.json({ error: 'Your role cannot resolve tasks.' }, { status: 403 });
  }

  const { lockId, action, comment, value } = await request.json();
  if (action !== 'complete' && action !== 'waive') {
    return NextResponse.json({ error: 'Unknown action.' }, { status: 400 });
  }

  const reason = String(comment ?? '').trim();
  if (reason.length < 5) {
    return NextResponse.json(
      { error: 'A comment is required — it is recorded permanently.' },
      { status: 400 }
    );
  }

  const db = createAdminClient();

  const { data: lock } = await db
    .from('item_locks').select('*')
    .eq('id', lockId).eq('org_id', manager.orgId).maybeSingle();
  if (!lock) return NextResponse.json({ error: 'Task not found.' }, { status: 404 });
  if (lock.state === 'resolved') {
    return NextResponse.json({ error: 'That task is already resolved.' }, { status: 409 });
  }

  const { roles, submitterLevel } = await chainContext(db, manager.orgId, lock.run_id);
  if (!canUnlock(roles, manager.roleId, submitterLevel, lock.escalation_level)) {
    return NextResponse.json(
      { error: unlockRefusalReason(roles, submitterLevel, lock.escalation_level) },
      { status: 403 }
    );
  }

  const { data: item } = await db
    .from('checklist_items').select('*').eq('id', lock.checklist_item_id).single();

  let valueNumber: number | null = null;
  let outOfBounds = false;
  if (action === 'complete' && item?.proof === 'number' && value !== undefined && value !== '') {
    valueNumber = Number(value);
    if (Number.isNaN(valueNumber)) {
      return NextResponse.json({ error: 'That reading is not a number.' }, { status: 400 });
    }
    outOfBounds =
      (item.min_value !== null && valueNumber < Number(item.min_value)) ||
      (item.max_value !== null && valueNumber > Number(item.max_value));
  }

  const now = new Date();
  const { error } = await db.from('submissions').insert({
    id: crypto.randomUUID(),
    org_id: manager.orgId,
    outlet_id: lock.outlet_id,
    run_id: lock.run_id,
    checklist_item_id: lock.checklist_item_id,
    user_id: manager.id,
    value_number: valueNumber,
    value_text: action === 'waive' ? null : (item?.proof === 'text' ? reason : null),
    comment: reason,
    status: action === 'complete' ? 'completed_by_manager' : 'waived',
    out_of_bounds: outOfBounds,
    was_late: true,
    reviewed_by: manager.id,
    reviewed_at: now.toISOString(),
  });

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json({ error: 'Someone already completed this.' }, { status: 409 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await db.from('item_locks')
    .update({ state: 'resolved', resolved_at: now.toISOString() })
    .eq('id', lock.id);

  await db.from('lock_events').insert({
    org_id: manager.orgId, run_id: lock.run_id,
    checklist_item_id: lock.checklist_item_id,
    event: action === 'complete' ? 'manager_completed' : 'waived',
    actor_user_id: manager.id, comment: reason,
  });

  return NextResponse.json({ ok: true, outOfBounds });
}
