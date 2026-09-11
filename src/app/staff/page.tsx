'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

// The floor-staff flow, as one screen with steps: pick outlet (once per
// device) -> pick your name -> PIN -> pick your shift -> checklist.
//
// Written as a single client component on purpose. The whole flow is one
// short-lived session on a shared device, and splitting it across routes
// would mean juggling state through the URL for no benefit to the user.

type Step = 'outlet' | 'staff' | 'pin' | 'shift' | 'list';

interface Outlet { id: string; name: string; org_id: string; timezone: string }
interface Staff { id: string; name: string; role: string; level: number; needsPin: boolean }
interface Shift { id: string; name: string; start_time: string; end_time: string }

interface Item {
  id: string; title: string; description: string | null;
  proof: 'none' | 'photo' | 'number' | 'text';
  proofRequired: boolean; requiresApproval: boolean;
  unit: string | null; minValue: number | null; maxValue: number | null;
  dueAt: string;
  state: 'todo' | 'done' | 'locked' | 'unlocked' | 'waived';
  submission: {
    id: string; status: string; valueNumber: number | null; valueText: string | null;
    photoPath: string | null; comment: string | null; submittedAt: string;
    wasLate: boolean; outOfBounds: boolean; byName?: string;
  } | null;
  lock: {
    lockedAt: string; escalationLevel: number; escalatesAt: string | null;
    unlockExpiresAt: string | null; unlockComment: string | null;
    unlockableBy: string[]; nextLevelAt: string | null;
  } | null;
}

interface Run {
  runId: string; templateTitle: string; shiftName: string;
  startsAt: string; endsAt: string; items: Item[];
}

const OUTLET_KEY = 'checklist.outletId';

