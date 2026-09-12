import type { SupabaseClient } from '@supabase/supabase-js';
import { SEED_ROLES, SEED_SHIFTS, SEED_TEMPLATES } from '@/lib/checklist-content';

// Creating a real restaurant group: roles, the reporting chain, outlets, shifts
// and a starting set of checklists, plus the owner's own account.
//
// The starter checklists are copied in as ordinary editable rows, not linked to
// a shared template. A restaurant that changes "fryer oil check" must not
// change it for every other customer.

export interface ProvisionInput {
  organisationName: string;
  outletNames: string[];
  timezone: string;
  owner: { name: string; email: string; authUserId: string };
}

export interface ProvisionResult {
  orgId: string;
  outlets: { id: string; name: string }[];
  checklists: number;
  items: number;
}

const uuid = () => crypto.randomUUID();

export async function provisionOrganisation(
  db: SupabaseClient,
  input: ProvisionInput
): Promise<ProvisionResult> {
  const orgId = uuid();

  await insert(db, 'organisations', [{
    id: orgId,
    name: input.organisationName,
    is_demo: false,
    default_unlock_window_minutes: 30,
    unlock_escalation_minutes: 60,
    overdue_grace_minutes: 15,
  }]);

  const roleRows = SEED_ROLES.map((r) => ({
    id: uuid(), org_id: orgId, name: r.name, level: r.level,
    can_review: r.canReview, can_unlock: r.canUnlock, can_manage: r.canManage,
  }));
  await insert(db, 'roles', roleRows);

  const byName = new Map(roleRows.map((r) => [r.name, r]));
  const ordered = [...roleRows].sort((a, b) => a.level - b.level);
  const chain = ordered.flatMap((r) => {
    const up = ordered.find((o) => o.level > r.level);
    return up ? [{
      id: uuid(), org_id: orgId, role_id: r.id,
      reports_to_role_id: up.id, escalation_after_minutes: 60,
    }] : [];
  });
  await insert(db, 'reporting_chain', chain);

  const outletRows = input.outletNames.map((name) => ({
    id: uuid(), org_id: orgId, name, address: null, timezone: input.timezone,
  }));
  await insert(db, 'outlets', outletRows);

  // The owner: a real account, and assigned to every outlet.
  const ownerId = uuid();
  await insert(db, 'users', [{
    id: ownerId, org_id: orgId, role_id: byName.get('Owner')!.id,
    name: input.owner.name, email: input.owner.email,
    auth_user_id: input.owner.authUserId,
    pin_hash: null, pin_set_at: null,
  }]);
  await insert(db, 'user_outlets',
    outletRows.map((o) => ({ user_id: ownerId, outlet_id: o.id })));

  const shiftRows: any[] = [];
  const templateRows: any[] = [];
  const itemRows: any[] = [];

  for (const outlet of outletRows) {
    const shifts: Record<string, any> = {};
    for (const sh of SEED_SHIFTS) {
      const row = {
        id: uuid(), org_id: orgId, outlet_id: outlet.id, name: sh.name,
        start_time: sh.start, end_time: sh.end, sort_order: sh.sort,
      };
      shifts[sh.name] = row;
      shiftRows.push(row);
    }

    for (const t of SEED_TEMPLATES) {
      const templateId = uuid();
      templateRows.push({
        id: templateId, org_id: orgId, outlet_id: outlet.id,
        role_id: byName.get(t.role)!.id, shift_id: shifts[t.shift].id,
        title: t.title,
      });
      t.items.forEach((item, i) => {
        itemRows.push({
          id: uuid(), org_id: orgId, template_id: templateId,
          title: item.title, description: item.description ?? null, sort_order: i,
          proof: item.proof, proof_required: item.proofRequired ?? false,
          photo_mode: item.photoMode ?? 'none',
          photo_facing: item.photoFacing ?? 'environment',
          readings: item.readings ?? null,
          requires_approval: item.requiresApproval ?? false,
          due_offset_minutes: item.dueOffsetMinutes,
          min_value: item.min ?? null, max_value: item.max ?? null,
          unit: item.unit ?? null,
        });
      });
    }
  }

  await insert(db, 'shifts', shiftRows);
  await insert(db, 'checklist_templates', templateRows);
  await insert(db, 'checklist_items', itemRows);

  // Read back before reporting success, so a partial write cannot present as a
  // finished account.
  const { data: written } = await db
    .from('outlets').select('id, name').eq('org_id', orgId);
  if ((written?.length ?? 0) !== outletRows.length) {
    throw new Error('Setup did not complete — please try again.');
  }

  return {
    orgId,
    outlets: written ?? [],
    checklists: templateRows.length,
    items: itemRows.length,
  };
}

// Rows in a batch must share a shape: PostgREST takes the column list from the
// first row and sends NULL for keys missing from later ones.
async function insert(db: SupabaseClient, table: string, rows: any[]) {
  if (!rows.length) return;
  const shape = Object.keys(rows[0]).sort().join(',');
  for (const row of rows) {
    if (Object.keys(row).sort().join(',') !== shape) {
      throw new Error(`${table}: rows in a batch must all have the same columns.`);
    }
  }
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await db.from(table).insert(rows.slice(i, i + 500));
    if (error) throw new Error(`${table}: ${error.message}`);
  }
}
