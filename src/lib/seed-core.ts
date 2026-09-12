import type { SupabaseClient } from '@supabase/supabase-js';
import bcrypt from 'bcryptjs';
import { SEED_ROLES, SEED_SHIFTS, SEED_TEMPLATES } from '@/lib/checklist-content';

// The demo builder, shared by the command-line script and the /setup page.
//
// Rows are generated in memory with client-side ids and written in batches,
// one request per table rather than one per row. An earlier version inserted
// each row individually and read the id back: around 1,400 sequential network
// round-trips, which took minutes and was killed by the serverless request
// timeout long before it finished. Batching turns that into roughly twenty
// requests.
//
// Only rows belonging to the demo organisation are touched. Real customer
// organisations (is_demo = false) are never deleted here.

export const DEMO_ORG = 'Spice Garden Restaurants';
export const DEMO_PIN = '1234';
export const DEMO_MANAGER_PASSWORD = 'demo-manager-2026';
export const DEMO_EMAIL_DOMAIN = 'spicegarden.demo';
const HISTORY_DAYS = 14;

const OUTLETS = [
  { name: 'Spice Garden — Koramangala', address: '80 Feet Road, Koramangala' },
  { name: 'Spice Garden — Indiranagar', address: '100 Feet Road, Indiranagar' },
  { name: 'Spice Garden — Whitefield',  address: 'ITPL Main Road, Whitefield' },
];

const STAFF = [
  { name: 'Ramesh Kumar',   role: 'Kitchen Staff',   outlet: 0 },
  { name: 'Anita Desai',    role: 'Kitchen Staff',   outlet: 0 },
  { name: 'Suresh Patil',   role: 'Service Staff',   outlet: 0 },
  { name: 'Meena Iyer',     role: 'Service Staff',   outlet: 0 },
  { name: 'Vikram Singh',   role: 'Bar Staff',       outlet: 0 },
  { name: 'Priya Nair',     role: 'Shift Manager',   outlet: 0 },
  { name: 'Arjun Reddy',    role: 'Kitchen Staff',   outlet: 1 },
  { name: 'Kavya Menon',    role: 'Service Staff',   outlet: 1 },
  { name: 'Rahul Sharma',   role: 'Shift Manager',   outlet: 1 },
  { name: 'Deepa Krishnan', role: 'Kitchen Staff',   outlet: 2 },
  { name: 'Sanjay Gupta',   role: 'Service Staff',   outlet: 2 },
  { name: 'Farah Khan',     role: 'Shift Manager',   outlet: 2 },
  { name: 'Nikhil Rao',     role: 'General Manager', outlet: null },
  { name: 'Lakshmi Venkat', role: 'Owner',           outlet: null },
];

export interface SeedResult {
  outlets: number; staff: number; templates: number;
  submissions: number; frozen: number; pin: string;
  managers: { name: string; role: string; email: string }[];
  managerPassword: string;
}

const uuid = () => crypto.randomUUID();

