'use client';

import { useCallback, useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

// The manager screen: what is locked and waiting on them, what needs
// approving, what came back out of range, and how each outlet is tracking.
//
// Ordered by what needs a decision now. A manager opening this during service
// has seconds, not minutes.

interface LockedItem {
  lockId: string; runId: string; itemId: string; title: string;
  proof: string; unit: string | null; minValue: number | null; maxValue: number | null;
  outlet: string; outletId: string; checklist: string; shift: string; forRole: string;
  state: 'locked' | 'unlocked'; lockedAt: string; escalationLevel: number;
  escalatesAt: string | null; unlockExpiresAt: string | null; unlockComment: string | null;
  empoweredRoles: string[]; youCanUnlock: boolean; dueAt: string | null;
}

interface ReviewItem {
  id: string; title: string; unit: string | null;
  minValue: number | null; maxValue: number | null;
  outlet: string; checklist: string; by: string;
  valueNumber: number | null; valueText: string | null;
  photoPath: string | null; comment: string | null;
  status: string; outOfBounds: boolean; wasLate: boolean; submittedAt: string;
}

interface OutletStat {
  id: string; name: string; total: number; done: number; locked: number; percent: number;
}

interface Overview {
  date: string;
  manager: { name: string; role: string; canReview: boolean; canUnlock: boolean };
  defaultUnlockWindow: number;
  locked: LockedItem[];
  review: ReviewItem[];
  alerts: ReviewItem[];
  outlets: OutletStat[];
}

type Tab = 'locked' | 'review' | 'alerts' | 'outlets';

export default function ManagerPage() {
  const [session, setSession] = useState<'loading' | 'out' | 'in'>('loading');
  const [data, setData] = useState<Overview | null>(null);
  const [tab, setTab] = useState<Tab>('locked');
  const [error, setError] = useState<string | null>(null);
  const [acting, setActing] = useState<LockedItem | null>(null);
  const [reviewing, setReviewing] = useState<ReviewItem | null>(null);

  const supabase = createClient();

  const load = useCallback(async () => {
    const res = await fetch(`/api/manager/overview?t=${Date.now()}`, { cache: 'no-store' });
    if (res.status === 401) { setSession('out'); return; }
    const body = await res.json();
    if (!res.ok) { setError(body.error); return; }
    setData(body);
    setSession('in');
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      if (!s) { setSession('out'); return; }
      void load();
    });
  }, [load, supabase]);

  // Locks escalate on a clock, so keep the screen honest without a manual
  // refresh.
  useEffect(() => {
    if (session !== 'in') return;
    const t = setInterval(() => { void load(); }, 60_000);
    return () => clearInterval(t);
  }, [session, load]);

  if (session === 'loading') return <div className="spinner" />;
  if (session === 'out') return <SignIn onDone={load} />;
  if (!data) return <div className="spinner" />;

  const urgent = data.locked.filter((l) => l.youCanUnlock && l.state === 'locked').length;

  return (
    <>
      <div className="topbar">
        <div>
          <h1>{data.manager.name}</h1>
          <div className="sub">{data.manager.role} · {data.date}</div>
        </div>
        <button className="btn-ghost" style={{ width: 'auto', minHeight: 40, padding: '8px 14px' }}
          onClick={async () => { await supabase.auth.signOut(); setSession('out'); }}>
          Sign out
        </button>
      </div>

      <div className="shell">
        {error && <div className="banner error">{error}</div>}

        <div className="tabs">
          <Tab id="locked"  label="Locked"   count={data.locked.length} badge={urgent} tab={tab} set={setTab} />
          <Tab id="review"  label="Approve"  count={data.review.length} tab={tab} set={setTab} />
          <Tab id="alerts"  label="Alerts"   count={data.alerts.length} tab={tab} set={setTab} />
          <Tab id="outlets" label="Outlets"  count={data.outlets.length} tab={tab} set={setTab} />
        </div>

        {tab === 'locked' && (
          <>
            {data.locked.length === 0 && (
              <p className="empty">Nothing locked. Everything is on track.</p>
            )}
            {data.locked.map((l) => (
              <LockedCard key={l.lockId} item={l} onAct={() => setActing(l)} />
            ))}
          </>
        )}

        {tab === 'review' && (
          <>
            {data.review.length === 0 && <p className="empty">Nothing waiting for approval.</p>}
            {data.review.map((s) => (
              <SubmissionCard key={s.id} item={s} onOpen={() => setReviewing(s)} />
            ))}
          </>
        )}

        {tab === 'alerts' && (
          <>
            {data.alerts.length === 0 && (
              <p className="empty">No out-of-range readings today.</p>
            )}
            {data.alerts.map((s) => (
              <SubmissionCard key={s.id} item={s} onOpen={() => setReviewing(s)} />
            ))}
          </>
        )}

        {tab === 'outlets' && data.outlets.map((o) => (
          <div className="card" key={o.id}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
              <strong>{o.name}</strong>
              <span style={{ color: o.locked ? 'var(--locked)' : 'var(--muted)' }}>
                {o.percent}%{o.locked ? ` · ${o.locked} locked` : ''}
              </span>
            </div>
            <div className="progress"><div style={{ width: `${o.percent}%` }} /></div>
            <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 8 }}>
              {o.done} of {o.total} tasks done today
            </div>
          </div>
        ))}
      </div>

      {acting && (
        <ActionSheet
          item={acting}
          defaultWindow={data.defaultUnlockWindow}
          onClose={() => setActing(null)}
          onDone={async () => { setActing(null); await load(); }}
        />
      )}

      {reviewing && (
        <ReviewSheet
          item={reviewing}
          canReview={data.manager.canReview}
          onClose={() => setReviewing(null)}
          onDone={async () => { setReviewing(null); await load(); }}
        />
      )}
    </>
  );
}

