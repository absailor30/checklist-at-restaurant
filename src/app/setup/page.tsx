'use client';

import { useCallback, useEffect, useState } from 'react';

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

  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/seed');
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

  const healthy = status?.exists && (status.outlets ?? 0) > 0;

  return (
    <div className="shell" style={{ paddingTop: 40 }}>
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

      <p className="lede" style={{ fontSize: 13 }}>
        <strong>Create</strong> does nothing if the demo is already complete.{' '}
        <strong>Rebuild</strong> deletes it and starts over — useful before a
        pitch. Neither ever touches a real customer&apos;s data.
      </p>

      <div className="btn-row">
        <a className="btn btn-ghost" href="/health"
           style={{ textAlign: 'center', textDecoration: 'none' }}>Health</a>
        <a className="btn btn-primary" href="/staff"
           style={{ textAlign: 'center', textDecoration: 'none' }}>Go to the app</a>
      </div>
    </div>
  );
}
