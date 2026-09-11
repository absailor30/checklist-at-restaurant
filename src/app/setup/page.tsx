'use client';

import { useState } from 'react';

// Browser-based setup so a demo can be created or reset without a terminal.
export default function SetupPage() {
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [logins, setLogins] = useState<{ name: string; role: string; email: string }[]>([]);
  const [managerPassword, setManagerPassword] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

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

      if (data.alreadyExists) {
        setMessage(data.message);
      } else {
        const r = data.result;
        setLogins(r.managers ?? []);
        setManagerPassword(r.managerPassword ?? null);
        setMessage(
          `Demo ready: ${r.outlets} outlets, ${r.staff} staff, ${r.templates} checklists, ` +
          `${r.submissions} submissions, ${r.frozen} locked items. ` +
          `Everyone's PIN is ${r.pin}.`
        );
      }
    } catch {
      setError(
        'The request did not complete. If the demo was partly created, use ' +
        'Rebuild to start cleanly rather than Create.'
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="shell" style={{ paddingTop: 40 }}>
      <h2>Set up demo data</h2>
      <p className="lede">
        Creates the Spice Garden demo restaurant group with three outlets and two
        weeks of history. Run this once after setting up the database.
      </p>

      {error && <div className="banner error">{error}</div>}
      {message && <div className="banner info">{message}</div>}
      {busy && (
        <div className="banner info">
          Writing around 3,000 rows. This takes a few seconds — do not close the page.
        </div>
      )}

      <div className="card">
        <label>Setup password</label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="The SETUP_PASSWORD you configured"
          autoComplete="off"
        />
        <div className="btn-row" style={{ marginTop: 16 }}>
          <button className="btn-ghost" disabled={busy || !password} onClick={() => run(true)}>
            Rebuild
          </button>
          <button className="btn-primary" disabled={busy || !password} onClick={() => run(false)}>
            {busy ? 'Building…' : 'Create demo'}
          </button>
        </div>
      </div>

      {logins.length > 0 && (
        <div className="card">
          <strong>Manager sign-ins</strong>
          <p className="lede" style={{ fontSize: 13, margin: '6px 0 12px' }}>
            Use these at <code>/manager</code>. Password for all of them:{' '}
            <strong>{managerPassword}</strong>
          </p>
          {logins.map((m) => (
            <div key={m.email} className="lockbox" style={{ marginTop: 8 }}>
              <div className="row"><span className="label">{m.role}</span><span>{m.name}</span></div>
              <div className="row"><span className="label">Email</span><span>{m.email}</span></div>
            </div>
          ))}
        </div>
      )}

      <p className="lede" style={{ fontSize: 13 }}>
        <strong>Create</strong> does nothing if the demo already exists.{' '}
        <strong>Rebuild</strong> deletes it and starts over — useful before a
        pitch. Neither ever touches a real customer&apos;s data.
      </p>

      <a className="btn btn-ghost" href="/staff"
         style={{ display: 'block', textAlign: 'center', textDecoration: 'none', marginTop: 8 }}>
        Go to the app
      </a>
    </div>
  );
}
