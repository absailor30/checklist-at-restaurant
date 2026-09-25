'use client';

import { useState } from 'react';

// Platform admin: approve/reject any pending L1 or L2 across every brand,
// password-gated the same way /setup is (SETUP_PASSWORD).
export default function AdminPendingPage() {
  const [password, setPassword] = useState('');
  const [pending, setPending] = useState<any[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const call = async (action: string, extra: any = {}) => {
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/admin/pending', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password, action, ...extra }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error); return; }
      return data;
    } finally {
      setBusy(false);
    }
  };

  const load = async () => {
    const data = await call('list');
    if (data) setPending(data.pending);
  };

  const approve = async (userId: string) => {
    const data = await call('approve', { userId });
    if (data) void load();
  };

  const reject = async (userId: string) => {
    const data = await call('reject', { userId });
    if (data) void load();
  };

  return (
    <div className="shell" style={{ paddingTop: 40 }}>
      <h2>Pending approvals — all brands</h2>
      <p className="lede">Approve or reject any L1/L2 signup request, across every brand on the platform.</p>

      {error && <div className="banner error">{error}</div>}

      <div className="card">
        <label>Admin password</label>
        <input type="password" value={password} autoComplete="off" onChange={(e) => setPassword(e.target.value)} />
        <button className="btn-primary" style={{ marginTop: 12 }} disabled={busy || !password} onClick={load}>
          {busy ? 'Loading…' : 'Load pending requests'}
        </button>
      </div>

      {pending && pending.length === 0 && <p className="empty">Nothing pending.</p>}
      {pending?.map((u) => (
        <div key={u.id} className="item">
          <div className="head">
            <div className="title">{u.name}</div>
            <span className="tag warn">{u.role}{u.shift ? ` · ${u.shift}` : ''}</span>
          </div>
          <div className="desc">{u.brand}{u.email ? ` · ${u.email}` : ''}</div>
          <div className="btn-row" style={{ marginTop: 12 }}>
            <button className="btn-primary" disabled={busy} onClick={() => approve(u.id)}>Approve</button>
            <button className="btn-ghost" disabled={busy} onClick={() => reject(u.id)}>Reject</button>
          </div>
        </div>
      ))}
    </div>
  );
}
