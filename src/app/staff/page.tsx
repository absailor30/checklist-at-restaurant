'use client';

import { useMemo, useState } from 'react';
import { L1_HARD_STOP, L1_QUESTIONS, STATIONS, type LineCheckQuestion } from '@/lib/line-check/questions';
import {
  canAdvance,
  scoreAnswer,
  type LineCheckAnswer,
  type YesNoNa,
} from '@/lib/line-check/score-answer';
import { bandOf } from '@/lib/scoring';

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

export default function StaffLineCheckPage() {
  const [stations, setStations] = useState<Record<number, StationState>>({
    1: emptyStation(),
    2: emptyStation(),
    3: emptyStation(),
  });
  const [active, setActive] = useState<number | null>(null);
  const [pauseDraft, setPauseDraft] = useState('');
  const [error, setError] = useState<string | null>(null);

  const overall = useMemo(() => {
    const parts = STATIONS.map((s) => stationScore(stations[s.id].answers));
    const scored = parts.reduce((n, p) => n + p.scored, 0);
    const points = parts.reduce((n, p) => n + p.points, 0);
    const waived = parts.reduce((n, p) => n + p.waived, 0);
    const percent = scored ? Math.round((points / scored) * 1000) / 10 : 0;
    return { scored, points, waived, percent, band: scored ? bandOf(percent) : '—' };
  }, [stations]);

  function patch(id: number, fn: (s: StationState) => StationState) {
    setStations((prev) => ({ ...prev, [id]: fn(prev[id]) }));
  }

  function openStation(id: number) {
    setError(null);
    patch(id, (s) => ({
      ...s,
      status: s.status === 'complete' ? 'complete' : 'in_progress',
    }));
    setActive(id);
  }

  function pauseStation(id: number) {
    if (!pauseDraft.trim()) {
      setError('Pause needs a reason so L3 can see why the station stalled.');
      return;
    }
    patch(id, (s) => ({ ...s, status: 'paused', pauseReason: pauseDraft.trim() }));
    setPauseDraft('');
    setActive(null);
  }

  function setAnswer(id: number, q: LineCheckQuestion, partial: Partial<LineCheckAnswer>) {
    patch(id, (s) => {
      const prev = s.answers[q.id] ?? { questionId: q.id };
      return { ...s, answers: { ...s.answers, [q.id]: { ...prev, ...partial, questionId: q.id } } };
    });
  }

  function next(id: number, q: LineCheckQuestion) {
    const st = stations[id];
    const a = st.answers[q.id];
    if (!canAdvance(q, a)) {
      setError('Answer this question fully before moving on.');
      return;
    }
    setError(null);
    if (st.index >= L1_QUESTIONS.length - 1) {
      patch(id, (s) => ({ ...s, status: 'complete', index: s.index }));
      setActive(null);
      return;
    }
    patch(id, (s) => ({ ...s, index: s.index + 1, status: 'in_progress' }));
  }

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
          q={q}
          a={a}
          onChange={(partial) => setAnswer(active, q, partial)}
        />

        {error && <p className="lede" style={{ color: 'var(--locked)' }}>{error}</p>}

        <div className="btn-row">
          <button className="btn-ghost" onClick={() => next(active, q)}>
            {st.index >= L1_QUESTIONS.length - 1 ? 'Complete station' : 'Next'}
          </button>
        </div>

        <label htmlFor="pause">Pause this station</label>
        <textarea
          id="pause"
          placeholder="Reason (repairs, wait on delivery…)"
          value={pauseDraft}
          onChange={(e) => setPauseDraft(e.target.value)}
        />
        <button className="btn-ghost" onClick={() => pauseStation(active)}>
          Pause and switch station
        </button>
      </div>
    );
  }

  return (
    <div className="shell">
      <header className="topbar">
        <div>
          <h1>Line check — L1</h1>
          <div className="sub">Sample bank for review · 12:00 hard stop · stations independent</div>
        </div>
      </header>

      <p className="lede">
        One question per page. Pause any station without losing answers. Overall {overall.percent}%
        {overall.band !== '—' ? ` · ${overall.band}` : ''}.
      </p>

      {STATIONS.map((s) => {
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
  );
}

function QuestionCard({
  q,
  a,
  onChange,
}: {
  q: LineCheckQuestion;
  a: LineCheckAnswer | undefined;
  onChange: (partial: Partial<LineCheckAnswer>) => void;
}) {
  const yesNo = (v: YesNoNa) => onChange({ yesNo: v });

  return (
    <article className="card">
      <div className="tag plain">Q{q.order} · {kindLabel(q.kind)}</div>
      <h2 style={{ marginTop: 10 }}>{q.prompt}</h2>
      {q.notes && <p className="lede">{q.notes}</p>}
      {q.expected && q.kind !== 'numeric_photo' && (
        <p className="lede">Expected: {q.expected}</p>
      )}

      {q.kind === 'numeric_photo' ? (
        <>
          <label htmlFor="temp">Reading {q.unit ?? ''}</label>
          <input
            id="temp"
            type="number"
            inputMode="decimal"
            value={a?.value ?? ''}
            onChange={(e) => onChange({ value: e.target.value === '' ? null : Number(e.target.value) })}
          />
          <PhotoField value={a?.photoDataUrl} onPick={(url) => onChange({ photoDataUrl: url })} required />
        </>
      ) : (
        <>
          <div className="btn-row" style={{ marginTop: 12 }}>
            <button
              className={a?.yesNo === 'yes' ? 'btn-primary' : 'btn-ghost'}
              onClick={() => yesNo('yes')}
            >
              Yes
            </button>
            <button
              className={a?.yesNo === 'no' ? 'btn-primary' : 'btn-ghost'}
              onClick={() => yesNo('no')}
            >
              No
            </button>
            {q.kind === 'yes_no_na' && (
              <button
                className={a?.yesNo === 'na' ? 'btn-primary' : 'btn-ghost'}
                onClick={() => yesNo('na')}
              >
                N/A
              </button>
            )}
          </div>
          {needsPhoto(q, a) && (
            <PhotoField value={a?.photoDataUrl} onPick={(url) => onChange({ photoDataUrl: url })} required />
          )}
          {needsReason(q, a) && (
            <>
              <label htmlFor="reason">Reason</label>
              <textarea
                id="reason"
                value={a?.reason ?? ''}
                onChange={(e) => onChange({ reason: e.target.value })}
                placeholder="What failed and what you did"
              />
            </>
          )}
        </>
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

function kindLabel(kind: LineCheckQuestion['kind']) {
  switch (kind) {
    case 'yes_no': return 'Yes / No';
    case 'yes_no_photo_on_no': return 'Photo if No';
    case 'yes_no_photo_always': return 'Photo always';
    case 'numeric_photo': return 'Temp + photo';
    case 'yes_no_na': return 'Yes / No / N/A';
    case 'yes_no_reason_on_no': return 'Reason if No';
    case 'yes_photo_no_reason': return 'Photo if Yes · reason if No';
  }
}

function PhotoField({
  value,
  onPick,
  required,
}: {
  value?: string | null;
  onPick: (url: string) => void;
  required?: boolean;
}) {
  return (
    <>
      <label htmlFor="photo">Photo {required ? '(required)' : '(optional)'}</label>
      <input
        id="photo"
        type="file"
        accept="image/*"
        capture="environment"
        onChange={async (e) => {
          const file = e.target.files?.[0];
          if (file) onPick(await fileToDataUrl(file));
        }}
      />
      {value && <img className="preview" src={value} alt="Attached evidence" />}
    </>
  );
}
