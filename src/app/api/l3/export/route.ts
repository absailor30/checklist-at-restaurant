import { createAdminClient } from '@/lib/supabase/admin';
import { currentManager } from '@/lib/supabase/server';
import { buildL3Report, parseRange } from '@/lib/l3-report';
import { fmtDate } from '@/lib/format';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const HEADERS = [
  'Date', 'Outlet', 'Shift', 'Stations complete', 'Stations total', 'Filled percent',
  'Line check percent', 'Band', 'Temperature alerts', 'Missed stations', 'On time', 'Delay reason', 'Operations Manager reviewed', 'CEO/Owner reviewed',
];

function csvCell(v: unknown): string {
  const s = v === null || v === undefined ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export async function GET(request: Request) {
  const manager = await currentManager();
  if (!manager) return new Response('Not signed in.', { status: 401 });
  if (!(manager.canManage || manager.canReview)) return new Response('Operations Manager or CEO/Owner access required.', { status: 403 });

  const url = new URL(request.url);
  const range = parseRange(url);

  const report = await buildL3Report(createAdminClient(), manager, range);

  const lines = [HEADERS.join(',')];
  for (const r of report.rows) {
    lines.push([
      fmtDate(r.date), r.outletName, r.shift, r.stationsComplete, r.stationCount, r.filledPct ?? '',
      r.percent ?? '', r.band ?? '', r.outOfRange, r.missed, r.onTime === null ? '' : r.onTime ? 'yes' : 'no', r.delayReason ?? '',
      r.l2Complete ? 'yes' : 'no', r.l3Complete ? 'yes' : 'no',
    ].map(csvCell).join(','));
  }

  return new Response(lines.join('\n'), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="report-${report.headline.date || 'export'}.csv"`,
      'Cache-Control': 'no-store',
    },
  });
}