// --------------------------------------------------------------------------

function Tab({ id, label, count, badge, tab, set }: {
  id: Tab; label: string; count: number; badge?: number; tab: Tab; set: (t: Tab) => void;
}) {
  return (
    <button className={`tab${tab === id ? ' active' : ''}`} onClick={() => set(id)}>
      {label}
      {count > 0 && <span className={`tabcount${badge ? ' urgent' : ''}`}>{count}</span>}
    </button>
  );
}

function SignIn({ onDone }: { onDone: () => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const supabase = createClient();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null);
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (signInError) { setError(signInError.message); return; }
    onDone();
  }

  return (
    <div className="shell" style={{ paddingTop: 48 }}>
      <h2>Manager sign in</h2>
      <p className="lede">
        Managers sign in with an email and password, not a PIN — approvals and
        unlocks are recorded against your name permanently.
      </p>
      {error && <div className="banner error">{error}</div>}
      <form className="card" onSubmit={submit}>
        <label>Email</label>
        <input type="email" value={email} autoComplete="username"
          onChange={(e) => setEmail(e.target.value)} required />
        <label>Password</label>
        <input type="password" value={password} autoComplete="current-password"
          onChange={(e) => setPassword(e.target.value)} required
          style={{ WebkitTextSecurity: 'disc' } as React.CSSProperties} />
        <button className="btn-primary" style={{ marginTop: 18 }} disabled={busy}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
      <a className="btn btn-ghost" href="/staff"
        style={{ display: 'block', textAlign: 'center', textDecoration: 'none' }}>
        I&apos;m floor staff
      </a>
    </div>
  );
}

function LockedCard({ item, onAct }: { item: LockedItem; onAct: () => void }) {
  const unlocked = item.state === 'unlocked';
  return (
    <div className={`item ${unlocked ? 'unlocked' : 'locked'}`}>
      <div className="head">
        <div className="title">
          {item.title}
          <div className="desc">
            {item.outlet} · {item.checklist} · {item.forRole}
          </div>
        </div>
        {item.escalationLevel > 0 && !unlocked && (
          <span className="tag locked">Escalated ×{item.escalationLevel}</span>
        )}
      </div>

      <div className="lockbox">
        {unlocked ? (
          <div className="row">
            <span className="label">Reopened until</span>
            <span><strong>{relative(item.unlockExpiresAt!)}</strong></span>
          </div>
        ) : (
          <>
            <div className="row">
              <span className="label">Locked</span>
              <span>{relative(item.lockedAt)}</span>
            </div>
            <div className="row">
              <span className="label">Can unlock</span>
              <span>{item.empoweredRoles.join(', ')}</span>
            </div>
            {item.escalatesAt && (
              <div className="row">
                <span className="label">Escalates</span>
                <span>{relative(item.escalatesAt)}</span>
              </div>
            )}
          </>
        )}
      </div>

      {item.youCanUnlock ? (
        <button className="btn-primary" style={{ marginTop: 12 }} onClick={onAct}>
          {unlocked ? 'Resolve it yourself' : 'Unlock or resolve'}
        </button>
      ) : (
        <div className="banner info" style={{ marginTop: 12, marginBottom: 0 }}>
          Waiting on {item.empoweredRoles.join(' or ')}. It reaches you when it escalates.
        </div>
      )}
    </div>
  );
}

