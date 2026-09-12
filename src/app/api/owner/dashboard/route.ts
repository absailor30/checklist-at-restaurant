import { json } from '@/lib/no-store';
import { createAdminClient } from '@/lib/supabase/admin';
import { currentManager } from '@/lib/supabase/server';
import { ensureRuns, refreshLocks } from '@/lib/checklist';
import { todayIn } from '@/lib/time';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

// The owner's view: how each outlet is tracking today, the seven-day trend,
// and the things that need a person — locked items, out-of-range readings,
// waivers and manager completions.
//
// Waivers and manager completions are surfaced deliberately. A manager who
// waives or self-completes everything is the failure mode this app exists to
// expose, and it is invisible unless the owner is shown it.
export async function GET(request: Request) {
  const manager = await currentManager();
  if (!manager) return json({ error: 'Not signed in.' }, { status: 401 });
  if (!manager.canManage) {
    return json({ error: 'Owner or general manager access required.' }, { status: 403 });
  }

  const db = createAdminClient();
  const url = new URL(request.url);
  const days = Math.min(Math.max(Number(url.searchParams.get('days') ?? 7), 1), 30);

  const { data: org } = await db
    .from('organisations')
    .select('id, name, overdue_grace_minutes, unlock_escalation_minutes')
    .eq('id', manager.orgId).single();

  const { data: outlets } = await db
    .from('outlets').select('id, org_id, name, timezone')
    .eq('org_id', manager.orgId).eq('is_active', true).order('name');

  const timezone = outlets?.[0]?.timezone ?? 'Asia/Kolkata';
  const today = todayIn(timezone);

  // Keep today honest before reporting on it.
  for (const outlet of outlets ?? []) {
    await ensureRuns(db, outlet, today);
    await refreshLocks(db, org!, outlet.id, today);
  }

  const from = new Date(`${today}T00:00:00Z`);
  from.setDate(from.getDate() - (days - 1));
  const fromDate = from.toISOString().slice(0, 10);

  const [{ data: runs }, { data: items }, { data: submissions }, { data: locks }] =
    await Promise.all([
      db.from('checklist_runs')
        .select('id, outlet_id, template_id, run_date')
        .eq('org_id', manager.orgId).gte('run_date', fromDate).lte('run_date', today),
      db.from('checklist_items')
        .select('id, template_id, title, unit, min_value, max_value')
        .eq('org_id', manager.orgId).eq('is_active', true),
      db.from('submissions')
        .select('id, outlet_id, run_id, checklist_item_id, status, out_of_bounds, was_late, submitted_at, value_number, comment, users!submissions_user_id_fkey(name)')
        .eq('org_id', manager.orgId).gte('submitted_at', `${fromDate}T00:00:00Z`),
      db.from('item_locks')
        .select('id, outlet_id, run_id, checklist_item_id, state, escalation_level, locked_at')
        .eq('org_id', manager.orgId).neq('state', 'resolved'),
    ]);

  // Completion is counted from live rows only; a re-taken reading is one task
  // done, not two. Out-of-range history keeps every row, replaced or not.
  const live = (submissions ?? []).filter((s: any) => !s.superseded_by);

  const itemsByTemplate = new Map<string, number>();
  for (const i of items ?? []) {
    itemsByTemplate.set(i.template_id, (itemsByTemplate.get(i.template_id) ?? 0) + 1);
  }
  const itemById = new Map((items ?? []).map((i) => [i.id, i]));
  const outletById = new Map((outlets ?? []).map((o) => [o.id, o.name]));
  const runById = new Map((runs ?? []).map((r) => [r.id, r]));

  const expectedFor = (predicate: (r: any) => boolean) =>
    (runs ?? []).filter(predicate)
      .reduce((n, r) => n + (itemsByTemplate.get(r.template_id) ?? 0), 0);

  // Per-outlet, today.
  const outletStats = (outlets ?? []).map((o) => {
    const expected = expectedFor((r) => r.outlet_id === o.id && r.run_date === today);
    const done = live.filter(
      (s: any) => s.outlet_id === o.id && runById.get(s.run_id)?.run_date === today
    ).length;
    const lockedNow = (locks ?? []).filter((l) => l.outlet_id === o.id).length;
    return {
      id: o.id, name: o.name, expected, done, locked: lockedNow,
      percent: expected ? Math.round((done / expected) * 100) : 0,
    };
  });

  // Trend across the window.
  const trend: { date: string; percent: number; done: number; expected: number }[] = [];
  for (let d = days - 1; d >= 0; d--) {
    const day = new Date(`${today}T00:00:00Z`);
    day.setDate(day.getDate() - d);
    const date = day.toISOString().slice(0, 10);
    const expected = expectedFor((r) => r.run_date === date);
    const done = live.filter(
      (s: any) => runById.get(s.run_id)?.run_date === date
    ).length;
    trend.push({
      date, done, expected,
      percent: expected ? Math.round((done / expected) * 100) : 0,
    });
  }

  const shape = (s: any) => ({
    id: s.id,
    title: itemById.get(s.checklist_item_id)?.title ?? 'Task',
    outlet: outletById.get(s.outlet_id) ?? '',
    by: (Array.isArray(s.users) ? s.users[0] : s.users)?.name ?? 'Staff',
    value: s.value_number,
    unit: itemById.get(s.checklist_item_id)?.unit ?? null,
    min: itemById.get(s.checklist_item_id)?.min_value ?? null,
    max: itemById.get(s.checklist_item_id)?.max_value ?? null,
    comment: s.comment,
    at: s.submitted_at,
  });

  const todayExpected = expectedFor((r) => r.run_date === today);
  const todayDone = live.filter(
    (s: any) => runById.get(s.run_id)?.run_date === today
  ).length;

  return json({
    org: org?.name,
    date: today,
    days,
    headline: {
      completionToday: todayExpected ? Math.round((todayDone / todayExpected) * 100) : 0,
      doneToday: todayDone,
      expectedToday: todayExpected,
      lockedNow: (locks ?? []).length,
      escalated: (locks ?? []).filter((l) => l.escalation_level > 0).length,
      outOfRange: (submissions ?? []).filter((s) => s.out_of_bounds).length,
      late: live.filter((s: any) => s.was_late).length,
      waived: live.filter((s: any) => s.status === 'waived').length,
      byManager: live.filter((s: any) => s.status === 'completed_by_manager').length,
    },
    outlets: outletStats,
    trend,
    outOfRange: (submissions ?? []).filter((s) => s.out_of_bounds)
      .sort((a, b) => +new Date(b.submitted_at) - +new Date(a.submitted_at))
      .slice(0, 20).map(shape),
    waived: live.filter((s: any) => s.status === 'waived')
      .sort((a, b) => +new Date(b.submitted_at) - +new Date(a.submitted_at))
      .slice(0, 20).map(shape),
    byManager: live.filter((s: any) => s.status === 'completed_by_manager')
      .sort((a, b) => +new Date(b.submitted_at) - +new Date(a.submitted_at))
      .slice(0, 20).map(shape),
    lockedItems: (locks ?? []).map((l) => ({
      id: l.id,
      title: itemById.get(l.checklist_item_id)?.title ?? 'Task',
      outlet: outletById.get(l.outlet_id) ?? '',
      state: l.state,
      escalationLevel: l.escalation_level,
      lockedAt: l.locked_at,
    })).sort((a, b) => b.escalationLevel - a.escalationLevel).slice(0, 20),
  });
}