export async function buildDemo(
  db: SupabaseClient,
  opts: { reset: boolean }
): Promise<SeedResult | { alreadyExists: true }> {
  const { data: existing } = await db
    .from('organisations').select('id').eq('name', DEMO_ORG).maybeSingle();

  if (existing) {
    // An attempt that failed part way through leaves the organisation row
    // behind with few or no children. That state blocks itself: the app sees
    // no outlets, while a plain Create sees an organisation and skips. Treat
    // an organisation with no outlets as incomplete and rebuild it, rather
    // than reporting success and leaving the user stuck.
    // Fetch rows rather than counts. An exact count arrives in a response
    // header, and a missing header reads as zero — which would make a complete
    // demo look empty and get deleted and rebuilt on every run.
    const [{ data: existingOutlets }, { data: existingSubmissions }] = await Promise.all([
      db.from('outlets').select('id').eq('org_id', existing.id),
      db.from('submissions').select('id').eq('org_id', existing.id).limit(1),
    ]);
    // Outlets alone are not enough: a run that died partway through wrote the
    // outlets and then failed on submissions, leaving a demo with no history.
    const incomplete =
      (existingOutlets?.length ?? 0) === 0 || (existingSubmissions?.length ?? 0) === 0;

    if (!opts.reset && !incomplete) return { alreadyExists: true };

    const { error: deleteError } = await db
      .from('organisations').delete().eq('id', existing.id);
    if (deleteError) {
      throw new Error(
        `Could not remove the existing demo organisation: ${deleteError.message}`
      );
    }

    // Confirm the delete actually took effect. Every other table cascades from
    // this row, so proceeding on a failed delete would produce duplicates.
    const { data: stillThere } = await db
      .from('organisations').select('id').eq('id', existing.id).maybeSingle();
    if (stillThere) {
      throw new Error('The existing demo organisation could not be deleted.');
    }
  }

  // ---------------------------------------------------------------- build

  const orgId = uuid();
  const organisation = {
    id: orgId, name: DEMO_ORG, is_demo: true,
    default_unlock_window_minutes: 30,
    unlock_escalation_minutes: 60,
    overdue_grace_minutes: 15,
  };

  const roleRows = SEED_ROLES.map((r) => ({
    id: uuid(), org_id: orgId, name: r.name, level: r.level,
    can_review: r.canReview, can_unlock: r.canUnlock, can_manage: r.canManage,
  }));
  const roleByName = new Map(roleRows.map((r) => [r.name, r]));

  const ordered = [...roleRows].sort((a, b) => a.level - b.level);
  const chainRows = ordered.flatMap((r) => {
    const up = ordered.find((o) => o.level > r.level);
    return up ? [{
      id: uuid(), org_id: orgId, role_id: r.id,
      reports_to_role_id: up.id, escalation_after_minutes: 60,
    }] : [];
  });

  const outletRows = OUTLETS.map((o) => ({
    id: uuid(), org_id: orgId, name: o.name, address: o.address,
    timezone: 'Asia/Kolkata',
  }));

  // Manager accounts must exist in Supabase Auth before the users rows can
  // reference them. There are only a handful, so these stay sequential.
  const pinHash = await bcrypt.hash(DEMO_PIN, 10);
  const managerLogins: { name: string; role: string; email: string }[] = [];
  const userRows: any[] = [];
  const userOutletRows: { user_id: string; outlet_id: string }[] = [];

  for (const s of STAFF) {
    const roleDef = SEED_ROLES.find((r) => r.name === s.role)!;
    let authUserId: string | null = null;
    let email: string | null = null;

    // Anyone who can review or unlock needs a real account with a password.
    // An approval trail signed by a shared four-digit PIN is worthless in a
    // dispute or an inspection.
    if (roleDef.canReview || roleDef.canUnlock) {
      email = `${s.name.split(' ')[0].toLowerCase()}@${DEMO_EMAIL_DOMAIN}`;
      const { data: created, error } = await db.auth.admin.createUser({
        email, password: DEMO_MANAGER_PASSWORD,
        email_confirm: true, user_metadata: { name: s.name },
      });
      if (error && !/already|registered/i.test(error.message)) {
        throw new Error(`auth account for ${email}: ${error.message}`);
      }
      authUserId = created?.user?.id ?? await findAuthUser(db, email);
      managerLogins.push({ name: s.name, role: s.role, email });
    }

    const userId = uuid();
    userRows.push({
      id: userId, org_id: orgId, role_id: roleByName.get(s.role)!.id,
      name: s.name, email, auth_user_id: authUserId,
      pin_hash: pinHash, pin_set_at: new Date().toISOString(),
    });
    for (const o of s.outlet === null ? outletRows : [outletRows[s.outlet]]) {
      userOutletRows.push({ user_id: userId, outlet_id: o.id });
    }
  }

  const shiftRows: any[] = [];
  const templateRows: any[] = [];
  const itemRows: any[] = [];
  const templateIndex: {
    tplId: string; items: any[]; outlet: any; shift: any; role: string;
  }[] = [];

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
      const tplId = uuid();
      templateRows.push({
        id: tplId, org_id: orgId, outlet_id: outlet.id,
        role_id: roleByName.get(t.role)!.id, shift_id: shifts[t.shift].id,
        title: t.title,
      });

      const items = t.items.map((item, i) => ({
        id: uuid(), org_id: orgId, template_id: tplId, title: item.title,
        description: item.description ?? null, sort_order: i,
        proof: item.proof, proof_required: item.proofRequired ?? false,
        photo_mode: item.photoMode ?? 'none',
        requires_approval: item.requiresApproval ?? false,
        due_offset_minutes: item.dueOffsetMinutes,
        min_value: item.min ?? null, max_value: item.max ?? null,
        unit: item.unit ?? null,
      }));
      itemRows.push(...items);
      templateIndex.push({ tplId, items, outlet, shift: shifts[t.shift], role: t.role });
    }
  }

  const runRows: any[] = [];
  const submissionRows: any[] = [];
  const lockRows: any[] = [];
  const eventRows: any[] = [];
  const now = Date.now();

  for (let d = HISTORY_DAYS; d >= 0; d--) {
    const date = isoDate(d);
    const today = d === 0;

    for (const { tplId, items, outlet, shift, role } of templateIndex) {
      const startsAt = at(date, String(shift.start_time).slice(0, 5));
      const endsAt = at(date, String(shift.end_time).slice(0, 5));
      if (today && new Date(startsAt).getTime() > now) continue;

      const runId = uuid();
      const pool = userRows.filter((u) => {
        const r = roleRows.find((x) => x.id === u.role_id);
        return r?.name === role;
      });
      if (!pool.length) continue;

      const atOutlet = pool.filter((u) =>
        userOutletRows.some((uo) => uo.user_id === u.id && uo.outlet_id === outlet.id)
      );
      if (!atOutlet.length) continue;
      const who = atOutlet[d % atOutlet.length];

      const managers = userRows.filter((u) => {
        const r = roleRows.find((x) => x.id === u.role_id);
        return r?.name === 'Shift Manager' &&
               userOutletRows.some((uo) => uo.user_id === u.id && uo.outlet_id === outlet.id);
      });
      const manager = managers[0];

      let done = 0;
      for (const item of items) {
        const dueAt = addMin(startsAt, item.due_offset_minutes);
        if (today && new Date(dueAt).getTime() > now) continue;

        // Older days look better than recent ones so the dashboard shows a
        // trend. A demo where everything is green proves nothing.
        const missed = rand(`${runId}${item.id}`) < (d > 7 ? 0.06 : 0.14);

        if (missed) {
          lockRows.push({
            id: uuid(), org_id: orgId, outlet_id: outlet.id, run_id: runId,
            checklist_item_id: item.id,
            state: today ? 'locked' : 'resolved',
            locked_at: dueAt, escalates_at: addMin(dueAt, 60),
            escalation_level: today ? 0 : 1,
            resolved_at: today ? null : addMin(dueAt, 75),
          });
          eventRows.push(lockEvent({
            orgId, runId, itemId: item.id, event: 'frozen',
            actorUserId: null,
            comment: 'Due time passed with no submission.',
            createdAt: dueAt,
          }));
          if (today || !manager) continue;

          // Historic misses were unlocked and completed late, which is the
          // normal path and the one managers will recognise.
          eventRows.push(lockEvent({
            orgId, runId, itemId: item.id, event: 'unlocked',
            actorUserId: manager.id,
            comment: 'Rush during service, staff reassigned. Reopened for 30 minutes.',
            createdAt: addMin(dueAt, 45),
          }));
          submissionRows.push(submission({
            orgId, outletId: outlet.id, runId, item, userId: who.id,
            status: item.requires_approval ? 'approved' : 'submitted',
            wasLate: true,
            submittedAt: addMin(dueAt, 60),
            reviewedBy: item.requires_approval ? manager.id : null,
            reviewedAt: item.requires_approval ? addMin(dueAt, 70) : null,
          }));
          done++;
          continue;
        }

        submissionRows.push(submission({
          orgId, outletId: outlet.id, runId, item, userId: who.id,
          status: item.requires_approval ? 'approved' : 'submitted',
          wasLate: false,
          submittedAt: addMin(dueAt, -5),
        }));
        done++;
      }

      runRows.push({
        id: runId, org_id: orgId, outlet_id: outlet.id, template_id: tplId,
        shift_id: shift.id, run_date: date,
        starts_at: startsAt, ends_at: endsAt,
        status: !today && done === items.length ? 'complete' : 'in_progress',
      });
    }
  }

  // ---------------------------------------------------------------- write
  // Order matters: each table references the ones before it.

  await insertAll(db, 'organisations', [organisation]);
  await insertAll(db, 'roles', roleRows);
  await insertAll(db, 'reporting_chain', chainRows);
  await insertAll(db, 'outlets', outletRows);
  await insertAll(db, 'users', userRows);
  await insertAll(db, 'user_outlets', userOutletRows);
  await insertAll(db, 'shifts', shiftRows);
  await insertAll(db, 'checklist_templates', templateRows);
  await insertAll(db, 'checklist_items', itemRows);
  await insertAll(db, 'checklist_runs', runRows);
  await insertAll(db, 'submissions', submissionRows);
  await insertAll(db, 'item_locks', lockRows);
  await insertAll(db, 'lock_events', eventRows);

  // Read back before reporting success. Claiming the demo is ready when the
  // outlets did not land is exactly what left the setup page and the app
  // disagreeing about whether anything existed.
  const [{ data: writtenOutlets }, { data: writtenSubmissions }] = await Promise.all([
    db.from('outlets').select('id').eq('org_id', orgId),
    db.from('submissions').select('id').eq('org_id', orgId).limit(1),
  ]);
  if ((writtenOutlets?.length ?? 0) !== outletRows.length ||
      (writtenSubmissions?.length ?? 0) === 0) {
    throw new Error(
      `Wrote ${writtenOutlets?.length ?? 0} of ${outletRows.length} outlets and ` +
      `${(writtenSubmissions?.length ?? 0) === 0 ? 'no' : 'some'} submissions. ` +
      `The demo is incomplete — press Rebuild to try again.`
    );
  }

  return {
    outlets: outletRows.length,
    staff: userRows.length,
    templates: templateRows.length,
    submissions: submissionRows.length,
    frozen: lockRows.length,
    pin: DEMO_PIN,
    managers: managerLogins,
    managerPassword: DEMO_MANAGER_PASSWORD,
  };
}

