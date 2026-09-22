'use client';

import { useCallback, useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

interface Row {
  date: string; outletId: string; outletName: string; shift: string;
  stationsComplete: number; stationCount: number; l1Complete: boolean;
  percent: number | null; band: string | null; onTime: boolean | null;
  l2Complete: boolean; l3Complete: boolean;
}
interface Report {
  orgName: string;
  outlets: { id: string; name: string }[];
  rows: Row[];
  headline: {
    date: string; shiftsExpected: number; shiftsL1Complete: number;
    pendingL2: number; pendingL3: number; late: number;
  };
}

export default function L3ReportPage() {
  const supabase = createClient();
  const [sessionState, setSessionState] = useState<'checking' | 'in' | 'out'>('checking');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loginBusy, setLoginBusy] = useState(false);
  const [loginError, setLoginError] = useState('');

  const [days, setDays] = useState(7);
  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchReport = useCallback(async (d: number) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/l3/report?days=${d}`);
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
      if (session) void fetchReport(days);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => {
      setSessionState(session ? 'in' : 'out');
      if (session) void fetchReport(days);
    });
    return () => subscription.unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase]);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoginBusy(true); setLoginError('');
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoginBusy(false);
    if (error) setLoginError(error.message);
  }

  async function handleLogout() { await supabase.auth.signOut(); }

  function changeDays(d: number) {
    setDays(d);
    void fetchReport(d);
  }

  if (sessionState === 'checking') return <div className="shell" style={{ paddingTop: 32 }}><div className="spinner" /></div>;

  if (sessionState === 'out') {
    return (
      <div className="shell" style={{ paddingTop: 32 }}>
        <h2>L3 sign in</h2>
        <p className="lede">Same account as the manager dashboard.</p>
        {loginError && <div className="banner error">{loginError}</div>}
        <form className="card" onSubmit={handleLogin}>
          <label htmlFor="email" style={{ marginTop: 0 }}>Email</label>
          <input id="email" type="email" value={email} autoComplete="username"
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
          <h1>L3 Report</h1>
          <div className="sub">{report?.orgName}</div>
        </div>
        <button className="btn-ghost" style={{ width: 'auto', minHeight: 40, padding: '8px 14px' }} onClick={handleLogout}>
          Sign out
        </button>
      </div>

      <div className="shell">
        {error && <div className="banner error">{error}</div>}

        {report && (
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: 16 }}>
            <Stat label="L1 shifts complete today" value={`${report.headline.shiftsL1Complete}/${report.headline.shiftsExpected}`} />
            <Stat label="Pending L2 review" value={String(report.headline.pendingL2)} warn={report.headline.pendingL2 > 0} />
            <Stat label="Pending L3 review" value={String(report.headline.pendingL3)} warn={report.headline.pendingL3 > 0} />
            <Stat label="Late today" value={String(report.headline.late)} warn={report.headline.late > 0} />
          </div>
        )}

        <div className="btn-row" style={{ marginBottom: 16 }}>
          {[7, 14, 30].map((d) => (
            <button key={d} className={days === d ? 'btn-primary' : 'btn-ghost'} onClick={() => changeDays(d)}>
              {d} days
            </button>
          ))}
          <a className="btn btn-ghost" href={`/api/l3/export?days=${days}`} style={{ textAlign: 'center', textDecoration: 'none' }}>
            Export CSV
          </a>
          <a className="btn btn-ghost" href={`/api/l3/export/pdf?days=${days}`} style={{ textAlign: 'center', textDecoration: 'none' }}>
            Export PDF
          </a>
        </div>

        {loading ? <div className="spinner" /> : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--border)' }}>
                  {['Date', 'Outlet', 'Shift', 'Stations', 'L1 %', 'Band', 'On time', 'L2', 'L3'].map((h) => (
                    <th key={h} style={{ padding: '6px 8px' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(report?.rows ?? []).map((r, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '6px 8px' }}>{r.date}</td>
                    <td style={{ padding: '6px 8px' }}>{r.outletName}</td>
                    <td style={{ padding: '6px 8px', textTransform: 'capitalize' }}>{r.shift}</td>
                    <td style={{ padding: '6px 8px' }}>{r.stationsComplete}/{r.stationCount}</td>
                    <td style={{ padding: '6px 8px' }}>{r.percent ?? '—'}</td>
                    <td style={{ padding: '6px 8px' }}>{r.band ?? '—'}</td>
                    <td style={{ padding: '6px 8px' }}>{r.onTime === null ? '—' : r.onTime ? 'Yes' : 'Late'}</td>
                    <td style={{ padding: '6px 8px' }}>{r.l2Complete ? 'Done' : '—'}</td>
                    <td style={{ padding: '6px 8px' }}>{r.l3Complete ? 'Done' : '—'}</td>
                  </tr>
                ))}
                {report && report.rows.length === 0 && (
                  <tr><td colSpan={9} style={{ padding: 16, textAlign: 'center' }} className="empty">No line checks in this range.</td></tr>
                )}
              </tbody>
            </table>
          </div>
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
