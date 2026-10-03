'use client';

import { useState } from 'react';

interface Row {
  date: string; outletName: string; percent: number | null; band: string | null;
}

const BANDS = ['Exceptional', 'Good', 'Acceptable', 'Poor'] as const;

const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const r1 = (n: number) => Math.round(n * 10) / 10;
const shortDate = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;

export function L3Charts({ rows }: { rows: Row[] }) {
  const scored = rows.filter((r) => r.percent !== null) as (Row & { percent: number })[];
  if (scored.length === 0) return null;

  const byDate = new Map<string, number[]>();
  const byOutlet = new Map<string, number[]>();
  const bandCounts = new Map<string, number>(BANDS.map((b) => [b, 0]));
  for (const r of scored) {
    byDate.set(r.date, [...(byDate.get(r.date) ?? []), r.percent]);
    byOutlet.set(r.outletName, [...(byOutlet.get(r.outletName) ?? []), r.percent]);
    if (r.band && bandCounts.has(r.band)) bandCounts.set(r.band, (bandCounts.get(r.band) ?? 0) + 1);
  }
  const trend = [...byDate.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, v]) => ({ date, value: r1(avg(v)) }));
  const outlets = [...byOutlet.entries()].map(([name, v]) => ({ name, value: r1(avg(v)) })).sort((a, b) => b.value - a.value);
  const bands = BANDS.map((b) => ({ name: b, value: bandCounts.get(b) ?? 0 }));

  return (
    <div className="viz-root">
      <TrendChart data={trend} />
      <div className="viz-grid">
        <BarChart title="Average L1 % by outlet" data={outlets} max={100} unit="%" />
        <BarChart title="Shifts by score band" data={bands} unit="" integer />
      </div>
    </div>
  );
}

function TrendChart({ data }: { data: { date: string; value: number }[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 640, H = 220, L = 40, R = 16, T = 16, B = 28;
  const lo = Math.max(0, Math.floor((Math.min(...data.map((d) => d.value)) - 5) / 5) * 5);
  const hi = 100;
  const x = (i: number) => (data.length === 1 ? (L + W - R) / 2 : L + (i * (W - L - R)) / (data.length - 1));
  const y = (v: number) => T + ((hi - v) * (H - T - B)) / (hi - lo);
  const ticks = [lo, Math.round((lo + hi) / 2), hi];
  const path = data.map((d, i) => `${i ? 'L' : 'M'}${x(i)},${y(d.value)}`).join(' ');
  const labelEvery = Math.ceil(data.length / 7);
  const last = data[data.length - 1];

  return (
    <figure className="viz-card" aria-label="Average L1 compliance by day">
      <figcaption className="viz-title">Average L1 compliance by day</figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} className="viz-svg" role="img" onMouseLeave={() => setHover(null)}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={L} x2={W - R} y1={y(t)} y2={y(t)} className="viz-grid-line" />
            <text x={L - 8} y={y(t) + 4} textAnchor="end" className="viz-axis">{t}%</text>
          </g>
        ))}
        <path d={path} fill="none" className="viz-line" />
        {data.map((d, i) => (
          <g key={d.date} onMouseEnter={() => setHover(i)} onTouchStart={() => setHover(i)}>
            <rect x={x(i) - 14} y={T} width={28} height={H - T - B} fill="transparent" />
            {(hover === i || i === data.length - 1) && <circle cx={x(i)} cy={y(d.value)} r={5} className="viz-dot" />}
            {i % labelEvery === 0 && <text x={x(i)} y={H - 8} textAnchor="middle" className="viz-axis">{shortDate(d.date)}</text>}
          </g>
        ))}
        {hover === null && (
          <text x={x(data.length - 1)} y={y(last.value) - 10} textAnchor="end" className="viz-label">{last.value}%</text>
        )}
        {hover !== null && (
          <text x={Math.min(Math.max(x(hover), L + 30), W - R - 30)} y={y(data[hover].value) - 10} textAnchor="middle" className="viz-label">
            {shortDate(data[hover].date)} · {data[hover].value}%
          </text>
        )}
      </svg>
    </figure>
  );
}

function BarChart({ title, data, max, unit, integer }: {
  title: string; data: { name: string; value: number }[]; max?: number; unit: string; integer?: boolean;
}) {
  const top = max ?? Math.max(1, ...data.map((d) => d.value));
  return (
    <figure className="viz-card" aria-label={title}>
      <figcaption className="viz-title">{title}</figcaption>
      <div className="viz-bars">
        {data.map((d) => (
          <div key={d.name} className="viz-bar-row" title={`${d.name}: ${d.value}${unit}`}>
            <span className="viz-bar-name">{d.name}</span>
            <div className="viz-bar-track">
              <div className="viz-bar" style={{ width: `${Math.max(d.value > 0 ? 1 : 0, (d.value / top) * 100)}%` }} />
            </div>
            <span className="viz-bar-value">{integer ? d.value : d.value.toFixed(1)}{unit}</span>
          </div>
        ))}
      </div>
    </figure>
  );
}
