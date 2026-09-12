'use client';

import { useCallback, useEffect, useState } from 'react';

// The notification bell.
//
// Notifications were being written to the database from the start but nothing
// ever displayed them, so a manager had no way to learn that a task had locked
// or needed approving unless they happened to open the right screen. The bell
// carries an unread count precisely so nobody has to go looking.

interface Item {
  id: string;
  kind: string;
  title: string;
  body: string | null;
  read: boolean;
  createdAt: string;
}

export function NotificationBell() {
  const [items, setItems] = useState<Item[]>([]);
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/notifications?t=${Date.now()}`, { cache: 'no-store' });
      if (!res.ok) return;
      const data = await res.json();
      setItems(data.notifications ?? []);
      setUnread(data.unread ?? 0);
    } catch {
      // A failed poll is not worth interrupting anyone over; the next one runs
      // in a minute.
    }
  }, []);

  useEffect(() => {
    void load();
    const timer = setInterval(() => { void load(); }, 60_000);
    return () => clearInterval(timer);
  }, [load]);

  async function markAllRead() {
    setError(null);
    const res = await fetch('/api/notifications', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? 'Could not mark these as read.');
      return;
    }
    await load();
  }

  return (
    <>
      <button
        className="bell"
        aria-label={unread ? `${unread} unread notifications` : 'Notifications'}
        onClick={() => { setOpen(true); void load(); }}
      >
        <span aria-hidden="true">🔔</span>
        {unread > 0 && <span className="bellcount">{unread > 9 ? '9+' : unread}</span>}
      </button>

      {open && (
        <div className="sheet-backdrop" onClick={() => setOpen(false)}>
          <div className="sheet" onClick={(e) => e.stopPropagation()}>
            <h3>Notifications</h3>
            {error && <div className="banner error">{error}</div>}

            {items.length === 0 && (
              <p className="empty" style={{ padding: '32px 0' }}>Nothing yet.</p>
            )}

            {items.map((n) => (
              <div className={`item ${toneOf(n.kind)}`} key={n.id}>
                <div className="head">
                  <div className="title">
                    {n.title}
                    {n.body && <div className="desc">{n.body}</div>}
                    <div className="due">{when(n.createdAt)}</div>
                  </div>
                  {!n.read && <span className="tag warn">New</span>}
                </div>
              </div>
            ))}

            <div className="btn-row" style={{ marginTop: 18 }}>
              <button className="btn-ghost" onClick={() => setOpen(false)}>Close</button>
              <button className="btn-primary" onClick={markAllRead} disabled={unread === 0}>
                Mark all read
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function toneOf(kind: string): string {
  if (kind === 'out_of_bounds' || kind === 'rejected' || kind === 'escalated') return 'locked';
  if (kind === 'locked' || kind === 'review_needed') return 'unlocked';
  if (kind === 'approved') return 'done';
  return '';
}

function when(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diff / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  if (mins < 24 * 60) return `${Math.floor(mins / 60)}h ago`;
  return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
}
