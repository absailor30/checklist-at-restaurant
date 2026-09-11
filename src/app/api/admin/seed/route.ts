import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { createAdminClient } from '@/lib/supabase/admin';
import { buildDemo } from '@/lib/seed-core';
import { PHOTO_BUCKET } from '@/lib/storage';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Builds the demo data from a browser, so no development environment is
// needed to set up or reset a demo.
//
// Protected by SETUP_PASSWORD. This endpoint can delete and rebuild an entire
// organisation, so it must never be callable by a stranger who finds the URL.
export async function POST(request: Request) {
  const expected = process.env.SETUP_PASSWORD;
  if (!expected) {
    return NextResponse.json(
      { error: 'SETUP_PASSWORD is not configured on the server.' },
      { status: 500 }
    );
  }

  const { password, reset } = await request.json().catch(() => ({}));
  if (!safeEqual(String(password ?? ''), expected)) {
    return NextResponse.json({ error: 'Wrong setup password.' }, { status: 401 });
  }

  try {
    const db = createAdminClient();
    await ensurePhotoBucket(db);
    const result = await buildDemo(db, { reset: Boolean(reset) });
    if ('alreadyExists' in result) {
      return NextResponse.json({
        ok: true, alreadyExists: true,
        message: 'Demo data is already set up. Use "Rebuild" to start fresh.',
      });
    }
    return NextResponse.json({ ok: true, result });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? 'Seeding failed.' }, { status: 500 });
  }
}

// Photos live in a private bucket: proof images are evidence about a named
// employee, and must never be readable by anyone holding a guessable URL.
// Reads go through short-lived signed URLs instead.
async function ensurePhotoBucket(db: ReturnType<typeof createAdminClient>) {
  const { data: buckets } = await db.storage.listBuckets();
  if (buckets?.some((b) => b.name === PHOTO_BUCKET)) return;

  const { error } = await db.storage.createBucket(PHOTO_BUCKET, {
    public: false,
    fileSizeLimit: 8 * 1024 * 1024,
    allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp'],
  });
  // A concurrent call may have created it first; that is not a failure.
  if (error && !/already exists/i.test(error.message)) throw error;
}

// Constant-time so the password cannot be guessed character by character.
function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}