function SubmissionCard({ item, onOpen }: { item: ReviewItem; onOpen: () => void }) {
  return (
    <div className={`item ${item.outOfBounds ? 'locked' : ''}`}>
      <div className="head">
        <div className="title">
          {item.title}
          <div className="desc">{item.outlet} · by {item.by}</div>
          {item.valueNumber !== null && (
            <div className="due" style={item.outOfBounds
              ? { color: 'var(--locked)', fontWeight: 700 } : undefined}>
              {item.valueNumber}{item.unit ?? ''}
              {item.outOfBounds &&
                ` — outside ${item.minValue} to ${item.maxValue}${item.unit ?? ''}`}
            </div>
          )}
          {item.valueText && <div className="due">{item.valueText}</div>}
          {item.comment && <div className="due">“{item.comment}”</div>}
        </div>
        <span className={`tag ${statusTone(item)}`}>{statusLabel(item)}</span>
      </div>
      <button className="btn-ghost" style={{ marginTop: 12 }} onClick={onOpen}>
        {item.status === 'submitted' ? 'Review' : 'View'}
      </button>
    </div>
  );
}

function ActionSheet({ item, defaultWindow, onClose, onDone }: {
  item: LockedItem; defaultWindow: number; onClose: () => void; onDone: () => void;
}) {
  const [mode, setMode] = useState<'unlock' | 'complete' | 'waive'>(
    item.state === 'unlocked' ? 'complete' : 'unlock'
  );
  const [comment, setComment] = useState('');
  const [value, setValue] = useState('');
  const [minutes, setMinutes] = useState(String(defaultWindow));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function go() {
    setBusy(true); setError(null);
    try {
      const url = mode === 'unlock' ? '/api/manager/unlock' : '/api/manager/resolve';
      const body = mode === 'unlock'
        ? { lockId: item.lockId, comment, windowMinutes: Number(minutes) }
        : { lockId: item.lockId, action: mode, comment, value };

      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error); return; }
      onDone();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <h3>{item.title}</h3>
        <p className="lede">{item.outlet} · {item.checklist}</p>
        {error && <div className="banner error">{error}</div>}

        <div className="segmented">
          {item.state !== 'unlocked' && (
            <button className={mode === 'unlock' ? 'on' : ''} onClick={() => setMode('unlock')}>
              Let staff do it
            </button>
          )}
          <button className={mode === 'complete' ? 'on' : ''} onClick={() => setMode('complete')}>
            I did it
          </button>
          <button className={mode === 'waive' ? 'on' : ''} onClick={() => setMode('waive')}>
            Not needed
          </button>
        </div>

        <p className="lede" style={{ fontSize: 13, marginTop: 12 }}>
          {mode === 'unlock' &&
            'Reopens the task for staff for a limited time. It locks again if they do not finish.'}
          {mode === 'complete' &&
            'Records that you completed it yourself. Kept separate from staff completions in reports.'}
          {mode === 'waive' &&
            'Records that the task did not apply today. Never counted as completed, and shown to the owner.'}
        </p>

        {mode === 'unlock' && (
          <>
            <label>Reopen for</label>
            <select value={minutes} onChange={(e) => setMinutes(e.target.value)}>
              <option value="15">15 minutes</option>
              <option value="30">30 minutes</option>
              <option value="60">1 hour</option>
              <option value="120">2 hours</option>
            </select>
          </>
        )}

        {mode === 'complete' && item.proof === 'number' && (
          <>
            <label>
              Reading{item.unit ? ` (${item.unit})` : ''}
              {item.minValue !== null && ` — expected ${item.minValue} to ${item.maxValue}`}
            </label>
            <input type="number" inputMode="decimal" value={value}
              onChange={(e) => setValue(e.target.value)} />
          </>
        )}

        <label>Reason (recorded permanently)</label>
        <textarea value={comment} onChange={(e) => setComment(e.target.value)}
          placeholder={
            mode === 'waive'
              ? 'e.g. Delivery did not arrive, so nothing to check in'
              : 'e.g. Rush during service, staff were reassigned'
          } />

        <div className="btn-row" style={{ marginTop: 18 }}>
          <button className="btn-ghost" onClick={onClose} disabled={busy}>Cancel</button>
          <button className="btn-primary" onClick={go} disabled={busy || comment.trim().length < 5}>
            {busy ? 'Saving…' : 'Confirm'}
          </button>
        </div>
      </div>
    </div>
  );
}

