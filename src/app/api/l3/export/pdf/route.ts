import { createAdminClient } from '@/lib/supabase/admin';
import { currentManager } from '@/lib/supabase/server';
import { buildL3Report } from '@/lib/l3-report';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

// PDF alongside the existing CSV export — a printable/emailable summary
// for a client who wants a document rather than a spreadsheet.
export async function GET(request: Request) {
  const manager = await currentManager();
  if (!manager) return new Response('Not signed in.', { status: 401 });
  if (!manager.canManage) return new Response('L3 owner access required.', { status: 403 });

  const url = new URL(request.url);
  const days = Math.min(Math.max(Number(url.searchParams.get('days') ?? 7), 1), 30);

  const report = await buildL3Report(createAdminClient(), manager, days);

  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  const pageWidth = 595, pageHeight = 842, margin = 40;
  const cols = [70, 140, 65, 60, 45, 60, 55, 40, 40]; // date, outlet, shift, stations, %, band, ontime, l2, l3
  const headers = ['Date', 'Outlet', 'Shift', 'Stations', '%', 'Band', 'On time', 'L2', 'L3'];
  const rowHeight = 16;

  let page = pdf.addPage([pageWidth, pageHeight]);
  let y = pageHeight - margin;

  const drawHeader = () => {
    page.drawText(`L3 Report — ${report.orgName}`, { x: margin, y, size: 14, font: bold });
    y -= 20;
    page.drawText(
      `Today (${report.headline.date}): ${report.headline.shiftsL1Complete}/${report.headline.shiftsExpected} L1 shifts complete · ` +
      `${report.headline.pendingL2} pending L2 · ${report.headline.pendingL3} pending L3 · ${report.headline.late} late`,
      { x: margin, y, size: 9, font }
    );
    y -= 24;
    let x = margin;
    headers.forEach((h, i) => {
      page.drawText(h, { x, y, size: 8, font: bold });
      x += cols[i];
    });
    y -= 6;
    page.drawLine({ start: { x: margin, y }, end: { x: pageWidth - margin, y }, thickness: 0.5, color: rgb(0.6, 0.6, 0.6) });
    y -= 12;
  };

  drawHeader();

  for (const r of report.rows) {
    if (y < margin + rowHeight) {
      page = pdf.addPage([pageWidth, pageHeight]);
      y = pageHeight - margin;
      drawHeader();
    }
    const cells = [
      r.date, r.outletName.slice(0, 22), r.shift, `${r.stationsComplete}/${r.stationCount}`,
      r.percent?.toString() ?? '—', r.band ?? '—',
      r.onTime === null ? '—' : r.onTime ? 'Yes' : 'Late',
      r.l2Complete ? 'Done' : '—', r.l3Complete ? 'Done' : '—',
    ];
    let x = margin;
    cells.forEach((c, i) => {
      page.drawText(String(c), { x, y, size: 8, font });
      x += cols[i];
    });
    y -= rowHeight;
  }

  if (report.rows.length === 0) {
    page.drawText('No line checks in this range.', { x: margin, y, size: 9, font });
  }

  const bytes = await pdf.save();
  return new Response(Buffer.from(bytes), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="l3-report-${report.headline.date || 'export'}.pdf"`,
      'Cache-Control': 'no-store',
    },
  });
}
