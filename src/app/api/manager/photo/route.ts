import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { currentManager } from '@/lib/supabase/server';
import { PHOTO_BUCKET } from '@/lib/storage';

export const dynamic = 'force-dynamic';

// Proof photos live in a private bucket and are served through short-lived
// signed URLs. They are evidence about a named employee, so a permanent public
// link would be the wrong thing to hand out.
export async function GET(request: Request) {
  const manager = await currentManager();
  if (!manager) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });

  const path = new URL(request.url).searchParams.get('path');
  if (!path) return NextResponse.json({ error: 'path required' }, { status: 400 });

  // Paths begin with the organisation id. Checking that prefix stops a manager
  // reading another organisation's photos by guessing a path.
  if (!path.startsWith(`${manager.orgId}/`)) {
    return NextResponse.json({ error: 'Not your organisation.' }, { status: 403 });
  }

  const db = createAdminClient();
  const { data, error } = await db.storage.from(PHOTO_BUCKET).createSignedUrl(path, 300);
  if (error) return NextResponse.json({ error: error.message }, { status: 404 });

  return NextResponse.json({ url: data.signedUrl });
}
