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
  const [push, setPush] = useState<'unsupported' | 'off' | 'on' | 'blocked' | 'busy'>('off');

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
    const timer = setInterval(() => { void load(); }, 30_000);

    // Also refresh when the screen comes back into view. Someone returning to
    // the tab expects to see the current position, not whatever it was when
    // they left.
    const onVisible = () => { if (!document.hidden) void load(); };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [load]);

  // Work out whether this device already has push switched on.
  useEffect(() => {
    (async () => {
      if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
        setPush('unsupported');
        return;
      }
      if (Notification.permission === 'denied') { setPush('blocked'); return; }

      const registration = await navigator.serviceWorker.getRegistration();
      const existing = await registration?.pushManager.getSubscription();
      setPush(existing ? 'on' : 'off');
    })().catch(() => setPush('unsupported'));
  }, []);

  async function enablePush() {
    setError(null);
    setPush('busy');
    try {
      const keyRes = await fetch('/api/push/subscribe', { cache: 'no-store' });
      const keyData = await keyRes.json();
      if (!keyData.available) {
        setError(keyData.reason ?? 'Push is not available on this deployment.');
        setPush('off');
        return;
      }

      const permission = await Notification.requestPermission();
      if (permission !== 'granted') { setPush('blocked'); return; }

      const registration = await navigator.serviceWorker.register('/sw.js');
      await navigator.serviceWorker.ready;

      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: base64UrlToBytes(keyData.publicKey),
      });

      const res = await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subscription }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? 'Could not save the subscription.');
        setPush('off');
        return;
      }
      setPush('on');
    } catch (e: any) {
      setError(e?.message ?? 'Could not turn on notifications for this device.');
      setPush('off');
    }
  }

  async function disablePush() {
    setPush('busy');
    try {
      const registration = await navigator.serviceWorker.getRegistration();
      const subscription = await registration?.pushManager.getSubscription();
      if (subscription) {
        await fetch('/api/push/subscribe', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ endpoint: subscription.endpoint }),
        });
        await subscription.unsubscribe();
      }
      setPush('off');
    } catch {
      setPush('on');
    }
  }

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

            <div className="card" style={{ marginTop: 16 }}>
              <strong>Alerts on this phone</strong>
              <p className="lede" style={{ fontSize: 13, margin: '6px 0 12px' }}>
                {push === 'on'
                  ? 'This device will buzz even when the app is closed.'
                  : push === 'blocked'
                    ? 'Notifications are blocked for this site. Allow them in your browser settings, then come back.'
                    : push === 'unsupported'
                      ? 'This browser cannot deliver notifications when the app is closed.'
                      : 'Get alerted even when the app is closed — useful once you have left the restaurant.'}
              </p>
              {push === 'on' && (
                <button className="btn-ghost" onClick={disablePush}>Turn off on this device</button>
              )}
              {push === 'off' && (
                <button className="btn-primary" onClick={enablePush}>Turn on</button>
              )}
              {push === 'busy' && <div className="spinner" style={{ margin: '10px auto' }} />}
            </div>

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

// The browser wants the key as raw bytes, not the base64url text the server
// sends.
function base64UrlToBytes(value: string): ArrayBuffer {
  const padded = (value + '='.repeat((4 - (value.length % 4)) % 4))
    .replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(padded);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes.buffer;
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
