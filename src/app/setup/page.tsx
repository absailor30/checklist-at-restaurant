'use client';

import { useCallback, useEffect, useState } from 'react';

function BrandOnboarding() {
  const [brandName, setBrandName] = useState('');
  const [outletCount, setOutletCount] = useState(3);
  const [outletNames, setOutletNames] = useState<string[]>(['Outlet 1', 'Outlet 2', 'Outlet 3']);
  const [stationCount, setStationCount] = useState(3);
  const [l2Name, setL2Name] = useState(''); const [l2Email, setL2Email] = useState(''); const [l2Password, setL2Password] = useState('');
  const [l3Name, setL3Name] = useState(''); const [l3Email, setL3Email] = useState(''); const [l3Password, setL3Password] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function setCount(n: number) {
    const count = Math.max(1, Math.min(200, n));
    setOutletCount(count);
    setOutletNames((prev) => {
      const next = [...prev];
      while (next.length < count) next.push(`Outlet ${next.length + 1}`);
      return next.slice(0, count);
    });
  }

  async function submitForm(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null); setResult(null);
    try {
      const res = await fetch('/api/onboard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          brandName,
          outlets: outletNames.map((name) => ({ name, stationCount })),
          l2Name, l2Email, l2Password,
          l3Name, l3Email, l3Password,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error); return; }
      setResult(`Created "${brandName}" — ${data.outlets.length} outlets, ${data.l1Count} L1 managers.`);
    } catch {
      setError('The request did not complete.');
    } finally {
      setBusy(false);
    }
  }

  async function submitExcel(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true); setError(null); setResult(null);
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await fetch('/api/onboard/excel', { method: 'POST', body: form });
      const data = await res.json();
      if (!res.ok) { setError(data.error); return; }
      setResult(`Created brand — ${data.outlets.length} outlets, ${data.l1Count} L1 managers.`);
    } catch {
      setError('The request did not complete.');
    } finally {
      setBusy(false);
      e.target.value = '';
    }
  }

  return (
    <div className="card">
      <strong>Onboard a new brand</strong>
      <p className="lede" style={{ fontSize: 13, margin: '8px 0 12px' }}>
        A brand gets its outlets, each with 3 stations and one L1 manager per
        shift (morning/afternoon/evening), plus one L2 manager and one L3
        owner covering every outlet. For more than a few outlets, or when
        stations or shift-manager names differ per outlet, use the Excel
        upload instead — download the{' '}
        <a href="/onboarding-template.xlsx">template</a>, fill it in, and
        upload it below.
      </p>

      {error && <div className="banner error">{error}</div>}
      {result && <div className="banner info">{result}</div>}

      <div style={{ marginBottom: 16 }}>
        <label>Upload a filled-in Excel template</label>
        <input type="file" accept=".xlsx" disabled={busy} onChange={submitExcel} />
      </div>

      <form onSubmit={submitForm}>
        <label>Brand name</label>
        <input value={brandName} onChange={(e) => setBrandName(e.target.value)} required />

        <label>Number of outlets</label>
        <input type="number" min={1} max={200} value={outletCount}
          onChange={(e) => setCount(Number(e.target.value) || 1)} />

        {outletNames.map((name, i) => (
          <input key={i} value={name} style={{ marginTop: 6 }}
            onChange={(e) => setOutletNames((prev) => prev.map((n, j) => j === i ? e.target.value : n))} />
        ))}

        <label style={{ marginTop: 12 }}>Stations per outlet (same for all)</label>
        <input type="number" min={1} max={3} value={stationCount}
          onChange={(e) => setStationCount(Math.max(1, Math.min(3, Number(e.target.value) || 3)))} />

        <label style={{ marginTop: 12 }}>L2 manager</label>
        <input placeholder="Name" value={l2Name} onChange={(e) => setL2Name(e.target.value)} required />
        <input placeholder="Email" type="email" value={l2Email} onChange={(e) => setL2Email(e.target.value)} required style={{ marginTop: 6 }} />
        <input placeholder="Password (10+ chars)" type="password" value={l2Password} onChange={(e) => setL2Password(e.target.value)} required style={{ marginTop: 6 }} />

        <label style={{ marginTop: 12 }}>L3 owner</label>
        <input placeholder="Name" value={l3Name} onChange={(e) => setL3Name(e.target.value)} required />
        <input placeholder="Email" type="email" value={l3Email} onChange={(e) => setL3Email(e.target.value)} required style={{ marginTop: 6 }} />
        <input placeholder="Password (10+ chars)" type="password" value={l3Password} onChange={(e) => setL3Password(e.target.value)} required style={{ marginTop: 6 }} />

        <button className="btn-primary" type="submit" disabled={busy} style={{ marginTop: 16 }}>
          {busy ? 'Creating…' : 'Create brand'}
        </button>
      </form>
    </div>
  );
}

// Browser-based setup, so a demo can be created or reset without a terminal.
//
// The page always shows what is actually in the database. An earlier version
// only reported the result of the last button press, which left it insisting
// the demo was "already set up" while the app itself saw nothing.

interface Status {
  exists: boolean;
  outlets?: number;
  submissions?: number;
  pin?: string;
  managerPassword?: string;
  managers?: { name: string; email: string; role: string }[];
}

