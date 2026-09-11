/**
 * Seeds a demo restaurant group into the database.
 *
 * The demo runs against the real schema, the real tables and the real code
 * paths — it is not a mock. A submission made during a pitch genuinely saves
 * and genuinely appears on the manager dashboard.
 *
 *   npm run db:seed          add the demo organisation if it is not there
 *   npm run db:reset-demo    delete and rebuild it (safe before a demo)
 *
 * Only rows belonging to the demo organisation are ever touched. Real customer
 * organisations are matched by is_demo = false and are never deleted here.
 */
import { createClient } from '@supabase/supabase-js';
import bcrypt from 'bcryptjs';
import { SEED_ROLES, SEED_SHIFTS, SEED_TEMPLATES } from '../src/lib/checklist-content';

const DEMO_ORG = 'Spice Garden Restaurants';
const DEMO_PIN = '1234'; // demo only; real staff choose their own on first use
const HISTORY_DAYS = 14;

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error(
    'Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.\n' +
    'Fill in .env.local first — see SETUP.md.'
  );
  process.exit(1);
}
const db = createClient(url, key, { auth: { persistSession: false } });

const OUTLETS = [
  { name: 'Spice Garden — Koramangala', address: '80 Feet Road, Koramangala' },
  { name: 'Spice Garden — Indiranagar', address: '100 Feet Road, Indiranagar' },
  { name: 'Spice Garden — Whitefield',  address: 'ITPL Main Road, Whitefield' },
];

const STAFF = [
  { name: 'Ramesh Kumar',    role: 'Kitchen Staff',   outlet: 0 },
  { name: 'Anita Desai',     role: 'Kitchen Staff',   outlet: 0 },
  { name: 'Suresh Patil',    role: 'Service Staff',   outlet: 0 },
  { name: 'Meena Iyer',      role: 'Service Staff',   outlet: 0 },
  { name: 'Vikram Singh',    role: 'Bar Staff',       outlet: 0 },
  { name: 'Priya Nair',      role: 'Shift Manager',   outlet: 0 },
  { name: 'Arjun Reddy',     role: 'Kitchen Staff',   outlet: 1 },
  { name: 'Kavya Menon',     role: 'Service Staff',   outlet: 1 },
  { name: 'Rahul Sharma',    role: 'Shift Manager',   outlet: 1 },
  { name: 'Deepa Krishnan',  role: 'Kitchen Staff',   outlet: 2 },
  { name: 'Sanjay Gupta',    role: 'Service Staff',   outlet: 2 },
  { name: 'Farah Khan',      role: 'Shift Manager',   outlet: 2 },
  { name: 'Nikhil Rao',      role: 'General Manager', outlet: null }, // all outlets
  { name: 'Lakshmi Venkat',  role: 'Owner',           outlet: null },
];

function isoDate(daysAgo: number): string {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return d.toISOString().slice(0, 10);
}

function at(date: string, time: string): string {
  // Demo data only. Real runs resolve deadlines in the outlet's timezone when
  // the run is created; this is close enough for seeded history.
  return new Date(`${date}T${time}:00+05:30`).toISOString();
}

function addMinutes(iso: string, minutes: number): string {
  return new Date(new Date(iso).getTime() + minutes * 60_000).toISOString();
}

async function wipeDemo() {
  const { data: existing } = await db
    .from('organisations').select('id').eq('name', DEMO_ORG).eq('is_demo', true);
  for (const org of existing ?? []) {
    // Every tenant table cascades from organisations, so one delete is enough.
    await db.from('organisations').delete().eq('id', org.id);
    console.log('Removed previous demo organisation.');
  }
}

