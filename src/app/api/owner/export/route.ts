import { createAdminClient } from '@/lib/supabase/admin';
import { currentManager } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Audit export. CSV rather than a PDF: an inspector or an accountant wants the
// rows, and every spreadsheet on earth opens CSV. The dashboard's print view
// covers the case where a signed paper copy is wanted.
export async function GET(request: Request) {
  const manager = await currentManager();
  if (!manager) {
    return new Response('Not signed in.', { status: 401 });
  }
  if (!manager.canReview) {
    return new Response('Review access required.', { status: 403 });
  }

  const url = new URL(request.url);
  const from = url.searchParams.get('from');
  const to = url.searchParams.get('to');
  const outletId = url.searchParams.get('outletId');
  const status = url.searchParams.get('status');

  const db = createAdminClient();

  let query = db
    .from('submissions')
    .select(`
      id, submitted_at, status, out_of_bounds, was_late, value_number, value_text,
      comment, review_note, reviewed_at, photo_path,
      outlets(name),
      users!submissions_user_id_fkey(name, roles(name)),
      checklist_items(title, unit, min_value, max_value),
      checklist_runs(run_date, shifts(name))
    `)
    .eq('org_id', manager.orgId)
    .is('superseded_by', null)
    .order('submitted_at', { ascending: false })
    .limit(5000);

  if (from) query = query.gte('submitted_at', `${from}T00:00:00Z`);
  if (to) query = query.lte('submitted_at', `${to}T23:59:59Z`);
  if (outletId) query = query.eq('outlet_id', outletId);
  if (status) query = query.eq('status', status);

  const { data, error } = await query;
  if (error) return new Response(error.message, { status: 500 });

  const header = [
    'Date', 'Time', 'Outlet', 'Shift', 'Task', 'Staff', 'Role',
    'Status', 'Reading', 'Unit', 'Expected min', 'Expected max',
    'Out of range', 'Late', 'Note', 'Comment', 'Manager note',
    'Reviewed at', 'Photo',
  ];

  const rows = (data ?? []).map((s: any) => {
    const one = (v: any) => (Array.isArray(v) ? v[0] : v);
    const outlet = one(s.outlets);
    const user = one(s.users);
    const role = one(user?.roles);
    const item = one(s.checklist_items);
    const run = one(s.checklist_runs);
    const shift = one(run?.shifts);
    const at = new Date(s.submitted_at);

    return [
      run?.run_date ?? at.toISOString().slice(0, 10),
      at.toISOString().slice(11, 16),
      outlet?.name ?? '',
      shift?.name ?? '',
      item?.title ?? '',
      user?.name ?? '',
      role?.name ?? '',
      statusLabel(s.status),
      s.value_number ?? '',
      item?.unit ?? '',
      item?.min_value ?? '',
      item?.max_value ?? '',
      s.out_of_bounds ? 'YES' : '',
      s.was_late ? 'YES' : '',
      s.value_text ?? '',
      s.comment ?? '',
      s.review_note ?? '',
      s.reviewed_at ? new Date(s.reviewed_at).toISOString().slice(0, 16).replace('T', ' ') : '',
      s.photo_path ? 'yes' : '',
    ];
  });

  const csv = [header, ...rows].map((r) => r.map(csvCell).join(',')).join('\r\n');
  const stamp = new Date().toISOString().slice(0, 10);

  return new Response(`﻿${csv}`, {
    headers: {
      // The byte order mark above makes Excel read it as UTF-8, without which
      // outlet names containing an em dash arrive mangled.
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="checklist-audit-${stamp}.csv"`,
      'Cache-Control': 'no-store',
    },
  });
}

function statusLabel(status: string): string {
  switch (status) {
    case 'completed_by_manager': return 'Completed by manager';
    case 'waived': return 'Waived';
    case 'approved': return 'Approved';
    case 'rejected': return 'Sent back';
    default: return 'Submitted';
  }
}

function csvCell(value: unknown): string {
  const text = value === null || value === undefined ? '' : String(value);
  // A leading =, +, - or @ makes a spreadsheet treat the cell as a formula.
  // Comments are written by staff, so this is untrusted input.
  const safe = /^[=+\-@]/.test(text) ? `'${text}` : text;
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}
