import type { SupabaseClient } from '@supabase/supabase-js';

// Onboarding a brand: a brand (organisation) has outlets; each outlet has up
// to 3 stations and 3 L1 managers (one per shift — morning/afternoon/evening)
// who run the L1 line check; a single L2 manager and a single L3 owner cover
// every outlet in the brand and review what L1 submits.
//
// The old multi-department checklist system (Kitchen/Front Office/etc, with
// its own checklist_templates/items) is not seeded for new brands — a brand
// onboarded here only gets the L1/L2/L3 line check.

export type Shift = 'morning' | 'afternoon' | 'evening';
export const SHIFTS: Shift[] = ['morning', 'afternoon', 'evening'];

export interface OutletInput {
  name: string;
  /** 1-3. Defaults to 3. */
  stationCount?: number;
  /** One L1 manager per shift. A shift with no entry gets a default name. */
  l1?: Partial<Record<Shift, { name: string }>>;
}

export interface ProvisionBrandInput {
  brandName: string;
  timezone: string;
  outlets: OutletInput[];
  l2: { name: string; email: string; authUserId: string };
  l3: { name: string; email: string; authUserId: string };
}

export interface ProvisionBrandResult {
  orgId: string;
  outlets: { id: string; name: string; stationCount: number }[];
  l1Count: number;
}

const uuid = () => crypto.randomUUID();

const SHIFT_LABEL: Record<Shift, string> = {
  morning: 'Morning', afternoon: 'Afternoon', evening: 'Evening',
};

export async function provisionBrand(
  db: SupabaseClient,
  input: ProvisionBrandInput
): Promise<ProvisionBrandResult> {
  const orgId = uuid();

  await insert(db, 'organisations', [{
    id: orgId,
    name: input.brandName,
    is_demo: false,
    default_unlock_window_minutes: 30,
    unlock_escalation_minutes: 60,
    overdue_grace_minutes: 15,
  }]);

  const roleRows = [
    { id: uuid(), org_id: orgId, name: 'L1 Manager', level: 1, can_review: false, can_unlock: false, can_manage: false },
    { id: uuid(), org_id: orgId, name: 'L2 Manager', level: 2, can_review: true, can_unlock: true, can_manage: false },
    { id: uuid(), org_id: orgId, name: 'L3 Owner', level: 3, can_review: true, can_unlock: true, can_manage: true },
  ];
  await insert(db, 'roles', roleRows);
  const roleByName = new Map(roleRows.map((r) => [r.name, r]));

  const ordered = [...roleRows].sort((a, b) => a.level - b.level);
  const chain = ordered.flatMap((r) => {
    const up = ordered.find((o) => o.level > r.level);
    return up ? [{
      id: uuid(), org_id: orgId, role_id: r.id,
      reports_to_role_id: up.id, escalation_after_minutes: 60,
    }] : [];
  });
  await insert(db, 'reporting_chain', chain);

  if (input.outlets.length === 0) {
    throw new Error('A brand needs at least one outlet.');
  }
  const outletRows = input.outlets.map((o) => ({
    id: uuid(), org_id: orgId, name: o.name, address: null, timezone: input.timezone,
    station_count: Math.min(3, Math.max(1, o.stationCount ?? 3)),
  }));
  await insert(db, 'outlets', outletRows);

  // L2 and L3: one each, real accounts, covering every outlet in the brand.
  const l2Id = uuid();
  const l3Id = uuid();
  await insert(db, 'users', [
    {
      id: l2Id, org_id: orgId, role_id: roleByName.get('L2 Manager')!.id,
      name: input.l2.name, email: input.l2.email, auth_user_id: input.l2.authUserId,
      pin_hash: null, pin_set_at: null, shift: null,
    },
    {
      id: l3Id, org_id: orgId, role_id: roleByName.get('L3 Owner')!.id,
      name: input.l3.name, email: input.l3.email, auth_user_id: input.l3.authUserId,
      pin_hash: null, pin_set_at: null, shift: null,
    },
  ]);
  await insert(db, 'user_outlets', outletRows.flatMap((o) => [
    { user_id: l2Id, outlet_id: o.id },
    { user_id: l3Id, outlet_id: o.id },
  ]));

  // L1: 3 per outlet, one per shift, PIN-based like floor staff — no auth
  // account, assigned only to their own outlet.
  const l1Rows: any[] = [];
  const l1OutletRows: any[] = [];
  input.outlets.forEach((o, i) => {
    const outletId = outletRows[i].id;
    for (const shift of SHIFTS) {
      const name = o.l1?.[shift]?.name || `L1 Manager — ${SHIFT_LABEL[shift]}`;
      const id = uuid();
      l1Rows.push({
        id, org_id: orgId, role_id: roleByName.get('L1 Manager')!.id,
        name, email: null, auth_user_id: null,
        pin_hash: null, pin_set_at: null, shift,
      });
      l1OutletRows.push({ user_id: id, outlet_id: outletId });
    }
  });
  await insert(db, 'users', l1Rows);
  await insert(db, 'user_outlets', l1OutletRows);

  const { data: written } = await db
    .from('outlets').select('id, name').eq('org_id', orgId);
  if ((written?.length ?? 0) !== outletRows.length) {
    throw new Error('Setup did not complete — please try again.');
  }

  return {
    orgId,
    outlets: outletRows.map((o) => ({ id: o.id, name: o.name, stationCount: o.station_count })),
    l1Count: l1Rows.length,
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