async function seed() {
  const reset = process.argv.includes('--reset');
  if (reset) await wipeDemo();

  const { data: already } = await db
    .from('organisations').select('id').eq('name', DEMO_ORG).maybeSingle();
  if (already) {
    console.log('Demo organisation already exists. Use "npm run db:reset-demo" to rebuild it.');
    return;
  }

  const org = await insert('organisations', {
    name: DEMO_ORG,
    is_demo: true,
    default_unlock_window_minutes: 30,
    unlock_escalation_minutes: 60,
    overdue_grace_minutes: 15,
  });

  const roles: Record<string, any> = {};
  for (const r of SEED_ROLES) {
    roles[r.name] = await insert('roles', {
      org_id: org.id, name: r.name, level: r.level,
      can_review: r.canReview, can_unlock: r.canUnlock, can_manage: r.canManage,
    });
  }

  // Reporting chain: each level reports to the next one up.
  const ordered = [...SEED_ROLES].sort((a, b) => a.level - b.level);
  for (const r of ordered) {
    const up = ordered.find((o) => o.level > r.level);
    if (!up) continue;
    await insert('reporting_chain', {
      org_id: org.id,
      role_id: roles[r.name].id,
      reports_to_role_id: roles[up.name].id,
      escalation_after_minutes: 60,
    });
  }

  const outlets: any[] = [];
  for (const o of OUTLETS) {
    outlets.push(await insert('outlets', {
      org_id: org.id, name: o.name, address: o.address, timezone: 'Asia/Kolkata',
    }));
  }

  const pinHash = await bcrypt.hash(DEMO_PIN, 10);
  const users = [];
  for (const s of STAFF) {
    const u = await insert('users', {
      org_id: org.id, role_id: roles[s.role].id, name: s.name,
      pin_hash: pinHash, pin_set_at: new Date().toISOString(),
    });
    const assigned = s.outlet === null ? outlets : [outlets[s.outlet]];
    for (const o of assigned) {
      await db.from('user_outlets').insert({ user_id: u.id, outlet_id: o.id });
    }
    users.push({ ...u, role: s.role, outletIndex: s.outlet });
  }

  // Shifts, templates and items per outlet.
  const templates: any[] = [];
  for (const outlet of outlets) {
    const shifts: Record<string, any> = {};
    for (const sh of SEED_SHIFTS) {
      shifts[sh.name] = await insert('shifts', {
        org_id: org.id, outlet_id: outlet.id, name: sh.name,
        start_time: sh.start, end_time: sh.end, sort_order: sh.sort,
      });
    }

    for (const t of SEED_TEMPLATES) {
      const tpl = await insert('checklist_templates', {
        org_id: org.id, outlet_id: outlet.id,
        role_id: roles[t.role].id, shift_id: shifts[t.shift].id, title: t.title,
      });
      const items = [];
      for (const [i, item] of t.items.entries()) {
        items.push(await insert('checklist_items', {
          org_id: org.id, template_id: tpl.id, title: item.title,
          description: item.description ?? null, sort_order: i,
          proof: item.proof, proof_required: item.proofRequired ?? false,
          requires_approval: item.requiresApproval ?? false,
          due_offset_minutes: item.dueOffsetMinutes,
          min_value: item.min ?? null, max_value: item.max ?? null,
          unit: item.unit ?? null,
        }));
      }
      templates.push({ tpl, items, outlet, shift: shifts[t.shift], role: t.role });
    }
  }

  // History: believable completion, with deliberate gaps so the dashboard has
  // something real to show. A demo where everything is 100% green proves
  // nothing — the overdue and waived cases are what sell the product.
  let submissions = 0, frozen = 0;
  for (let d = HISTORY_DAYS; d >= 0; d--) {
    const date = isoDate(d);
    const today = d === 0;

    for (const { tpl, items, outlet, shift, role } of templates) {
      const startsAt = at(date, shift.start_time.slice(0, 5));
      const endsAt = at(date, shift.end_time.slice(0, 5));
      // Today's later shifts have not happened yet.
      if (today && new Date(startsAt) > new Date()) continue;

      const run = await insert('checklist_runs', {
        org_id: org.id, outlet_id: outlet.id, template_id: tpl.id,
        shift_id: shift.id, run_date: date,
        starts_at: startsAt, ends_at: endsAt, status: 'in_progress',
      });

      const staff = users.filter(
        (u) => u.role === role &&
               (u.outletIndex === null || outlets[u.outletIndex].id === outlet.id)
      );
      if (staff.length === 0) continue;
      const who = staff[d % staff.length];

      let done = 0;
      for (const item of items) {
        const dueAt = addMinutes(startsAt, item.due_offset_minutes);
        if (today && new Date(dueAt) > new Date()) continue;

        // Roughly one item in eight is missed, weighted so older days look
        // better than recent ones — an owner should see a trend, not noise.
        const missRate = d > 7 ? 0.06 : 0.14;
        const missed = pseudoRandom(`${run.id}${item.id}`) < missRate;

        if (missed) {
          const lock = await insert('item_locks', {
            org_id: org.id, outlet_id: outlet.id, run_id: run.id,
            checklist_item_id: item.id, state: today ? 'locked' : 'resolved',
            locked_at: dueAt,
            escalates_at: addMinutes(dueAt, 60),
            escalation_level: today ? 0 : 1,
            resolved_at: today ? null : addMinutes(dueAt, 75),
          });
          await db.from('lock_events').insert({
            org_id: org.id, run_id: run.id, checklist_item_id: item.id,
            event: 'frozen', comment: 'Due time passed with no submission.',
            created_at: dueAt,
          });
          frozen++;

          if (!today) {
            // Historic misses were unlocked by the shift manager and completed
            // late, which is the normal path and what managers will recognise.
            const mgr = users.find(
              (u) => u.role === 'Shift Manager' &&
                     (u.outletIndex === null || outlets[u.outletIndex!].id === outlet.id)
            )!;
            await db.from('lock_events').insert({
              org_id: org.id, run_id: run.id, checklist_item_id: item.id,
              event: 'unlocked', actor_user_id: mgr.id,
              comment: 'Rush during service, staff reassigned. Reopened for 30 minutes.',
              created_at: addMinutes(dueAt, 45),
            });
            await insert('submissions', {
              id: crypto.randomUUID(),
              org_id: org.id, outlet_id: outlet.id, run_id: run.id,
              checklist_item_id: item.id, user_id: who.id,
              ...proofValue(item),
              status: item.requires_approval ? 'approved' : 'submitted',
              was_late: true,
              submitted_at: addMinutes(dueAt, 60),
              reviewed_by: item.requires_approval ? mgr.id : null,
              reviewed_at: item.requires_approval ? addMinutes(dueAt, 70) : null,
            });
            submissions++; done++;
          }
          continue;
        }

        const values = proofValue(item);
        await insert('submissions', {
          id: crypto.randomUUID(),
          org_id: org.id, outlet_id: outlet.id, run_id: run.id,
          checklist_item_id: item.id, user_id: who.id,
          ...values,
          out_of_bounds: values.out_of_bounds ?? false,
          status: item.requires_approval ? 'approved' : 'submitted',
          submitted_at: addMinutes(dueAt, -5),
        });
        submissions++; done++;
      }

      if (!today && done === items.length) {
        await db.from('checklist_runs').update({ status: 'complete' }).eq('id', run.id);
      }
    }
  }

  console.log(`
Demo ready.

  Organisation : ${DEMO_ORG}
  Outlets      : ${outlets.length}
  Staff        : ${users.length}   (demo PIN for everyone: ${DEMO_PIN})
  Templates    : ${templates.length}
  Submissions  : ${submissions}
  Frozen items : ${frozen}

Rebuild it any time with: npm run db:reset-demo
`);
}

