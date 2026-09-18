'use client';

import { useEffect, useState } from 'react';
import { ThemeSwitcher } from '@/components/theme-switcher';

// Readable status page. When something is broken, the person looking at it is
// probably not a developer, so each line says what to do about it.
export default function HealthPage() {
  const [data, setData] = useState<{
    healthy: boolean;
    checks: { name: string; ok: boolean; detail: string }[];
  } | null>(null);

  useEffect(() => {
    fetch(`/api/health?t=${Date.now()}`, { cache: 'no-store' })
      .then((r) => r.json())
      .then(setData)
      .catch(() => setData({
        healthy: false,
        checks: [{ name: 'Server', ok: false, detail: 'The app itself is not responding.' }],
      }));
  }, []);

  if (!data) return <div className="spinner" />;

  return (
    <div className="shell" style={{ paddingTop: 40 }}>
      <h2>{data.healthy ? 'Everything is working' : 'Something needs attention'}</h2>
      <p className="lede">
        {data.healthy
          ? 'Configuration, database and storage all check out.'
          : 'The items marked below are stopping the app from working.'}
      </p>

      {data.checks.map((c) => (
        <div className={`item ${c.ok ? 'done' : 'locked'}`} key={c.name}>
          <div className="head">
            <div className="title">
              {c.name}
              <div className="desc">{c.detail}</div>
            </div>
            <span className={`tag ${c.ok ? 'ok' : 'locked'}`}>{c.ok ? 'OK' : 'Fix'}</span>
          </div>
        </div>
      ))}

      <h2 style={{ fontSize: 16, marginTop: 28 }}>Appearance</h2>
      <ThemeSwitcher />

      <div className="btn-row" style={{ marginTop: 20 }}>
        <a className="btn btn-ghost" href="/setup"
           style={{ textAlign: 'center', textDecoration: 'none' }}>Setup</a>
        <a className="btn btn-primary" href="/l1"
           style={{ textAlign: 'center', textDecoration: 'none' }}>App</a>
      </div>
    </div>
  );
}
