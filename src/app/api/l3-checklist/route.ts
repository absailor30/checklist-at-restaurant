import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { currentManager } from '@/lib/supabase/server';
import { l3ItemsOf } from '@/lib/l3-checklist';

export const dynamic = 'force-dynamic';

// L3's quick checklist. L3 (and Admin) fill it in, one entry per outlet per month; stored under the first day of the month.
const dayIn = (tz: string) => `${new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit' }).format(new Date()).slice(0, 7)}-01`;
const canFill = (m: { canManage: boolean; roleName: string }) => m.canManage || m.roleName === 'Admin';

export async function GET(request: Request) {
  const manager = await currentManager();
  if (!manager || !manager.approved) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
  if (!(manager.level >= 3 || manager.roleName === 'Admin')) return NextResponse.json({ error: 'The L3 checklist is for L3 only.' }, { status: 403 });

  const db = createAdminClient();
  const { data: outlets } = await db.from('outlets').select('id, name, timezone').eq('org_id', manager.orgId).eq('is_active', true).order('name');
  if (!outlets?.length) return NextResponse.json({ error: 'No outlet found.' }, { status: 404 });
  const wanted = new URL(request.url).searchParams.get('outletId');
  const outlet = outlets.find((o) => o.id === wanted) ?? outlets[0];
  const today = dayIn(outlet.timezone || 'UTC');

  const { data: org } = await db.from('organisations').select('line_check_config').eq('id', manager.orgId).maybeSingle();
  const items = l3ItemsOf(org?.line_check_config);

  const { data: checks } = await db.from('l3_checks').select('id, check_date, user_id')
    .eq('outlet_id', outlet.id).order('check_date', { ascending: false }).limit(60);
  const ids = (checks ?? []).map((c) => c.id);
  const { data: rows } = ids.length
    ? await db.from('l3_check_answers').select('check_id, item_key, yes_no, comment').in('check_id', ids)
    : { data: [] as any[] };

  const byCheck = new Map<string, Record<string, { yesNo: string | null; comment: string | null }>>();
  for (const r of rows ?? []) {
    const m = byCheck.get(r.check_id) ?? {};
    m[r.item_key] = { yesNo: r.yes_no, comment: r.comment };
    byCheck.set(r.check_id, m);
  }
  const history = (checks ?? []).map((c) => {
    const a = byCheck.get(c.id) ?? {};
    return { date: c.check_date, yes: items.filter((i) => a[i.key]?.yesNo === 'yes').length, no: items.filter((i) => a[i.key]?.yesNo === 'no').length, answers: a };
  });

  return NextResponse.json({
    canFill: canFill(manager), outlets: outlets.map((o) => ({ id: o.id, name: o.name })), outletId: outlet.id, outletName: outlet.name,
    today, items, answers: history.find((h) => h.date === today)?.answers ?? {}, history,
  });
}

export async function POST(request: Request) {
  const manager = await currentManager();
  if (!manager || !manager.approved) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
  if (!canFill(manager)) return NextResponse.json({ error: 'Only L3 can fill in this checklist.' }, { status: 403 });

  const body = await request.json().catch(() => ({}));
  const db = createAdminClient();
  const { data: outlet } = await db.from('outlets').select('id, timezone').eq('id', body.outletId).eq('org_id', manager.orgId).maybeSingle();
  if (!outlet) return NextResponse.json({ error: 'Outlet not found.' }, { status: 404 });

  const { data: org } = await db.from('organisations').select('line_check_config').eq('id', manager.orgId).maybeSingle();
  const items = l3ItemsOf(org?.line_check_config);
  const incoming = (body.answers ?? {}) as Record<string, { yesNo?: string; comment?: string }>;
  if (!items.every((i) => ['yes', 'no'].includes(incoming[i.key]?.yesNo ?? ''))) {
    return NextResponse.json({ error: 'Please answer Yes or No for every item.' }, { status: 400 });
  }

  const date = dayIn(outlet.timezone || 'UTC');
  const { data: check, error } = await db.from('l3_checks')
    .upsert({ org_id: manager.orgId, outlet_id: outlet.id, check_date: date, user_id: manager.id }, { onConflict: 'outlet_id,check_date' })
    .select('id').single();
  if (error || !check) return NextResponse.json({ error: 'Could not save.' }, { status: 500 });

  const rows = items.map((i) => ({ check_id: check.id, item_key: i.key, yes_no: incoming[i.key].yesNo!, comment: (incoming[i.key].comment ?? '').trim().slice(0, 1000) || null }));
  const { error: e2 } = await db.from('l3_check_answers').upsert(rows, { onConflict: 'check_id,item_key' });
  if (e2) return NextResponse.json({ error: 'Could not save the answers.' }, { status: 500 });
  return NextResponse.json({ ok: true });
}
