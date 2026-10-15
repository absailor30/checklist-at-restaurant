'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { loginEmail } from '@/lib/login-id';

interface Q { id: string; prompt: string; notes: string | null; section: string | null }
type Ans = { yesNo: string | null; comment: string | null };
interface Data {
  level: number; outlets: { id: string; name: string }[]; outletId: string; outletName: string;
  period: string; currentPeriod: string; questions: Q[];
  audit: { status: string; score: number | null; completedAt: string | null; auditorName: string | null } | null;
  answers: Record<string, Ans>;
  history: { period: string; status: string; score: number | null; completedAt: string | null }[];
}

const monthName = (p: string) => new Date(`${p}-01T00:00:00`).toLocaleString('en-GB', { month: 'long', year: 'numeric' });

export default function AuditPage() {
  const supabase = createClient();
  const [session, setSession] = useState<'checking' | 'in' | 'out'>('checking');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [busy, setBusy] = useState(false);

  const [data, setData] = useState<Data | null>(null);
  const [answers, setAnswers] = useState<Record<string, Ans>>({});
  const [error, setError] = useState('');
  const [saved, setSaved] = useState('');
  const dirty = useRef(false);

  const load = useCallback(async (outletId?: string, period?: string) => {
    const qs = new URLSearchParams();
    if (outletId) qs.set('outletId', outletId);
    if (period) qs.set('period', period);
    const res = await fetch(`/api/audit?${qs}`, { cache: 'no-store' });
    const d = await res.json();
    if (!res.ok) { setError(d.error ?? 'Could not load the audit.'); return; }
    setError(''); dirty.current = false; setData(d); setAnswers(d.answers ?? {});
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session ? 'in' : 'out');
      if (session) void load();
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s ? 'in' : 'out');
      if (s) void load();
    });
    return () => subscription.unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase]);

  const editable = Boolean(data && data.level === 2 && data.period === data.currentPeriod && data.audit?.status !== 'complete');

  async function save(complete = false) {
    if (!data) return false;
    setError(''); setSaved('');
    const res = await fetch('/api/audit', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ outletId: data.outletId, answers, complete }),
    });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) { setError(d.error ?? 'Could not save.'); return false; }
    dirty.current = false;
    setSaved(complete ? 'Audit completed.' : 'Saved.');
    if (complete) await load(data.outletId, data.period);
    return true;
  }

  // Save a moment after the last change, so nothing is lost if the page is closed.
  useEffect(() => {
    if (!editable || !dirty.current) return;
    const t = setTimeout(() => { void save(false); }, 1500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [answers]);

  const setAns = (id: string, partial: Partial<Ans>) => {
    dirty.current = true;
    setSaved('');
    setAnswers((prev) => ({ ...prev, [id]: { ...(prev[id] ?? { yesNo: null, comment: null }), ...partial } }));
  };

  async function login(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setLoginError('');
    const { error } = await supabase.auth.signInWithPassword({ email: loginEmail(email), password });
    setBusy(false);
    if (error) setLoginError(error.message);
  }

  if (session === 'checking') return <div className="shell" style={{ paddingTop: 32 }}><div className="spinner" /></div>;

  if (session === 'out') {
    return (
      <div className="shell" style={{ paddingTop: 32 }}>
        <h2>Monthly audit sign in</h2>
        <p className="lede">Same account as the manager dashboard.</p>
        {loginError && <div className="banner error">{loginError}</div>}
        <form className="card" onSubmit={login}>
          <label htmlFor="email" style={{ marginTop: 0 }}>Email or username</label>
          <input id="email" type="text" autoCapitalize="none" autoCorrect="off" value={email} autoComplete="username"
            onChange={(e) => setEmail(e.target.value)} required />
          <label htmlFor="password">Password</label>
          <input id="password" type="password" value={password} autoComplete="current-password"
            onChange={(e) => setPassword(e.target.value)} required />
          <button type="submit" disabled={busy} className="btn-primary" style={{ marginTop: 16 }}>{busy ? 'Signing in…' : 'Sign in'}</button>
        </form>
      </div>
    );
  }

  const questions = data?.questions ?? [];
  const answered = questions.filter((q) => answers[q.id]?.yesNo).length;
  const sections = questions.reduce<{ name: string; qs: Q[] }[]>((acc, q) => {
    const name = q.section ?? 'Questions';
    const last = acc[acc.length - 1];
    if (last && last.name === name) last.qs.push(q); else acc.push({ name, qs: [q] });
    return acc;
  }, []);
  const fails = questions.filter((q) => answers[q.id]?.yesNo === 'no');

  return (
    <>
      <div className="topbar">
        <div>
          <h1>Monthly audit</h1>
          <div className="sub">{data ? `${data.outletName} · ${monthName(data.period)}` : ''}</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <a className="btn-ghost" href="/manager" style={{ width: 'auto', minHeight: 40, padding: '8px 14px', display: 'flex', alignItems: 'center', textDecoration: 'none' }}>Dashboard</a>
          <button className="btn-ghost" style={{ width: 'auto', minHeight: 40, padding: '8px 14px' }} onClick={() => supabase.auth.signOut()}>Sign out</button>
        </div>
      </div>

      <div className="shell">
        {error && <div className="banner error">{error}</div>}
        {!data && !error && <div className="spinner" />}

        {data && data.outlets.length > 1 && (
          <select value={data.outletId} onChange={(e) => void load(e.target.value)} style={{ marginBottom: 12 }}>
            {data.outlets.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
        )}

        {data && (
          <div className="card" style={{ boxShadow: 'none' }}>
            {data.audit?.status === 'complete' ? (
              <>
                <div style={{ fontSize: 20, fontWeight: 700 }}>{data.audit.score ?? '—'}% compliant</div>
                <div className="desc">
                  Completed{data.audit.completedAt ? ` ${new Date(data.audit.completedAt).toLocaleDateString('en-GB')}` : ''}
                  {data.audit.auditorName ? ` by ${data.audit.auditorName}` : ''} · {fails.length} item{fails.length === 1 ? '' : 's'} not compliant
                </div>
              </>
            ) : (
              <>
                <div style={{ fontWeight: 700 }}>{answered} of {questions.length} answered</div>
                <div className="progress"><div style={{ width: `${questions.length ? (answered / questions.length) * 100 : 0}%` }} /></div>
                {data.level !== 2 && <div className="desc" style={{ marginTop: 6 }}>Only L2 fills in the audit. You can read it here once it is saved.</div>}
              </>
            )}
          </div>
        )}

        {sections.map((s) => (
          <section key={s.name} style={{ marginBottom: 8 }}>
            <h3 style={{ margin: '16px 0 8px' }}>{s.name}</h3>
            {s.qs.map((q) => {
              const a = answers[q.id];
              return (
                <div key={q.id} className="card" style={{ marginBottom: 10, boxShadow: 'none' }}>
                  <div style={{ fontWeight: 600 }}>{q.prompt}</div>
                  {q.notes && <div className="desc" style={{ marginTop: 4 }}>{q.notes}</div>}
                  <div className="btn-row" style={{ marginTop: 10 }}>
                    {(['yes', 'no', 'na'] as const).map((v) => (
                      <button key={v} type="button" disabled={!editable}
                        className={a?.yesNo === v ? 'btn-primary' : 'btn-ghost'} onClick={() => setAns(q.id, { yesNo: v })}>
                        {v === 'na' ? 'N/A' : v === 'yes' ? 'Yes' : 'No'}
                      </button>
                    ))}
                  </div>
                  {(editable || a?.comment) && (a?.yesNo === 'no' || a?.comment) && (
                    <textarea style={{ marginTop: 10 }} disabled={!editable} value={a?.comment ?? ''}
                      placeholder="Comments / Corrective actions" onChange={(e) => setAns(q.id, { comment: e.target.value })} />
                  )}
                </div>
              );
            })}
          </section>
        ))}

        {editable && (
          <div className="btn-row" style={{ margin: '16px 0' }}>
            <button className="btn-ghost" onClick={() => save(false)}>Save progress</button>
            <button className="btn-primary" disabled={answered < questions.length}
              onClick={() => { if (window.confirm('Complete this month\'s audit? You will not be able to change it afterwards.')) void save(true); }}>
              Complete audit
            </button>
          </div>
        )}
        {saved && <p className="lede">{saved}</p>}

        {data && data.history.length > 0 && (
          <>
            <h3 style={{ margin: '24px 0 8px' }}>Past audits</h3>
            {data.history.map((h) => (
              <button key={h.period} className={h.period === data.period ? 'btn-primary' : 'btn-ghost'}
                style={{ marginRight: 8, marginBottom: 8, width: 'auto' }} onClick={() => void load(data.outletId, h.period)}>
                {monthName(h.period)} · {h.status === 'complete' ? `${h.score ?? '—'}%` : 'in progress'}
              </button>
            ))}
            {data.period !== data.currentPeriod && (
              <button className="btn-ghost" style={{ width: 'auto' }} onClick={() => void load(data.outletId)}>Back to this month</button>
            )}
          </>
        )}
      </div>
    </>
  );
}