// Deterministic pseudo-randomness: the same seed always produces the same
// demo, so a rebuild before a pitch looks identical to the one you rehearsed.
function pseudoRandom(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 1000) / 1000;
}

function proofValue(item: any): Record<string, any> {
  switch (item.proof) {
    case 'number': {
      const min = Number(item.min_value ?? 0);
      const max = Number(item.max_value ?? 100);
      // Occasionally seed an out-of-range reading: a freezer running warm is
      // exactly the event this app exists to surface.
      const bad = pseudoRandom(item.id + 'oob') < 0.04;
      const value = bad
        ? Number((max + (max - min) * 0.15).toFixed(1))
        : Number((min + (max - min) * 0.5).toFixed(1));
      return { value_number: value, out_of_bounds: bad };
    }
    case 'text':
      return { value_text: 'Checked, all in order.' };
    case 'photo':
      // No file in seeded history; the UI shows a placeholder for these.
      return { photo_path: null, comment: 'Completed.' };
    default:
      return {};
  }
}

async function insert(table: string, row: Record<string, any>) {
  const { data, error } = await db.from(table).insert(row).select().single();
  if (error) throw new Error(`${table}: ${error.message}`);
  return data;
}

seed().catch((e) => {
  console.error(e.message ?? e);
  process.exit(1);
});
