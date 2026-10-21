'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { loginEmail } from '@/lib/login-id';
import { CameraCapture } from '@/components/camera-capture';

interface Q { id: string; prompt: string; notes: string | null; section: string | null; photoRequired?: boolean }
type Ans = { yesNo: string | null; comment: string | null; photoPath?: string | null; flagged?: boolean };
interface Data {
  level: number; canFill?: boolean; outlets: { id: string; name: string }[]; outletId: string; outletName: string;
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
  const [qIndex, setQIndex] = useState(0);
  const [showComment, setShowComment] = useState<Set<string>>(new Set());
  const [showMedia, setShowMedia] = useState<Set<string>>(new Set());
  const [cameraFor, setCameraFor] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const jumped = useRef(false);
  const fetching = useRef(new Set<string>());

  const load = useCallback(async (outletId?: string, period?: string) => {
    const qs = new URLSearchParams();
    if (outletId) qs.set('outletId', outletId);
    if (period) qs.set('period', period);
    const res = await fetch(`/api/audit?${qs}`, { cache: 'no-store' });
    const d = await res.json();
    if (!res.ok) { setError(d.error ?? 'Could not load the audit.'); return; }
    setError(''); dirty.current = false; setData(d); setAnswers(d.answers ?? {});
    const first = (d.questions as Q[]).findIndex((q) => !d.answers?.[q.id]?.yesNo);
    setQIndex(first === -1 ? 0 : first); jumped.current = true;
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

  const editable = Boolean(data && (data.canFill ?? data.level === 2) && data.period === data.currentPeriod && data.audit?.status !== 'complete');

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

  async function showPhoto(path: string) {
    if (urls[path] || fetching.current.has(path)) return;
    fetching.current.add(path);
    try {
      const res = await fetch(`/api/manager/line-check/photo-url?path=${encodeURIComponent(path)}`);
      const d = await res.json();
      if (res.ok) setUrls((u) => ({ ...u, [path]: d.url }));
    } catch { /* the photo just does not preview */ }
  }

  async function uploadPhoto(q: Q, file: File) {
    if (!data) return;
    setCameraFor(null); setUploading(true); setError('');
    try {
      const form = new FormData();
      form.append('file', file); form.append('questionId', q.id); form.append('outletId', data.outletId);
      const res = await fetch('/api/audit/photo', { method: 'POST', body: form });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || 'Photo upload failed.');
      setAns(q.id, { photoPath: d.photoPath });
      setUrls((u) => ({ ...u, [d.photoPath]: URL.createObjectURL(file) }));
    } catch (e: any) {
      setError(e.message || 'Photo upload failed.');
    } finally {
      setUploading(false);
    }
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
        <h2>FSSAI Audit sign in</h2>
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
          <h1>FSSAI Audit</h1>
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
                {!(data.canFill ?? data.level === 2) && <div className="desc" style={{ marginTop: 6 }}>Only the Operations Manager fills in the audit. You can read it here once it is saved.</div>}
              </>
            )}
          </div>
        )}

        {editable && questions.length > 0 && (() => {
          const q = questions[Math.min(qIndex, questions.length - 1)];
          const a = answers[q.id] ?? { yesNo: null, comment: null };
          const isLast = qIndex >= questions.length - 1;
          const commentOpen = showComment.has(q.id) || Boolean(a.comment);
          const mediaOpen = showMedia.has(q.id) || Boolean(a.photoPath) || Boolean(q.photoRequired);
          const needsPhoto = Boolean(q.photoRequired) && a.yesNo !== 'na' && !a.photoPath;
          const canGo = Boolean(a.yesNo) && !needsPhoto && !uploading;
          if (a.photoPath) void showPhoto(a.photoPath);
          return (
            <div className="card" key={q.id}>
              <div className="tag plain">Q{qIndex + 1} of {questions.length}</div>
              {q.section && <div className="desc" style={{ marginTop: 8, fontWeight: 600 }}>{q.section}</div>}
              <h2 style={{ marginTop: 10, fontSize: 16 }}>{q.prompt}</h2>
              {q.notes && <p className="desc" style={{ marginTop: 6 }}>{q.notes}</p>}
              <div className="btn-row" style={{ marginTop: 12 }}>
                {(['yes', 'no', 'na'] as const).map((v) => (
                  <button key={v} className={a.yesNo === v ? 'btn-primary' : 'btn-ghost'} onClick={() => setAns(q.id, { yesNo: v })}>
                    {v === 'na' ? 'N/A' : v === 'yes' ? 'Yes' : 'No'}
                  </button>
                ))}
              </div>
              <div className="btn-row" style={{ marginTop: 12 }}>
                <button type="button" className={commentOpen ? 'btn-primary' : 'btn-ghost'} onClick={() => setShowComment((p) => new Set(p).add(q.id))}>💬 Comments / Corrective actions</button>
                <button type="button" className={mediaOpen ? 'btn-primary' : 'btn-ghost'} onClick={() => setShowMedia((p) => new Set(p).add(q.id))}>📎 Media</button>
                <button type="button" className={a.flagged ? 'btn-primary' : 'btn-ghost'} onClick={() => setAns(q.id, { flagged: !a.flagged })}>🚩 Flag</button>
              </div>
              {commentOpen && (
                <textarea style={{ marginTop: 12 }} value={a.comment ?? ''} placeholder="Comments / Corrective actions (if applicable)"
                  onChange={(e) => setAns(q.id, { comment: e.target.value })} />
              )}
              {mediaOpen && (
                <div style={{ marginTop: 12 }}>
                  <label style={{ marginTop: 0 }}>Photo {q.photoRequired ? '(required)' : '(optional)'}</label>
                  <button type="button" className="btn-ghost" disabled={uploading} onClick={() => setCameraFor(q.id)}>
                    {a.photoPath ? 'Retake photo' : 'Take photo'}
                  </button>
                  {uploading && <p className="lede">Uploading…</p>}
                  {a.photoPath && urls[a.photoPath] && <img className="preview" src={urls[a.photoPath]} alt="Attached evidence" />}
                  {cameraFor === q.id && (
                    <CameraCapture compact={a.yesNo !== 'no'} onCapture={(f) => void uploadPhoto(q, f)} onClose={() => setCameraFor(null)} />
                  )}
                </div>
              )}
              {needsPhoto && <p className="lede" style={{ color: 'var(--locked)', marginTop: 8 }}>A photo is required for this question (or choose N/A).</p>}
              <div className="btn-row" style={{ marginTop: 20 }}>
                <button className="btn-ghost" disabled={qIndex === 0} onClick={() => setQIndex((i) => Math.max(0, i - 1))}>Back</button>
                {isLast ? (
                  <button className="btn-primary" disabled={!canGo || answered < questions.length}
                    onClick={() => { if (window.confirm('Complete this month\'s FSSAI audit? You will not be able to change it afterwards.')) void save(true); }}>
                    Complete audit
                  </button>
                ) : (
                  <button className="btn-primary" disabled={!canGo} onClick={() => setQIndex((i) => i + 1)}>Next</button>
                )}
              </div>
            </div>
          );
        })()}

        {!editable && sections.map((s) => (
          <section key={s.name} style={{ marginBottom: 8 }}>
            <h3 style={{ margin: '16px 0 8px' }}>{s.name}</h3>
            {s.qs.map((q) => {
              const a = answers[q.id];
              if (a?.photoPath) void showPhoto(a.photoPath);
              return (
                <div key={q.id} className="card" style={{ marginBottom: 10, boxShadow: 'none' }}>
                  <div style={{ fontWeight: 600 }}>{q.prompt}{a?.flagged ? ' 🚩' : ''}</div>
                  {q.notes && <div className="desc" style={{ marginTop: 4 }}>{q.notes}</div>}
                  <div style={{ marginTop: 8, fontWeight: 700, color: a?.yesNo === 'no' ? 'var(--locked)' : undefined }}>
                    {a?.yesNo === 'yes' ? 'Yes' : a?.yesNo === 'no' ? 'No' : a?.yesNo === 'na' ? 'N/A' : '—'}
                  </div>
                  {a?.comment && <div className="desc" style={{ marginTop: 4 }}>{a.comment}</div>}
                  {a?.photoPath && urls[a.photoPath] && <img className="preview" src={urls[a.photoPath]} alt="Evidence" />}
                </div>
              );
            })}
          </section>
        ))}

        {editable && (
          <div className="btn-row" style={{ margin: '16px 0' }}>
            <button className="btn-ghost" onClick={() => save(false)}>Save progress</button>
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