// Every row in a batch must carry exactly the same keys.
//
// PostgREST builds the column list for a bulk insert from the first row of the
// array. Any key missing from a later row is sent as NULL, which silently
// violates NOT NULL constraints — a batch of submissions where only the late
// ones carried was_late pushed NULL into a NOT NULL column for every other
// row. Building rows through these helpers keeps the shapes identical by
// construction rather than by care.
function submission(o: {
  orgId: string; outletId: string; runId: string; item: any; userId: string;
  status: string; wasLate: boolean; submittedAt: string;
  reviewedBy?: string | null; reviewedAt?: string | null;
}) {
  const proof = proofValue(o.item);
  return {
    id: uuid(),
    org_id: o.orgId,
    outlet_id: o.outletId,
    run_id: o.runId,
    checklist_item_id: o.item.id,
    user_id: o.userId,
    value_number: proof.value_number ?? null,
    value_text: proof.value_text ?? null,
    photo_path: proof.photo_path ?? null,
    comment: proof.comment ?? null,
    status: o.status,
    out_of_bounds: proof.out_of_bounds ?? false,
    was_late: o.wasLate,
    device_captured_at: null,
    submitted_at: o.submittedAt,
    reviewed_by: o.reviewedBy ?? null,
    reviewed_at: o.reviewedAt ?? null,
    review_note: null,
    superseded_by: null,
  };
}

