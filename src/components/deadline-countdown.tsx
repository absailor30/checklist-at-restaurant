'use client';

import { useEffect, useState } from 'react';

// Shows a live countdown in the last 15 minutes before a shift's deadline
// ('HH:MM' in the outlet's timezone). Renders nothing outside that window.
function secondsToDeadline(deadline: string, timeZone: string): number {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })
      .formatToParts(new Date()).map((x) => [x.type, x.value])
  );
  const now = (Number(p.hour) % 24) * 3600 + Number(p.minute) * 60 + Number(p.second);
  return Number(deadline.slice(0, 2)) * 3600 + Number(deadline.slice(3, 5)) * 60 - now;
}

export function DeadlineCountdown({ deadline, timeZone }: { deadline?: string | null; timeZone?: string }) {
  const [left, setLeft] = useState<number | null>(null);

  useEffect(() => {
    if (!deadline) return;
    const tick = () => setLeft(secondsToDeadline(deadline, timeZone || 'UTC'));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [deadline, timeZone]);

  if (left === null || left <= 0 || left > 15 * 60) return null;
  const mm = String(Math.floor(left / 60)).padStart(2, '0');
  const ss = String(left % 60).padStart(2, '0');
  const urgent = left <= 5 * 60;
  return (
    <div
      role="timer"
      style={{
        margin: '8px 0', padding: '8px 12px', borderRadius: 8, fontWeight: 700,
        border: `1px solid ${urgent ? 'var(--locked)' : 'var(--border)'}`,
        color: urgent ? 'var(--locked)' : undefined,
      }}
    >
      ⏱ {mm}:{ss} left to finish before the deadline
    </div>
  );
}
