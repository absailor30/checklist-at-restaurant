'use client';

import { fmtDate } from '@/lib/format';

// One row per outlet per day, with Opening and Closing side by side in fixed columns,
// so every day reads the same way. Built for a quick read by the CEO/Owner.

export interface DailyRow {
  date: string; outletId: string; outletName: string; shiftKey?: string; recorded?: boolean;
  stationsComplete: number; stationCount: number; outOfRange: number; missed: number;
  percent: number | null; filledPct?: number | null; onTime: boolean | null;
  l2Complete: boolean; l3Complete: boolean; delayReason?: string | null;
}

const niceDate = (d: string) => fmtDate(d);

const hasProblem = (r: DailyRow) => r.recorded === false || r.outOfRange > 0 || r.missed > 0 || r.onTime === false || (r.filledPct ?? 100) < 100;

function Cell({ r }: { r?: DailyRow }) {
  if (!r) return <span className="desc">—</span>;
  const complete = r.recorded !== false && r.stationCount > 0 && r.stationsComplete === r.stationCount;
  const filled = r.filledPct ?? 0;
  const status = r.recorded === false
    ? <span className="tag locked">Not done</span>
    : complete ? <span className="tag ok">Complete</span>
    : filled > 0 ? <span className="tag warn">Partial · {filled}%</span>
    : <span className="tag locked">Not started</span>;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 3, alignItems: 'flex-start' }}>
      {status}
      {r.recorded !== false && (
        <div className="desc">
          {r.percent !== null ? `Score ${r.percent}%` : 'No score yet'} · {r.stationsComplete}/{r.stationCount} stations
        </div>
      )}
      {r.recorded === false && <div className="desc">No record for this shift</div>}
      {(r.outOfRange > 0 || r.missed > 0 || r.onTime === false) && (
        <div style={{ fontSize: 12, fontWeight: 600 }}>
          {r.outOfRange > 0 && <span style={{ color: 'var(--locked)', marginRight: 8 }}>⚠ {r.outOfRange} temp</span>}
          {r.missed > 0 && r.recorded !== false && <span style={{ color: 'var(--locked)', marginRight: 8 }}>{r.missed} missed</span>}
          {r.onTime === false && <span style={{ color: '#d97706' }}>Late</span>}
        </div>
      )}
      {r.delayReason && <div className="desc">Delay: {r.delayReason.length > 60 ? `${r.delayReason.slice(0, 57)}…` : r.delayReason}</div>}
      {r.recorded !== false && (r.l2Complete || r.l3Complete) && (
        <div className="desc">{r.l2Complete ? 'Ops ✓ ' : ''}{r.l3Complete ? 'CEO ✓' : ''}</div>
      )}
    </div>
  );
}

export function DailyTable({ rows, shifts, onlyIssues }: { rows: DailyRow[]; shifts: { key: string; label: string }[]; onlyIssues: boolean }) {
  const cols = shifts.length ? shifts : [{ key: 'morning', label: 'Opening' }, { key: 'evening', label: 'Closing' }];
  const days = new Map<string, { date: string; outletId: string; outletName: string; cells: Record<string, DailyRow> }>();
  for (const r of rows) {
    const k = `${r.date}|${r.outletId}`;
    const d = days.get(k) ?? { date: r.date, outletId: r.outletId, outletName: r.outletName, cells: {} };
    d.cells[r.shiftKey ?? ''] = r;
    days.set(k, d);
  }
  const list = [...days.values()].filter((d) => !onlyIssues || Object.values(d.cells).some(hasProblem)).slice(0, 120);
  const multiOutlet = new Set(rows.map((r) => r.outletId)).size > 1;

  if (list.length === 0) return <div className="empty" style={{ padding: 16 }}>No days to show in this range.</div>;
  return (
    <div style={{ overflowX: 'auto', marginBottom: 16 }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 360 + cols.length * 190 }}>
        <thead>
          <tr style={{ textAlign: 'left', borderBottom: '2px solid var(--border)' }}>
            <th style={{ padding: '8px', width: 96 }}>Day</th>
            {multiOutlet && <th style={{ padding: '8px', width: 140 }}>Outlet</th>}
            {cols.map((c) => <th key={c.key} style={{ padding: '8px', width: '40%' }}>{c.label}</th>)}
          </tr>
        </thead>
        <tbody>
          {list.map((d) => (
            <tr key={`${d.date}|${d.outletId}`} style={{ borderBottom: '1px solid var(--border)', verticalAlign: 'top' }}>
              <td style={{ padding: '10px 8px', fontWeight: 600, whiteSpace: 'nowrap' }}>{niceDate(d.date)}</td>
              {multiOutlet && <td style={{ padding: '10px 8px' }}>{d.outletName}</td>}
              {cols.map((c) => <td key={c.key} style={{ padding: '10px 8px' }}><Cell r={d.cells[c.key]} /></td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
