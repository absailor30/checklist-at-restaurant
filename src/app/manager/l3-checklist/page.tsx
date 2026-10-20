'use client';

import { useCallback, useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { loginEmail } from '@/lib/login-id';

type Ans = { yesNo: string | null; comment: string | null };
interface Data {
  canFill: boolean; outlets: { id: string; name: string }[]; outletId: string; outletName: string; today: string;
  items: { key: string; prompt: string }[]; answers: Record<string, Ans>;
  history: { date: string; yes: number; no: number; answers: Record<string, Ans> }[];
}

export default function L3ChecklistPage() {
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
  const [open, setOpen] = useState<string | null>(null);

  const load = useCallback(async (outletId?: string) => {
    const res = await fetch(`/api/l3-checklist${outletId ? `?outletId=${outletId}` : ''}`, { cache: 'no-store' });
    const d = await res.json();
    if (!res.ok) { setError(d.error ?? 'Could not load.'); return; }
    setError(''); setData(d); setAnswers(d.answers ?? {});
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session ? 'in' : 'out');
      if (session) void load();
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, s) => { setSession(s ? 'in' : 'out'); if (s) void load(); });
    return () => subscription.unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase]);

  const setAns = (key: string, partial: Partial<Ans>) => {
    setSaved('');
    setAnswers((p) => ({ ...p, [key]: { ...(p[key] ?? { yesNo: null, comment: null }), ...partial } }));
  };

  async function submit() {
    if (!data) return;
    setError(''); setSaved('');
    const res = await fetch('/api/l3-checklist', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ outletId: data.outletId, answers }) });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) { setError(d.error ?? 'Could not save.'); return; }
    setSaved('Saved.'); await load(data.outletId);
  }

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
        <h2>L3 Checklist sign in</h2>
        <p className="lede">Same account as the manager dashboard.</p>
        {loginError && <div className="banner error">{loginError}</div>}
        <form className="card" onSubmit={login}>
          <label htmlFor="email" style={{ marginTop: 0 }}>Email or username</label>
          <input id="email" type="text" autoCapitalize="none" autoCorrect="off" value={email} autoComplete="username" onChange={(e) => setEmail(e.target.value)} required />
          <label htmlFor="password">Password</label>
          <input id="password" type="password" value={password} autoComplete="current-password" onChange={(e) => setPassword(e.target.value)} required />
          <button type="submit" disabled={busy} className="btn-primary" style={{ marginTop: 16 }}>{busy ? 'Signing in…' : 'Sign in'}</button>
        </form>
      </div>
    );
  }

  const items = data?.items ?? [];
  const complete = items.length > 0 && items.every((i) => answers[i.key]?.yesNo);
  const doneToday = Boolean(data && data.history.some((h) => h.date === data.today));

  return (
    <>
      <div className="topbar">
        <div>
          <h1>L3 Checklist</h1>
          <div className="sub">{data ? `${data.outletName} · ${data.today}` : ''}</div>
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
        {data && !data.canFill && <div className="banner">Only L3 fills in this checklist. You can read the entries below.</div>}
        {data && doneToday && data.canFill && <div className="banner">Today's checklist is saved. You can change it and save again.</div>}

        {data && data.canFill && items.map((it) => {
          const a = answers[it.key];
          return (
            <div key={it.key} className="card" style={{ marginBottom: 10, boxShadow: 'none' }}>
              <div style={{ fontWeight: 600 }}>{it.prompt}</div>
              <div className="btn-row" style={{ marginTop: 10 }}>
                {(['yes', 'no'] as const).map((v) => (
                  <button key={v} className={a?.yesNo === v ? 'btn-primary' : 'btn-ghost'} onClick={() => setAns(it.key, { yesNo: v })}>{v === 'yes' ? 'Yes' : 'No'}</button>
                ))}
              </div>
              <textarea style={{ marginTop: 10 }} value={a?.comment ?? ''} placeholder="Comments (optional)" onChange={(e) => setAns(it.key, { comment: e.target.value })} />
            </div>
          );
        })}
        {data && data.canFill && (
          <button className="btn-primary" disabled={!complete} onClick={submit} style={{ margin: '8px 0 16px' }}>{doneToday ? 'Save changes' : 'Submit checklist'}</button>
        )}
        {saved && <p className="lede">{saved}</p>}

        {data && data.history.length > 0 && (
          <>
            <h3 style={{ margin: '20px 0 8px' }}>Previous entries</h3>
            {data.history.map((h) => (
              <div key={h.date} className="card" style={{ marginBottom: 8, boxShadow: 'none' }}>
                <button className="btn-ghost" style={{ width: '100%', textAlign: 'left' }} onClick={() => setOpen(open === h.date ? null : h.date)}>
                  {h.date} · {h.yes} yes{h.no ? <span style={{ color: 'var(--locked)', fontWeight: 700 }}> · {h.no} no</span> : ''}
                </button>
                {open === h.date && items.map((it) => (
                  <div key={it.key} style={{ marginTop: 8 }}>
                    <div style={{ fontSize: 13 }}>{it.prompt}: <strong style={{ color: h.answers[it.key]?.yesNo === 'no' ? 'var(--locked)' : undefined }}>{h.answers[it.key]?.yesNo === 'yes' ? 'Yes' : h.answers[it.key]?.yesNo === 'no' ? 'No' : '—'}</strong></div>
                    {h.answers[it.key]?.comment && <div className="desc">{h.answers[it.key]?.comment}</div>}
                  </div>
                ))}
              </div>
            ))}
          </>
        )}
      </div>
    </>
  );
}
