'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

const SHIFTS = [
  { id: 'morning', label: 'Morning shift' },
  { id: 'afternoon', label: 'Afternoon shift' },
  { id: 'evening', label: 'Evening shift' },
] as const;

export default function ManagerDashboard() {
  const router = useRouter();
  const supabase = createClient();
  const [sessionState, setSessionState] = useState<'checking' | 'in' | 'out'>('checking');

  // Login state
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loginBusy, setLoginBusy] = useState(false);
  const [loginError, setLoginError] = useState('');

  const [outlets, setOutlets] = useState<any[]>([]);
  const [role, setRole] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Review modal state
  const [reviewLevel, setReviewLevel] = useState<'L2' | 'L3' | null>(null);
  const [reviewRunId, setReviewRunId] = useState<string | null>(null);
  const [questions, setQuestions] = useState<any[]>([]);
  const [answers, setAnswers] = useState<Record<string, { yesNo?: string; reason?: string; flagged?: boolean }>>({});
  const [photos, setPhotos] = useState<Record<string, File>>({});
  const [showComment, setShowComment] = useState<Set<string>>(new Set());
  const [showMedia, setShowMedia] = useState<Set<string>>(new Set());
  const [qIndex, setQIndex] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [actions, setActions] = useState<any[]>([]);
  const [newQLevel, setNewQLevel] = useState<'L2' | 'L3'>('L2');
  const [newQPrompt, setNewQPrompt] = useState('');
  const [newQBusy, setNewQBusy] = useState(false);
  const [newQMessage, setNewQMessage] = useState('');
  const [team, setTeam] = useState<any[]>([]);
  const [teamOutlets, setTeamOutlets] = useState<any[]>([]);
  const [newL1Name, setNewL1Name] = useState('');
  const [newL1Shift, setNewL1Shift] = useState<'morning' | 'afternoon' | 'evening'>('morning');
  const [newL1Outlet, setNewL1Outlet] = useState('');
  const [teamBusy, setTeamBusy] = useState(false);
  const [teamMessage, setTeamMessage] = useState('');

  const canReviewL2 = role === 'L2 Manager' || role === 'Shift Manager';
  const canReviewL3 = role === 'L3 Owner' || role === 'General Manager' || role === 'Owner';

  const fetchOverview = async () => {
    try {
      const res = await fetch('/api/manager/line-check/overview');
      if (!res.ok) throw new Error('Failed to fetch overview');
      const data = await res.json();
      setOutlets(data.outlets || []);
      setRole(data.role || null);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const fetchActions = async () => {
    try {
      const res = await fetch('/api/manager/corrective-actions');
      const data = await res.json();
      if (res.ok) setActions(data.actions || []);
    } catch { /* non-critical */ }
  };

  const fetchTeam = async () => {
    try {
      const res = await fetch('/api/manager/team');
      const data = await res.json();
      if (res.ok) {
        setTeam(data.users || []);
        setTeamOutlets(data.outlets || []);
        if (!newL1Outlet && data.outlets?.[0]) setNewL1Outlet(data.outlets[0].id);
      }
    } catch { /* non-critical */ }
  };

  const addL1 = async () => {
    if (newL1Name.trim().length < 2 || !newL1Outlet) return;
    setTeamBusy(true);
    setTeamMessage('');
    try {
      const res = await fetch('/api/manager/team', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'add_l1', name: newL1Name.trim(), shift: newL1Shift, outletId: newL1Outlet }),
      });
      const data = await res.json();
      if (!res.ok) { setTeamMessage(data.error); return; }
      setNewL1Name('');
      void fetchTeam();
    } catch {
      setTeamMessage('The request did not complete.');
    } finally {
      setTeamBusy(false);
    }
  };

  const deactivateUser = async (userId: string) => {
    await fetch('/api/manager/team', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'deactivate', userId }),
    });
    void fetchTeam();
  };

  const addQuestion = async () => {
    if (newQPrompt.trim().length < 3) return;
    setNewQBusy(true);
    setNewQMessage('');
    try {
      const res = await fetch('/api/manager/line-check/questions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ level: newQLevel, prompt: newQPrompt.trim() }),
      });
      const data = await res.json();
      if (!res.ok) { setNewQMessage(data.error); return; }
      setNewQMessage('Added — it will appear on the next review.');
      setNewQPrompt('');
    } catch {
      setNewQMessage('The request did not complete.');
    } finally {
      setNewQBusy(false);
    }
  };

  const resolveAction = async (id: string) => {
    await fetch('/api/manager/corrective-actions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    void fetchActions();
  };

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) {
        setSessionState('out');
      } else {
        setSessionState('in');
        fetchOverview();
        fetchActions();
        fetchTeam();
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) {
        setSessionState('in');
        fetchOverview();
        fetchActions();
        fetchTeam();
      } else {
        setSessionState('out');
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [supabase]);

  useEffect(() => {
    if (sessionState !== 'in') return;
    const interval = setInterval(() => {
      fetchOverview();
      fetchActions();
      fetchTeam();
    }, 15000);
    return () => clearInterval(interval);
  }, [sessionState]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginBusy(true);
    setLoginError('');
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoginBusy(false);
    if (error) setLoginError(error.message);
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
  };

  const startReview = async (runId: string, level: 'L2' | 'L3') => {
    setReviewLevel(level);
    setReviewRunId(runId);
    setAnswers({});
    setPhotos({});
    setShowComment(new Set());
    setShowMedia(new Set());
    setQIndex(0);
    try {
      const res = await fetch(`/api/manager/line-check/questions?level=${level}`);
      if (!res.ok) throw new Error('Failed to fetch questions');
      const data = await res.json();
      setQuestions(data.questions || []);
    } catch (err: any) {
      alert(err.message);
      setReviewLevel(null);
    }
  };

  const submitReview = async () => {
    if (!reviewLevel || !reviewRunId) return;

    if (Object.keys(answers).length < questions.length) {
      alert('Please answer all questions');
      return;
    }

    setSubmitting(true);
    try {
      const formattedAnswers = Object.entries(answers).map(([qId, val]) => ({
        question_id: qId,
        yes_no: val.yesNo,
        reason: val.reason,
        flagged: Boolean(val.flagged),
      }));

      const form = new FormData();
      form.append('run_id', reviewRunId);
      form.append('level', reviewLevel);
      form.append('answers', JSON.stringify(formattedAnswers));
      for (const [qId, file] of Object.entries(photos)) {
        form.append(`photo_${qId}`, file);
      }

      const res = await fetch('/api/manager/line-check/submit', {
        method: 'POST',
        body: form,
      });

      if (!res.ok) throw new Error('Failed to submit review');

      setReviewLevel(null);
      setReviewRunId(null);
      fetchOverview();
      fetchActions();
      fetchTeam();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  if (sessionState === 'checking') return <div className="shell" style={{ paddingTop: 32 }}><div className="spinner" /></div>;

  if (sessionState === 'out') {
    return (
      <div className="shell" style={{ paddingTop: 32 }}>
        <h2>Manager sign in</h2>
        <p className="lede">
          Managers sign in with an email and password, not a PIN — approvals and
          unlocks are recorded against your name permanently.
        </p>
        {loginError && <div className="banner error">{loginError}</div>}
        <form className="card" onSubmit={handleLogin}>
          <div>
            <label htmlFor="email" style={{ marginTop: 0 }}>Email</label>
            <input
              id="email"
              type="email"
              value={email}
              autoComplete="username"
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div>
            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              value={password}
              autoComplete="current-password"
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          <button
            type="submit"
            disabled={loginBusy}
            className="btn-primary"
            style={{ marginTop: 16 }}
          >
            {loginBusy ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
        <a className="btn btn-ghost" href="/l1" style={{ display: 'block', textAlign: 'center', textDecoration: 'none', marginTop: 16, lineHeight: '22px' }}>
          I'm an L1 manager
        </a>
      </div>
    );
  }

  if (loading) return <div className="shell" style={{ paddingTop: 32 }}><div className="spinner" /></div>;
  if (error) return <div className="shell" style={{ paddingTop: 32 }}><div className="banner error">Error: {error}</div></div>;

  return (
    <>
      <div className="topbar">
        <div>
          <h1>Manager Dashboard</h1>
          <div className="sub">Line Check Reviews</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {canReviewL3 && (
            <a className="btn-ghost" href="/l3" style={{ width: 'auto', minHeight: 40, padding: '8px 14px', display: 'flex', alignItems: 'center', textDecoration: 'none' }}>
              Report
            </a>
          )}
          <button className="btn-ghost" style={{ width: 'auto', minHeight: 40, padding: '8px 14px' }} onClick={handleLogout}>
            Sign out
          </button>
        </div>
      </div>

      <div className="shell">
        {canReviewL3 && (
          <div className="card" style={{ marginBottom: 16 }}>
            <strong>Add a question</strong>
            <p className="lede" style={{ fontSize: 13, margin: '8px 0 12px' }}>
              Adds a question just for your brand's L2 or L3 review. The standard questions stay as they are for every brand.
            </p>
            {newQMessage && <div className="banner info" style={{ marginBottom: 8 }}>{newQMessage}</div>}
            <div className="btn-row">
              <button className={newQLevel === 'L2' ? 'btn-primary' : 'btn-ghost'} onClick={() => setNewQLevel('L2')}>L2</button>
              <button className={newQLevel === 'L3' ? 'btn-primary' : 'btn-ghost'} onClick={() => setNewQLevel('L3')}>L3</button>
            </div>
            <textarea
              style={{ marginTop: 8 }}
              value={newQPrompt}
              onChange={(e) => setNewQPrompt(e.target.value)}
              placeholder="e.g. Was the walk-in freezer log signed today?"
            />
            <button className="btn-primary" style={{ marginTop: 8 }} disabled={newQBusy || newQPrompt.trim().length < 3} onClick={addQuestion}>
              {newQBusy ? 'Adding…' : 'Add question'}
            </button>
          </div>
        )}

        {canReviewL3 && (
          <div className="card" style={{ marginBottom: 16 }}>
            <strong>Team</strong>
            {teamMessage && <div className="banner info" style={{ margin: '8px 0' }}>{teamMessage}</div>}

            <p className="lede" style={{ fontSize: 13, margin: '8px 0 4px' }}>Add an L1 manager</p>
            <input placeholder="Name" value={newL1Name} onChange={(e) => setNewL1Name(e.target.value)} />
            <div className="btn-row" style={{ marginTop: 6 }}>
              {(['morning', 'afternoon', 'evening'] as const).map((s) => (
                <button key={s} className={newL1Shift === s ? 'btn-primary' : 'btn-ghost'} onClick={() => setNewL1Shift(s)}>
                  {s}
                </button>
              ))}
            </div>
            <select value={newL1Outlet} onChange={(e) => setNewL1Outlet(e.target.value)} style={{ marginTop: 6 }}>
              {teamOutlets.map((o: any) => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
            <button className="btn-primary" style={{ marginTop: 8 }} disabled={teamBusy || newL1Name.trim().length < 2} onClick={addL1}>
              {teamBusy ? 'Adding…' : 'Add L1 manager'}
            </button>

            <p className="lede" style={{ fontSize: 13, margin: '16px 0 4px' }}>Everyone on the team</p>
            {team.filter((u: any) => u.isActive).map((u: any) => (
              <div key={u.id} className="lockbox" style={{ marginTop: 6 }}>
                <div className="row">
                  <span className="label">{u.name}</span>
                  <span className="tag plain">{u.role}{u.shift ? ` · ${u.shift}` : ''}</span>
                </div>
                <div className="desc">{u.outlets.join(', ') || 'No outlet'}</div>
                <button className="btn-ghost" style={{ marginTop: 6, width: 'auto' }} onClick={() => deactivateUser(u.id)}>
                  Deactivate
                </button>
              </div>
            ))}
          </div>
        )}

        {actions.length > 0 && (
          <div className="card" style={{ marginBottom: 16 }}>
            <strong>Corrective actions ({actions.length} open)</strong>
            {actions.map((a) => (
              <div key={a.id} className="lockbox" style={{ marginTop: 8 }}>
                <div className="row">
                  <span className="label">{a.outlets?.name ?? ''} · {a.source.toUpperCase()}</span>
                  <span className="tag warn">{a.assigned_role}</span>
                </div>
                <div className="desc" style={{ marginTop: 4 }}>{a.description}</div>
                <button
                  className="btn-ghost"
                  style={{ marginTop: 8, width: 'auto' }}
                  onClick={() => resolveAction(a.id)}
                >
                  Mark resolved
                </button>
              </div>
            ))}
          </div>
        )}

        {outlets.length === 0 && <p className="empty">No outlets found.</p>}

        {outlets.map(outlet => {
          const runs = outlet.line_check_runs || [];

          return (
            <article key={outlet.id} className="item">
              <div className="head">
                <div className="title">{outlet.name}</div>
              </div>

              {SHIFTS.map(({ id: shift, label }) => {
                const run = runs.find((r: any) => r.shift === shift) || null;

                const stationCount = outlet.station_count ?? 3;
                let stationsComplete = 0;
                let l1Complete = false;
                if (run && run.line_check_stations) {
                  const completes = run.line_check_stations.filter((s: any) => s.status === 'complete');
                  stationsComplete = completes.length;
                  l1Complete = stationsComplete === stationCount;
                }

                const l2Complete = !!(run && run.l2_completed_at);
                const l3Complete = !!(run && run.l3_completed_at);

                return (
                <div key={shift} style={{ marginTop: 16, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
                  <div className="desc" style={{ fontWeight: 600 }}>{label}</div>
                  {!run ? (
                    <div className="desc">Not started yet.</div>
                  ) : (
                  <>
                  <div style={{ marginTop: 12 }}>
                    <div className="desc" style={{ marginBottom: 6 }}>L1 Stations</div>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      {Array.from({ length: stationCount }, (_, i) => i + 1).map(stNo => {
                        const st = run.line_check_stations?.find((s: any) => s.station_no === stNo);
                        let statusText = 'Not Started';
                        let tagClass = 'plain';
                        let timingText = null;
                        let timingClass = '';

                        if (st) {
                          statusText = st.status.replace('_', ' ');
                          if (st.status === 'complete') {
                            tagClass = 'ok';
                            if (st.completed_at) {
                              const formatter = new Intl.DateTimeFormat('en-GB', {
                                timeZone: outlet.timezone || 'UTC',
                                year: 'numeric', month: '2-digit', day: '2-digit',
                                hour: '2-digit', minute: '2-digit',
                                hour12: false
                              });
                              const parts = formatter.formatToParts(new Date(st.completed_at));
                              const dp = Object.fromEntries(parts.map(p => [p.type, p.value]));
                              const completedLocal = `${dp.year}-${dp.month}-${dp.day} ${dp.hour}:${dp.minute}`;
                              const cutoffLocal = `${run.run_date} 12:00`;

                              if (completedLocal >= cutoffLocal) {
                                timingText = 'Late';
                                timingClass = 'warn';
                              } else {
                                timingText = 'On Time';
                                timingClass = 'ok';
                              }
                            }
                          } else if (st.status === 'in_progress') {
                            tagClass = 'warn';
                          } else if (st.status === 'paused') {
                            tagClass = 'locked';
                          } else if (st.status === 'missed') {
                            tagClass = 'locked';
                          }
                        }

                        return (
                          <div key={stNo} className="card" style={{ flex: 1, padding: '10px', marginBottom: 0, textAlign: 'center', boxShadow: 'none' }}>
                            <div style={{ fontWeight: 600, fontSize: 14 }}>S{stNo}</div>
                            <div style={{ marginTop: 4, display: 'flex', flexDirection: 'column', gap: '4px', alignItems: 'center' }}>
                              <span className={`tag ${tagClass}`} style={{ textTransform: 'capitalize' }}>
                                {statusText}
                              </span>
                              {timingText && (
                                <span className={`tag ${timingClass}`}>{timingText}</span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <div className="lockbox">
                    <div className="row">
                      <div className="label" style={{ margin: 0, display: 'flex', alignItems: 'center' }}>L2 Review (Manager)</div>
                      <div>
                        {l2Complete ? (
                          <span className="tag ok">Completed</span>
                        ) : !l1Complete ? (
                          <span className="tag plain">Waiting for L1</span>
                        ) : canReviewL2 ? (
                          <button
                            onClick={() => startReview(run.id, 'L2')}
                            className="btn-primary"
                            style={{ padding: '6px 12px', minHeight: 'auto', borderRadius: '8px', fontSize: 13, width: 'auto' }}
                          >
                            Review
                          </button>
                        ) : (
                          <span className="tag plain">L2 Manager only</span>
                        )}
                      </div>
                    </div>
                    <div className="row" style={{ marginTop: 8 }}>
                      <div className="label" style={{ margin: 0, display: 'flex', alignItems: 'center' }}>L3 Review (Area)</div>
                      <div>
                        {l3Complete ? (
                          <span className="tag ok">Completed</span>
                        ) : !l2Complete ? (
                          <span className="tag plain">Waiting for L2</span>
                        ) : canReviewL3 ? (
                          <button
                            onClick={() => startReview(run.id, 'L3')}
                            className="btn-primary"
                            style={{ padding: '6px 12px', minHeight: 'auto', borderRadius: '8px', fontSize: 13, width: 'auto' }}
                          >
                            Review
                          </button>
                        ) : (
                          <span className="tag plain">L3 Owner only</span>
                        )}
                      </div>
                    </div>
                  </div>
                  </>
                  )}
                </div>
                );
              })}
            </article>
          );
        })}
      </div>

      {reviewLevel && (
        <div className="sheet-backdrop">
          <div className="sheet">
            <h3>{reviewLevel} Review</h3>
            {questions.length === 0 ? (
              <div className="spinner" />
            ) : (
              <div style={{ marginTop: 16 }}>
                {(() => {
                  const q = questions[qIndex];
                  const isLast = qIndex === questions.length - 1;
                  const a = answers[q.id] || {};
                  const setA = (partial: typeof a) =>
                    setAnswers(prev => ({ ...prev, [q.id]: { ...prev[q.id], ...partial } }));
                  const commentOpen = showComment.has(q.id) || Boolean(a.reason);
                  const mediaOpen = showMedia.has(q.id) || Boolean(photos[q.id]);

                  return (
                    <div key={q.id} className="card">
                      <div className="tag plain">Q{qIndex + 1} of {questions.length}</div>
                      <h2 style={{ marginTop: 10, fontSize: 16 }}>{q.prompt}</h2>
                      <div className="btn-row" style={{ marginTop: 12 }}>
                        <button className={a.yesNo === 'yes' ? 'btn-primary' : 'btn-ghost'} onClick={() => setA({ yesNo: 'yes' })}>
                          Yes
                        </button>
                        <button className={a.yesNo === 'no' ? 'btn-primary' : 'btn-ghost'} onClick={() => setA({ yesNo: 'no' })}>
                          No
                        </button>
                        <button className={a.yesNo === 'na' ? 'btn-primary' : 'btn-ghost'} onClick={() => setA({ yesNo: 'na' })}>
                          N/A
                        </button>
                      </div>

                      <div className="btn-row" style={{ marginTop: 12 }}>
                        <button
                          type="button"
                          className={commentOpen ? 'btn-primary' : 'btn-ghost'}
                          onClick={() => setShowComment(prev => new Set(prev).add(q.id))}
                        >
                          💬 Comment
                        </button>
                        <button
                          type="button"
                          className={mediaOpen ? 'btn-primary' : 'btn-ghost'}
                          onClick={() => setShowMedia(prev => new Set(prev).add(q.id))}
                        >
                          📎 Media
                        </button>
                        <button
                          type="button"
                          className={a.flagged ? 'btn-primary' : 'btn-ghost'}
                          onClick={() => setA({ flagged: !a.flagged })}
                        >
                          🚩 Flag
                        </button>
                      </div>

                      {commentOpen && (
                        <textarea
                          style={{ marginTop: 12 }}
                          value={a.reason ?? ''}
                          onChange={(e) => setA({ reason: e.target.value })}
                          placeholder="Comment"
                        />
                      )}
                      {mediaOpen && (
                        <div style={{ marginTop: 12 }}>
                          <input
                            type="file"
                            accept="image/*"
                            capture="environment"
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (file) setPhotos(prev => ({ ...prev, [q.id]: file }));
                            }}
                          />
                        </div>
                      )}

                      <div className="btn-row" style={{ marginTop: 20 }}>
                        <button
                          onClick={() => (qIndex === 0 ? setReviewLevel(null) : setQIndex(i => i - 1))}
                          className="btn-ghost"
                        >
                          {qIndex === 0 ? 'Cancel' : 'Back'}
                        </button>
                        {isLast ? (
                          <button onClick={submitReview} disabled={submitting || !a.yesNo} className="btn-primary">
                            {submitting ? 'Submitting...' : 'Submit'}
                          </button>
                        ) : (
                          <button
                            onClick={() => setQIndex(i => i + 1)}
                            disabled={!a.yesNo}
                            className="btn-primary"
                          >
                            Next
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })()}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}