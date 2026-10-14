import { json } from '@/lib/no-store';
import { createAdminClient } from '@/lib/supabase/admin';
import { readSession } from '@/lib/session';
import { PHOTO_BUCKET } from '@/lib/storage';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// Today's saved paused and completed stations for this outlet and shift, so
// whoever signs in next sees them and carries on rather than starting over.
export async function GET() {
  const session = await readSession();
  if (!session) return json({ error: 'Not signed in.' }, { status: 401 });

  const db = createAdminClient();
  const { data: outlet } = await db.from('outlets').select('timezone').eq('id', session.outletId).single();
  const runDate = new Intl.DateTimeFormat('en-CA', {
    timeZone: outlet?.timezone || 'UTC', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());

  const { data: run } = await db.from('line_check_runs').select('id')
    .eq('outlet_id', session.outletId).eq('run_date', runDate).eq('shift', session.l1Shift ?? 'morning').maybeSingle();
  if (!run) return json({ stations: {} });

  const { data: rows } = await db.from('line_check_stations')
    .select('station_no, status, pause_reason, line_check_answers(question_id, yes_no, value_number, reason, flagged, photo_path, correction_photo_path, ai_verified, ai_note)')
    .eq('run_id', run.id).in('status', ['paused', 'complete']);

  const sign = async (path: string | null) => {
    if (!path) return null;
    const { data } = await db.storage.from(PHOTO_BUCKET).createSignedUrl(path, 3600);
    return data?.signedUrl ?? null;
  };

  const stations: Record<number, any> = {};
  for (const s of rows ?? []) {
    const answers: Record<string, any> = {};
    for (const a of (s as any).line_check_answers ?? []) {
      answers[a.question_id] = {
        questionId: a.question_id, yesNo: a.yes_no, value: a.value_number, reason: a.reason, flagged: a.flagged,
        photoPath: a.photo_path, photoDataUrl: await sign(a.photo_path),
        correctionPhotoPath: a.correction_photo_path, correctionPhotoDataUrl: await sign(a.correction_photo_path),
        aiVerified: a.ai_verified, aiNote: a.ai_note,
      };
    }
    stations[s.station_no] = { status: s.status, pauseReason: s.pause_reason ?? '', answers };
  }
  return json({ stations });
}
