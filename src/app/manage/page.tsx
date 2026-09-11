'use client';

import { useCallback, useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

// Staff administration: who works here, in what role, at which outlets.
//
// Staff are deactivated rather than deleted. Their submissions are the audit
// trail, and a record that points at a deleted person is worth nothing in a
// dispute or an inspection.

interface Staff {
  id: string; name: string; email: string | null; isActive: boolean;
  hasPin: boolean; roleId: string; outletIds: string[];
}
interface Role { id: string; name: string; level: number; can_review: boolean }
interface Outlet { id: string; name: string }

export default function ManagePage() {
  const [state, setState] = useState<'loading' | 'out' | 'in' | 'denied'>('loading');
  const [staff, setStaff] = useState<Staff[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [outlets, setOutlets] = useState<Outlet[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const supabase = createClient();

  const load = useCallback(async () => {
    const res = await fetch(`/api/manage/staff?t=${Date.now()}`, { cache: 'no-store' });
    if (res.status === 401) { setState('out'); return; }
    const body = await res.json();
    if (res.status === 403) { setError(body.error); setState('denied'); return; }
    if (!res.ok) { setError(body.error); return; }
    setStaff(body.staff); setRoles(body.roles); setOutlets(body.outlets);
    setState('in');
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) { setState('out'); return; }
      void load();
    });
  }, [load, supabase]);

  async function act(action: string, userId: string) {
    const res = await fetch('/api/manage/staff', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, userId }),
    });
    const body = await res.json();
    if (!res.ok) { setError(body.error); return; }
    await load();
  }

  if (state === 'loading') return <div className="spinner" />;

  if (state === 'out' || state === 'denied') {
    return (
      <div className="shell" style={{ paddingTop: 48 }}>
        <h2>{state === 'out' ? 'Staff' : 'Not available to your role'}</h2>
        <p className="lede">
          {state === 'out'
            ? 'Sign in with your manager account to manage staff.'
            : error}
        </p>
        <a className="btn btn-primary" href="/manager"
           style={{ display: 'block', textAlign: 'center', textDecoration: 'none' }}>
          Go to sign in
        </a>
      </div>
    );
  }

  const roleById = new Map(roles.map((r) => [r.id, r]));
  const outletById = new Map(outlets.map((o) => [o.id, o]));

  return (
    <>
      <div className="topbar">
        <div>
          <h1>Staff</h1>
          <div className="sub">{staff.filter((s) => s.isActive).length} active</div>
        </div>
        <a className="btn-ghost" href="/owner"
           style={{ width: 'auto', minHeight: 40, padding: '8px 14px', textDecoration: 'none' }}>
          Dashboard
        </a>
      </div>

      <div className="shell">
        {error && <div className="banner error">{error}</div>}

        <button className="btn-primary" onClick={() => setAdding(true)}>
          Add a staff member
        </button>

        <p className="lede" style={{ fontSize: 13, marginTop: 14 }}>
          Staff set their own PIN the first time they sign in, so nobody else
          ever knows it. If someone forgets theirs, reset it here and they will
          be asked to choose a new one.
        </p>

        {staff.map((s) => {
          const role = roleById.get(s.roleId);
          return (
            <div className={`item ${s.isActive ? '' : 'locked'}`} key={s.id}>
              <div className="head">
                <div className="title">
                  {s.name}
                  <div className="desc">
                    {role?.name ?? 'No role'}
                    {' · '}
                    {s.outletIds.map((id) => outletById.get(id)?.name).filter(Boolean).join(', ')
                      || 'No outlet'}
                  </div>
                  <div className="due">
                    {s.email
                      ? `Signs in with ${s.email}`
                      : s.hasPin ? 'PIN set' : 'Will set a PIN on first sign-in'}
                  </div>
                </div>
                <span className={`tag ${s.isActive ? 'plain' : 'locked'}`}>
                  {s.isActive ? 'Active' : 'Inactive'}
                </span>
              </div>

              <div className="btn-row" style={{ marginTop: 12 }}>
                {s.isActive ? (
                  <>
                    {!s.email && (
                      <button className="btn-ghost" onClick={() => act('reset_pin', s.id)}>
                        Reset PIN
                      </button>
                    )}
                    <button className="btn-ghost" onClick={() => {
                      if (confirm(
                        `${s.name} will no longer appear on the sign-in screen.\n\n` +
                        'Their past submissions are kept. Continue?'
                      )) void act('deactivate', s.id);
                    }}>
                      Deactivate
                    </button>
                  </>
                ) : (
                  <button className="btn-ghost" onClick={() => act('reactivate', s.id)}>
                    Reactivate
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {adding && (
        <AddStaff roles={roles} outlets={outlets}
          onClose={() => setAdding(false)}
          onDone={async () => { setAdding(false); await load(); }} />
      )}
    </>
  );
}

function AddStaff({ roles, outlets, onClose, onDone }: {
  roles: Role[]; outlets: Outlet[]; onClose: () => void; onDone: () => void;
}) {
  const [name, setName] = useState('');
  const [roleId, setRoleId] = useState(roles[0]?.id ?? '');
  const [outletIds, setOutletIds] = useState<string[]>(outlets[0] ? [outlets[0].id] : []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const role = roles.find((r) => r.id === roleId);

  async function submit() {
    setBusy(true); setError(null);
    try {
      const res = await fetch('/api/manage/staff', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'add', name, roleId, outletIds }),
      });
      const body = await res.json();
      if (!res.ok) { setError(body.error); return; }
      onDone();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <h3>Add a staff member</h3>
        {error && <div className="banner error">{error}</div>}

        <label>Name</label>
        <input type="text" value={name} onChange={(e) => setName(e.target.value)}
          placeholder="As it should appear on the sign-in screen" />

        <label>Role</label>
        <select value={roleId} onChange={(e) => setRoleId(e.target.value)}>
          {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
        </select>

        {role?.can_review && (
          <div className="banner info" style={{ marginTop: 12 }}>
            {role.name} can review and unlock tasks. Roles that approve work need
            an email and password, not a PIN — add them here, then send them a
            sign-in invitation from Supabase.
          </div>
        )}

        <label>Outlets</label>
        {outlets.map((o) => (
          <label key={o.id} style={{
            display: 'flex', alignItems: 'center', gap: 10,
            fontWeight: 400, margin: '8px 0',
          }}>
            <input type="checkbox" checked={outletIds.includes(o.id)}
              style={{ width: 20, height: 20, minHeight: 20 }}
              onChange={(e) => setOutletIds(e.target.checked
                ? [...outletIds, o.id]
                : outletIds.filter((id) => id !== o.id))} />
            {o.name}
          </label>
        ))}

        <div className="btn-row" style={{ marginTop: 18 }}>
          <button className="btn-ghost" onClick={onClose} disabled={busy}>Cancel</button>
          <button className="btn-primary" onClick={submit}
            disabled={busy || name.trim().length < 2 || !outletIds.length}>
            {busy ? 'Adding…' : 'Add'}
          </button>
        </div>
      </div>
    </div>
  );
}
