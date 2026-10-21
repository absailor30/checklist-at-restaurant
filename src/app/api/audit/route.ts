import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { currentManager } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

// Monthly L2 audit. L2 fills it in (answers are saved as they go); L3 can read it.
// One audit per outlet per calendar month, in the outlet's own timezone.
const monthIn = (tz: string) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit' }).format(new Date()).slice(0, 7);

async function questionsFor(db: ReturnType<typeof createAdminClient>, orgId: string) {
  const { data: org } = await db.from('organisations').select('line_check_config').eq('id', orgId).maybeSingle();
  const ownL2 = Boolean((org?.line_check_config as any)?.l2OwnBank);
  const { data } = await db.from('line_check_questions')
    .select('id, prompt, notes, section, sort_order, org_id, photo_required')
    .eq('level', 'L2').or(`org_id.is.null,org_id.eq.${orgId}`).order('sort_order');
  return (data ?? []).filter((q: any) => !(ownL2 && q.org_id === null))
    .map((q: any) => ({ id: q.id, prompt: q.prompt, notes: q.notes, section: q.section, photoRequired: Boolean(q.photo_required) }));
}

export async function GET(request: Request) {
  const manager = await currentManager();
  if (!manager || !manager.approved) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
  if (manager.level < 2) return NextResponse.json({ error: 'Operations Manager or CEO/Owner access required.' }, { status: 403 });

  const db = createAdminClient();
  const { data: outlets } = await db.from('outlets').select('id, name, timezone')
    .eq('org_id', manager.orgId).eq('is_active', true).order('name');
  if (!outlets?.length) return NextResponse.json({ error: 'No outlet found.' }, { status: 404 });

  const url = new URL(request.url);
  const outlet = outlets.find((o) => o.id === url.searchParams.get('outletId')) ?? outlets[0];
  const currentPeriod = monthIn(outlet.timezone || 'UTC');
  const period = /^\d{4}-\d{2}$/.test(url.searchParams.get('period') ?? '') ? url.searchParams.get('period')! : currentPeriod;

  const { data: audit } = await db.from('audits').select('id, status, score, completed_at, auditor_id, period')
    .eq('outlet_id', outlet.id).eq('period', period).maybeSingle();
  let answers: Record<string, { yesNo: string | null; comment: string | null; photoPath: string | null; flagged: boolean }> = {};
  let auditorName: string | null = null;
  if (audit) {
    const { data: rows } = await db.from('audit_answers').select('question_id, yes_no, comment, photo_path, flagged').eq('audit_id', audit.id);
    for (const r of rows ?? []) answers[r.question_id] = { yesNo: r.yes_no, comment: r.comment, photoPath: r.photo_path, flagged: Boolean(r.flagged) };
    if (audit.auditor_id) {
      const { data: u } = await db.from('users').select('name').eq('id', audit.auditor_id).maybeSingle();
      auditorName = u?.name ?? null;
    }
  }

  const { data: history } = await db.from('audits').select('period, status, score, completed_at')
    .eq('outlet_id', outlet.id).order('period', { ascending: false }).limit(24);

  return NextResponse.json({
    level: manager.level, canFill: manager.level === 2 || manager.roleName === 'Admin', outlets: outlets.map((o) => ({ id: o.id, name: o.name })),
    outletId: outlet.id, outletName: outlet.name, period, currentPeriod,
    questions: await questionsFor(db, manager.orgId),
    audit: audit ? { status: audit.status, score: audit.score, completedAt: audit.completed_at, auditorName } : null,
    answers, history: history ?? [],
  });
}

export async function POST(request: Request) {
  const manager = await currentManager();
  if (!manager || !manager.approved) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
  if (!(manager.level === 2 || manager.roleName === 'Admin')) return NextResponse.json({ error: 'Only the Operations Manager or Admin can fill in the audit.' }, { status: 403 });

  const body = await request.json().catch(() => ({}));
  const db = createAdminClient();
  const { data: outlet } = await db.from('outlets').select('id, timezone')
    .eq('id', body.outletId).eq('org_id', manager.orgId).maybeSingle();
  if (!outlet) return NextResponse.json({ error: 'Outlet not found.' }, { status: 404 });

  const period = monthIn(outlet.timezone || 'UTC');
  const questions = await questionsFor(db, manager.orgId);
  const valid = new Set(questions.map((q) => q.id));

  let { data: audit } = await db.from('audits').select('id, status').eq('outlet_id', outlet.id).eq('period', period).maybeSingle();
  if (audit?.status === 'complete') return NextResponse.json({ error: 'This month\'s audit is already complete.' }, { status: 409 });
  if (!audit) {
    const { data: created, error } = await db.from('audits')
      .insert({ org_id: manager.orgId, outlet_id: outlet.id, period, auditor_id: manager.id }).select('id, status').single();
    if (error || !created) return NextResponse.json({ error: 'Could not start the audit.' }, { status: 500 });
    audit = created;
  }

  const incoming = (body.answers ?? {}) as Record<string, { yesNo?: string; comment?: string; photoPath?: string | null; flagged?: boolean }>;
  const rows = Object.entries(incoming)
    .filter(([id, a]) => valid.has(id) && ['yes', 'no', 'na'].includes(a?.yesNo ?? ''))
    .map(([id, a]) => ({
      audit_id: audit!.id, question_id: id, yes_no: a.yesNo!, comment: (a.comment ?? '').trim().slice(0, 1000) || null,
      // A photo path must sit under this org's folder.
      photo_path: typeof a.photoPath === 'string' && a.photoPath.startsWith(`${manager.orgId}/`) ? a.photoPath : null,
      flagged: Boolean(a.flagged),
    }));
  if (rows.length) await db.from('audit_answers').upsert(rows, { onConflict: 'audit_id,question_id' });

  if (body.complete) {
    const { data: all } = await db.from('audit_answers').select('question_id, yes_no, photo_path').eq('audit_id', audit.id);
    if ((all ?? []).length < questions.length) {
      return NextResponse.json({ error: 'Please answer every question before completing.' }, { status: 400 });
    }
    const missingPhoto = questions.filter((q) => q.photoRequired && (all ?? []).find((a: any) => a.question_id === q.id)?.yes_no !== 'na' && !(all ?? []).find((a: any) => a.question_id === q.id)?.photo_path);
    if (missingPhoto.length) {
      return NextResponse.json({ error: `A photo is required for: ${missingPhoto.map((q) => q.prompt).join('; ')}` }, { status: 400 });
    }
    const yes = (all ?? []).filter((a: any) => a.yes_no === 'yes').length;
    const no = (all ?? []).filter((a: any) => a.yes_no === 'no').length;
    const score = yes + no ? Math.round((yes / (yes + no)) * 1000) / 10 : null;
    await db.from('audits').update({ status: 'complete', completed_at: new Date().toISOString(), score, auditor_id: manager.id }).eq('id', audit.id);
  }
  return NextResponse.json({ ok: true });
}
