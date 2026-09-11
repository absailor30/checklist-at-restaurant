import { json } from '@/lib/no-store';
import crypto from 'crypto';
import { createAdminClient } from '@/lib/supabase/admin';
import { buildDemo, DEMO_ORG, DEMO_PIN, DEMO_MANAGER_PASSWORD } from '@/lib/seed-core';
import { PHOTO_BUCKET } from '@/lib/storage';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Builds the demo data from a browser, so no development environment is
// needed to set up or reset a demo.
//
// Protected by SETUP_PASSWORD. This endpoint can delete and rebuild an entire
// organisation, so it must never be callable by a stranger who finds the URL.
// Current state of the demo data, so the setup page can show what actually
// exists rather than leaving the reader to guess from the last button press.
export async function GET() {
  try {
    const db = createAdminClient();
    const { data: org } = await db
      .from('organisations').select('id').eq('name', DEMO_ORG).maybeSingle();

    if (!org) return json({ exists: false });

    const [{ data: outletRows }, { count: submissions }, { data: managers }] = await Promise.all([
      db.from('outlets').select('id').eq('org_id', org.id),
      db.from('submissions').select('id', { count: 'exact', head: true }).eq('org_id', org.id),
      db.from('users')
        .select('name, email, roles!inner(name, can_review)')
        .eq('org_id', org.id).not('email', 'is', null),
    ]);

    return json({
      exists: true,
      outlets: outletRows?.length ?? 0,
      submissions: submissions ?? 0,
      pin: DEMO_PIN,
      managerPassword: DEMO_MANAGER_PASSWORD,
      managers: (managers ?? []).map((m: any) => ({
        name: m.name,
        email: m.email,
        role: (Array.isArray(m.roles) ? m.roles[0] : m.roles)?.name ?? '',
      })),
    });
  } catch (e: any) {
    return json({ exists: false, error: e?.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const expected = process.env.SETUP_PASSWORD;
  if (!expected) {
    return json(
      { error: 'SETUP_PASSWORD is not configured on the server.' },
      { status: 500 }
    );
  }

  const { password, reset } = await request.json().catch(() => ({}));
  if (!safeEqual(String(password ?? ''), expected)) {
    return json({ error: 'Wrong setup password.' }, { status: 401 });
  }

  try {
    const db = createAdminClient();
    await ensurePhotoBucket(db);
    const result = await buildDemo(db, { reset: Boolean(reset) });
    if ('alreadyExists' in result) {
      return json({
        ok: true, alreadyExists: true,
        message: 'Demo data is already set up. Use "Rebuild" to start fresh.',
      });
    }
    return json({ ok: true, result });
  } catch (e: any) {
    return json({ error: e?.message ?? 'Seeding failed.' }, { status: 500 });
  }
}

// Photos live in a private bucket: proof images are evidence about a named
// employee, and must never be readable by anyone holding a guessable URL.
// Reads go through short-lived signed URLs instead.
async function ensurePhotoBucket(db: ReturnType<typeof createAdminClient>) {
  // Attempt creation directly rather than listing first. Listing can come back
  // empty for reasons unrelated to whether the bucket exists, and acting on
  // that produced a setup that reported storage missing while photos worked —
  // or worse, skipped creating it.
  const { error } = await db.storage.createBucket(PHOTO_BUCKET, {
    public: false,
    fileSizeLimit: 8 * 1024 * 1024,
    allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp'],
  });

  // Already existing is the expected outcome on every run after the first.
  if (error && !/already exists|duplicate/i.test(error.message)) {
    throw new Error(`Could not create the photo storage bucket: ${error.message}`);
  }
}

// Constant-time so the password cannot be guessed character by character.
function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}
