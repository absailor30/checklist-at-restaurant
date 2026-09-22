import { json } from '@/lib/no-store';
import { createAdminClient } from '@/lib/supabase/admin';
import { readSession } from '@/lib/session';
import { L1_QUESTIONS } from '@/lib/line-check/questions';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request: Request) {
  const session = await readSession();
  if (!session) return json({ error: 'Not signed in.' }, { status: 401 });

  const form = await request.formData();
  const stationNo = Number(form.get('stationNo'));
  const status = form.get('status') as string;
  const pauseReason = form.get('pauseReason') as string | null;
  const answersJson = form.get('answers') as string;

  if (![1, 2, 3].includes(stationNo)) {
    return json({ error: 'Invalid station number.' }, { status: 400 });
  }

  // Accounts predating the shift system default to 'morning' rather than
  // breaking their sync outright.
  const shift = session.l1Shift ?? 'morning';

  const db = createAdminClient();

  // Find or create run for today (using outlet's timezone or simple date)
  // For simplicity, use the server's current date or a passed in date.
  // We'll use the server's UTC date, or better, the outlet's timezone.
  // Let's fetch outlet to get timezone.
  const { data: outlet } = await db.from('outlets').select('timezone, station_count').eq('id', session.outletId).single();
  const tz = outlet?.timezone || 'UTC';

  if (stationNo > (outlet?.station_count ?? 3)) {
    return json({ error: 'This outlet does not have that many stations.' }, { status: 400 });
  }

  // Get current date string in outlet's timezone (YYYY-MM-DD)
  const runDate = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());

  // Upsert the run
  const { data: run, error: runError } = await db
    .from('line_check_runs')
    .upsert({ outlet_id: session.outletId, run_date: runDate, shift }, { onConflict: 'outlet_id, run_date, shift' })
    .select('id')
    .single();

  if (runError || !run) {
    return json({ error: 'Failed to find or create run.' }, { status: 500 });
  }

  const runId = run.id;

  // Upsert the station
  const updatePayload: any = { status, pause_reason: pauseReason };
  if (status === 'complete') updatePayload.completed_at = new Date().toISOString();
  else if (status === 'paused') updatePayload.paused_at = new Date().toISOString();
  else updatePayload.started_at = new Date().toISOString(); // just an approximation

  const { data: station, error: stationError } = await db
    .from('line_check_stations')
    .upsert({
      run_id: runId,
      station_no: stationNo,
      ...updatePayload
    }, { onConflict: 'run_id, station_no' })
    .select('id')
    .single();

  if (stationError || !station) {
    return json({ error: 'Failed to update station.' }, { status: 500 });
  }

  const stationId = station.id;

  // Handle answers and photos
  let answers = [];
  try {
    answers = JSON.parse(answersJson);
  } catch (e) {
    return json({ error: 'Invalid answers format.' }, { status: 400 });
  }

  for (const a of answers) {
    const questionId = a.questionId;

    // Photos are uploaded immediately on capture via /api/l1/line-check/photo
    // — this request just carries the resulting path, never file bytes.
    const { error: ansError } = await db
      .from('line_check_answers')
      .upsert({
        station_id: stationId,
        question_id: questionId,
        yes_no: a.yesNo,
        value_number: a.value,
        reason: a.reason,
        flagged: Boolean(a.flagged),
        ...(a.photoPath ? { photo_path: a.photoPath } : {}),
        ...(a.aiVerified !== undefined && a.aiVerified !== null ? { ai_verified: a.aiVerified, ai_note: a.aiNote ?? null } : {}),
      }, { onConflict: 'station_id, question_id' });

    if (ansError) {
      console.error('Answer upsert failed:', ansError);
    }

    // A flagged answer becomes an open corrective action for L2 to act on,
    // rather than the flag just sitting on the answer unnoticed. One per
    // outlet+question+day is enough — repeat syncs of the same flag must
    // not pile up duplicates.
    if (a.flagged) {
      const { data: existing } = await db
        .from('corrective_actions')
        .select('id')
        .eq('outlet_id', session.outletId)
        .eq('question_id', questionId)
        .eq('source', 'l1')
        .eq('status', 'open')
        .gte('created_at', `${runDate}T00:00:00Z`)
        .maybeSingle();
      if (!existing) {
        const q = L1_QUESTIONS.find((q) => q.id === questionId);
        await db.from('corrective_actions').insert({
          org_id: session.orgId,
          outlet_id: session.outletId,
          source: 'l1',
          question_id: questionId,
          description: q?.prompt ?? questionId,
          assigned_role: 'L2 Manager',
        });
      }
    }
  }

  return json({ ok: true, runId, stationId });
}
