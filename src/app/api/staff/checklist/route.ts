import { json } from '@/lib/no-store';
import { createAdminClient } from '@/lib/supabase/admin';
import { readSession } from '@/lib/session';
import { ensureRuns, refreshLocks, unlockableRoleNames, type ItemView, type RunView } from '@/lib/checklist';
import { addMinutes, todayIn } from '@/lib/time';
import { unwrap } from '@/lib/db';

// These routes read a session cookie and live database state, so they must run
// per-request. Without this Next.js tries to execute them at build time, which
// fails because no configuration or request exists yet.
export const dynamic = 'force-dynamic';

// Everything the staff checklist screen needs, in one request.
//
// This route uses the service role, which bypasses row-level security, so
// every query below is scoped explicitly by org and outlet from the signed
// session — never from anything the caller supplied.
export async function GET() {
  const session = await readSession();
  if (!session) return json({ error: 'Not signed in.' }, { status: 401 });
  if (!session.shiftId) return json({ error: 'No shift selected.' }, { status: 400 });

  const db = createAdminClient();

  const { data: outlet } = await db
    .from('outlets').select('id, org_id, name, timezone')
    .eq('id', session.outletId).single();
  if (!outlet) return json({ error: 'Outlet not found.' }, { status: 404 });

  const { data: org } = await db
    .from('organisations')
    .select('id, overdue_grace_minutes, unlock_escalation_minutes, default_unlock_window_minutes')
    .eq('id', outlet.org_id).single();
  if (!org) return json({ error: 'Organisation not found.' }, { status: 404 });

  const date = todayIn(outlet.timezone);
  await ensureRuns(db, outlet, date);
  await refreshLocks(db, org, outlet.id, date);

  const { data: roles } = await db
    .from('roles').select('name, level, can_unlock').eq('org_id', org.id);
  const { data: myRole } = await db
    .from('roles').select('name, level').eq('id', session.roleId).single();

  // Only this person's role and chosen shift.
  const { data: runs } = await db
    .from('checklist_runs')
    .select('id, starts_at, ends_at, template_id, checklist_templates!inner(id, title, role_id), shifts!inner(name)')
    .eq('outlet_id', outlet.id)
    .eq('run_date', date)
    .eq('shift_id', session.shiftId)
    .eq('checklist_templates.role_id', session.roleId);

  const runIds = (runs ?? []).map((r) => r.id);
  if (runIds.length === 0) {
    return json({
      outlet: outlet.name, date, timezone: outlet.timezone,
      staff: { name: session.name, role: myRole?.name },
      runs: [] as RunView[],
    });
  }

  const [items, submissions, locks] = await Promise.all([
    db.from('checklist_items')
      .select('*')
      .in('template_id', (runs ?? []).map((r) => r.template_id))
      .eq('is_active', true)
      .order('sort_order')
      .then((r) => unwrap<any[]>(r, 'checklist items')),
    db.from('submissions')
      // submissions references users twice (user_id and reviewed_by), so the
      // relationship has to be named or PostgREST refuses the whole query.
      .select('*, users!submissions_user_id_fkey(name)')
      .in('run_id', runIds).is('superseded_by', null)
      .then((r) => unwrap<any[]>(r, 'submissions')),
    db.from('item_locks').select('*').in('run_id', runIds)
      .then((r) => unwrap<any[]>(r, 'item locks')),
  ]);

  const subByKey = new Map((submissions ?? []).map((s) => [`${s.run_id}:${s.checklist_item_id}`, s]));
  const lockByKey = new Map((locks ?? []).map((l) => [`${l.run_id}:${l.checklist_item_id}`, l]));

  const result: RunView[] = (runs ?? []).map((run) => {
    const template: any = Array.isArray(run.checklist_templates)
      ? run.checklist_templates[0] : run.checklist_templates;
    const shift: any = Array.isArray(run.shifts) ? run.shifts[0] : run.shifts;

    const views: ItemView[] = (items ?? [])
      .filter((i) => i.template_id === run.template_id)
      .map((i) => {
        const key = `${run.id}:${i.id}`;
        const sub = subByKey.get(key);
        const lock = lockByKey.get(key);
        const dueAt = addMinutes(run.starts_at, i.due_offset_minutes);

        let state: ItemView['state'] = 'todo';
        if (sub) state = sub.status === 'waived' ? 'waived' : 'done';
        else if (lock?.state === 'unlocked') state = 'unlocked';
        else if (lock?.state === 'locked') state = 'locked';

        return {
          id: i.id,
          title: i.title,
          description: i.description,
          proof: i.proof,
          proofRequired: i.proof_required,
          photoMode: i.photo_mode ?? 'none',
          requiresApproval: i.requires_approval,
          unit: i.unit,
          minValue: i.min_value,
          maxValue: i.max_value,
          dueAt: dueAt.toISOString(),
          state,
          submission: sub ? {
            id: sub.id, status: sub.status,
            valueNumber: sub.value_number, valueText: sub.value_text,
            photoPath: sub.photo_path, comment: sub.comment,
            submittedAt: sub.submitted_at,
            wasLate: sub.was_late, outOfBounds: sub.out_of_bounds,
            byName: (Array.isArray(sub.users) ? sub.users[0] : sub.users)?.name,
          } : null,
          lock: lock ? {
            lockedAt: lock.locked_at,
            escalationLevel: lock.escalation_level,
            escalatesAt: lock.escalates_at,
            unlockExpiresAt: lock.unlock_expires_at,
            unlockComment: lock.unlock_comment,
            // Staff see exactly who can reopen this, and when it climbs.
            unlockableBy: unlockableRoleNames(
              roles ?? [], myRole?.level ?? 1, lock.escalation_level
            ),
            nextLevelAt: lock.state === 'locked' ? lock.escalates_at : null,
          } : null,
        };
      });

    return {
      runId: run.id,
      templateTitle: template.title,
      shiftName: shift.name,
      startsAt: run.starts_at,
      endsAt: run.ends_at,
      items: views,
    };
  });

  return json({
    outlet: outlet.name, date, timezone: outlet.timezone,
    staff: { name: session.name, role: myRole?.name },
    runs: result,
  });
}
