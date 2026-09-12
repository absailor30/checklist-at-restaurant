import crypto from 'crypto';
import webpush from 'web-push';
import type { SupabaseClient } from '@supabase/supabase-js';

// Push notifications to the phone.
//
// Sending requires a VAPID key pair, which identifies this app to the browser
// vendors' push services. Rather than another pair of environment variables
// that someone has to create and paste in — and that silently disables the
// feature until they do — the pair is derived deterministically from
// APP_SESSION_SECRET, which the app already requires.
//
// The consequence is worth stating plainly: changing APP_SESSION_SECRET
// changes the key pair, and every existing push subscription stops working.
// Devices re-subscribe on their next visit, so it self-heals, but notifications
// go quiet in between. Setting VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY
// explicitly avoids that and is the better choice once this is load-bearing.

let cached: { publicKey: string; privateKey: string } | null = null;

export function vapidKeys(): { publicKey: string; privateKey: string } {
  if (cached) return cached;

  const explicitPublic = process.env.VAPID_PUBLIC_KEY;
  const explicitPrivate = process.env.VAPID_PRIVATE_KEY;
  if (explicitPublic && explicitPrivate) {
    cached = { publicKey: explicitPublic, privateKey: explicitPrivate };
    return cached;
  }

  const seed = process.env.APP_SESSION_SECRET;
  if (!seed || seed.length < 32) {
    throw new Error('Push needs VAPID keys, or an APP_SESSION_SECRET to derive them from.');
  }

  // A P-256 private key is a 32-byte scalar that must fall within the curve
  // order. Derive one, and step the counter in the vanishingly unlikely case
  // it does not.
  for (let counter = 0; counter < 16; counter++) {
    const scalar = crypto
      .createHmac('sha256', seed)
      .update(`vapid-v1-${counter}`)
      .digest();

    try {
      const ecdh = crypto.createECDH('prime256v1');
      ecdh.setPrivateKey(scalar);
      cached = {
        publicKey: ecdh.getPublicKey().toString('base64url'),
        privateKey: scalar.toString('base64url'),
      };
      return cached;
    } catch {
      // Out of range for the curve; try the next derivation.
    }
  }

  throw new Error('Could not derive a usable VAPID key pair.');
}

/** The public key the browser needs in order to subscribe. */
export function vapidPublicKey(): string {
  return vapidKeys().publicKey;
}

export interface PushMessage {
  title: string;
  body: string;
  url?: string;
  tag?: string;
}

/**
 * Sends a push to every device a user has registered.
 *
 * Subscriptions expire and devices are wiped, so a rejection is routine rather
 * than exceptional: a 404 or 410 means that device is gone and the row is
 * deleted. Anything else is logged and ignored — a push that fails to send
 * must never fail the submission that triggered it.
 */
export async function pushToUsers(
  db: SupabaseClient,
  userIds: string[],
  message: PushMessage
): Promise<number> {
  if (!userIds.length) return 0;

  let keys;
  try {
    keys = vapidKeys();
  } catch {
    return 0; // Push is not configured; in-app notifications still happened.
  }

  webpush.setVapidDetails(
    process.env.PUSH_CONTACT ?? 'mailto:noreply@example.com',
    keys.publicKey,
    keys.privateKey
  );

  const { data: subs } = await db
    .from('push_subscriptions')
    .select('id, endpoint, p256dh, auth')
    .in('user_id', userIds);

  if (!subs?.length) return 0;

  const payload = JSON.stringify(message);
  let sent = 0;

  await Promise.all(subs.map(async (sub) => {
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        payload
      );
      sent++;
    } catch (e: any) {
      const status = e?.statusCode;
      if (status === 404 || status === 410) {
        await db.from('push_subscriptions').delete().eq('id', sub.id);
      } else {
        console.error('push failed', status, e?.body ?? e?.message);
      }
    }
  }));

  return sent;
}
