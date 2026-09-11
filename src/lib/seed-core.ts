import type { SupabaseClient } from '@supabase/supabase-js';
import bcrypt from 'bcryptjs';
import { SEED_ROLES, SEED_SHIFTS, SEED_TEMPLATES } from '@/lib/checklist-content';

// The demo builder, shared by the command-line script and the /setup page.
//
// It exists as a web page as well as a script because the person running this
// may not have a development environment at all — they should be able to set
// up a demo from a phone browser.
//
// Only rows belonging to the demo organisation are touched. Real customer
// organisations (is_demo = false) are never deleted here.

export const DEMO_ORG = 'Spice Garden Restaurants';
export const DEMO_PIN = '1234';
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
}

export async function buildDemo(
  db: SupabaseClient,
  opts: { reset: boolean }
): Promise<SeedResult | { alreadyExists: true }> {
  if (opts.reset) {
    const { data: existing } = await db
      .from('organisations').select('id').eq('name', DEMO_ORG).eq('is_demo', true);
    for (const org of existing ?? []) {
      await db.from('organisations').delete().eq('id', org.id);
    }
  }

  const { data: already } = await db
    .from('organisations').select('id').eq('name', DEMO_ORG).maybeSingle();
  if (already) return { alreadyExists: true };

  const insert = async (table: string, row: Record<string, unknown>) => {
    const { data, error } = await db.from(table).insert(row).select().single();
    if (error) throw new Error(`${table}: ${error.message}`);
    return data;
  };

  const org = await insert('organisations', {
    name: DEMO_ORG, is_demo: true,
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

  const ordered = [...SEED_ROLES].sort((a, b) => a.level - b.level);
  for (const r of ordered) {
    const up = ordered.find((o) => o.level > r.level);
    if (!up) continue;
    await insert('reporting_chain', {
      org_id: org.id, role_id: roles[r.name].id,
      reports_to_role_id: roles[up.name].id, escalation_after_minutes: 60,
    });
  }

  const outlets: any[] = [];
  for (const o of OUTLETS) {
    outlets.push(await insert('outlets', {
      org_id: org.id, name: o.name, address: o.address, timezone: 'Asia/Kolkata',
    }));
  }

  const pinHash = await bcrypt.hash(DEMO_PIN, 10);
  const users: any[] = [];
  for (const s of STAFF) {
    const u = await insert('users', {
      org_id: org.id, role_id: roles[s.role].id, name: s.name,
      pin_hash: pinHash, pin_set_at: new Date().toISOString(),
    });
    for (const o of s.outlet === null ? outlets : [outlets[s.outlet]]) {
      await db.from('user_outlets').insert({ user_id: u.id, outlet_id: o.id });
    }
    users.push({ ...u, role: s.role, outletIndex: s.outlet });
  }

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
      const items: any[] = [];
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

  let submissions = 0, frozen = 0;
  for (let d = HISTORY_DAYS; d >= 0; d--) {
    const date = isoDate(d);
    const today = d === 0;

    for (const { tpl, items, outlet, shift, role } of templates) {
      const startsAt = at(date, String(shift.start_time).slice(0, 5));
      const endsAt = at(date, String(shift.end_time).slice(0, 5));
      if (today && new Date(startsAt) > new Date()) continue;

      const run = await insert('checklist_runs', {
        org_id: org.id, outlet_id: outlet.id, template_id: tpl.id,
        shift_id: shift.id, run_date: date,
        starts_at: startsAt, ends_at: endsAt, status: 'in_progress',
      });

      const pool = users.filter(
        (u) => u.role === role &&
               (u.outletIndex === null || outlets[u.outletIndex].id === outlet.id)
      );
      if (!pool.length) continue;
      const who = pool[d % pool.length];
      const manager = users.find(
        (u) => u.role === 'Shift Manager' &&
               (u.outletIndex === null || outlets[u.outletIndex].id === outlet.id)
      );

      let done = 0;
      for (const item of items) {
        const dueAt = addMin(startsAt, item.due_offset_minutes);
        if (today && new Date(dueAt) > new Date()) continue;

        // Older days look better than recent ones so the dashboard shows a
        // trend. A demo where everything is green proves nothing.
        const missRate = d > 7 ? 0.06 : 0.14;
        const missed = rand(`${run.id}${item.id}`) < missRate;

        if (missed) {
          await insert('item_locks', {
            org_id: org.id, outlet_id: outlet.id, run_id: run.id,
            checklist_item_id: item.id,
            state: today ? 'locked' : 'resolved',
            locked_at: dueAt,
            escalates_at: addMin(dueAt, 60),
            escalation_level: today ? 0 : 1,
            resolved_at: today ? null : addMin(dueAt, 75),
          });
          await db.from('lock_events').insert({
            org_id: org.id, run_id: run.id, checklist_item_id: item.id,
            event: 'frozen', comment: 'Due time passed with no submission.',
            created_at: dueAt,
          });
          frozen++;
          if (today || !manager) continue;

          await db.from('lock_events').insert({
            org_id: org.id, run_id: run.id, checklist_item_id: item.id,
            event: 'unlocked', actor_user_id: manager.id,
            comment: 'Rush during service, staff reassigned. Reopened for 30 minutes.',
            created_at: addMin(dueAt, 45),
          });
          await insert('submissions', {
            id: crypto.randomUUID(),
            org_id: org.id, outlet_id: outlet.id, run_id: run.id,
            checklist_item_id: item.id, user_id: who.id,
            ...proofValue(item),
            status: item.requires_approval ? 'approved' : 'submitted',
            was_late: true, submitted_at: addMin(dueAt, 60),
            reviewed_by: item.requires_approval ? manager.id : null,
            reviewed_at: item.requires_approval ? addMin(dueAt, 70) : null,
          });
          submissions++; done++;
          continue;
        }

        const values = proofValue(item);
        await insert('submissions', {
          id: crypto.randomUUID(),
          org_id: org.id, outlet_id: outlet.id, run_id: run.id,
          checklist_item_id: item.id, user_id: who.id,
          ...values,
          status: item.requires_approval ? 'approved' : 'submitted',
          submitted_at: addMin(dueAt, -5),
        });
        submissions++; done++;
      }

      if (!today && done === items.length) {
        await db.from('checklist_runs').update({ status: 'complete' }).eq('id', run.id);
      }
    }
  }

  return {
    outlets: outlets.length, staff: users.length, templates: templates.length,
    submissions, frozen, pin: DEMO_PIN,
  };
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
