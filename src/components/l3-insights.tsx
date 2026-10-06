'use client';

import type { L3Insights as Ins } from '@/lib/l3-report';

const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : null);
const RED = 'var(--locked)';
const OK = '#3b82f6';

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="card" style={{ padding: 14, marginBottom: 12, boxShadow: 'none' }}>
      <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>{title}</div>
      {children}
    </div>
  );
}

function Kpi({ label, value, sub, bad }: { label: string; value: string; sub?: string; bad?: boolean }) {
  return (
    <div className="card" style={{ flex: '1 1 140px', padding: '10px 12px', marginBottom: 0, boxShadow: 'none' }}>
      <div className="desc" style={{ marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, color: bad ? RED : undefined }}>{value}</div>
      {sub && <div className="desc" style={{ marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

function Bar({ label, parts, total }: { label: string; parts: { v: number; c: string }[]; total: number }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, fontSize: 12 }}>
      <div style={{ width: 120, flex: 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={label}>{label}</div>
      <div style={{ flex: 1, display: 'flex', height: 14, background: 'rgba(128,128,128,.15)', borderRadius: 4, overflow: 'hidden' }}>
        {parts.map((p, k) => p.v > 0 && <div key={k} style={{ width: `${(p.v / Math.max(total, 1)) * 100}%`, background: p.c }} />)}
      </div>
      <div style={{ width: 70, flex: 'none', textAlign: 'right' }}>{parts.map((p) => p.v).join(' / ')}</div>
    </div>
  );
}

export function L3Insights({ i }: { i: Ins }) {
  const completion = pct(i.stationsComplete, i.stationsExpected);
  const shiftsDone = i.shiftsOnTime + i.shiftsLate;
  const onTime = pct(i.shiftsOnTime, shiftsDone);
  const maxDay = Math.max(1, ...i.daily.map((d) => d.complete + d.missed));
  const maxStation = Math.max(1, ...i.byStation.map((s) => s.complete + s.missed));
  const cor = i.corrective;

  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
        <Kpi label="Station completion" value={completion === null ? '—' : `${completion}%`} sub={`${i.stationsComplete} of ${i.stationsExpected} done`} bad={completion !== null && completion < 80} />
        <Kpi label="Missed stations" value={String(i.stationsMissed)} sub="past deadline, not done" bad={i.stationsMissed > 0} />
        <Kpi label="Done on time" value={onTime === null ? '—' : `${onTime}%`} sub={`${i.shiftsLate} late shift${i.shiftsLate === 1 ? '' : 's'}`} bad={onTime !== null && onTime < 80} />
        <Kpi label="Temperature failures" value={String(i.tempFails)} sub="items outside range" bad={i.tempFails > 0} />
      </div>

      <Card title="Daily: stations done vs missed (red = temperature failures)">
        {i.daily.length === 0 ? <div className="empty">No data in this range.</div> : (
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 130, overflowX: 'auto' }}>
            {i.daily.map((d) => (
              <div key={d.date} style={{ flex: '1 0 28px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', height: '100%' }} title={`${d.date}: ${d.complete} done, ${d.missed} missed, ${d.tempFails} temp failures`}>
                {d.tempFails > 0 && <div style={{ fontSize: 10, color: RED, fontWeight: 700 }}>⚠{d.tempFails}</div>}
                <div style={{ width: '100%', display: 'flex', flexDirection: 'column-reverse', height: `${((d.complete + d.missed) / maxDay) * 100}%`, minHeight: 2 }}>
                  <div style={{ flex: d.complete, background: OK }} />
                  <div style={{ flex: d.missed, background: RED }} />
                </div>
                <div style={{ fontSize: 10, marginTop: 3 }}>{d.date.slice(8)}/{d.date.slice(5, 7)}</div>
              </div>
            ))}
          </div>
        )}
        <div className="desc" style={{ marginTop: 6 }}><span style={{ color: OK }}>■</span> done &nbsp;<span style={{ color: RED }}>■</span> missed</div>
      </Card>

      <Card title="By shift">
        {i.byShift.map((s) => (
          <Bar key={s.label} label={`${s.label} (${s.runs} run${s.runs === 1 ? '' : 's'})`} total={s.complete + s.missed}
            parts={[{ v: s.complete, c: OK }, { v: s.missed, c: RED }]} />
        ))}
        <div className="desc">done / missed stations. Late shifts: {i.byShift.map((s) => `${s.label} ${s.late}`).join(', ') || '—'}</div>
      </Card>

      <Card title="By station: done / missed (⚠ = temperature failures)">
        {i.byStation.map((s) => (
          <div key={s.name} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <div style={{ flex: 1 }}><Bar label={s.name} total={maxStation} parts={[{ v: s.complete, c: OK }, { v: s.missed, c: RED }]} /></div>
            <div style={{ width: 34, fontSize: 12, color: RED, fontWeight: 700 }}>{s.tempFails ? `⚠${s.tempFails}` : ''}</div>
          </div>
        ))}
      </Card>

      <Card title="Products failing most (temperature out of range)">
        {i.topFails.length === 0 ? <div className="empty">No temperature failures in this range.</div> : i.topFails.map((f) => (
          <Bar key={f.prompt + f.station} label={`${f.prompt} · ${f.station}`} total={i.topFails[0].count} parts={[{ v: f.count, c: RED }]} />
        ))}
      </Card>

      <Card title="Corrective actions on failures">
        <div style={{ fontSize: 13 }}>
          {cor.total === 0 ? 'No failures logged.' : <>
            {cor.total} failure{cor.total === 1 ? '' : 's'} · {cor.withComment} with a comment/corrective action ({pct(cor.withComment, cor.total)}%) · {cor.withPhoto} with after-correction photo ({pct(cor.withPhoto, cor.total)}%)
          </>}
        </div>
      </Card>
    </div>
  );
}
