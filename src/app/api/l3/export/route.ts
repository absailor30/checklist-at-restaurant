import { createAdminClient } from '@/lib/supabase/admin';
import { currentManager } from '@/lib/supabase/server';
import { buildL3Report } from '@/lib/l3-report';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const HEADERS = [
  'Date', 'Outlet', 'Shift', 'Stations complete', 'Stations total',
  'L1 percent', 'Band', 'On time', 'L2 reviewed', 'L3 reviewed',
];

function csvCell(v: unknown): string {
  const s = v === null || v === undefined ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export async function GET(request: Request) {
  const manager = await currentManager();
  if (!manager) return new Response('Not signed in.', { status: 401 });
  if (!manager.canManage) return new Response('L3 owner access required.', { status: 403 });

  const url = new URL(request.url);
  const days = Math.min(Math.max(Number(url.searchParams.get('days') ?? 7), 1), 30);

  const report = await buildL3Report(createAdminClient(), manager, days);

  const lines = [HEADERS.join(',')];
  for (const r of report.rows) {
    lines.push([
      r.date, r.outletName, r.shift, r.stationsComplete, r.stationCount,
      r.percent ?? '', r.band ?? '', r.onTime === null ? '' : r.onTime ? 'yes' : 'no',
      r.l2Complete ? 'yes' : 'no', r.l3Complete ? 'yes' : 'no',
    ].map(csvCell).join(','));
  }

  return new Response(lines.join('\n'), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="l3-report-${report.headline.date || 'export'}.csv"`,
      'Cache-Control': 'no-store',
    },
  });
}