function lockEvent(o: {
  orgId: string; runId: string; itemId: string; event: string;
  actorUserId: string | null; comment: string; createdAt: string;
}) {
  return {
    id: uuid(),
    org_id: o.orgId,
    run_id: o.runId,
    checklist_item_id: o.itemId,
    event: o.event,
    actor_user_id: o.actorUserId,
    from_level: null,
    to_level: null,
    comment: o.comment,
    created_at: o.createdAt,
  };
}

// Chunked so a single request never carries an unreasonable payload.
async function insertAll(db: SupabaseClient, table: string, rows: any[], chunk = 500) {
  if (rows.length === 0) return;

  // Catch a shape mismatch here, where the message names the culprit, rather
  // than as an opaque NOT NULL violation from the database.
  const shape = Object.keys(rows[0]).sort().join(',');
  for (const row of rows) {
    const rowShape = Object.keys(row).sort().join(',');
    if (rowShape !== shape) {
      throw new Error(
        `${table}: rows in a batch must all have the same columns. ` +
        `Expected [${shape}] but found [${rowShape}].`
      );
    }
  }

  for (let i = 0; i < rows.length; i += chunk) {
    const { error } = await db.from(table).insert(rows.slice(i, i + chunk));
    if (error) throw new Error(`${table}: ${error.message}`);
  }
}

// A rebuild reuses auth accounts that already exist, since deleting the
// organisation does not remove them.
async function findAuthUser(db: SupabaseClient, email: string): Promise<string | null> {
  const { data } = await db.auth.admin.listUsers({ perPage: 200 });
  return data?.users.find((u) => u.email === email)?.id ?? null;
}

function isoDate(daysAgo: number): string {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return d.toISOString().slice(0, 10);
}

function at(date: string, time: string): string {
  return new Date(`${date}T${time}:00+05:30`).toISOString();
}

function addMin(iso: string, minutes: number): string {
  return new Date(new Date(iso).getTime() + minutes * 60_000).toISOString();
}

// Deterministic: rebuilding before a pitch reproduces the demo that was
// rehearsed, rather than a different one.
function rand(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 1000) / 1000;
}

function proofValue(item: any): Record<string, unknown> {
  switch (item.proof) {
    case 'number': {
      const min = Number(item.min_value ?? 0);
      const max = Number(item.max_value ?? 100);
      // A freezer running warm is exactly what this app exists to surface, so
      // the demo must contain a few.
      const bad = rand(item.id + 'oob') < 0.04;
      return {
        value_number: bad
          ? Number((max + (max - min) * 0.15).toFixed(1))
          : Number((min + (max - min) * 0.5).toFixed(1)),
        out_of_bounds: bad,
      };
    }
    case 'text': return { value_text: 'Checked, all in order.' };
    case 'photo': return { photo_path: null, comment: 'Completed.' };
    default: return {};
  }
}
