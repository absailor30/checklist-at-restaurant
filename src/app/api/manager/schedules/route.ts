import { NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';
import { currentManager } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

function periodKeyFor(frequency: string, date: Date): string {
  if (frequency === 'daily') return date.toISOString().slice(0, 10);
  if (frequency === 'monthly') return date.toISOString().slice(0, 7);
  // ISO week
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((d as any) - (yearStart as any)) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

function isDueToday(s: { frequency: string; day_of_week: number | null; day_of_month: number | null }, today: Date): boolean {
  if (s.frequency === 'daily') return true;
  if (s.frequency === 'weekly') return s.day_of_week === today.getDay();
  if (s.frequency === 'monthly') return s.day_of_month === today.getDate();
  return false;
}

export async function GET() {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase.from('users').select('org_id').eq('auth_user_id', user.id).single();
  if (!profile) return NextResponse.json({ error: 'User profile not found' }, { status: 404 });

  const { data: schedules, error } = await supabase
    .from('schedules')
    .select('id, outlet_id, title, frequency, day_of_week, day_of_month, is_active, outlets(name)')
    .eq('org_id', profile.org_id)
    .eq('is_active', true);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const { data: outlets } = await supabase.from('outlets').select('id, name').eq('org_id', profile.org_id).eq('is_active', true);

  const today = new Date();
  const rows: any[] = [];
  for (const s of schedules ?? []) {
    const targetOutlets = s.outlet_id ? outlets?.filter((o) => o.id === s.outlet_id) : outlets;
    for (const o of targetOutlets ?? []) {
      const periodKey = periodKeyFor(s.frequency, today);
      const { data: completion } = await supabase
        .from('schedule_completions')
        .select('completed_at, completed_by')
        .eq('schedule_id', s.id).eq('outlet_id', o.id).eq('period_key', periodKey)
        .maybeSingle();
      rows.push({
        scheduleId: s.id, title: s.title, frequency: s.frequency,
        outletId: o.id, outletName: o.name,
        due: isDueToday(s, today), periodKey,
        completed: !!completion, completedAt: completion?.completed_at ?? null,
      });
    }
  }

  return NextResponse.json({ schedules: rows, outlets: outlets ?? [] });
}

export async function POST(request: Request) {
  const supabase = await createServerSupabase();
  const manager = await currentManager();
  if (!manager) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });

  const body = await request.json().catch(() => ({}));

  if (body.action === 'complete') {
    const { scheduleId, outletId, periodKey } = body;
    if (!scheduleId || !outletId || !periodKey) return NextResponse.json({ error: 'Missing fields.' }, { status: 400 });
    const { error } = await supabase.from('schedule_completions').insert({
      schedule_id: scheduleId, outlet_id: outletId, period_key: periodKey, completed_by: manager.name,
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  // Create a schedule — L3 only.
  if (!manager.canManage) return NextResponse.json({ error: 'L3 owner access required.' }, { status: 403 });
  const { title, frequency, outletId, dayOfWeek, dayOfMonth } = body;
  if (!title?.trim() || !['daily', 'weekly', 'monthly'].includes(frequency)) {
    return NextResponse.json({ error: 'Title and a valid frequency are required.' }, { status: 400 });
  }
  const { error } = await supabase.from('schedules').insert({
    org_id: manager.orgId,
    outlet_id: outletId || null,
    title: title.trim(),
    frequency,
    day_of_week: frequency === 'weekly' ? Number(dayOfWeek) : null,
    day_of_month: frequency === 'monthly' ? Number(dayOfMonth) : null,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
