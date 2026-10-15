import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { currentManager } from '@/lib/supabase/server';
import { PHOTO_BUCKET } from '@/lib/storage';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// One audit photo, uploaded the moment it is taken. Camera only in the app; L2 only here.
export async function POST(request: Request) {
  const manager = await currentManager();
  if (!manager || !manager.approved || manager.level !== 2) return NextResponse.json({ error: 'Only L2 can add audit photos.' }, { status: 403 });

  const form = await request.formData();
  const file = form.get('file') as File | null;
  const questionId = String(form.get('questionId') ?? '');
  const outletId = String(form.get('outletId') ?? '');
  if (!file || file.size === 0) return NextResponse.json({ error: 'No photo attached.' }, { status: 400 });
  if (!/^[A-Za-z0-9_-]{1,40}$/.test(questionId)) return NextResponse.json({ error: 'Invalid question.' }, { status: 400 });

  const db = createAdminClient();
  const { data: outlet } = await db.from('outlets').select('id, timezone').eq('id', outletId).eq('org_id', manager.orgId).maybeSingle();
  if (!outlet) return NextResponse.json({ error: 'Outlet not found.' }, { status: 404 });

  const period = new Intl.DateTimeFormat('en-CA', { timeZone: outlet.timezone || 'UTC', year: 'numeric', month: '2-digit' }).format(new Date()).slice(0, 7);
  const photoPath = `${manager.orgId}/${outlet.id}/audit-${period}/${questionId}_${Date.now()}.jpg`;
  const { error } = await db.storage.from(PHOTO_BUCKET).upload(photoPath, file, { contentType: 'image/jpeg', upsert: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, photoPath });
}
