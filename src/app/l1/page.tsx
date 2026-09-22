'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { L1_HARD_STOP, L1_QUESTIONS, STATIONS, type LineCheckQuestion } from '@/lib/line-check/questions';
import { canAdvance, scoreAnswer, type LineCheckAnswer, type YesNoNa } from '@/lib/line-check/score-answer';
import { bandOf } from '@/lib/scoring';
import { ThemeSwitcher } from '@/components/theme-switcher';
import { NotificationBell } from '@/components/notifications';

type Step = 'outlet' | 'staff' | 'pin' | 'list';

interface Outlet { id: string; name: string; org_id: string; timezone: string; station_count?: number }
interface Staff { id: string; name: string; role: string; level: number; needsPin: boolean; shift?: string }

type StationStatus = 'idle' | 'in_progress' | 'paused' | 'complete';

interface StationState {
  status: StationStatus;
  pauseReason: string;
  index: number;
  answers: Record<string, LineCheckAnswer>;
}

function emptyStation(): StationState {
  return { status: 'idle', pauseReason: '', index: 0, answers: {} };
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function stationScore(answers: Record<string, LineCheckAnswer>) {
  let scored = 0;
  let points = 0;
  let waived = 0;
  for (const q of L1_QUESTIONS) {
    const s = scoreAnswer(q, answers[q.id]);
    if (s === null) waived++;
    else {
      scored++;
      points += s;
    }
  }
  const percent = scored ? Math.round((points / scored) * 1000) / 10 : 0;
  return { scored, points, waived, percent, band: scored ? bandOf(percent) : 'Poor' };
}

const OUTLET_KEY = 'checklist.outletId';

function draftKey(outletId: string, personId: string) {
  const day = new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  return `checklist.linecheck.draft.${outletId}.${personId}.${day}`;
}

export default function StaffLineCheckPage() {
  const [step, setStep] = useState<Step>('outlet');
  const [outlets, setOutlets] = useState<Outlet[]>([]);
  const [outlet, setOutlet] = useState<Outlet | null>(null);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [person, setPerson] = useState<Staff | null>(null);
  const [me, setMe] = useState<{ name: string; role?: string } | null>(null);
  const [timezone, setTimezone] = useState('Asia/Kolkata');
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loadingOutlets, setLoadingOutlets] = useState(true);
  const [diagnostic, setDiagnostic] = useState<string | null>(null);

  // Line Check state
  const [stations, setStations] = useState<Record<number, StationState>>({
    1: emptyStation(),
    2: emptyStation(),
    3: emptyStation(),
  });
  const [active, setActive] = useState<number | null>(null);
  const [pauseDraft, setPauseDraft] = useState('');

  // --- device setup -------------------------------------------------------

  useEffect(() => {
    (async () => {
      const ask = (attempt: number) =>
        fetch(`/api/l1/outlets?t=${Date.now()}-${attempt}`, {
          cache: 'no-store',
          headers: { 'Cache-Control': 'no-cache' },
        });

      let res = await ask(1);
      let data = await res.json().catch(() => ({}));

      if (res.ok && (data.outlets ?? []).length === 0) {
        await new Promise((r) => setTimeout(r, 400));
        res = await ask(2);
        data = await res.json().catch(() => ({}));
      }

      setDiagnostic(
        `server returned ${(data.outlets ?? []).length} outlets ` +
        `of ${data.totalRows ?? 0} rows` +
        (data.serverTime ? ` at ${new Date(data.serverTime).toLocaleTimeString()}` : '')
      );

      if (!res.ok) {
        setError(data.error ?? `The server returned an error (${res.status}).`);
        setLoadingOutlets(false);
        return;
      }
      const list: Outlet[] = data.outlets ?? [];
      setOutlets(list);
      setLoadingOutlets(false);

      const saved = localStorage.getItem(OUTLET_KEY);
      const found = list.find((o) => o.id === saved);
      if (found) {
        setOutlet(found);
        setTimezone(found.timezone);
        void loadStaff(found);
      }
    })().catch(() => {
      setError('Could not reach the server. Check your connection and reload.');
      setLoadingOutlets(false);
    });
  }, []);

  const loadStaff = useCallback(async (o: Outlet) => {
    const res = await fetch(`/api/l1/login?outletId=${o.id}&t=${Date.now()}`, { cache: 'no-store' });
    const data = await res.json();
    setStaff(data.staff ?? []);
    setStep('staff');
  }, []);

  function chooseOutlet(o: Outlet) {
    localStorage.setItem(OUTLET_KEY, o.id);
    setOutlet(o);
    setTimezone(o.timezone);
    void loadStaff(o);
  }

  // --- sign in ------------------------------------------------------------

  async function submitPin(value: string) {
    if (!person || !outlet) return;
    setBusy(true); setError(null);
    try {
      const res = await fetch('/api/l1/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: person.id, outletId: outlet.id, pin: value }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error); setPin(''); return; }

      // Logged in! Restore any in-progress answers from before a refresh/crash.
      try {
        const saved = localStorage.getItem(draftKey(outlet.id, person.id));
        if (saved) setStations(JSON.parse(saved));
      } catch { /* corrupt or missing draft, start fresh */ }
      setMe({ name: person.name, role: person.role });
      setStep('list');
    } finally {
      setBusy(false);
    }
  }

  async function signOut() {
    await fetch('/api/l1/logout', { method: 'POST' });
    if (outlet && person) {
      try { localStorage.removeItem(draftKey(outlet.id, person.id)); } catch { /* ignore */ }
    }
    setPerson(null); setPin(''); setMe(null);
    setStations({ 1: emptyStation(), 2: emptyStation(), 3: emptyStation() });
    setStep('staff');
  }

  // --- line check logic ---------------------------------------------------

  // This outlet may run fewer than 3 stations — a smaller outlet doesn't
  // need to pretend it has stations it doesn't.
  const activeStations = STATIONS.slice(0, outlet?.station_count ?? 3);

  const overall = useMemo(() => {
    const parts = activeStations.map((s) => stationScore(stations[s.id].answers));
    const scored = parts.reduce((n, p) => n + p.scored, 0);
    const points = parts.reduce((n, p) => n + p.points, 0);
    const waived = parts.reduce((n, p) => n + p.waived, 0);
    const percent = scored ? Math.round((points / scored) * 1000) / 10 : 0;
    return { scored, points, waived, percent, band: scored ? bandOf(percent) : '—' };
  }, [stations]);

  function patch(id: number, fn: (s: StationState) => StationState) {
    setStations((prev) => ({ ...prev, [id]: fn(prev[id]) }));
  }

  // Mirror in-progress answers to localStorage so a refresh, crash, or locked
  // phone mid-station doesn't silently wipe answers that haven't been synced
  // to the server yet (sync only happens on pause or complete).
  useEffect(() => {
    if (step !== 'list' || !outlet || !person) return;
    try {
      localStorage.setItem(draftKey(outlet.id, person.id), JSON.stringify(stations));
    } catch { /* storage full or unavailable, nothing we can do */ }
  }, [stations, step, outlet, person]);

  function openStation(id: number) {
    setError(null);
    patch(id, (s) => ({
      ...s,
      status: s.status === 'complete' ? 'complete' : 'in_progress',
    }));
    setActive(id);
  }

  async function syncStation(id: number, status: StationStatus, pReason: string = '') {
    const st = stations[id];
    const form = new FormData();
    form.append('stationNo', id.toString());
    form.append('status', status);
    if (pReason) form.append('pauseReason', pReason);

    // Photos are uploaded immediately on capture (see PhotoField), so this
    // request only ever carries small JSON — no more bundling every
    // question's photo into one giant request at completion time.
    const answersArray = Object.entries(st.answers).map(([qId, a]) => ({
      questionId: qId,
      yesNo: a.yesNo,
      value: a.value,
      reason: a.reason,
      flagged: a.flagged ?? false,
      photoPath: a.photoPath ?? null,
      aiVerified: a.aiVerified ?? null,
      aiNote: a.aiNote ?? null,
    }));

    form.append('answers', JSON.stringify(answersArray));

    setBusy(true);
    try {
      const res = await fetch('/api/l1/line-check/sync', { method: 'POST', body: form });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setError(d.error || 'Failed to sync station');
        return false;
      }
      return true;
    } catch (e) {
      setError('Network error syncing station');
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function pauseStation(id: number) {
    if (!pauseDraft.trim()) {
      setError('Pause needs a reason so L3 can see why the station stalled.');
      return;
    }
    const success = await syncStation(id, 'paused', pauseDraft.trim());
    if (success) {
      patch(id, (s) => ({ ...s, status: 'paused', pauseReason: pauseDraft.trim() }));
      setPauseDraft('');
      setActive(null);
    }
  }

  function setAnswer(id: number, q: LineCheckQuestion, partial: Partial<LineCheckAnswer>) {
    patch(id, (s) => {
      const prev = s.answers[q.id] ?? { questionId: q.id };
      return { ...s, answers: { ...s.answers, [q.id]: { ...prev, ...partial, questionId: q.id } } };
    });
  }

  async function next(id: number, q: LineCheckQuestion) {
    const st = stations[id];
    const a = st.answers[q.id];
    if (!canAdvance(q, a)) {
      setError('Answer this question fully before moving on.');
      return;
    }
    setError(null);
    if (st.index >= L1_QUESTIONS.length - 1) {
      // Completed!
      const success = await syncStation(id, 'complete');
      if (success) {
        patch(id, (s) => ({ ...s, status: 'complete', index: s.index }));
        setActive(null);
      }
      return;
    }
    // Advance local state
    patch(id, (s) => ({ ...s, index: s.index + 1, status: 'in_progress' }));
  }

  function prev(id: number) {
    setError(null);
    patch(id, (s) => ({ ...s, index: Math.max(0, s.index - 1) }));
  }

  // --- render -------------------------------------------------------------

  if (step === 'outlet') {
    return (
      <Screen title="Choose this device's outlet" lede="You only need to do this once on this device.">
        {error && <div className="banner error">{error}</div>}
        {loadingOutlets && <div className="spinner" />}
        {!loadingOutlets && outlets.length === 0 && !error && (
          <div className="card">
            <strong>No outlets set up yet</strong>
            <p className="lede" style={{ margin: '8px 0 14px' }}>
              The database is reachable but returned no restaurants. Create the
              demo data first, then come back here.
            </p>
            {diagnostic && (
              <p className="lede" style={{ fontSize: 12, margin: '0 0 14px' }}>
                {diagnostic}
              </p>
            )}
            <a className="btn btn-primary" href="/setup"
               style={{ display: 'block', textAlign: 'center', textDecoration: 'none' }}>
              Go to setup
            </a>
          </div>
        )}
        {outlets.map((o) => (
          <button key={o.id} className="pick" onClick={() => chooseOutlet(o)}>
            <span><span className="name">{o.name}</span></span>
            <span className="chev">›</span>
          </button>
        ))}
        <h2 style={{ fontSize: 16, marginTop: 28 }}>Appearance</h2>
        <p className="lede" style={{ fontSize: 13 }}>
          Set once for this device. Choose the colour-blind friendly set if
          red and green are hard to tell apart.
        </p>
        <ThemeSwitcher />
      </Screen>
    );
  }

  if (step === 'staff') {
    return (
      <Screen title="Who's working?" lede={outlet?.name} onBack={() => setStep('outlet')} backLabel="Change outlet">
        {staff.map((s) => (
          <button key={s.id} className="pick"
            onClick={() => { setPerson(s); setPin(''); setError(null); setStep('pin'); }}>
            <span>
              <span className="name">{s.name}</span>
              <span className="meta">
                {s.role}{s.shift ? ` · ${s.shift} shift` : ''}{s.needsPin ? ' · set your PIN' : ''}
              </span>
            </span>
            <span className="chev">›</span>
          </button>
        ))}
        {staff.length === 0 && <p className="empty">No L1 managers set up for this outlet yet.</p>}
        <a className="btn btn-ghost" href="/manager"
          style={{ display: 'block', textAlign: 'center', textDecoration: 'none', marginTop: 16 }}>
          Manager sign in
        </a>
      </Screen>
    );
  }

  if (step === 'pin') {
    const first = person?.needsPin;
    return (
      <Screen
        title={first ? 'Create your PIN' : `Hello, ${person?.name.split(' ')[0]}`}
        lede={first
          ? 'Choose a 4-digit PIN. You will use it every shift — do not share it.'
          : 'Enter your 4-digit PIN.'}
        onBack={() => { setPerson(null); setPin(''); setStep('staff'); }}
      >
        <div className="pindots">
          {[0, 1, 2, 3].map((i) => (
            <span key={i} className={`pindot${i < pin.length ? ' filled' : ''}`} />
          ))}
        </div>
        {error && <div className="banner error">{error}</div>}
        <div className="pinpad">
          {['1','2','3','4','5','6','7','8','9'].map((n) => (
            <button key={n} disabled={busy} onClick={() => {
              const next = pin + n;
              setPin(next);
              if (next.length === 4) void submitPin(next);
            }}>{n}</button>
          ))}
          <button onClick={() => { setPin(''); setError(null); }}>Clear</button>
          <button disabled={busy} onClick={() => {
            const next = pin + '0';
            setPin(next);
            if (next.length === 4) void submitPin(next);
          }}>0</button>
          <button onClick={() => setPin(pin.slice(0, -1))}>⌫</button>
        </div>
      </Screen>
    );
  }

  // --- list step (stations) -----------------------------------------------

  if (active !== null) {
    const st = stations[active];
    const q = L1_QUESTIONS[st.index];
    const a = st.answers[q.id];
    const progress = Math.round((st.index / L1_QUESTIONS.length) * 100);

    return (
      <div className="shell">
        <header className="topbar">
          <div>
            <h1>Station {active}</h1>
            <div className="sub">
              Question {st.index + 1} of {L1_QUESTIONS.length} · hard stop {L1_HARD_STOP}
            </div>
          </div>
          <button className="btn-ghost" style={{ width: 'auto' }} onClick={() => setActive(null)}>
            Stations
          </button>
        </header>

        <div className="progress" aria-label="Progress">
          <div style={{ width: `${progress}%` }} />
        </div>

        <QuestionCard
          key={q.id}
          q={q}
          a={a}
          stationNo={active}
          onChange={(partial) => setAnswer(active, q, partial)}
        />

        {error && <p className="lede" style={{ color: 'var(--locked)' }}>{error}</p>}

        <div className="btn-row">
          <button className="btn-ghost" onClick={() => prev(active)} disabled={busy || st.index === 0}>
            Back
          </button>
          <button className="btn-primary" onClick={() => next(active, q)} disabled={busy}>
            {busy ? 'Saving...' : st.index >= L1_QUESTIONS.length - 1 ? 'Complete station' : 'Next'}
          </button>
        </div>

        <label htmlFor="pause">Pause this station</label>
        <textarea
          id="pause"
          placeholder="Reason (repairs, wait on delivery…)"
          value={pauseDraft}
          onChange={(e) => setPauseDraft(e.target.value)}
        />
        <button className="btn-ghost" onClick={() => pauseStation(active)} disabled={busy}>
          {busy ? 'Saving...' : 'Pause and switch station'}
        </button>
      </div>
    );
  }

  return (
    <>
      <div className="topbar">
        <div>
          <h1>{me?.name}</h1>
          <div className="sub">{me?.role} · {outlet?.name}</div>
        </div>
        <div className="bellrow">
          <NotificationBell />
          <button className="btn-ghost" style={{ width: 'auto', minHeight: 40, padding: '8px 14px' }}
            onClick={signOut}>Done</button>
        </div>
      </div>

      <div className="shell">
        <header style={{ marginBottom: 20 }}>
          <h1>Line check — L1</h1>
          <div className="sub">Sample bank for review · 12:00 hard stop · stations independent</div>
        </header>

        <p className="lede">
          One question per page. Pause any station without losing answers. Overall {overall.percent}%
          {overall.band !== '—' ? ` · ${overall.band}` : ''}.
        </p>

        {activeStations.map((s) => {
          const st = stations[s.id];
          const sc = stationScore(st.answers);
          const done = Object.keys(st.answers).length;
          return (
            <article key={s.id} className={`item ${st.status === 'complete' ? 'done' : ''}`}>
              <div className="head">
                <div className="title">{s.name}</div>
                <span className={`tag ${st.status === 'complete' ? 'ok' : st.status === 'paused' ? 'warn' : 'plain'}`}>
                  {st.status.replace('_', ' ')}
                </span>
              </div>
              <div className="desc">
                {done}/{L1_QUESTIONS.length} answered
                {done ? ` · ${sc.percent}% ${sc.band}` : ''}
              </div>
              {st.pauseReason && <div className="due">Paused: {st.pauseReason}</div>}
              <div className="progress">
                <div style={{ width: `${(done / L1_QUESTIONS.length) * 100}%` }} />
              </div>
              <button className="btn-primary" style={{ marginTop: 12 }} onClick={() => openStation(s.id)}>
                {st.status === 'idle' ? 'Start' : st.status === 'complete' ? 'Review' : 'Resume'}
              </button>
            </article>
          );
        })}
      </div>
    </>
  );
}

// --------------------------------------------------------------------------

function Screen({ title, lede, children, onBack, backLabel }: {
  title: string; lede?: string; children: React.ReactNode;
  onBack?: () => void; backLabel?: string;
}) {
  return (
    <div className="shell" style={{ paddingTop: 32 }}>
      <h2>{title}</h2>
      {lede && <p className="lede">{lede}</p>}
      {children}
      {onBack && (
        <button className="btn-ghost" style={{ marginTop: 16 }} onClick={onBack}>
          {backLabel ?? 'Back'}
        </button>
      )}
    </div>
  );
}

function QuestionCard({
  q,
  a,
  stationNo,
  onChange,
}: {
  q: LineCheckQuestion;
  a: LineCheckAnswer | undefined;
  stationNo: number;
  onChange: (partial: Partial<LineCheckAnswer>) => void;
}) {
  const yesNo = (v: YesNoNa) => onChange({ yesNo: v });
  const [showComment, setShowComment] = useState(false);
  const [showMedia, setShowMedia] = useState(false);

  const commentRequired = needsReason(q, a);
  const mediaRequired = needsPhoto(q, a) || q.kind === 'numeric_photo';
  const commentOpen = showComment || commentRequired || Boolean(a?.reason);
  const mediaOpen = showMedia || mediaRequired || Boolean(a?.photoDataUrl);

  return (
    <article className="card">
      <div className="tag plain">Q{q.order}</div>
      <h2 style={{ marginTop: 10 }}>{q.prompt}</h2>
      {q.notes && <p className="lede">{q.notes}</p>}
      {q.expected && q.kind !== 'numeric_photo' && (
        <p className="lede">Expected: {q.expected}</p>
      )}

      {q.kind === 'numeric_photo' && (
        <>
          <label htmlFor="temp">Reading {q.unit ?? ''}</label>
          <input
            id="temp"
            type="number"
            inputMode="decimal"
            value={a?.value ?? ''}
            onChange={(e) => onChange({ value: e.target.value === '' ? null : Number(e.target.value) })}
          />
        </>
      )}

      {q.kind !== 'numeric_photo' && (
        <div className="btn-row" style={{ marginTop: 12 }}>
          <button className={a?.yesNo === 'yes' ? 'btn-primary' : 'btn-ghost'} onClick={() => yesNo('yes')}>
            Yes
          </button>
          <button className={a?.yesNo === 'no' ? 'btn-primary' : 'btn-ghost'} onClick={() => yesNo('no')}>
            No
          </button>
          <button className={a?.yesNo === 'na' ? 'btn-primary' : 'btn-ghost'} onClick={() => yesNo('na')}>
            N/A
          </button>
        </div>
      )}

      <div className="btn-row" style={{ marginTop: 12 }}>
        <button
          type="button"
          className={commentOpen ? 'btn-primary' : 'btn-ghost'}
          onClick={() => setShowComment((v) => !v)}
          aria-pressed={commentOpen}
          title="Comment"
        >
          💬 Comment{commentRequired ? ' *' : ''}
        </button>
        <button
          type="button"
          className={mediaOpen ? 'btn-primary' : 'btn-ghost'}
          onClick={() => setShowMedia((v) => !v)}
          aria-pressed={mediaOpen}
          title="Attach photo"
        >
          📎 Media{mediaRequired ? ' *' : ''}
        </button>
        <button
          type="button"
          className={a?.flagged ? 'btn-primary' : 'btn-ghost'}
          onClick={() => onChange({ flagged: !a?.flagged })}
          aria-pressed={Boolean(a?.flagged)}
          title="Flag for follow-up"
        >
          🚩 Flag
        </button>
      </div>

      {commentOpen && (
        <>
          <label htmlFor="reason">Comment {commentRequired ? '(required)' : '(optional)'}</label>
          <textarea
            id="reason"
            value={a?.reason ?? ''}
            onChange={(e) => onChange({ reason: e.target.value })}
            placeholder="What failed and what you did"
          />
        </>
      )}
      {mediaOpen && (
        <PhotoField
          value={a?.photoDataUrl}
          questionId={q.id}
          stationNo={stationNo}
          onUploaded={(photoDataUrl, photoPath, aiVerified, aiNote) => onChange({ photoDataUrl, photoPath, aiVerified, aiNote })}
          required={mediaRequired}
        />
      )}
    </article>
  );
}

function needsPhoto(q: LineCheckQuestion, a: LineCheckAnswer | undefined) {
  if (q.kind === 'yes_no_photo_always') return true;
  if (q.kind === 'yes_no_photo_on_no') return a?.yesNo === 'no';
  if (q.kind === 'yes_photo_no_reason') return a?.yesNo === 'yes';
  return false;
}

function needsReason(q: LineCheckQuestion, a: LineCheckAnswer | undefined) {
  if (q.kind === 'yes_photo_no_reason' || q.kind === 'yes_no_reason_on_no') return a?.yesNo === 'no';
  return false;
}


function PhotoField({
  value,
  questionId,
  stationNo,
  onUploaded,
  required,
}: {
  value?: string | null;
  questionId: string;
  stationNo: number;
  onUploaded: (photoDataUrl: string, photoPath: string, aiVerified: boolean | null, aiNote: string | null) => void;
  required?: boolean;
}) {
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [aiResult, setAiResult] = useState<{ verified: boolean | null; note: string | null } | null>(null);

  return (
    <>
      <label htmlFor="photo">Photo {required ? '(required)' : '(optional)'}</label>
      <input
        id="photo"
        type="file"
        accept="image/*"
        capture="environment"
        disabled={uploading}
        onChange={async (e) => {
          const file = e.target.files?.[0];
          if (!file) return;
          setUploading(true);
          setUploadError(null);
          try {
            const preview = await fileToDataUrl(file);
            const form = new FormData();
            form.append('file', file);
            form.append('questionId', questionId);
            form.append('stationNo', stationNo.toString());
            const res = await fetch('/api/l1/line-check/photo', { method: 'POST', body: form });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.error || 'Photo upload failed.');
            setAiResult(data.aiVerified === null ? null : { verified: data.aiVerified, note: data.aiNote });
            onUploaded(preview, data.photoPath, data.aiVerified ?? null, data.aiNote ?? null);
          } catch (err: any) {
            setUploadError(err.message || 'Photo upload failed.');
          } finally {
            setUploading(false);
            e.target.value = '';
          }
        }}
      />
      {uploading && <p className="lede">Uploading…</p>}
      {uploadError && <p className="lede" style={{ color: 'var(--locked)' }}>{uploadError}</p>}
      {value && <img className="preview" src={value} alt="Attached evidence" />}
      {aiResult && aiResult.verified === false && (
        <p className="lede" style={{ color: 'var(--locked)' }}>⚠️ AI check: {aiResult.note}</p>
      )}
      {aiResult && aiResult.verified === true && (
        <p className="lede" style={{ color: 'var(--ok, green)' }}>✅ AI check passed</p>
      )}
    </>
  );
}
