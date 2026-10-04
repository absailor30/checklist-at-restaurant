import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { currentManager } from '@/lib/supabase/server';
import { PHOTO_BUCKET } from '@/lib/storage';

export const dynamic = 'force-dynamic';

// A short-lived link to one evidence photo, for a signed-in manager of the
// same brand. Photo paths start with the organisation id, which is what is
// checked here.
export async function GET(request: Request) {
  const manager = await currentManager();
  if (!manager) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
  if (!manager.approved) return NextResponse.json({ error: 'Your account is still waiting for approval.' }, { status: 403 });

  const path = new URL(request.url).searchParams.get('path') ?? '';
  if (!path.startsWith(`${manager.orgId}/`) || path.includes('..')) {
    return NextResponse.json({ error: 'Not allowed.' }, { status: 403 });
  }

  const { data, error } = await createAdminClient().storage.from(PHOTO_BUCKET).createSignedUrl(path, 600);
  if (error || !data) return NextResponse.json({ error: 'Photo not found.' }, { status: 404 });
  return NextResponse.json({ url: data.signedUrl });
}
