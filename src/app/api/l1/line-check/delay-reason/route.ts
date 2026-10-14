import { json } from '@/lib/no-store';
import { createAdminClient } from '@/lib/supabase/admin';
import { readSession } from '@/lib/session';

export const dynamic = 'force-dynamic';

// L1 gives the reason a check ran past its deadline. Saved on today's run for this shift.
export async function POST(request: Request) {
  const session = await readSession();
  if (!session) return json({ error: 'Not signed in.' }, { status: 401 });
  const { reason } = await request.json().catch(() => ({}));
  const text = typeof reason === 'string' ? reason.trim().slice(0, 500) : '';
  if (text.length < 3) return json({ error: 'Please write a short reason.' }, { status: 400 });

  const db = createAdminClient();
  const { data: outlet } = await db.from('outlets').select('timezone').eq('id', session.outletId).single();
  const runDate = new Intl.DateTimeFormat('en-CA', {
    timeZone: outlet?.timezone || 'UTC', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());

  const { data, error } = await db.from('line_check_runs').update({ delay_reason: text })
    .eq('outlet_id', session.outletId).eq('run_date', runDate).eq('shift', session.l1Shift ?? 'morning').select('id');
  if (error || !data?.length) return json({ error: 'Could not save the reason.' }, { status: 500 });
  return json({ ok: true });
}
