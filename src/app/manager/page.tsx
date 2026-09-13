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

  if (sessionState === 'checking') return <div className="p-8">Loading...</div>;

  if (sessionState === 'out') {
    return (
      <div className="p-4 md:p-8 max-w-md mx-auto mt-12">
        <h2 className="text-2xl font-bold mb-4">Manager sign in</h2>
        <p className="text-gray-600 mb-6">
          Managers sign in with an email and password, not a PIN — approvals and
          unlocks are recorded against your name permanently.
        </p>
        {loginError && <div className="bg-red-100 text-red-700 p-3 rounded mb-4">{loginError}</div>}
        <form className="bg-white border rounded p-6 shadow-sm dark:bg-gray-800 dark:border-gray-700" onSubmit={handleLogin}>
          <div className="mb-4">
            <label className="block font-medium mb-1">Email</label>
            <input
              type="email"
              value={email}
              autoComplete="username"
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full border p-2 rounded dark:bg-gray-700 dark:border-gray-600"
            />
          </div>
          <div className="mb-6">
            <label className="block font-medium mb-1">Password</label>
            <input
              type="password"
              value={password}
              autoComplete="current-password"
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full border p-2 rounded dark:bg-gray-700 dark:border-gray-600"
            />
          </div>
          <button
            type="submit"
            disabled={loginBusy}
            className="w-full bg-blue-600 text-white p-2 rounded font-medium hover:bg-blue-700 disabled:opacity-50"
          >
            {loginBusy ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
        <div className="mt-4 text-center">
          <a className="text-blue-600 hover:underline" href="/staff">
            I&apos;m floor staff
          </a>
        </div>
      </div>
    );
  }

  if (loading) return <div className="p-8">Loading Manager Dashboard...</div>;
  if (error) return <div className="p-8 text-red-500">Error: {error}</div>;

  return (
    <div className="p-4 md:p-8 max-w-4xl mx-auto">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Line Check - Manager Dashboard</h1>
        <button onClick={handleLogout} className="text-sm border px-3 py-1 rounded hover:bg-gray-50 dark:hover:bg-gray-700">
          Sign out
        </button>
      </div>

      {outlets.length === 0 && <p className="text-gray-500">No outlets found.</p>}

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
          <div key={outlet.id} className="border rounded p-4 mb-4 bg-white shadow-sm dark:bg-gray-800 dark:border-gray-700">
            <h2 className="text-xl font-semibold mb-4">{outlet.name}</h2>

            {!run ? (
              <p className="text-gray-500">No line check started today.</p>
            ) : (
              <div>
                <div className="mb-4">
                  <h3 className="font-medium text-sm text-gray-500 uppercase tracking-wider mb-2">L1 Stations</h3>
                  <div className="grid grid-cols-3 gap-2">
                    {[1, 2, 3].map(stNo => {
                      const st = run.line_check_stations?.find((s: any) => s.station_no === stNo);
                      let statusText = 'Not Started';
                      let color = 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300';

                      if (st) {
                        statusText = st.status;
                        if (st.status === 'complete') color = 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300';
                        if (st.status === 'in_progress') color = 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300';
                        if (st.status === 'paused') color = 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300';
                      }

                      return (
                        <div key={stNo} className={`p-2 rounded text-center text-sm font-medium ${color}`}>
                          <div>Station {stNo}</div>
                          <div className="text-xs opacity-80 mt-1 capitalize">{statusText}</div>
                          {st?.status === 'paused' && st.pause_reason && (
                            <div className="text-xs mt-1 italic">Reason: {st.pause_reason}</div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row gap-4 border-t pt-4 border-gray-200 dark:border-gray-700">
                  <div className="flex-1">
                    <h3 className="font-medium mb-2">L2 Review (Manager)</h3>
                    {l2Complete ? (
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300">
                        Completed
                      </span>
                    ) : l1Complete ? (
                      <button
                        onClick={() => startReview(run.id, 'L2')}
                        className="bg-blue-600 text-white px-4 py-2 rounded text-sm hover:bg-blue-700 transition-colors"
                      >
                        Complete L2 Review
                      </button>
                    ) : (
                      <span className="text-sm text-gray-500">Waiting for L1 completion (Stations 1-3)</span>
                    )}
                  </div>

                  <div className="flex-1">
                    <h3 className="font-medium mb-2">L3 Review (Area Manager)</h3>
                    {l3Complete ? (
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300">
                        Completed
                      </span>
                    ) : l2Complete ? (
                      <button
                        onClick={() => startReview(run.id, 'L3')}
                        className="bg-purple-600 text-white px-4 py-2 rounded text-sm hover:bg-purple-700 transition-colors"
                      >
                        Complete L3 Review
                      </button>
                    ) : (
                      <span className="text-sm text-gray-500">Waiting for L2 completion</span>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        );
      })}

      {reviewLevel && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg max-w-lg w-full max-h-[90vh] overflow-y-auto p-6">
            <h2 className="text-2xl font-bold mb-4">{reviewLevel} Review</h2>

            {questions.length === 0 ? (
              <p>Loading questions...</p>
            ) : (
              <div className="space-y-6">
                {questions.map((q, idx) => (
                  <div key={q.id} className="border-b pb-4 dark:border-gray-700">
                    <p className="font-medium mb-3">{idx + 1}. {q.prompt}</p>
                    <div className="flex gap-4">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="radio"
                          name={q.id}
                          value="yes"
                          checked={answers[q.id] === 'yes'}
                          onChange={() => setAnswers(prev => ({ ...prev, [q.id]: 'yes' }))}
                          className="w-4 h-4 text-blue-600"
                        />
                        <span>Yes</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="radio"
                          name={q.id}
                          value="no"
                          checked={answers[q.id] === 'no'}
                          onChange={() => setAnswers(prev => ({ ...prev, [q.id]: 'no' }))}
                          className="w-4 h-4 text-blue-600"
                        />
                        <span>No</span>
                      </label>
                    </div>
                  </div>
                ))}

                <div className="flex justify-end gap-3 pt-4">
                  <button
                    onClick={() => setReviewLevel(null)}
                    className="px-4 py-2 border rounded hover:bg-gray-50 dark:hover:bg-gray-700"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={submitReview}
                    disabled={submitting}
                    className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
                  >
                    {submitting ? 'Submitting...' : 'Submit Review'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
