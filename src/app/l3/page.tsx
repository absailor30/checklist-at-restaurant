'use client';

import { useCallback, useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { L3Charts } from '@/components/l3-charts';
import { L3Insights } from '@/components/l3-insights';
import { DailyTable } from '@/components/l3-daily';
import { loginEmail } from '@/lib/login-id';

interface Row {
  date: string; outletId: string; outletName: string; shift: string; checkTime: string | null;
  stationsComplete: number; stationCount: number; l1Complete: boolean; outOfRange: number; missed: number;
  percent: number | null; filledPct?: number | null; band: string | null; onTime: boolean | null;
  l2Complete: boolean; l3Complete: boolean; delayReason?: string | null; shiftKey?: string; recorded?: boolean;
}
interface Report {
  insights?: import('@/lib/l3-report').L3Insights;
  selectedOutletId?: string | null;
  viewerRole?: string;
  orgName: string;
  outlets: { id: string; name: string; location?: string | null }[];
  locations?: string[];
  filterOptions?: { shifts: { key: string; label: string }[]; stations: { no: number; name: string }[] };
  rows: Row[];
  headline: {
    date: string; shiftsExpected: number; shiftsL1Complete: number;
    pendingL2: number; pendingL3: number; late: number;
  };
}

type Range = { kind: 'days' | 'yesterday' | 'all' | 'custom' | 'month'; days?: number; from?: string; to?: string; month?: string; offset?: number };
interface Filters { outletId: string; location: string; shift: string; station: string }
const NO_FILTERS: Filters = { outletId: '', location: '', shift: '', station: '' };

const PRESETS: { label: string; r: Range }[] = [
  { label: 'Today', r: { kind: 'days', days: 1 } },
  { label: 'Yesterday', r: { kind: 'yesterday' } },
  { label: '7 days', r: { kind: 'days', days: 7 } },
  { label: '14 days', r: { kind: 'days', days: 14 } },
  { label: '30 days', r: { kind: 'days', days: 30 } },
  { label: 'This month', r: { kind: 'month', offset: 0 } },
  { label: 'Last month', r: { kind: 'month', offset: -1 } },
  { label: '60 days', r: { kind: 'days', days: 60 } },
  { label: '90 days', r: { kind: 'days', days: 90 } },
  { label: 'All time', r: { kind: 'all' } },
];
const sameRange = (a: Range, b: Range) => a.kind === b.kind && a.days === b.days && a.offset === b.offset && !a.month && !b.month;

function queryOf(r: Range, f: Filters) {
  const q = new URLSearchParams();
  if (r.kind === 'days') q.set('days', String(r.days ?? 7));
  if (r.kind === 'yesterday') q.set('yesterday', '1');
  if (r.kind === 'all') q.set('all', '1');
  if (r.kind === 'month') { if (r.month) q.set('month', r.month); else q.set('monthOffset', String(r.offset ?? 0)); }
  if (r.kind === 'custom' && r.from && r.to) { q.set('from', r.from); q.set('to', r.to); }
  if (f.outletId) q.set('outletId', f.outletId);
  if (f.location) q.set('location', f.location);
  if (f.shift) q.set('shift', f.shift);
  if (f.station) q.set('station', f.station);
  return q.toString();
}

export default function L3ReportPage() {
  const supabase = createClient();
  const [sessionState, setSessionState] = useState<'checking' | 'in' | 'out'>('checking');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loginBusy, setLoginBusy] = useState(false);
  const [loginError, setLoginError] = useState('');

  const [range, setRange] = useState<Range>({ kind: 'days', days: 7 });
  const [filters, setFilters] = useState<Filters>(NO_FILTERS);
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [onlyIssues, setOnlyIssues] = useState(false);
  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchReport = useCallback(async (r: Range, f: Filters) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/l3/report?${queryOf(r, f)}`);
      const data = await res.json();
      if (!res.ok) { setError(data.error); return; }
      setError(''); setReport(data);
    } catch {
      setError('Could not load the report.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSessionState(session ? 'in' : 'out');
      if (session) void fetchReport(range, filters);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => {
      setSessionState(session ? 'in' : 'out');
      if (session) void fetchReport(range, filters);
    });
    return () => subscription.unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase]);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoginBusy(true); setLoginError('');
    const { error } = await supabase.auth.signInWithPassword({ email: loginEmail(email), password });
    setLoginBusy(false);
    if (error) setLoginError(error.message);
  }

  async function handleLogout() { await supabase.auth.signOut(); }

  function pick(r: Range) { setRange(r); void fetchReport(r, filters); }
  function setFilter(patch: Partial<Filters>) {
    const next = { ...filters, ...patch };
    setFilters(next);
    void fetchReport(range, next);
  }
  function pickOutlet(id: string) { setFilter({ outletId: id }); }
  const exportQuery = queryOf(range, filters);
  const activeFilterCount = Object.values(filters).filter(Boolean).length;

  if (sessionState === 'checking') return <div className="shell" style={{ paddingTop: 32 }}><div className="spinner" /></div>;

  if (sessionState === 'out') {
    return (
      <div className="shell" style={{ paddingTop: 32 }}>
        <h2>Report sign in</h2>
        <p className="lede">Same account as the manager dashboard.</p>
        {loginError && <div className="banner error">{loginError}</div>}
        <form className="card" onSubmit={handleLogin}>
          <label htmlFor="email" style={{ marginTop: 0 }}>Email or username</label>
          <input id="email" type="text" autoCapitalize="none" autoCorrect="off" value={email} autoComplete="username"
            onChange={(e) => setEmail(e.target.value)} required />
          <label htmlFor="password">Password</label>
          <input id="password" type="password" value={password} autoComplete="current-password"
            onChange={(e) => setPassword(e.target.value)} required />
          <button type="submit" disabled={loginBusy} className="btn-primary" style={{ marginTop: 16 }}>
            {loginBusy ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
        <a className="btn btn-ghost" href="/manager" style={{ display: 'block', textAlign: 'center', textDecoration: 'none', marginTop: 16, lineHeight: '22px' }}>
          Go to manager reviews
        </a>
      </div>
    );
  }

  return (
    <>
      <div className="topbar">
        <div>
          <h1>Report</h1>
          <div className="sub">{report?.orgName}</div>
        </div>
        <button className="btn-ghost" style={{ width: 'auto', minHeight: 40, padding: '8px 14px' }} onClick={handleLogout}>
          Sign out
        </button>
      </div>

      <div className="shell">
        {error && <div className="banner error">{error}</div>}

        {/* Filters */}
        <div className="card" style={{ boxShadow: 'none', marginBottom: 12 }}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            {report && (report.locations?.length ?? 0) > 1 && (
              <div style={{ flex: '1 1 150px' }}>
                <label style={{ marginTop: 0 }}>Location</label>
                <select value={filters.location} onChange={(e) => setFilter({ location: e.target.value, outletId: '' })}>
                  <option value="">All locations</option>
                  {(report.locations ?? []).map((l) => <option key={l} value={l}>{l}</option>)}
                </select>
              </div>
            )}
            {report && report.outlets.length > 1 && (
              <div style={{ flex: '1 1 150px' }}>
                <label style={{ marginTop: 0 }}>Outlet</label>
                <select value={filters.outletId} onChange={(e) => setFilter({ outletId: e.target.value })}>
                  <option value="">All outlets</option>
                  {report.outlets.filter((o) => !filters.location || o.location === filters.location).map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
                </select>
              </div>
            )}
            {report?.filterOptions && report.filterOptions.shifts.length > 1 && (
              <div style={{ flex: '1 1 130px' }}>
                <label style={{ marginTop: 0 }}>Shift</label>
                <select value={filters.shift} onChange={(e) => setFilter({ shift: e.target.value })}>
                  <option value="">All shifts</option>
                  {report.filterOptions.shifts.map((x) => <option key={x.key} value={x.key}>{x.label}</option>)}
                </select>
              </div>
            )}
            {report?.filterOptions && report.filterOptions.stations.length > 1 && (
              <div style={{ flex: '1 1 150px' }}>
                <label style={{ marginTop: 0 }}>Station</label>
                <select value={filters.station} onChange={(e) => setFilter({ station: e.target.value })}>
                  <option value="">All stations</option>
                  {report.filterOptions.stations.map((x) => <option key={x.no} value={String(x.no)}>{x.name}</option>)}
                </select>
              </div>
            )}
            <div style={{ flex: '1 1 150px' }}>
              <label style={{ marginTop: 0 }}>Month</label>
              <input type="month" value={range.kind === 'month' && range.month ? range.month : ''}
                onChange={(e) => { if (e.target.value) pick({ kind: 'month', month: e.target.value }); }} />
            </div>
            {activeFilterCount > 0 && (
              <button className="btn-ghost" style={{ width: 'auto', minHeight: 40, padding: '8px 14px' }}
                onClick={() => { setFilters(NO_FILTERS); void fetchReport(range, NO_FILTERS); }}>Clear filters</button>
            )}
          </div>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
            {PRESETS.map((p) => (
              <button key={p.label} className={sameRange(range, p.r) ? 'btn-primary' : 'btn-ghost'}
                style={{ width: 'auto', minHeight: 36, padding: '6px 12px' }} onClick={() => pick(p.r)}>{p.label}</button>
            ))}
            <button className={range.kind === 'custom' ? 'btn-primary' : 'btn-ghost'}
              style={{ width: 'auto', minHeight: 36, padding: '6px 12px' }} onClick={() => setRange({ kind: 'custom', from: customFrom, to: customTo })}>Custom dates</button>
          </div>

          {range.kind === 'custom' && (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end', marginTop: 12 }}>
              <div><label style={{ marginTop: 0 }}>From</label><input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} /></div>
              <div><label style={{ marginTop: 0 }}>To</label><input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} /></div>
              <button className="btn-primary" style={{ width: 'auto' }} disabled={!customFrom || !customTo}
                onClick={() => pick({ kind: 'custom', from: customFrom, to: customTo })}>Show</button>
            </div>
          )}
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
          <a className="btn btn-ghost" href={`/api/l3/export?${exportQuery}`} style={{ textAlign: 'center', textDecoration: 'none' }}>Export CSV</a>
          <a className="btn btn-ghost" href={`/api/l3/export/pdf?${exportQuery}`} style={{ textAlign: 'center', textDecoration: 'none' }}>Export PDF</a>
          {['L2 Manager', 'Shift Manager', 'Admin'].includes(report?.viewerRole ?? '') && (
            <a className="btn btn-ghost" href="/manager/fssai-audit" style={{ textAlign: 'center', textDecoration: 'none' }}>FSSAI Audit</a>
          )}
          {['L3 Owner', 'General Manager', 'Owner', 'Admin'].includes(report?.viewerRole ?? '') && (
            <a className="btn btn-ghost" href="/manager/l3-checklist" style={{ textAlign: 'center', textDecoration: 'none' }}>Audit</a>
          )}
        </div>

        {report && (
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: 16 }}>
            <Stat label="Manager Line Check shifts complete today" value={`${report.headline.shiftsL1Complete}/${report.headline.shiftsExpected}`} />
            <Stat label="Pending Operations Manager review" value={String(report.headline.pendingL2)} warn={report.headline.pendingL2 > 0} />
            <Stat label="Pending CEO/Owner review" value={String(report.headline.pendingL3)} warn={report.headline.pendingL3 > 0} />
            <Stat label="Late today" value={String(report.headline.late)} warn={report.headline.late > 0} />
          </div>
        )}

        {!loading && report?.insights && <L3Insights i={report.insights} onPickOutlet={pickOutlet} />}

        {!loading && report && (
          <details style={{ marginBottom: 16 }}>
            <summary style={{ cursor: 'pointer', fontWeight: 600, marginBottom: 8 }}>Classic charts</summary>
            <L3Charts rows={report.rows} />
          </details>
        )}

        {!loading && report && (
          <label style={{ display: 'flex', gap: 8, alignItems: 'center', margin: '0 0 8px', fontWeight: 400 }}>
            <input type="checkbox" checked={onlyIssues} onChange={(e) => setOnlyIssues(e.target.checked)} style={{ width: 'auto' }} />
            Only show shifts with a problem (temperature failures, missed, late or not fully filled)
          </label>
        )}

        {!loading && report && (
          <>
            <h3 style={{ margin: '8px 0 8px' }}>Day by day</h3>
            <DailyTable rows={report.rows} shifts={report.filterOptions?.shifts ?? []} onlyIssues={onlyIssues} />
          </>
        )}

        {loading ? <div className="spinner" /> : (
          <details>
            <summary style={{ cursor: 'pointer', fontWeight: 600, margin: '8px 0' }}>Detailed table (every column)</summary>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--border)' }}>
                  {['Date', 'Outlet', 'Shift', 'Stations', 'Filled', 'Line check %', 'Band', 'Temp alerts', 'Missed', 'On time', 'Delay reason', 'Ops Mgr', 'CEO'].map((h) => (
                    <th key={h} style={{ padding: '6px 8px' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(report?.rows ?? []).filter((r) => !onlyIssues || r.outOfRange > 0 || r.missed > 0 || r.onTime === false || (r.filledPct ?? 100) < 100).slice(0, 200).map((r, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '6px 8px' }}>{r.date}</td>
                    <td style={{ padding: '6px 8px' }}>{r.outletName}</td>
                    <td style={{ padding: '6px 8px', textTransform: 'capitalize' }}>{r.shift}{r.checkTime ? ` · ${r.checkTime}` : ''}</td>
                    <td style={{ padding: '6px 8px' }}>{r.stationsComplete}/{r.stationCount}</td>
                    <td style={{ padding: '6px 8px' }}>{r.filledPct === null || r.filledPct === undefined ? '—' : `${r.filledPct}%`}</td>
                    <td style={{ padding: '6px 8px' }}>{r.percent ?? '—'}</td>
                    <td style={{ padding: '6px 8px' }}>{r.band ?? '—'}</td>
                    <td style={{ padding: '6px 8px', color: r.outOfRange ? 'var(--locked)' : undefined, fontWeight: r.outOfRange ? 700 : undefined }}>{r.outOfRange ? `⚠ ${r.outOfRange}` : '—'}</td>
                    <td style={{ padding: '6px 8px', color: r.missed ? 'var(--locked)' : undefined, fontWeight: r.missed ? 700 : undefined }}>{r.missed ? `${r.missed} missed` : '—'}</td>
                    <td style={{ padding: '6px 8px' }}>{r.onTime === null ? '—' : r.onTime ? 'Yes' : 'Late'}</td>
                    <td style={{ padding: '6px 8px', maxWidth: 220 }}>{r.delayReason ?? '—'}</td>
                    <td style={{ padding: '6px 8px' }}>{r.l2Complete ? 'Done' : '—'}</td>
                    <td style={{ padding: '6px 8px' }}>{r.l3Complete ? 'Done' : '—'}</td>
                  </tr>
                ))}
                {report && report.rows.length === 0 && (
                  <tr><td colSpan={13} style={{ padding: 16, textAlign: 'center' }} className="empty">No line checks in this range.</td></tr>
                )}
              </tbody>
            </table>
          </div>
          </details>
        )}
      </div>
    </>
  );
}

function Stat({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div className="card" style={{ flex: '1 1 160px', padding: '10px 12px', marginBottom: 0, boxShadow: 'none' }}>
      <div className="desc" style={{ marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 700, color: warn ? 'var(--locked)' : undefined }}>{value}</div>
    </div>
  );
}
