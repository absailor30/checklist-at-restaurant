'use client';

import { useCallback, useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { NotificationBell } from '@/components/notifications';

// The owner's view. Headline numbers first, then per-outlet standing, then the
// things needing a person.
//
// Charts here are single-series magnitude only — a completion percentage per
// outlet and per day. That needs one hue plus the status colours, so there is
// no categorical palette to get wrong for colourblind readers, and every bar
// carries its number as text rather than relying on colour to be read.

interface OutletStat {
  id: string; name: string; expected: number; done: number; locked: number; percent: number;
}
interface TrendPoint { date: string; percent: number; done: number; expected: number }
interface Row {
  id: string; title: string; outlet: string; by: string;
  value: number | null; unit: string | null; min: number | null; max: number | null;
  comment: string | null; at: string;
}
interface LockedRow {
  id: string; title: string; outlet: string;
  state: string; escalationLevel: number; lockedAt: string;
}
interface SectionScore {
  section: string; scored: number; points: number; waived: number;
  percent: number; previous: number | null; change: number | null;
}
interface Scores {
  date: string; previousDate: string | null;
  sections: SectionScore[];
  overall: SectionScore;
}

interface Dashboard {
  org: string; date: string; days: number;
  headline: {
    completionToday: number; doneToday: number; expectedToday: number;
    lockedNow: number; escalated: number; outOfRange: number;
    late: number; waived: number; byManager: number;
  };
  outlets: OutletStat[];
  trend: TrendPoint[];
  scores: Scores;
  scoreTrend: { date: string; percent: number }[];
  outOfRange: Row[];
  waived: Row[];
  byManager: Row[];
  lockedItems: LockedRow[];
}

export default function OwnerPage() {
  const [state, setState] = useState<'loading' | 'out' | 'in' | 'denied'>('loading');
  const [data, setData] = useState<Dashboard | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [days, setDays] = useState(7);
  const supabase = createClient();

  const load = useCallback(async (windowDays: number) => {
    const res = await fetch(`/api/owner/dashboard?days=${windowDays}&t=${Date.now()}`, {
      cache: 'no-store',
    });
    if (res.status === 401) { setState('out'); return; }
    const body = await res.json();
    if (res.status === 403) { setError(body.error); setState('denied'); return; }
    if (!res.ok) { setError(body.error); return; }
    setData(body);
    setState('in');
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) { setState('out'); return; }
      void load(days);
    });
  }, [load, days, supabase]);

  if (state === 'loading') return <div className="spinner" />;

  if (state === 'out') {
    return (
      <div className="shell" style={{ paddingTop: 48 }}>
        <h2>Owner dashboard</h2>
        <p className="lede">Sign in with your manager account to see this.</p>
        <a className="btn btn-primary" href="/manager"
           style={{ display: 'block', textAlign: 'center', textDecoration: 'none' }}>
          Go to sign in
        </a>
      </div>
    );
  }

  if (state === 'denied') {
    return (
      <div className="shell" style={{ paddingTop: 48 }}>
        <h2>Not available to your role</h2>
        <p className="lede">{error}</p>
        <a className="btn btn-ghost" href="/manager"
           style={{ display: 'block', textAlign: 'center', textDecoration: 'none' }}>
          Back to the manager screen
        </a>
      </div>
    );
  }

  if (!data) return <div className="spinner" />;
  const h = data.headline;
  const worstDay = Math.max(...data.trend.map((t) => t.percent), 100);

  return (
    <>
      <div className="topbar">
        <div>
          <h1>{data.org}</h1>
          <div className="sub">Owner view · {data.date}</div>
        </div>
        <div className="bellrow">
          <NotificationBell />
          <a className="btn-ghost" href="/manager"
             style={{ width: 'auto', minHeight: 40, padding: '8px 14px', textDecoration: 'none' }}>
            Manager
          </a>
        </div>
      </div>

      <div className="shell">
        {error && <div className="banner error">{error}</div>}

        {/* Headline numbers. A stat tile beats a chart when there is one value
            to read — no axis to decode, no colour to interpret. */}
        <div className="tiles">
          <Tile label="Done today" value={`${h.completionToday}%`}
                note={`${h.doneToday} of ${h.expectedToday} tasks`}
                tone={h.completionToday >= 90 ? 'ok' : h.completionToday >= 70 ? 'warn' : 'bad'} />
          <Tile label="Locked now" value={String(h.lockedNow)}
                note={h.escalated ? `${h.escalated} escalated` : 'none escalated'}
                tone={h.lockedNow === 0 ? 'ok' : h.escalated ? 'bad' : 'warn'} />
          <Tile label="Out of range" value={String(h.outOfRange)}
                note={`last ${data.days} days`}
                tone={h.outOfRange === 0 ? 'ok' : 'bad'} />
          <Tile label="Waived" value={String(h.waived)}
                note={`${h.byManager} done by managers`}
                tone={h.waived === 0 ? 'ok' : 'warn'} />
        </div>

        {data.scores && (
          <>
            <h2 style={{ marginTop: 28 }}>Compliance score</h2>
            <p className="lede">
              Every check scores 1 or 0. Waived checks are left out rather than
              counted either way. A completed check still scores 0 if the
              reading was out of range or a manager sent it back — done and
              compliant are different questions.
            </p>

            <div className="card">
              <div className="barrow">
                <span className="barlabel" style={{ fontSize: 17 }}>Overall</span>
                <span className="barvalue" style={{ fontSize: 17, fontWeight: 700 }}>
                  {data.scores.overall.percent}%
                  <ChangeTag change={data.scores.overall.change} />
                </span>
              </div>
              <div className="progress">
                <div style={{
                  width: `${data.scores.overall.percent}%`,
                  background: toneColour(data.scores.overall.percent),
                }} />
              </div>
              <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 8 }}>
                {data.scores.overall.points} of {data.scores.overall.scored} checks passed
                {data.scores.overall.waived > 0 && ` · ${data.scores.overall.waived} waived`}
                {data.scores.previousDate && ` · previous inspection ${data.scores.previousDate}`}
              </div>
            </div>

            <div className="card">
              <div className="scoretable">
                <div className="scorehead">
                  <span>Department</span>
                  <span>Last</span>
                  <span>Now</span>
                  <span>Change</span>
                </div>
                {data.scores.sections.map((s) => (
                  <div className="scorerow" key={s.section}>
                    <span>
                      {s.section}
                      <span className="scoremeta">
                        {s.points}/{s.scored}{s.waived ? ` · ${s.waived} waived` : ''}
                      </span>
                    </span>
                    <span className="scorenum">{s.previous === null ? '—' : `${s.previous}%`}</span>
                    <span className="scorenum" style={{ color: toneColour(s.percent), fontWeight: 700 }}>
                      {s.percent}%
                    </span>
                    <span className="scorenum"><ChangeTag change={s.change} /></span>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        <h2 style={{ marginTop: 28 }}>Outlets today</h2>
        <p className="lede">Completion against the tasks due so far.</p>
        {data.outlets.map((o) => (
          <div className="card" key={o.id}>
            <div className="barrow">
              <span className="barlabel">{o.name}</span>
              <span className="barvalue">{o.percent}%</span>
            </div>
            <div className="progress">
              <div style={{
                width: `${o.percent}%`,
                background: o.percent >= 90 ? 'var(--ok)'
                          : o.percent >= 70 ? 'var(--warn)' : 'var(--locked)',
              }} />
            </div>
            <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 8 }}>
              {o.done} of {o.expected} done
              {o.locked > 0 && ` · ${o.locked} locked`}
            </div>
          </div>
        ))}

        <h2 style={{ marginTop: 28 }}>Last {data.days} days</h2>
        <p className="lede">Completion per day across all outlets.</p>
        <div className="card">
          <div className="trend">
            {data.trend.map((t) => (
              <div className="trendcol" key={t.date} title={`${t.date}: ${t.percent}%`}>
                <div className="trendbar-wrap">
                  <div className="trendbar" style={{
                    height: `${Math.max((t.percent / worstDay) * 100, 2)}%`,
                    background: t.percent >= 90 ? 'var(--ok)'
                              : t.percent >= 70 ? 'var(--warn)' : 'var(--locked)',
                  }} />
                </div>
                <div className="trendpct">{t.percent}</div>
                <div className="trendday">
                  {new Date(`${t.date}T00:00:00Z`).toLocaleDateString('en-GB', {
                    weekday: 'short', timeZone: 'UTC',
                  })}
                </div>
              </div>
            ))}
          </div>
          <p className="lede" style={{ fontSize: 12, margin: '12px 0 0' }}>
            Percentage of due tasks completed each day.
          </p>
        </div>

        <Section title="Out of range readings"
                 lede="Temperatures and measurements outside their expected band."
                 rows={data.outOfRange}
                 empty="No out-of-range readings in this period." />

        <Section title="Waived tasks"
                 lede="Marked not applicable by a manager. Never counted as completed."
                 rows={data.waived}
                 empty="Nothing waived in this period." />

        <Section title="Completed by managers"
                 lede="Tasks a manager did themselves rather than staff."
                 rows={data.byManager}
                 empty="No manager completions in this period." />

        {data.lockedItems.length > 0 && (
          <>
            <h2 style={{ marginTop: 28 }}>Locked right now</h2>
            <p className="lede">Missed tasks waiting on a manager.</p>
            {data.lockedItems.map((l) => (
              <div className={`item ${l.state === 'unlocked' ? 'unlocked' : 'locked'}`} key={l.id}>
                <div className="head">
                  <div className="title">
                    {l.title}
                    <div className="desc">{l.outlet}</div>
                  </div>
                  <span className={`tag ${l.escalationLevel > 0 ? 'locked' : 'warn'}`}>
                    {l.escalationLevel > 0 ? `Escalated ×${l.escalationLevel}` : 'Locked'}
                  </span>
                </div>
              </div>
            ))}
          </>
        )}

        <h2 style={{ marginTop: 28 }}>Reports</h2>
        <p className="lede">
          Download the full record for an inspection, or print this page as a summary.
        </p>
        <div className="card">
          <label>Period</label>
          <select value={days} onChange={(e) => { setDays(Number(e.target.value)); }}>
            <option value={7}>Last 7 days</option>
            <option value={14}>Last 14 days</option>
            <option value={30}>Last 30 days</option>
          </select>
          <div className="btn-row" style={{ marginTop: 16 }}>
            <button className="btn-ghost" onClick={() => window.print()}>Print summary</button>
            <a className="btn btn-primary"
               style={{ textAlign: 'center', textDecoration: 'none', lineHeight: '24px' }}
               href={`/api/owner/export?from=${rangeStart(data.date, days)}&to=${data.date}`}>
              Download CSV
            </a>
          </div>
          <p className="lede" style={{ fontSize: 12, margin: '12px 0 0' }}>
            The CSV carries every submission with its reading, who did it, when,
            whether it was late or out of range, and any manager notes.
          </p>
        </div>
      </div>
    </>
  );
}

