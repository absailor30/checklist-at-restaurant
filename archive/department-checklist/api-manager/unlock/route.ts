import { json } from '@/lib/no-store';
import { createAdminClient } from '@/lib/supabase/admin';
import { currentManager } from '@/lib/supabase/server';
import { canUnlock, chainContext, unlockRefusalReason } from '@/lib/authority';
import { addMinutes } from '@/lib/time';

export const dynamic = 'force-dynamic';

// Reopen a frozen item for a limited window.
//
// A comment is mandatory. An unlock with no stated reason is exactly the
// silent back-filling this feature exists to prevent, so it is rejected here
// rather than merely discouraged in the interface.
export async function POST(request: Request) {
  const manager = await currentManager();
  if (!manager) return json({ error: 'Not signed in.' }, { status: 401 });
  if (!manager.canUnlock) {
    return json({ error: 'Your role cannot unlock tasks.' }, { status: 403 });
  }

  const { lockId, comment, windowMinutes } = await request.json();
  const reason = String(comment ?? '').trim();
  if (reason.length < 5) {
    return json(
      { error: 'Explain why you are unlocking this — it is recorded permanently.' },
      { status: 400 }
    );
  }

  const minutes = Number(windowMinutes);
  if (!Number.isFinite(minutes) || minutes < 5 || minutes > 240) {
    return json(
      { error: 'The reopen window must be between 5 and 240 minutes.' },
      { status: 400 }
    );
  }

  const db = createAdminClient();

  const { data: lock } = await db
    .from('item_locks').select('*')
    .eq('id', lockId).eq('org_id', manager.orgId)
    .maybeSingle();
  if (!lock) return json({ error: 'Task not found.' }, { status: 404 });
  if (lock.state === 'resolved') {
    return json({ error: 'That task is already done.' }, { status: 409 });
  }

  const { roles, submitterLevel } = await chainContext(db, manager.orgId, lock.run_id);
  if (!canUnlock(roles, manager.roleId, submitterLevel, lock.escalation_level)) {
    return json(
      { error: unlockRefusalReason(roles, submitterLevel, lock.escalation_level) },
      { status: 403 }
    );
  }

  const now = new Date();
  const { error } = await db.from('item_locks').update({
    state: 'unlocked',
    unlocked_by: manager.id,
    unlocked_at: now.toISOString(),
    unlock_expires_at: addMinutes(now, minutes).toISOString(),
    unlock_comment: reason,
  }).eq('id', lock.id);
  if (error) return json({ error: error.message }, { status: 500 });

  await db.from('lock_events').insert({
    org_id: manager.orgId, run_id: lock.run_id,
    checklist_item_id: lock.checklist_item_id,
    event: 'unlocked', actor_user_id: manager.id,
    comment: `${reason} (reopened for ${minutes} minutes)`,
  });

  return json({ ok: true, expiresAt: addMinutes(now, minutes).toISOString() });
}