export default function SetupPage() {
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<Status | null>(null);
  const [cron, setCron] = useState<{ token: string; explicit: boolean; path: string } | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/seed?t=${Date.now()}`, { cache: 'no-store' });
      setStatus(await res.json());
    } catch {
      setStatus(null);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  async function run(reset: boolean) {
    if (reset && !confirm(
      'This deletes the demo restaurant and all its history, then rebuilds it.\n\n' +
      'Real customer data is never touched. Continue?'
    )) return;

    setBusy(true); setError(null); setMessage(null);
    try {
      const res = await fetch('/api/admin/seed', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password, reset }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error); return; }

      setMessage(data.alreadyExists
        ? 'Demo data was already complete — nothing to do.'
        : `Done: ${data.result.outlets} outlets, ${data.result.staff} staff, ` +
          `${data.result.submissions} submissions, ${data.result.frozen} locked items.`);
    } catch {
      setError(
        'The request did not complete. Press Rebuild to start cleanly.'
      );
    } finally {
      setBusy(false);
      await refresh();
    }
  }

  async function revealCron() {
    setError(null);
    const res = await fetch('/api/admin/cron-token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    });
    const data = await res.json();
    if (!res.ok) { setError(data.error); return; }
    setCron(data);
  }

  const healthy = status?.exists && (status.outlets ?? 0) > 0;

  return (
    <div className="shell" style={{ paddingTop: 40 }}>
      <BrandOnboarding />

      <h2>Set up demo data</h2>
      <p className="lede">
        Creates the Spice Garden demo restaurant group with three outlets and two
        weeks of history.
      </p>

      {error && <div className="banner error">{error}</div>}
      {message && <div className="banner info">{message}</div>}
      {busy && (
        <div className="banner info">
          Writing around 3,000 rows. This takes a few seconds — do not close the page.
        </div>
      )}

      {/* Always state the real position, not the outcome of the last click. */}
      {status && (
        <div className={`item ${healthy ? 'done' : 'locked'}`}>
          <div className="head">
            <div className="title">
              {healthy
                ? 'Demo data is ready'
                : status.exists
                  ? 'Demo data is incomplete'
                  : 'No demo data yet'}
              <div className="desc">
                {healthy
                  ? `${status.outlets} outlets, ${status.submissions} submissions`
                  : status.exists
                    ? 'A previous attempt did not finish. Press Rebuild.'
                    : 'Press Create demo below.'}
              </div>
            </div>
            <span className={`tag ${healthy ? 'ok' : 'locked'}`}>
              {healthy ? 'Ready' : 'Fix'}
            </span>
          </div>
        </div>
      )}

      <div className="card">
        <label>Setup password</label>
        <input type="password" value={password} autoComplete="off"
          onChange={(e) => setPassword(e.target.value)}
          placeholder="The SETUP_PASSWORD you configured" />
        <div className="btn-row" style={{ marginTop: 16 }}>
          <button className="btn-ghost" disabled={busy || !password} onClick={() => run(true)}>
            Rebuild
          </button>
          <button className="btn-primary" disabled={busy || !password} onClick={() => run(false)}>
            {busy ? 'Building…' : 'Create demo'}
          </button>
        </div>
      </div>

      {healthy && status.managers && status.managers.length > 0 && (
        <div className="card">
          <strong>Sign in details</strong>
          <p className="lede" style={{ fontSize: 13, margin: '8px 0 12px' }}>
            Floor staff at <code>/staff</code> use PIN <strong>{status.pin}</strong>.
            Managers at <code>/manager</code> use password{' '}
            <strong>{status.managerPassword}</strong>.
          </p>
          {status.managers.map((m) => (
            <div key={m.email} className="lockbox" style={{ marginTop: 8 }}>
              <div className="row">
                <span className="label">{m.role}</span><span>{m.name}</span>
              </div>
              <div className="row">
                <span className="label">Email</span><span>{m.email}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="card">
        <strong>Scheduled job</strong>
        <p className="lede" style={{ fontSize: 13, margin: '8px 0 12px' }}>
          Freezes overdue tasks and escalates them while nobody has the app open.
          It runs daily on its own — this plan allows no more than that — so for
          anything useful, point a free scheduler (cron-job.org and similar) at
          the address below every 15 minutes.
        </p>

        {cron ? (
          <>
            <div className="lockbox">
              <div className="row">
                <span className="label">Method</span><span>GET</span>
              </div>
              <div className="row">
                <span className="label">URL</span>
                <span style={{ wordBreak: 'break-all' }}>
                  {typeof window !== 'undefined' ? window.location.origin : ''}{cron.path}
                </span>
              </div>
              <div className="row">
                <span className="label">Header</span>
                <span style={{ wordBreak: 'break-all' }}>
                  Authorization: Bearer {cron.token}
                </span>
              </div>
            </div>
            <p className="lede" style={{ fontSize: 12, margin: '10px 0 0' }}>
              {cron.explicit
                ? 'This is the CRON_SECRET you set.'
                : 'Derived from the session secret, so there is nothing to configure. Changing APP_SESSION_SECRET changes this token too.'}{' '}
              Treat it like a password.
            </p>
          </>
        ) : (
          <button className="btn-ghost" disabled={!password} onClick={revealCron}>
            Show the scheduler details
          </button>
        )}
      </div>

      <p className="lede" style={{ fontSize: 13 }}>
        <strong>Create</strong> does nothing if the demo is already complete.{' '}
        <strong>Rebuild</strong> deletes it and starts over — useful before a
        pitch. Neither ever touches a real customer&apos;s data.
      </p>

      <div className="btn-row">
        <a className="btn btn-ghost" href="/health"
           style={{ textAlign: 'center', textDecoration: 'none' }}>Health</a>
        <a className="btn btn-primary" href="/l1"
           style={{ textAlign: 'center', textDecoration: 'none' }}>Go to the app</a>
      </div>
    </div>
  );
}
