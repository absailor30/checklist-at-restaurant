'use client';

import type { L3Insights as Ins, Kpis, HeatCell, L3ChecklistSummary } from '@/lib/l3-report';

const GOOD = '#22c55e', WARN = '#f59e0b', BAD = 'var(--locked)', BLUE = '#3b82f6', GREY = 'rgba(128,128,128,.22)';
const dm = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;
const pctText = (n: number | null) => (n === null ? '—' : `${n}%`);

function Card({ title, sub, children }: { title: string; sub?: string; children: React.ReactNode }) {
  return (
    <div className="card" style={{ padding: 14, marginBottom: 12, boxShadow: 'none' }}>
      <div style={{ fontSize: 14, fontWeight: 700 }}>{title}</div>
      {sub && <div className="desc" style={{ marginBottom: 8 }}>{sub}</div>}
      <div style={{ marginTop: sub ? 0 : 8 }}>{children}</div>
    </div>
  );
}

// A tile with the number, and how it moved against the same-length period just before.
function Kpi({ label, value, cur, prev, goodWhenUp, sub }: { label: string; value: string; cur: number | null; prev: number | null; goodWhenUp: boolean; sub?: string }) {
  let delta: React.ReactNode = <span className="desc">no earlier data</span>;
  if (cur !== null && prev !== null) {
    const d = Math.round((cur - prev) * 10) / 10;
    const good = d === 0 ? null : (d > 0) === goodWhenUp;
    delta = (
      <span style={{ fontSize: 12, fontWeight: 600, color: good === null ? undefined : good ? GOOD : BAD }}>
        {d === 0 ? '■ same as before' : `${d > 0 ? '▲' : '▼'} ${Math.abs(d)} vs before`}
      </span>
    );
  }
  return (
    <div className="card" style={{ flex: '1 1 150px', padding: '12px 14px', marginBottom: 0, boxShadow: 'none' }}>
      <div className="desc">{label}</div>
      <div style={{ fontSize: 26, fontWeight: 800, lineHeight: 1.2 }}>{value}</div>
      {sub && <div className="desc">{sub}</div>}
      <div style={{ marginTop: 2 }}>{delta}</div>
    </div>
  );
}

// Line (or column) chart over days, with grid lines and a label on each axis.
function TrendChart({ points, max, unit, color, kind }: { points: { date: string; v: number | null }[]; max: number; unit: string; color: string; kind: 'line' | 'bars' }) {
  if (points.length === 0) return <div className="empty">No data in this range.</div>;
  const W = 600, H = 180, L = 34, R = 8, T = 10, B = 24;
  const iw = W - L - R, ih = H - T - B;
  const x = (i: number) => L + (points.length === 1 ? iw / 2 : (i / (points.length - 1)) * iw);
  const y = (v: number) => T + ih - (v / max) * ih;
  const step = Math.max(1, Math.ceil(points.length / 8));
  const defined = points.map((p, i) => (p.v === null ? null : { i, v: p.v })).filter(Boolean) as { i: number; v: number }[];
  const line = defined.map((d, k) => `${k ? 'L' : 'M'}${x(d.i).toFixed(1)},${y(d.v).toFixed(1)}`).join(' ');
  const bw = Math.min(28, (iw / points.length) * 0.7);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto' }} role="img">
      {[0, 0.5, 1].map((f) => (
        <g key={f}>
          <line x1={L} x2={W - R} y1={y(max * f)} y2={y(max * f)} stroke="currentColor" opacity="0.15" />
          <text x={L - 4} y={y(max * f) + 3} textAnchor="end" fontSize="9" fill="currentColor" opacity="0.7">{Math.round(max * f)}{unit}</text>
        </g>
      ))}
      {kind === 'line' && defined.length > 1 && <path d={`${line} L${x(defined[defined.length - 1].i)},${y(0)} L${x(defined[0].i)},${y(0)} Z`} fill={color} opacity="0.12" />}
      {kind === 'line' && <path d={line} fill="none" stroke={color} strokeWidth="2.5" strokeLinejoin="round" />}
      {points.map((p, i) => p.v === null ? null : kind === 'line'
        ? <circle key={i} cx={x(i)} cy={y(p.v)} r="3.5" fill={color}><title>{`${dm(p.date)}: ${p.v}${unit}`}</title></circle>
        : <rect key={i} x={x(i) - bw / 2} y={y(p.v)} width={bw} height={Math.max(0, y(0) - y(p.v))} rx="3" fill={p.v > 0 ? color : GREY}><title>{`${dm(p.date)}: ${p.v}${unit}`}</title></rect>)}
      {points.map((p, i) => i % step === 0 && <text key={p.date} x={x(i)} y={H - 6} textAnchor="middle" fontSize="9" fill="currentColor" opacity="0.7">{dm(p.date)}</text>)}
    </svg>
  );
}