export default function StaffPage() {
  const [step, setStep] = useState<Step>('outlet');
  const [outlets, setOutlets] = useState<Outlet[]>([]);
  const [outlet, setOutlet] = useState<Outlet | null>(null);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [person, setPerson] = useState<Staff | null>(null);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [runs, setRuns] = useState<Run[]>([]);
  const [me, setMe] = useState<{ name: string; role?: string } | null>(null);
  const [timezone, setTimezone] = useState('Asia/Kolkata');
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [active, setActive] = useState<{ run: Run; item: Item } | null>(null);
  // Distinguish "still loading" from "loaded, but there is nothing there".
  // Conflating the two leaves a spinner running forever with no explanation.
  const [loadingOutlets, setLoadingOutlets] = useState(true);
  // What the server reported, shown when the list comes back empty so the
  // screen can be diagnosed from a screenshot rather than guesswork.
  const [diagnostic, setDiagnostic] = useState<string | null>(null);

  // --- device setup -------------------------------------------------------

  useEffect(() => {
    (async () => {
      // A unique query string defeats any cache between here and the server —
      // browser, service worker or CDN. An empty outlet list that was cached
      // before the data existed kept the picker empty long afterwards.
      const ask = (attempt: number) =>
        fetch(`/api/staff/outlets?t=${Date.now()}-${attempt}`, {
          cache: 'no-store',
          headers: { 'Cache-Control': 'no-cache' },
        });

      let res = await ask(1);
      let data = await res.json().catch(() => ({}));

      // One retry if the list is empty: distinguishes a genuinely empty
      // database from a stale response.
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
        // Surface the real reason. A misconfigured key or an unreachable
        // database is a very different problem from an empty database.
        setError(data.error ?? `The server returned an error (${res.status}).`);
        setLoadingOutlets(false);
        return;
      }
      const list: Outlet[] = data.outlets ?? [];
      setOutlets(list);
      setLoadingOutlets(false);

      // The outlet is a property of the device, not the person, so it is
      // remembered between sessions. Everything else is cleared each time.
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
    const res = await fetch(`/api/staff/login?outletId=${o.id}`, { cache: 'no-store' });
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
      const res = await fetch('/api/staff/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: person.id, outletId: outlet.id, pin: value }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error); setPin(''); return; }

      const shiftRes = await fetch('/api/staff/shift', { cache: 'no-store' });
      const shiftData = await shiftRes.json();
      setShifts(shiftData.shifts ?? []);
      setStep('shift');
    } finally {
      setBusy(false);
    }
  }

  async function chooseShift(shift: Shift) {
    setBusy(true); setError(null);
    try {
      await fetch('/api/staff/shift', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shiftId: shift.id }),
      });
      await loadChecklist();
      setStep('list');
    } finally {
      setBusy(false);
    }
  }

  const loadChecklist = useCallback(async () => {
    const res = await fetch('/api/staff/checklist', { cache: 'no-store' });
    const data = await res.json();
    if (!res.ok) { setError(data.error); return; }
    setRuns(data.runs ?? []);
    setMe(data.staff ?? null);
    setTimezone(data.timezone ?? timezone);
  }, [timezone]);

  async function signOut() {
    await fetch('/api/staff/logout', { method: 'POST' });
    setPerson(null); setPin(''); setRuns([]); setMe(null);
    setStep('staff');
  }

  // Lock states change with the clock, so refresh periodically while the
  // checklist is open. A staff member watching an item approach its deadline
  // should see it freeze without pulling to refresh.
  useEffect(() => {
    if (step !== 'list') return;
    const t = setInterval(() => { void loadChecklist(); }, 60_000);
    return () => clearInterval(t);
  }, [step, loadChecklist]);

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
              <span className="meta">{s.role}{s.needsPin ? ' · set your PIN' : ''}</span>
            </span>
            <span className="chev">›</span>
          </button>
        ))}
        {staff.length === 0 && <p className="empty">No staff set up for this outlet yet.</p>}
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

  if (step === 'shift') {
    return (
      <Screen title="Which shift are you on?" lede={outlet?.name} onBack={signOut} backLabel="Not me">
        {shifts.map((s) => (
          <button key={s.id} className="pick" disabled={busy} onClick={() => chooseShift(s)}>
            <span>
              <span className="name">{s.name}</span>
              <span className="meta">{s.start_time.slice(0, 5)} – {s.end_time.slice(0, 5)}</span>
            </span>
            <span className="chev">›</span>
          </button>
        ))}
        {shifts.length === 0 && <p className="empty">No shifts set up for this outlet.</p>}
      </Screen>
    );
  }

  const allItems = runs.flatMap((r) => r.items);
  const doneCount = allItems.filter((i) => i.state === 'done' || i.state === 'waived').length;

  return (
    <>
      <div className="topbar">
        <div>
          <h1>{me?.name}</h1>
          <div className="sub">{me?.role} · {outlet?.name}</div>
        </div>
        <button className="btn-ghost" style={{ width: 'auto', minHeight: 40, padding: '8px 14px' }}
          onClick={signOut}>Done</button>
      </div>

      <div className="shell">
        {error && <div className="banner error">{error}</div>}

        {allItems.length > 0 && (
          <div className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <strong>{doneCount} of {allItems.length} complete</strong>
              <span style={{ color: 'var(--muted)' }}>
                {allItems.filter((i) => i.state === 'locked').length > 0 &&
                  `${allItems.filter((i) => i.state === 'locked').length} locked`}
              </span>
            </div>
            <div className="progress">
              <div style={{ width: `${allItems.length ? (doneCount / allItems.length) * 100 : 0}%` }} />
            </div>
          </div>
        )}

        {runs.length === 0 && (
          <p className="empty">
            No checklist for your role on this shift today.<br />
            Check with your manager if you think this is wrong.
          </p>
        )}

        {runs.map((run) => (
          <section key={run.runId} style={{ marginBottom: 28 }}>
            <h2 style={{ marginTop: 20 }}>{run.templateTitle}</h2>
            <p className="lede">{run.shiftName} shift</p>
            {run.items.map((item) => (
              <ItemCard key={item.id} item={item} timezone={timezone}
                onOpen={() => setActive({ run, item })} />
            ))}
          </section>
        ))}
      </div>

      {active && (
        <SubmitSheet
          run={active.run}
          item={active.item}
          onClose={() => setActive(null)}
          onDone={async () => { setActive(null); await loadChecklist(); }}
        />
      )}
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

function ItemCard({ item, timezone, onOpen }: {
  item: Item; timezone: string; onOpen: () => void;
}) {
  const due = new Date(item.dueAt);
  const soon = item.state === 'todo' && due.getTime() - Date.now() < 15 * 60_000;

  return (
    <div className={`item ${item.state}${soon ? ' overdue-soon' : ''}`}>
      <div className="head">
        <div className="title">
          {item.title}
          {item.description && <div className="desc">{item.description}</div>}
          <div className="due">
            Due {fmt(due, timezone)}
            {item.proof !== 'none' && ` · ${proofLabel(item)}`}
            {item.requiresApproval && ' · needs manager approval'}
          </div>
        </div>
        <StateTag item={item} />
      </div>

      {/* Frozen items show everything: what it was, when it was due, who can
          reopen it, and when that climbs a level. Hiding it would only cause
          confusion on the floor. */}
      {item.lock && item.state !== 'done' && (
        <div className="lockbox">
          {item.state === 'locked' ? (
            <>
              <div className="row">
                <span className="label">Locked</span>
                <span>{fmt(new Date(item.lock.lockedAt), timezone)}</span>
              </div>
              <div className="row">
                <span className="label">Can unlock</span>
                <span>{item.lock.unlockableBy.join(', ') || 'Manager'}</span>
              </div>
              {item.lock.nextLevelAt && (
                <div className="row">
                  <span className="label">Escalates</span>
                  <span>{relative(new Date(item.lock.nextLevelAt))}</span>
                </div>
              )}
            </>
          ) : (
            <>
              <div className="row">
                <span className="label">Unlocked — finish it</span>
                <span><strong>{relative(new Date(item.lock.unlockExpiresAt!))}</strong></span>
              </div>
              {item.lock.unlockComment && (
                <div className="row">
                  <span className="label">Manager note</span>
                  <span>{item.lock.unlockComment}</span>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {item.submission && (
        <div className="lockbox">
          <div className="row">
            <span className="label">Done by</span>
            <span>{item.submission.byName ?? 'Staff'} · {fmt(new Date(item.submission.submittedAt), timezone)}</span>
          </div>
          {item.submission.valueNumber !== null && (
            <div className="row">
              <span className="label">Reading</span>
              <span style={item.submission.outOfBounds ? { color: 'var(--locked)', fontWeight: 700 } : undefined}>
                {item.submission.valueNumber}{item.unit ?? ''}
                {item.submission.outOfBounds && ' — out of range'}
              </span>
            </div>
          )}
          {item.submission.valueText && (
            <div className="row"><span className="label">Note</span><span>{item.submission.valueText}</span></div>
          )}
        </div>
      )}

      {(item.state === 'todo' || item.state === 'unlocked') && (
        <button className="btn-primary" style={{ marginTop: 12 }} onClick={onOpen}>
          {item.proof === 'photo' ? 'Take photo & complete' : 'Mark complete'}
        </button>
      )}
    </div>
  );
}

function StateTag({ item }: { item: Item }) {
  if (item.state === 'done') {
    return <span className={`tag ${item.submission?.outOfBounds ? 'locked' : 'ok'}`}>
      {item.submission?.wasLate ? 'Done late' : 'Done'}
    </span>;
  }
  if (item.state === 'waived') return <span className="tag plain">Waived</span>;
  if (item.state === 'locked') return <span className="tag locked">Locked</span>;
  if (item.state === 'unlocked') return <span className="tag warn">Unlocked</span>;
  return <span className="tag plain">To do</span>;
}

function SubmitSheet({ run, item, onClose, onDone }: {
  run: Run; item: Item; onClose: () => void; onDone: () => void;
}) {
  const [value, setValue] = useState('');
  const [comment, setComment] = useState('');
  const [photo, setPhoto] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [capturedAt, setCapturedAt] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const outOfRange =
    item.proof === 'number' && value !== '' &&
    ((item.minValue !== null && Number(value) < item.minValue) ||
     (item.maxValue !== null && Number(value) > item.maxValue));

  async function pick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setCapturedAt(new Date().toISOString());
    // Phone photos are 3-5MB. Compressing before upload keeps storage costs
    // and the staff member's mobile data sane.
    const compressed = await compress(file);
    setPhoto(compressed);
    setPreview(URL.createObjectURL(compressed));
  }

  async function submit() {
    setBusy(true); setError(null);
    try {
      const form = new FormData();
      // Generated here so a retry after a dropped connection is a no-op
      // rather than a duplicate.
      form.set('submissionId', crypto.randomUUID());
      form.set('runId', run.runId);
      form.set('itemId', item.id);
      if (value) form.set('value', value);
      if (comment) form.set('comment', comment);
      if (photo) form.set('photo', photo);
      if (capturedAt) form.set('capturedAt', capturedAt);

      const res = await fetch('/api/staff/submit', { method: 'POST', body: form });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? 'Could not save.'); return; }
      onDone();
    } catch {
      setError('No connection. Check your signal and try again.');
    } finally {
      setBusy(false);
    }
  }

  const canSubmit =
    !busy &&
    !(item.proof === 'photo' && item.proofRequired && !photo) &&
    !(item.proof === 'number' && item.proofRequired && value === '') &&
    !(item.proof === 'text' && item.proofRequired && !comment.trim() && !value.trim());

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <h3>{item.title}</h3>
        {item.description && <p className="lede">{item.description}</p>}
        {error && <div className="banner error">{error}</div>}

        {item.proof === 'photo' && (
          <>
            {/* capture="environment" opens the phone's own camera app, which
                gives far better image quality than an in-browser camera. */}
            <input ref={fileInput} type="file" accept="image/*" capture="environment"
              onChange={pick} style={{ display: 'none' }} />
            <button className="btn-ghost" onClick={() => fileInput.current?.click()}>
              {photo ? 'Retake photo' : 'Open camera'}
            </button>
            {preview && <img className="preview" src={preview} alt="Captured proof" />}
          </>
        )}

        {item.proof === 'number' && (
          <>
            <label>
              Reading{item.unit ? ` (${item.unit})` : ''}
              {item.minValue !== null && item.maxValue !== null &&
                ` — expected ${item.minValue} to ${item.maxValue}`}
            </label>
            <input type="number" inputMode="decimal" value={value}
              onChange={(e) => setValue(e.target.value)} placeholder="e.g. 3.5" />
            {outOfRange && (
              <div className="banner error" style={{ marginTop: 10 }}>
                That is outside the expected range. You can still submit it —
                your manager will be notified straight away.
              </div>
            )}
          </>
        )}

        {item.proof === 'text' && (
          <>
            <label>What did you find?</label>
            <textarea value={value} onChange={(e) => setValue(e.target.value)}
              placeholder="Describe what you checked" />
          </>
        )}

        <label>Comment {item.proof === 'text' ? '(optional)' : '(optional)'}</label>
        <textarea value={comment} onChange={(e) => setComment(e.target.value)}
          placeholder="Anything the manager should know" />

        <div className="btn-row" style={{ marginTop: 18 }}>
          <button className="btn-ghost" onClick={onClose} disabled={busy}>Cancel</button>
          <button className="btn-primary" onClick={submit} disabled={!canSubmit}>
            {busy ? 'Saving…' : 'Complete'}
          </button>
        </div>
      </div>
    </div>
  );
}

// --------------------------------------------------------------------------

async function compress(file: File, maxEdge = 1600, quality = 0.75): Promise<File> {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', quality)
    );
    if (!blob) return file;
    return new File([blob], 'photo.jpg', { type: 'image/jpeg' });
  } catch {
    // Never block a submission because compression failed — send the original.
    return file;
  }
}

function proofLabel(item: Item): string {
  const required = item.proofRequired ? 'required' : 'optional';
  if (item.proof === 'photo') return `photo ${required}`;
  if (item.proof === 'number') return `reading ${required}`;
  if (item.proof === 'text') return `note ${required}`;
  return '';
}

function fmt(d: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone, hour: '2-digit', minute: '2-digit', hour12: true,
  }).format(d);
}

function relative(to: Date): string {
  const diff = to.getTime() - Date.now();
  const mins = Math.round(Math.abs(diff) / 60_000);
  const text = mins < 60 ? `${mins} min` : `${Math.floor(mins / 60)}h ${mins % 60}m`;
  return diff >= 0 ? `in ${text}` : `${text} ago`;
}
