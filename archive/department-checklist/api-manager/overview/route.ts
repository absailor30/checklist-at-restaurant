import { json } from '@/lib/no-store';
import { createAdminClient } from '@/lib/supabase/admin';
import { currentManager } from '@/lib/supabase/server';
import { ensureRuns, refreshLocks } from '@/lib/checklist';
import { empoweredRoles } from '@/lib/authority';
import { addMinutes, todayIn } from '@/lib/time';
import { unwrap } from '@/lib/db';

export const dynamic = 'force-dynamic';

// Everything a manager needs on one screen: what is locked and waiting on
// them, what needs approval, what readings came back out of range, and how
// each outlet is tracking today.
export async function GET(request: Request) {
  const manager = await currentManager();
  if (!manager) return json({ error: 'Not signed in.' }, { status: 401 });
  if (!manager.canReview && !manager.canUnlock) {
    return json({ error: 'Your role has no review access.' }, { status: 403 });
  }

  // Reads are already confined to the manager's organisation by the row-level
  // security policies; the admin client is used here only so that creating
  // today's runs and refreshing lock state can write.
  const db = createAdminClient();
  const dateParam = new URL(request.url).searchParams.get('date');

  const { data: outlets } = await db
    .from('outlets')
    .select('id, org_id, name, timezone')
    .eq('org_id', manager.orgId).eq('is_active', true).order('name');

  const { data: org } = await db
    .from('organisations')
    .select('id, overdue_grace_minutes, unlock_escalation_minutes, default_unlock_window_minutes')
    .eq('id', manager.orgId).single();

  const { data: roles } = await db
    .from('roles').select('id, name, level, can_unlock').eq('org_id', manager.orgId);

  const date = dateParam ?? todayIn(outlets?.[0]?.timezone ?? 'Asia/Kolkata');

  for (const outlet of outlets ?? []) {
    await ensureRuns(db, outlet, date);
    await refreshLocks(db, org!, outlet.id, date);
  }

  const { data: runs } = await db
    .from('checklist_runs')
    .select('id, outlet_id, template_id, starts_at, checklist_templates!inner(title, role_id), shifts!inner(name)')
    .eq('org_id', manager.orgId).eq('run_date', date);

  const runIds = (runs ?? []).map((r) => r.id);
  const runById = new Map((runs ?? []).map((r) => [r.id, r]));

  const empty = { locked: [], review: [], alerts: [], outlets: [], date };
  if (!runIds.length) return json(empty);

  const [items, submissions, locks] = await Promise.all([
    db.from('checklist_items').select('*').eq('org_id', manager.orgId).eq('is_active', true)
      .then((r) => unwrap<any[]>(r, 'checklist items')),
    db.from('submissions')
      // Named relationship: submissions references users twice.
      .select('*, users!submissions_user_id_fkey(name, role_id)')
      .in('run_id', runIds)
      .then((r) => unwrap<any[]>(r, 'submissions')),
    db.from('item_locks').select('*').in('run_id', runIds).neq('state', 'resolved')
      .then((r) => unwrap<any[]>(r, 'item locks')),
  ]);

  const itemById = new Map((items ?? []).map((i) => [i.id, i]));
  const outletById = new Map((outlets ?? []).map((o) => [o.id, o]));
  const roleById = new Map((roles ?? []).map((r) => [r.id, r]));
  // Superseded rows still count as "this item was done", but they are excluded
  // from the approval queue below so a replaced reading is not reviewed twice.
  const live = (submissions ?? []).filter((s) => !s.superseded_by);
  const submittedKeys = new Set(
    live.map((s) => `${s.run_id}:${s.checklist_item_id}`)
  );

  // Frozen and unlocked items.
  const locked = (locks ?? [])
    .filter((l) => !submittedKeys.has(`${l.run_id}:${l.checklist_item_id}`))
    .map((lock) => {
      const run: any = runById.get(lock.run_id);
      const item = itemById.get(lock.checklist_item_id);
      const template: any = Array.isArray(run?.checklist_templates)
        ? run.checklist_templates[0] : run?.checklist_templates;
      const submitterRole: any = roleById.get(template?.role_id);
      const empowered = empoweredRoles(
        roles ?? [], submitterRole?.level ?? 1, lock.escalation_level
      );

      return {
        lockId: lock.id,
        runId: lock.run_id,
        itemId: lock.checklist_item_id,
        title: item?.title ?? 'Unknown task',
        proof: item?.proof ?? 'none',
        unit: item?.unit ?? null,
        minValue: item?.min_value ?? null,
        maxValue: item?.max_value ?? null,
        outlet: outletById.get(lock.outlet_id)?.name ?? '',
        outletId: lock.outlet_id,
        checklist: template?.title ?? '',
        shift: (Array.isArray(run?.shifts) ? run.shifts[0] : run?.shifts)?.name ?? '',
        forRole: submitterRole?.name ?? '',
        state: lock.state,
        lockedAt: lock.locked_at,
        escalationLevel: lock.escalation_level,
        escalatesAt: lock.escalates_at,
        unlockExpiresAt: lock.unlock_expires_at,
        unlockComment: lock.unlock_comment,
        empoweredRoles: empowered.map((r) => r.name),
        // Whether this particular manager can act on it right now.
        youCanUnlock: empowered.some((r) => r.id === manager.roleId),
        dueAt: item ? addMinutes(run.starts_at, item.due_offset_minutes).toISOString() : null,
      };
    })
    .sort((a, b) => (b.escalationLevel - a.escalationLevel) ||
                    (new Date(a.lockedAt).getTime() - new Date(b.lockedAt).getTime()));

  // Submissions awaiting approval.
  const review = live
    .filter((s) => s.status === 'submitted' && itemById.get(s.checklist_item_id)?.requires_approval)
    .map((s) => shapeSubmission(s, itemById, outletById, runById))
    .sort((a, b) => new Date(a.submittedAt).getTime() - new Date(b.submittedAt).getTime());

  // Out-of-range readings, whether or not they needed approval. A freezer
  // running warm must never sit silently in an auto-approved pile.
  const alerts = (submissions ?? [])
    .filter((s) => s.out_of_bounds)
    .map((s) => shapeSubmission(s, itemById, outletById, runById))
    .sort((a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime());

  // Per-outlet completion for the day.
  const outletStats = (outlets ?? []).map((o) => {
    const theirRuns = (runs ?? []).filter((r) => r.outlet_id === o.id);
    const total = theirRuns.reduce(
      (n, r) => n + (items ?? []).filter((i) => i.template_id === r.template_id).length, 0
    );
    const done = (submissions ?? []).filter((s) => s.outlet_id === o.id).length;
    const lockedNow = locked.filter((l) => l.outletId === o.id).length;
    return {
      id: o.id, name: o.name, total, done, locked: lockedNow,
      percent: total ? Math.round((done / total) * 100) : 0,
    };
  });

  return json({
    date,
    manager: {
      name: manager.name, role: manager.roleName,
      canReview: manager.canReview, canUnlock: manager.canUnlock,
    },
    defaultUnlockWindow: org?.default_unlock_window_minutes ?? 30,
    locked, review, alerts, outlets: outletStats,
  });
}

function shapeSubmission(s: any, itemById: Map<string, any>, outletById: Map<string, any>, runById: Map<string, any>) {
  const item = itemById.get(s.checklist_item_id);
  const run: any = runById.get(s.run_id);
  const template: any = Array.isArray(run?.checklist_templates)
    ? run.checklist_templates[0] : run?.checklist_templates;
  return {
    id: s.id,
    title: item?.title ?? 'Unknown task',
    unit: item?.unit ?? null,
    minValue: item?.min_value ?? null,
    maxValue: item?.max_value ?? null,
    outlet: outletById.get(s.outlet_id)?.name ?? '',
    checklist: template?.title ?? '',
    by: (Array.isArray(s.users) ? s.users[0] : s.users)?.name ?? 'Staff',
    valueNumber: s.value_number,
    valueText: s.value_text,
    photoPath: s.photo_path,
    comment: s.comment,
    status: s.status,
    outOfBounds: s.out_of_bounds,
    wasLate: s.was_late,
    submittedAt: s.submitted_at,
    replaced: Boolean(s.superseded_by),
  };
}
