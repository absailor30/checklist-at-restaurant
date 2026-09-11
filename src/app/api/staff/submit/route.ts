import { json } from '@/lib/no-store';
import { createAdminClient } from '@/lib/supabase/admin';
import { readSession } from '@/lib/session';
import { PHOTO_BUCKET, photoPath } from '@/lib/storage';
import { addMinutes } from '@/lib/time';

// These routes read a session cookie and live database state, so they must run
// per-request. Without this Next.js tries to execute them at build time, which
// fails because no configuration or request exists yet.
export const dynamic = 'force-dynamic';

export const runtime = 'nodejs';

// A completed checklist item.
//
// The client supplies the submission id. Re-sending the same id is a no-op
// rather than a duplicate, which makes a flaky-connection retry safe and is
// the foundation that lets offline sync be added later without reworking
// this route.
export async function POST(request: Request) {
  const session = await readSession();
  if (!session) return json({ error: 'Not signed in.' }, { status: 401 });

  const form = await request.formData();
  const submissionId = String(form.get('submissionId') ?? '');
  const runId = String(form.get('runId') ?? '');
  const itemId = String(form.get('itemId') ?? '');
  const comment = (form.get('comment') as string) || null;
  const rawValue = form.get('value') as string | null;
  const capturedAt = form.get('capturedAt') as string | null;
  const photo = form.get('photo') as File | null;

  if (!isUuid(submissionId) || !isUuid(runId) || !isUuid(itemId)) {
    return json({ error: 'Invalid request.' }, { status: 400 });
  }

  const db = createAdminClient();

  // Idempotency: if this id already exists, return success without writing
  // again. A retry after a dropped connection must not double-submit.
  const { data: existing } = await db
    .from('submissions').select('id').eq('id', submissionId).maybeSingle();
  if (existing) return json({ ok: true, duplicate: true });

  // Confirm the run belongs to this outlet. The session decides the outlet,
  // never the request body.
  const { data: run } = await db
    .from('checklist_runs')
    .select('id, starts_at, outlet_id, org_id, run_date, template_id')
    .eq('id', runId)
    .eq('outlet_id', session.outletId)
    .maybeSingle();
  if (!run) return json({ error: 'Checklist not found.' }, { status: 404 });

  const { data: item } = await db
    .from('checklist_items')
    .select('*')
    .eq('id', itemId)
    .eq('template_id', run.template_id)
    .maybeSingle();
  if (!item) return json({ error: 'Task not found.' }, { status: 404 });

  // A frozen item cannot be completed until a manager unlocks it, and an
  // expired unlock window is the same as frozen. This is the whole point of
  // the lockout feature, so it is enforced here on the server, not in the UI.
  const { data: lock } = await db
    .from('item_locks')
    .select('*')
    .eq('run_id', runId).eq('checklist_item_id', itemId)
    .maybeSingle();

  const now = new Date();
  if (lock && lock.state === 'locked') {
    return json(
      { error: 'This task is locked. A manager needs to unlock it first.' },
      { status: 423 }
    );
  }
  if (lock && lock.state === 'unlocked' && lock.unlock_expires_at &&
      new Date(lock.unlock_expires_at) <= now) {
    return json(
      { error: 'The unlock window has expired. Ask a manager to reopen it.' },
      { status: 423 }
    );
  }

  // Proof requirements.
  let valueNumber: number | null = null;
  let valueText: string | null = null;
  let outOfBounds = false;

  if (item.proof === 'number') {
    if (rawValue === null || rawValue === '' || Number.isNaN(Number(rawValue))) {
      if (item.proof_required) {
        return json({ error: 'A reading is required.' }, { status: 400 });
      }
    } else {
      valueNumber = Number(rawValue);
      outOfBounds =
        (item.min_value !== null && valueNumber < Number(item.min_value)) ||
        (item.max_value !== null && valueNumber > Number(item.max_value));
    }
  } else if (item.proof === 'text') {
    valueText = (rawValue ?? '').trim() || null;
    if (item.proof_required && !valueText) {
      return json({ error: 'A note is required.' }, { status: 400 });
    }
  }

  if (item.proof === 'photo' && item.proof_required && !photo) {
    return json({ error: 'A photo is required.' }, { status: 400 });
  }

  // Photo freshness. This raises the cost of submitting an old picture from
  // the gallery; it does not make it impossible, and that trade-off was taken
  // deliberately in exchange for the far better image quality the phone's own
  // camera produces.
  let deviceCapturedAt: string | null = null;
  if (capturedAt) {
    const captured = new Date(capturedAt);
    const ageMinutes = (now.getTime() - captured.getTime()) / 60_000;
    if (ageMinutes > 15 || ageMinutes < -5) {
      return json(
        { error: 'That photo is not recent. Please take a new one now.' },
        { status: 400 }
      );
    }
    deviceCapturedAt = captured.toISOString();
  }

  let storedPath: string | null = null;
  if (photo && photo.size > 0) {
    if (photo.size > 8 * 1024 * 1024) {
      return json({ error: 'Photo too large.' }, { status: 413 });
    }
    storedPath = photoPath({
      orgId: run.org_id, outletId: run.outlet_id, runDate: run.run_date,
      runId: run.id, itemId: item.id,
    });
    const { error: uploadError } = await db.storage
      .from(PHOTO_BUCKET)
      .upload(storedPath, photo, { contentType: 'image/jpeg', upsert: true });
    if (uploadError) {
      return json({ error: `Photo upload failed: ${uploadError.message}` }, { status: 500 });
    }
  }

  const dueAt = addMinutes(run.starts_at, item.due_offset_minutes);
  const wasLate = now > dueAt;

  const { error: insertError } = await db.from('submissions').insert({
    id: submissionId,
    org_id: run.org_id,
    outlet_id: run.outlet_id,
    run_id: run.id,
    checklist_item_id: item.id,
    user_id: session.userId,
    value_number: valueNumber,
    value_text: valueText,
    photo_path: storedPath,
    comment,
    status: 'submitted',
    out_of_bounds: outOfBounds,
    was_late: wasLate,
    device_captured_at: deviceCapturedAt,
  });

  if (insertError) {
    // The unique index means a second device completing the same item loses
    // the race. That is correct behaviour, and the message should say so
    // plainly rather than looking like a failure.
    if (insertError.code === '23505') {
      return json({ ok: true, alreadyDone: true });
    }
    return json({ error: insertError.message }, { status: 500 });
  }

  if (lock) {
    await db.from('item_locks')
      .update({ state: 'resolved', resolved_at: now.toISOString() })
      .eq('id', lock.id);
  }

  // An out-of-range reading is notified regardless of whether the item needs
  // approval. A freezer running warm is the event this app exists to catch,
  // and it must never be silently auto-approved.
  if (outOfBounds) {
    await notifyChain(db, run.org_id, session.roleId, {
      kind: 'out_of_bounds',
      title: `Reading out of range: ${item.title}`,
      body: `${session.name} recorded ${valueNumber}${item.unit ?? ''} (expected ${item.min_value}–${item.max_value}${item.unit ?? ''}).`,
      payload: { runId: run.id, itemId: item.id, submissionId },
    });
  } else if (item.requires_approval) {
    await notifyChain(db, run.org_id, session.roleId, {
      kind: 'review_needed',
      title: `Review needed: ${item.title}`,
      body: `Submitted by ${session.name}.`,
      payload: { runId: run.id, itemId: item.id, submissionId },
    });
  }

  return json({ ok: true, outOfBounds, wasLate });
}

// Notify everyone holding the role this person reports to.
async function notifyChain(
  db: ReturnType<typeof createAdminClient>,
  orgId: string,
  roleId: string,
  message: { kind: string; title: string; body: string; payload: Record<string, unknown> }
) {
  const { data: link } = await db
    .from('reporting_chain')
    .select('reports_to_role_id, reports_to_user_id')
    .eq('org_id', orgId).eq('role_id', roleId)
    .maybeSingle();
  if (!link) return;

  let recipients: string[] = [];
  if (link.reports_to_user_id) {
    recipients = [link.reports_to_user_id];
  } else if (link.reports_to_role_id) {
    const { data } = await db
      .from('users').select('id')
      .eq('org_id', orgId).eq('role_id', link.reports_to_role_id).eq('is_active', true);
    recipients = (data ?? []).map((u) => u.id);
  }
  if (!recipients.length) return;

  await db.from('notifications').insert(
    recipients.map((userId) => ({
      org_id: orgId, user_id: userId,
      kind: message.kind, title: message.title, body: message.body,
      payload: message.payload,
    }))
  );
}

function isUuid(v: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
}