function Donut({ parts, centre, label }: { parts: { v: number; c: string; name: string }[]; centre: string; label: string }) {
  const total = parts.reduce((a, p) => a + p.v, 0);
  const r = 42, C = 2 * Math.PI * r;
  let off = 0;
  return (
    <div style={{ flex: '1 1 160px', textAlign: 'center' }}>
      <svg viewBox="0 0 120 120" style={{ width: 130, height: 130 }}>
        <circle cx="60" cy="60" r={r} fill="none" stroke={GREY} strokeWidth="16" />
        {total > 0 && parts.map((p) => {
          const len = (p.v / total) * C;
          const el = <circle key={p.name} cx="60" cy="60" r={r} fill="none" stroke={p.c} strokeWidth="16" strokeDasharray={`${len} ${C - len}`} strokeDashoffset={-off} transform="rotate(-90 60 60)"><title>{`${p.name}: ${p.v}`}</title></circle>;
          off += len; return el;
        })}
        <text x="60" y="66" textAnchor="middle" fontSize="20" fontWeight="700" fill="currentColor">{centre}</text>
      </svg>
      <div style={{ fontSize: 13, fontWeight: 600 }}>{label}</div>
      <div className="desc">{parts.map((p) => <span key={p.name} style={{ marginRight: 8 }}><span style={{ color: p.c }}>■</span> {p.name} {p.v}</span>)}</div>
    </div>
  );
}

const cellColor = (c?: HeatCell) => !c ? 'transparent' : c.s === 'done' ? GOOD : c.s === 'partial' ? WARN : c.s === 'missed' ? 'var(--locked)' : GREY;

