import type { SupabaseClient } from '@supabase/supabase-js';
import { addMinutes, zonedToUtc } from '@/lib/time';

// The checklist engine: materialising each day's runs, keeping lock state
// current, and assembling what one staff member should see right now.
//
// Lock state is refreshed on read as well as by the scheduled job. Reading is
// cheap (indexed queries over one outlet's current day) and it means the
// screen is never stale, even if the cron job is late or a deploy skipped a
// window.

export interface ItemView {
  id: string;
  title: string;
  description: string | null;
  proof: 'none' | 'photo' | 'number' | 'text';
  proofRequired: boolean;
  requiresApproval: boolean;
  unit: string | null;
  minValue: number | null;
  maxValue: number | null;
  dueAt: string;
  state: 'todo' | 'done' | 'locked' | 'unlocked' | 'waived';
  submission: {
    id: string;
    status: string;
    valueNumber: number | null;
    valueText: string | null;
    photoPath: string | null;
    comment: string | null;
    submittedAt: string;
    wasLate: boolean;
    outOfBounds: boolean;
    byName?: string;
  } | null;
  lock: {
    lockedAt: string;
    escalationLevel: number;
    escalatesAt: string | null;
    unlockExpiresAt: string | null;
    unlockComment: string | null;
    // Staff see exactly who can reopen this and when it climbs. Hiding it
    // only causes confusion on the floor; it buys no accountability.
    unlockableBy: string[];
    nextLevelAt: string | null;
  } | null;
}

export interface RunView {
  runId: string;
  templateTitle: string;
  shiftName: string;
  startsAt: string;
  endsAt: string;
  items: ItemView[];
}

/**
 * Create today's runs for an outlet if they do not exist yet.
 *
 * Idempotent: the unique index on (template_id, outlet_id, run_date) means a
 * concurrent call from two devices cannot produce duplicates.
 */
export async function ensureRuns(
  db: SupabaseClient,
  outlet: { id: string; org_id: string; timezone: string },
  date: string
): Promise<void> {
  const weekday = isoWeekday(date, outlet.timezone);

  const { data: templates, error } = await db
    .from('checklist_templates')
    .select('id, shift_id, shifts!inner(id, start_time, end_time, days_of_week, is_active)')
    .eq('org_id', outlet.org_id)
    .eq('is_active', true)
    .or(`outlet_id.eq.${outlet.id},outlet_id.is.null`);
  if (error) throw error;

  const rows = [];
  for (const t of templates ?? []) {
    const shift: any = Array.isArray(t.shifts) ? t.shifts[0] : t.shifts;
    if (!shift?.is_active) continue;
    if (!shift.days_of_week?.includes(weekday)) continue;

    const startsAt = zonedToUtc(date, shift.start_time, outlet.timezone);
    let endsAt = zonedToUtc(date, shift.end_time, outlet.timezone);
    // A closing shift that runs past midnight ends on the following day.
    if (endsAt <= startsAt) endsAt = addMinutes(endsAt, 24 * 60);

    rows.push({
      org_id: outlet.org_id,
      outlet_id: outlet.id,
      template_id: t.id,
      shift_id: shift.id,
      run_date: date,
      starts_at: startsAt.toISOString(),
      ends_at: endsAt.toISOString(),
    });
  }

  if (rows.length === 0) return;
  const { error: insertError } = await db
    .from('checklist_runs')
    .upsert(rows, { onConflict: 'template_id,outlet_id,run_date', ignoreDuplicates: true });
  if (insertError) throw insertError;
}

/**
 * Bring lock state up to date for one outlet and date:
 *   - freeze items past their due time with no submission
 *   - re-freeze unlocked items whose window expired without a submission
 *   - escalate frozen items so the next level up gains unlock rights
 *
 * Every transition writes an immutable lock_events row.
 */