function ReviewSheet({ item, canReview, onClose, onDone }: {
  item: ReviewItem; canReview: boolean; onClose: () => void; onDone: () => void;
}) {
  const [note, setNote] = useState('');
  const [photo, setPhoto] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!item.photoPath) return;
    fetch(`/api/manager/photo?path=${encodeURIComponent(item.photoPath)}`)
      .then((r) => r.json())
      .then((d) => setPhoto(d.url ?? null))
      .catch(() => setPhoto(null));
  }, [item.photoPath]);

  async function decide(decision: 'approved' | 'rejected') {
    setBusy(true); setError(null);
    try {
      const res = await fetch('/api/manager/review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ submissionId: item.id, decision, note }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error); return; }
      onDone();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <h3>{item.title}</h3>
        <p className="lede">{item.outlet} · by {item.by} · {time(item.submittedAt)}</p>
        {error && <div className="banner error">{error}</div>}

        {item.outOfBounds && (
          <div className="banner error">
            Reading {item.valueNumber}{item.unit ?? ''} is outside the expected
            range of {item.minValue} to {item.maxValue}{item.unit ?? ''}.
          </div>
        )}

        {item.valueNumber !== null && !item.outOfBounds && (
          <div className="banner info">Reading: {item.valueNumber}{item.unit ?? ''}</div>
        )}
        {item.valueText && <div className="banner info">{item.valueText}</div>}
        {item.comment && <div className="banner info">“{item.comment}”</div>}
        {item.wasLate && <div className="banner info">Submitted after the due time.</div>}

        {item.photoPath
          ? (photo
              ? <img className="preview" src={photo} alt="Submitted proof" />
              : <div className="spinner" />)
          : <div className="banner info">No photo on this submission.</div>}

        {canReview && item.status === 'submitted' ? (
          <>
            <label>Note (required if sending back)</label>
            <textarea value={note} onChange={(e) => setNote(e.target.value)}
              placeholder="What needs fixing?" />
            <div className="btn-row" style={{ marginTop: 18 }}>
              <button className="btn-ghost" onClick={() => decide('rejected')}
                disabled={busy || note.trim().length < 5}>
                Send back
              </button>
              <button className="btn-primary" onClick={() => decide('approved')} disabled={busy}>
                Approve
              </button>
            </div>
          </>
        ) : (
          <button className="btn-ghost" style={{ marginTop: 18 }} onClick={onClose}>Close</button>
        )}
      </div>
    </div>
  );
}

// --------------------------------------------------------------------------

function statusLabel(s: ReviewItem): string {
  if (s.outOfBounds) return 'Out of range';
  if (s.status === 'approved') return 'Approved';
  if (s.status === 'rejected') return 'Sent back';
  if (s.status === 'completed_by_manager') return 'By manager';
  if (s.status === 'waived') return 'Waived';
  return 'Awaiting review';
}

function statusTone(s: ReviewItem): string {
  if (s.outOfBounds || s.status === 'rejected') return 'locked';
  if (s.status === 'approved') return 'ok';
  return 'warn';
}

function time(iso: string): string {
  return new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hour12: true })
    .format(new Date(iso));
}

function relative(iso: string): string {
  const diff = new Date(iso).getTime() - Date.now();
  const mins = Math.round(Math.abs(diff) / 60_000);
  const text = mins < 60 ? `${mins} min` : `${Math.floor(mins / 60)}h ${mins % 60}m`;
  return diff >= 0 ? `in ${text}` : `${text} ago`;
}