function Heatmap({ h }: { h: Ins['heat'] }) {
  if (!h.dates.length) return <div className="empty">No data in this range.</div>;
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ borderCollapse: 'separate', borderSpacing: 2, fontSize: 11 }}>
        <thead>
          <tr><th />{h.dates.map((d, i) => <th key={d} style={{ fontWeight: 400, opacity: 0.7, minWidth: 18 }}>{i % 2 === 0 ? dm(d).slice(0, 2) : ''}</th>)}</tr>
        </thead>
        <tbody>
          {h.stations.map((st) => (
            <tr key={st}>
              <td style={{ paddingRight: 8, whiteSpace: 'nowrap' }}>{st}</td>
              {h.dates.map((d) => {
                const c = h.cells[st]?.[d];
                return (
                  <td key={d} title={`${st} · ${dm(d)}: ${c ? c.s : 'no run'}${c?.f ? ` · ${c.f} temp failure${c.f === 1 ? '' : 's'}` : ''}`}
                    style={{ width: 18, height: 18, background: cellColor(c), borderRadius: 3, textAlign: 'center', color: '#fff', fontSize: 10, fontWeight: 700 }}>
                    {c?.f ? '!' : ''}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="desc" style={{ marginTop: 6 }}>
        <span style={{ color: GOOD }}>■</span> done &nbsp;<span style={{ color: WARN }}>■</span> partly done &nbsp;<span style={{ color: 'var(--locked)' }}>■</span> missed &nbsp;<span style={{ opacity: 0.5 }}>■</span> not started · ! = temperature failure. Day numbers shown (latest 31 days).
      </div>
    </div>
  );
}

function HBar({ label, value, max, color, right }: { label: string; value: number; max: number; color: string; right: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, fontSize: 12 }}>
      <div style={{ width: 130, flex: 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={label}>{label}</div>
      <div style={{ flex: 1, height: 14, background: GREY, borderRadius: 4, overflow: 'hidden' }}>
        <div style={{ width: `${max ? Math.min(100, (value / max) * 100) : 0}%`, height: '100%', background: color }} />
      </div>
      <div style={{ width: 64, flex: 'none', textAlign: 'right' }}>{right}</div>
    </div>
  );
}

export function L3Insights({ i, onPickOutlet }: { i: Ins; onPickOutlet?: (id: string) => void }) {
  const k: Kpis = i.kpis, p: Kpis = i.previous;
  const multiOutlet = i.byOutlet.length > 1;
  const worstStations = [...i.byStation].sort((a, b) => (b.missed + b.tempFails) - (a.missed + a.tempFails));
  const maxIssue = Math.max(1, ...worstStations.map((s) => s.missed + s.tempFails));
  const cor = i.corrective;

  return (
    <div style={{ marginBottom: 8 }}>
      <div className="desc" style={{ marginBottom: 8 }}>
        {i.range.from === i.range.to ? i.range.from : `${i.range.from} to ${i.range.to}`} ({i.range.days} day{i.range.days === 1 ? '' : 's'}), compared with {i.range.previousFrom === i.range.previousTo ? i.range.previousFrom : `${i.range.previousFrom} to ${i.range.previousTo}`}.
        {i.range.capped && ' Shown: the latest 12 months.'}
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
        <Kpi label="Station completion" value={pctText(k.completionPct)} cur={k.completionPct} prev={p.completionPct} goodWhenUp sub={`${k.stationsDone} of ${k.stationsExpected} stations done`} />
        <Kpi label="Finished on time" value={pctText(k.onTimePct)} cur={k.onTimePct} prev={p.onTimePct} goodWhenUp sub={`${k.shiftsLate} late shift${k.shiftsLate === 1 ? '' : 's'}`} />
        <Kpi label="Temperature failures" value={String(k.tempFails)} cur={k.tempFails} prev={p.tempFails} goodWhenUp={false} sub="readings outside range" />
        <Kpi label="Missed stations" value={String(k.missed)} cur={k.missed} prev={p.missed} goodWhenUp={false} sub="not done by the deadline" />
      </div>

      {multiOutlet && (
        <Card title="Outlet comparison" sub="Tap an outlet to see only that one.">
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead><tr style={{ textAlign: 'left', borderBottom: '1px solid var(--border)' }}>
                {['Outlet', 'Completion', 'On time', 'Temp fails', 'Missed', 'Avg score'].map((h) => <th key={h} style={{ padding: '6px 8px' }}>{h}</th>)}
              </tr></thead>
              <tbody>
                {i.byOutlet.map((o) => (
                  <tr key={o.id} style={{ borderBottom: '1px solid var(--border)', cursor: onPickOutlet ? 'pointer' : undefined }} onClick={() => onPickOutlet?.(o.id)}>
                    <td style={{ padding: '6px 8px', fontWeight: 600 }}>{o.name}</td>
                    <td style={{ padding: '6px 8px', minWidth: 120 }}><HBar label="" value={o.completionPct ?? 0} max={100} color={(o.completionPct ?? 0) >= 90 ? GOOD : (o.completionPct ?? 0) >= 70 ? WARN : (BAD as string)} right={pctText(o.completionPct)} /></td>
                    <td style={{ padding: '6px 8px' }}>{pctText(o.onTimePct)}</td>
                    <td style={{ padding: '6px 8px', color: o.tempFails ? (BAD as string) : undefined, fontWeight: o.tempFails ? 700 : undefined }}>{o.tempFails}</td>
                    <td style={{ padding: '6px 8px', color: o.missed ? (BAD as string) : undefined, fontWeight: o.missed ? 700 : undefined }}>{o.missed}</td>
                    <td style={{ padding: '6px 8px' }}>{pctText(o.avgScore)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <Card title="Completion over time" sub="Share of stations finished each day">
        <TrendChart kind="line" color={BLUE} unit="%" max={100} points={i.daily.map((d) => ({ date: d.date, v: d.completionPct }))} />
      </Card>
      <Card title="Temperature failures per day">
        <TrendChart kind="bars" color={WARN} unit="" max={Math.max(3, ...i.daily.map((d) => d.tempFails))} points={i.daily.map((d) => ({ date: d.date, v: d.tempFails }))} />
      </Card>

      <Card title="Where the time goes">
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, justifyContent: 'space-around' }}>
          <Donut label="Stations" centre={pctText(k.completionPct)} parts={[{ v: k.stationsDone, c: GOOD, name: 'done' }, { v: k.missed, c: 'var(--locked)', name: 'missed' }]} />
          <Donut label="Shifts" centre={pctText(k.onTimePct)} parts={[{ v: k.shiftsOnTime, c: GOOD, name: 'on time' }, { v: k.shiftsLate, c: WARN, name: 'late' }]} />
          <Donut label="Failure follow-up" centre={cor.total ? `${Math.round((cor.withComment / cor.total) * 100)}%` : '—'} parts={[{ v: cor.withComment, c: GOOD, name: 'commented' }, { v: Math.max(0, cor.total - cor.withComment), c: 'var(--locked)', name: 'no comment' }]} />
        </div>
        {cor.total > 0 && <div className="desc" style={{ marginTop: 8, textAlign: 'center' }}>{cor.total} temperature failure{cor.total === 1 ? '' : 's'}; {cor.withPhoto} with an after-correction photo.</div>}
      </Card>

      <Card title="Station heatmap" sub="Every station, every day: where checks go wrong">
        <Heatmap h={i.heat} />
      </Card>

      <Card title="Opening vs Closing">
        {i.byShift.length === 0 ? <div className="empty">No data in this range.</div> : i.byShift.map((s) => (
          <HBar key={s.label} label={`${s.label} (${s.runs})`} value={s.complete} max={s.complete + s.missed} color={GOOD} right={pctText(s.complete + s.missed ? Math.round((s.complete / (s.complete + s.missed)) * 1000) / 10 : null)} />
        ))}
        <div className="desc">Share of stations done. Late shifts: {i.byShift.map((s) => `${s.label} ${s.late}`).join(', ') || '—'}.</div>
      </Card>

      <Card title="Stations needing attention" sub="Missed stations plus temperature failures">
        {worstStations.filter((s) => s.missed + s.tempFails > 0).length === 0
          ? <div className="empty">Nothing to flag in this range.</div>
          : worstStations.filter((s) => s.missed + s.tempFails > 0).map((s) => (
              <HBar key={s.name} label={s.name} value={s.missed + s.tempFails} max={maxIssue} color={s.tempFails ? WARN : (BAD as string)} right={`${s.missed} missed${s.tempFails ? ` · ${s.tempFails}⚠` : ''}`} />
            ))}
      </Card>

      <Card title="Products failing most" sub="Temperature out of range">
        {i.topFails.length === 0 ? <div className="empty">No temperature failures in this range.</div> : i.topFails.map((f) => (
          <HBar key={f.prompt + f.station} label={`${f.prompt} · ${f.station}`} value={f.count} max={i.topFails[0].count} color={BAD as string} right={String(f.count)} />
        ))}
      </Card>
    </div>
  );
}

// How L3's quick checklist (the Audit) has gone over the chosen range.
export function L3ChecklistCard({ c }: { c: L3ChecklistSummary }) {
  return (
    <Card title="L3 audit checklist" sub={`${c.entries} of ${c.expected} daily entr${c.expected === 1 ? 'y' : 'ies'} filled in`}>
      {c.entries === 0 ? <div className="empty">No entries in this range.</div> : c.items.map((it) => (
        <HBar key={it.key} label={it.prompt} value={it.yes} max={Math.max(1, it.yes + it.no)} color={it.no ? WARN : GOOD} right={`${it.yes} yes · ${it.no} no`} />
      ))}
      {c.recentNos.length > 0 && (
        <div style={{ marginTop: 10 }}>
          <div style={{ fontWeight: 600, fontSize: 13 }}>Recent "No" answers</div>
          {c.recentNos.map((n, i) => (
            <div key={i} style={{ marginTop: 6, fontSize: 13 }}>
              <span style={{ color: BAD as string, fontWeight: 700 }}>No</span> · {n.prompt} <span className="desc">({n.date}{n.outlet ? ` · ${n.outlet}` : ''})</span>
              {n.comment && <div className="desc">{n.comment}</div>}
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
