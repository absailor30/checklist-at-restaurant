'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';

// Signing up a real restaurant. Deliberately short: name, outlets, and an
// owner account. Standard shift checklists are created for every outlet so the
// app is useful on day one; the owner edits them afterwards rather than facing
// an empty product.
export default function OnboardPage() {
  const [organisationName, setOrganisationName] = useState('');
  const [outlets, setOutlets] = useState<string[]>(['']);
  const [ownerName, setOwnerName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ outlets: number; checklists: number; items: number } | null>(null);

  const supabase = createClient();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      const res = await fetch('/api/onboard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          organisationName, ownerName, email, password,
          outletNames: outlets.map((o) => o.trim()).filter(Boolean),
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Kolkata',
        }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error); return; }

      // Sign straight in so the owner lands in the app rather than at a login.
      await supabase.auth.signInWithPassword({ email, password });
      setDone({ outlets: data.outlets.length, checklists: data.checklists, items: data.items });
    } catch {
      setError('Could not reach the server. Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div className="shell" style={{ paddingTop: 48 }}>
        <h2>{organisationName} is set up</h2>
        <p className="lede">
          {done.outlets} {done.outlets === 1 ? 'outlet' : 'outlets'}, {done.checklists} checklists
          and {done.items} tasks, based on standard restaurant practice. Edit anything
          that does not match how you work.
        </p>

        <div className="card">
          <strong>What to do next</strong>
          <ol className="lede" style={{ margin: '10px 0 0', paddingLeft: 20 }}>
            <li>Add your staff, so they appear on the sign-in screen.</li>
            <li>Open the app on the tablet or phone each outlet will use and pick that outlet.</li>
            <li>Staff tap their name and set their own PIN the first time.</li>
          </ol>
        </div>

        <div className="btn-row">
          <a className="btn btn-ghost" href="/owner"
             style={{ textAlign: 'center', textDecoration: 'none' }}>Dashboard</a>
          <a className="btn btn-primary" href="/manage"
             style={{ textAlign: 'center', textDecoration: 'none' }}>Add staff</a>
        </div>
      </div>
    );
  }

  return (
    <div className="shell" style={{ paddingTop: 40 }}>
      <h2>Set up your restaurant</h2>
      <p className="lede">
        Takes a minute. You will get opening, mid-shift and closing checklists for
        kitchen, front of house and bar, ready to edit.
      </p>

      {error && <div className="banner error">{error}</div>}

      <form onSubmit={submit}>
        <div className="card">
          <label>Restaurant or group name</label>
          <input type="text" value={organisationName} required
            onChange={(e) => setOrganisationName(e.target.value)}
            placeholder="e.g. Spice Garden Restaurants" />

          <label style={{ marginTop: 18 }}>Outlets</label>
          <p className="lede" style={{ fontSize: 13, margin: '0 0 10px' }}>
            One line per location. Add more later at any time.
          </p>
          {outlets.map((value, i) => (
            <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
              <input type="text" value={value}
                onChange={(e) => {
                  const next = [...outlets];
                  next[i] = e.target.value;
                  setOutlets(next);
                }}
                placeholder={i === 0 ? 'e.g. Koramangala' : 'Another location'} />
              {outlets.length > 1 && (
                <button type="button" className="btn-ghost"
                  style={{ width: 'auto', minHeight: 50, padding: '0 14px' }}
                  onClick={() => setOutlets(outlets.filter((_, j) => j !== i))}>
                  Remove
                </button>
              )}
            </div>
          ))}
          <button type="button" className="btn-ghost"
            onClick={() => setOutlets([...outlets, ''])}>
            Add another outlet
          </button>
        </div>

        <div className="card">
          <strong>Your owner account</strong>
          <p className="lede" style={{ fontSize: 13, margin: '6px 0 0' }}>
            You sign in with an email and password. Floor staff use a PIN on a
            shared device instead.
          </p>

          <label>Your name</label>
          <input type="text" value={ownerName} required autoComplete="name"
            onChange={(e) => setOwnerName(e.target.value)} />

          <label>Email</label>
          <input type="email" value={email} required autoComplete="username"
            onChange={(e) => setEmail(e.target.value)} />

          <label>Password</label>
          <input type="password" value={password} required minLength={10}
            autoComplete="new-password"
            onChange={(e) => setPassword(e.target.value)}
            placeholder="At least 10 characters" />
        </div>

        <button className="btn-primary" disabled={busy}>
          {busy ? 'Setting up…' : 'Create my restaurant'}
        </button>
      </form>

      <a className="btn btn-ghost" href="/manager"
         style={{ display: 'block', textAlign: 'center', textDecoration: 'none', marginTop: 10 }}>
        I already have an account
      </a>
    </div>
  );
}
