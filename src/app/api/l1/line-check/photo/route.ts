import { json } from '@/lib/no-store';
import { createAdminClient } from '@/lib/supabase/admin';
import { readSession } from '@/lib/session';
import { PHOTO_BUCKET } from '@/lib/storage';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// Uploads one photo the moment it's captured, rather than batching every
// question's photo into one giant request at "Complete station" — a station
// with several temperature/evidence photos was blowing past the platform's
// request body size limit and failing the whole sync with no clear error.
export async function POST(request: Request) {
  const session = await readSession();
  if (!session) return json({ error: 'Not signed in.' }, { status: 401 });

  const form = await request.formData();
  const file = form.get('file') as File | null;
  const questionId = form.get('questionId') as string | null;
  const stationNo = Number(form.get('stationNo'));

  if (!file || file.size === 0) return json({ error: 'No photo attached.' }, { status: 400 });
  if (!questionId) return json({ error: 'questionId required.' }, { status: 400 });
  if (![1, 2, 3].includes(stationNo)) return json({ error: 'Invalid station number.' }, { status: 400 });

  const db = createAdminClient();
  const { data: outlet } = await db.from('outlets').select('timezone').eq('id', session.outletId).single();
  const tz = outlet?.timezone || 'UTC';
  const runDate = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());

  const photoPath = `${session.orgId}/${session.outletId}/${runDate}/st${stationNo}_${questionId}_${Date.now()}.jpg`;
  const { error } = await db.storage
    .from(PHOTO_BUCKET)
    .upload(photoPath, file, { contentType: 'image/jpeg', upsert: true });

  if (error) return json({ error: error.message }, { status: 500 });
  return json({ ok: true, photoPath });
}
