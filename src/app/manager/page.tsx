'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Review modal state
  const [reviewLevel, setReviewLevel] = useState<'L2' | 'L3' | null>(null);
  const [reviewRunId, setReviewRunId] = useState<string | null>(null);
  const [questions, setQuestions] = useState<any[]>([]);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  const fetchOverview = async () => {
    try {
      const res = await fetch('/api/manager/line-check/overview');
      if (!res.ok) throw new Error('Failed to fetch overview');
      const data = await res.json();
      setOutlets(data.outlets || []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) {
        setSessionState('out');
      } else {
        setSessionState('in');
        fetchOverview();
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) {
        setSessionState('in');
        fetchOverview();
      } else {
        setSessionState('out');
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [supabase]);

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
        yes_no: val,
      }));

      const res = await fetch('/api/manager/line-check/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ run_id: reviewRunId, level: reviewLevel, answers: formattedAnswers }),
      });

      if (!res.ok) throw new Error('Failed to submit review');

      setReviewLevel(null);
      setReviewRunId(null);
      fetchOverview();
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
        <a className="btn btn-ghost" href="/staff" style={{ display: 'block', textAlign: 'center', textDecoration: 'none', marginTop: 16, lineHeight: '22px' }}>
          I'm floor staff
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
        <button className="btn-ghost" style={{ width: 'auto', minHeight: 40, padding: '8px 14px' }} onClick={handleLogout}>
          Sign out
        </button>
      </div>

      <div className="shell">
        {outlets.length === 0 && <p className="empty">No outlets found.</p>}

        {outlets.map(outlet => {
          const runs = outlet.line_check_runs || [];
          const run = runs.length > 0 ? runs[0] : null; // assuming today's run

          let stationsComplete = 0;
          let l1Complete = false;
          if (run && run.line_check_stations) {
            const completes = run.line_check_stations.filter((s: any) => s.status === 'complete');
            stationsComplete = completes.length;
            l1Complete = stationsComplete === 3;
          }

          const l2Complete = !!(run && run.l2_completed_at);
          const l3Complete = !!(run && run.l3_completed_at);

          return (
            <article key={outlet.id} className="item">
              <div className="head">
                <div className="title">{outlet.name}</div>
              </div>

              {!run ? (
                <div className="desc">No line check started today.</div>
              ) : (
                <>
                  <div style={{ marginTop: 12 }}>
                    <div className="desc" style={{ marginBottom: 6 }}>L1 Stations</div>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      {[1, 2, 3].map(stNo => {
                        const st = run.line_check_stations?.find((s: any) => s.station_no === stNo);
                        let statusText = 'Not Started';
                        let tagClass = 'plain';

                        if (st) {
                          statusText = st.status.replace('_', ' ');
                          if (st.status === 'complete') tagClass = 'ok';
                          if (st.status === 'in_progress') tagClass = 'warn';
                          if (st.status === 'paused') tagClass = 'locked';
                        }

                        return (
                          <div key={stNo} className="card" style={{ flex: 1, padding: '10px', marginBottom: 0, textAlign: 'center', boxShadow: 'none' }}>
                            <div style={{ fontWeight: 600, fontSize: 14 }}>S{stNo}</div>
                            <span className={`tag ${tagClass}`} style={{ marginTop: 4, textTransform: 'capitalize' }}>
                              {statusText}
                            </span>
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
                        ) : l1Complete ? (
                          <button
                            onClick={() => startReview(run.id, 'L2')}
                            className="btn-primary"
                            style={{ padding: '6px 12px', minHeight: 'auto', borderRadius: '8px', fontSize: 13, width: 'auto' }}
                          >
                            Review
                          </button>
                        ) : (
                          <span className="tag plain">Waiting for L1</span>
                        )}
                      </div>
                    </div>
                    <div className="row" style={{ marginTop: 8 }}>
                      <div className="label" style={{ margin: 0, display: 'flex', alignItems: 'center' }}>L3 Review (Area)</div>
                      <div>
                        {l3Complete ? (
                          <span className="tag ok">Completed</span>
                        ) : l2Complete ? (
                          <button
                            onClick={() => startReview(run.id, 'L3')}
                            className="btn-primary"
                            style={{ padding: '6px 12px', minHeight: 'auto', borderRadius: '8px', fontSize: 13, width: 'auto' }}
                          >
                            Review
                          </button>
                        ) : (
                          <span className="tag plain">Waiting for L2</span>
                        )}
                      </div>
                    </div>
                  </div>
                </>
              )}
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
                {questions.map((q, idx) => (
                  <div key={q.id} className="card">
                    <div className="tag plain">Q{idx + 1}</div>
                    <h2 style={{ marginTop: 10, fontSize: 16 }}>{q.prompt}</h2>
                    <div className="btn-row" style={{ marginTop: 12 }}>
                      <button
                        className={answers[q.id] === 'yes' ? 'btn-primary' : 'btn-ghost'}
                        onClick={() => setAnswers(prev => ({ ...prev, [q.id]: 'yes' }))}
                      >
                        Yes
                      </button>
                      <button
                        className={answers[q.id] === 'no' ? 'btn-primary' : 'btn-ghost'}
                        onClick={() => setAnswers(prev => ({ ...prev, [q.id]: 'no' }))}
                      >
                        No
                      </button>
                    </div>
                  </div>
                ))}

                <div className="btn-row" style={{ marginTop: 20 }}>
                  <button onClick={() => setReviewLevel(null)} className="btn-ghost">
                    Cancel
                  </button>
                  <button onClick={submitReview} disabled={submitting} className="btn-primary">
                    {submitting ? 'Submitting...' : 'Submit'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}