export async function refreshLocks(
  db: SupabaseClient,
  org: { id: string; overdue_grace_minutes: number; unlock_escalation_minutes: number },
  outletId: string,
  date: string
): Promise<void> {
  const now = new Date();

  const { data: runs } = await db
    .from('checklist_runs')
    .select('id, starts_at, checklist_templates!inner(id)')
    .eq('outlet_id', outletId)
    .eq('run_date', date);
  if (!runs?.length) return;

  const runIds = runs.map((r) => r.id);

  const [{ data: items }, { data: submissions }, { data: locks }] = await Promise.all([
    db.from('checklist_items')
      .select('id, template_id, due_offset_minutes')
      .eq('org_id', org.id).eq('is_active', true),
    db.from('submissions')
      .select('run_id, checklist_item_id')
      .in('run_id', runIds).is('superseded_by', null),
    db.from('item_locks')
      .select('*')
      .in('run_id', runIds),
  ]);

  const submitted = new Set((submissions ?? []).map((s) => `${s.run_id}:${s.checklist_item_id}`));
  const lockByKey = new Map((locks ?? []).map((l) => [`${l.run_id}:${l.checklist_item_id}`, l]));
  const itemsByTemplate = new Map<string, any[]>();
  for (const i of items ?? []) {
    const list = itemsByTemplate.get(i.template_id) ?? [];
    list.push(i);
    itemsByTemplate.set(i.template_id, list);
  }

  const newLocks: any[] = [];
  const events: any[] = [];
  const updates: { id: string; patch: any }[] = [];

  for (const run of runs) {
    const template: any = Array.isArray(run.checklist_templates)
      ? run.checklist_templates[0] : run.checklist_templates;
    for (const item of itemsByTemplate.get(template.id) ?? []) {
      const key = `${run.id}:${item.id}`;
      if (submitted.has(key)) continue;

      const dueAt = addMinutes(run.starts_at, item.due_offset_minutes);
      const freezeAt = addMinutes(dueAt, org.overdue_grace_minutes);
      const existing = lockByKey.get(key);

      // Not yet due (plus grace) — nothing to do.
      if (now < freezeAt) continue;

      if (!existing) {
        newLocks.push({
          org_id: org.id, outlet_id: outletId, run_id: run.id,
          checklist_item_id: item.id, state: 'locked',
          locked_at: freezeAt.toISOString(),
          escalation_level: 0,
          escalates_at: addMinutes(freezeAt, org.unlock_escalation_minutes).toISOString(),
        });
        events.push({
          org_id: org.id, run_id: run.id, checklist_item_id: item.id,
          event: 'frozen',
          comment: 'Due time passed with no submission.',
        });
        continue;
      }

      // An unlock window that expired without a submission re-freezes, and the
      // escalation clock resumes from now. An unlock is a second chance, not
      // an amnesty.
      if (existing.state === 'unlocked' && existing.unlock_expires_at &&
          new Date(existing.unlock_expires_at) <= now) {
        updates.push({
          id: existing.id,
          patch: {
            state: 'locked',
            unlocked_by: null, unlocked_at: null, unlock_expires_at: null,
            escalates_at: addMinutes(now, org.unlock_escalation_minutes).toISOString(),
          },
        });
        events.push({
          org_id: org.id, run_id: run.id, checklist_item_id: item.id,
          event: 'refrozen',
          comment: 'Unlock window expired with no submission.',
        });
        continue;
      }

      // Still frozen past its escalation time — the next level up is added.
      // The current level keeps its unlock rights; removing them mid-service
      // creates a deadlock with no upside.
      if (existing.state === 'locked' && existing.escalates_at &&
          new Date(existing.escalates_at) <= now) {
        const to = existing.escalation_level + 1;
        updates.push({
          id: existing.id,
          patch: {
            escalation_level: to,
            escalates_at: addMinutes(now, org.unlock_escalation_minutes).toISOString(),
          },
        });
        events.push({
          org_id: org.id, run_id: run.id, checklist_item_id: item.id,
          event: 'escalated',
          from_level: existing.escalation_level, to_level: to,
          comment: 'Still not completed. Unlock rights extended one level up.',
        });
      }
    }
  }

  if (newLocks.length) {
    await db.from('item_locks')
      .upsert(newLocks, { onConflict: 'run_id,checklist_item_id', ignoreDuplicates: true });
  }
  for (const u of updates) {
    await db.from('item_locks').update(u.patch).eq('id', u.id);
  }
  if (events.length) {
    await db.from('lock_events').insert(events);
  }
}

/** Roles that may unlock an item at a given escalation level, senior first. */
export function unlockableRoleNames(
  roles: { name: string; level: number; can_unlock: boolean }[],
  staffLevel: number,
  escalationLevel: number
): string[] {
  const above = roles
    .filter((r) => r.can_unlock && r.level > staffLevel)
    .sort((a, b) => a.level - b.level);
  return above.slice(0, escalationLevel + 1).map((r) => r.name);
}

function isoWeekday(date: string, timeZone: string): number {
  const d = new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'short' })
    .format(new Date(`${date}T12:00:00Z`));
  return { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 }[d] ?? 1;
}
