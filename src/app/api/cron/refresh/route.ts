import crypto from 'crypto';
import { json } from '@/lib/no-store';
import { createAdminClient } from '@/lib/supabase/admin';
import { ensureRuns, refreshLocks } from '@/lib/checklist';
import { notify, recipientsForLock } from '@/lib/notify';
import { todayIn } from '@/lib/time';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// The scheduled job: create each outlet's runs for the day, freeze items whose
// due time has passed, escalate ones still outstanding, and notify whoever is
// currently empowered to act.
//
// Screens also refresh lock state when they load, so the app is never stale
// for someone looking at it. This job exists for the hours when nobody is
// looking — overnight, and between shifts — which is exactly when a missed
// closing task needs to reach a manager.
export async function GET(request: Request) {
  const denied = authorise(request);
  if (denied) return denied;

  const db = createAdminClient();
  const startedAt = Date.now();

  const { data: orgs, error: orgError } = await db
    .from('organisations')
    .select('id, name, overdue_grace_minutes, unlock_escalation_minutes');
  if (orgError) return json({ error: orgError.message }, { status: 500 });

  const summary = {
    organisations: 0, outlets: 0,
    frozen: 0, refrozen: 0, escalated: 0, notified: 0,
    errors: [] as string[],
  };

  for (const org of orgs ?? []) {
    summary.organisations++;

    const { data: outlets } = await db
      .from('outlets')
      .select('id, org_id, name, timezone')
      .eq('org_id', org.id)
      .eq('is_active', true);

    const { data: roles } = await db
      .from('roles').select('id, level').eq('org_id', org.id);

    for (const outlet of outlets ?? []) {
      summary.outlets++;
      const date = todayIn(outlet.timezone);

      try {
        await ensureRuns(db, outlet, date);
        const changes = await refreshLocks(db, org, outlet.id, date);
        if (!changes.length) continue;

        // Resolve the titles and owning roles once for the whole batch rather
        // than per change.
        const itemIds = [...new Set(changes.map((c) => c.itemId))];
        const runIds = [...new Set(changes.map((c) => c.runId))];

        const [{ data: items }, { data: runs }] = await Promise.all([
          db.from('checklist_items').select('id, title, template_id').in('id', itemIds),
          db.from('checklist_runs')
            .select('id, checklist_templates!inner(role_id)')
            .in('id', runIds),
        ]);

        const titleById = new Map((items ?? []).map((i) => [i.id, i.title]));
        const roleByRun = new Map((runs ?? []).map((r: any) => {
          const t = Array.isArray(r.checklist_templates)
            ? r.checklist_templates[0] : r.checklist_templates;
          return [r.id, t?.role_id];
        }));
        const levelByRole = new Map((roles ?? []).map((r) => [r.id, r.level]));

        for (const change of changes) {
          if (change.kind === 'frozen') summary.frozen++;
          if (change.kind === 'refrozen') summary.refrozen++;
          if (change.kind === 'escalated') summary.escalated++;

          const submitterLevel = levelByRole.get(roleByRun.get(change.runId)) ?? 1;
          const recipients = await recipientsForLock(
            db, org.id, outlet.id, submitterLevel, change.escalationLevel
          );

          const title = titleById.get(change.itemId) ?? 'A checklist task';
          summary.notified += await notify(db, org.id, recipients, {
            kind: change.kind === 'escalated' ? 'escalated' : 'locked',
            title:
              change.kind === 'escalated'
                ? `Still not done: ${title}`
                : `Locked: ${title}`,
            body:
              change.kind === 'escalated'
                ? `${outlet.name} — this has now escalated to your level.`
                : `${outlet.name} — missed its due time and is locked. Unlock it or resolve it.`,
            payload: { runId: change.runId, itemId: change.itemId, outletId: outlet.id },
          });
        }
      } catch (e: any) {
        // One bad outlet must not stop the rest of the estate being processed.
        summary.errors.push(`${outlet.name}: ${e?.message ?? 'failed'}`);
      }
    }
  }

  return json({ ok: true, ms: Date.now() - startedAt, ...summary });
}

// Vercel Cron sends `Authorization: Bearer <CRON_SECRET>`. The same secret
// works for an external scheduler, which is how this gets a shorter interval
// than the Hobby plan's once-a-day cron allows.
function authorise(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return json(
      { error: 'CRON_SECRET is not configured on the server.' },
      { status: 500 }
    );
  }

  const header = request.headers.get('authorization') ?? '';
  const provided = header.replace(/^Bearer\s+/i, '');
  const a = Buffer.from(provided);
  const b = Buffer.from(secret);
  const ok = a.length === b.length && crypto.timingSafeEqual(a, b);

  return ok ? null : json({ error: 'Not authorised.' }, { status: 401 });
}