// Change is shown with its sign and an arrow, never colour alone.
function ChangeTag({ change }: { change: number | null }) {
  if (change === null) return <span style={{ color: 'var(--muted)' }}> —</span>;
  if (change === 0) return <span style={{ color: 'var(--muted)' }}> no change</span>;
  const up = change > 0;
  return (
    <span style={{ color: up ? 'var(--ok)' : 'var(--locked)', fontWeight: 700 }}>
      {' '}{up ? '▲' : '▼'} {up ? '+' : ''}{change}%
    </span>
  );
}

function toneColour(percent: number): string {
  if (percent >= 95) return 'var(--ok)';
  if (percent >= 85) return 'var(--warn)';
  return 'var(--locked)';
}

function Tile({ label, value, note, tone }: {
  label: string; value: string; note: string; tone: 'ok' | 'warn' | 'bad';
}) {
  return (
    <div className="tile">
      <div className="tilelabel">{label}</div>
      <div className={`tilevalue ${tone}`}>{value}</div>
      <div className="tilenote">{note}</div>
    </div>
  );
}

function Section({ title, lede, rows, empty }: {
  title: string; lede: string; rows: Row[]; empty: string;
}) {
  return (
    <>
      <h2 style={{ marginTop: 28 }}>{title}</h2>
      <p className="lede">{lede}</p>
      {rows.length === 0 && <p className="empty" style={{ padding: '24px 0' }}>{empty}</p>}
      {rows.map((r) => (
        <div className="item" key={r.id}>
          <div className="head">
            <div className="title">
              {r.title}
              <div className="desc">{r.outlet} · {r.by} · {when(r.at)}</div>
              {r.value !== null && (
                <div className="due" style={{ color: 'var(--locked)', fontWeight: 700 }}>
                  {r.value}{r.unit ?? ''} (expected {r.min} to {r.max}{r.unit ?? ''})
                </div>
              )}
              {r.comment && <div className="due">“{r.comment}”</div>}
            </div>
          </div>
        </div>
      ))}
    </>
  );
}

function when(iso: string): string {
  return new Date(iso).toLocaleString('en-GB', {
    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
  });
}

function rangeStart(today: string, days: number): string {
  const d = new Date(`${today}T00:00:00Z`);
  d.setDate(d.getDate() - (days - 1));
  return d.toISOString().slice(0, 10);
}
