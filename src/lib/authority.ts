import type { SupabaseClient } from '@supabase/supabase-js';

// Who may unlock what, and when.
//
// The rule agreed during scoping: a frozen item can first be unlocked only by
// the submitter's direct manager (M1). After the organisation's escalation
// window it climbs, and the next level up gains unlock rights too — M1 keeps
// theirs. Removing a busy manager's access mid-service would create a deadlock
// with no upside; the pressure comes from upward visibility.
//
// A consequence worth being explicit about: at escalation level 0 an Owner
// cannot unlock an item that only the Shift Manager is empowered for. That is
// the design as specified, not an oversight — it stops the top of the chain
// quietly absorbing every miss before the middle ever sees it.

export interface RoleRow {
  id: string;
  name: string;
  level: number;
  can_unlock: boolean;
}

/** Roles empowered to unlock an item at a given escalation level, junior first. */
export function empoweredRoles(
  roles: RoleRow[],
  submitterLevel: number,
  escalationLevel: number
): RoleRow[] {
  return roles
    .filter((r) => r.can_unlock && r.level > submitterLevel)
    .sort((a, b) => a.level - b.level)
    .slice(0, escalationLevel + 1);
}

export function canUnlock(
  roles: RoleRow[],
  managerRoleId: string,
  submitterLevel: number,
  escalationLevel: number
): boolean {
  return empoweredRoles(roles, submitterLevel, escalationLevel)
    .some((r) => r.id === managerRoleId);
}

/**
 * Why an unlock was refused, in words a manager can act on. Returning a bare
 * "forbidden" would leave them guessing at the rule.
 */
export function unlockRefusalReason(
  roles: RoleRow[],
  submitterLevel: number,
  escalationLevel: number
): string {
  const empowered = empoweredRoles(roles, submitterLevel, escalationLevel);
  const names = empowered.map((r) => r.name).join(' or ');
  return names
    ? `Only ${names} can unlock this right now. It will reach your level when it escalates.`
    : 'Nobody is currently empowered to unlock this. Check the reporting chain setup.';
}

/**
 * The roles in an organisation plus the seniority of the role a given run's
 * checklist belongs to — the two things every unlock decision needs.
 */
export async function chainContext(
  db: SupabaseClient,
  orgId: string,
  runId: string
) {
  const { data: roles } = await db
    .from('roles').select('id, name, level, can_unlock').eq('org_id', orgId);

  const { data: run } = await db
    .from('checklist_runs')
    .select('checklist_templates!inner(role_id)')
    .eq('id', runId).single();

  const template: any = Array.isArray(run?.checklist_templates)
    ? run.checklist_templates[0] : run?.checklist_templates;
  const submitterRole = (roles ?? []).find((r) => r.id === template?.role_id);

  return { roles: roles ?? [], submitterLevel: submitterRole?.level ?? 1 };
}
