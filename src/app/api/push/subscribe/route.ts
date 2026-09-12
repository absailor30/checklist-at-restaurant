import { json } from '@/lib/no-store';
import { createAdminClient } from '@/lib/supabase/admin';
import { currentManager } from '@/lib/supabase/server';
import { readSession } from '@/lib/session';
import { vapidPublicKey } from '@/lib/push';

export const dynamic = 'force-dynamic';

// Whoever is signed in, by either route.
async function viewer() {
  const manager = await currentManager();
  if (manager) return { userId: manager.id, orgId: manager.orgId };

  const staff = await readSession();
  if (staff) return { userId: staff.userId, orgId: staff.orgId };

  return null;
}

// The browser needs the public key before it can subscribe. It is public by
// definition — it identifies this app to the push service and grants nothing.
export async function GET() {
  try {
    return json({ publicKey: vapidPublicKey(), available: true });
  } catch (e: any) {
    return json({ available: false, reason: e?.message ?? 'Push is not configured.' });
  }
}

export async function POST(request: Request) {
  const who = await viewer();
  if (!who) return json({ error: 'Not signed in.' }, { status: 401 });

  const { subscription } = await request.json().catch(() => ({}));
  const endpoint = subscription?.endpoint;
  const p256dh = subscription?.keys?.p256dh;
  const auth = subscription?.keys?.auth;

  if (!endpoint || !p256dh || !auth) {
    return json({ error: 'That subscription is incomplete.' }, { status: 400 });
  }

  const db = createAdminClient();

  // The endpoint is unique per device, so re-subscribing on the same device
  // updates the row rather than accumulating duplicates that all deliver the
  // same notification.
  const { error } = await db.from('push_subscriptions').upsert(
    { org_id: who.orgId, user_id: who.userId, endpoint, p256dh, auth },
    { onConflict: 'endpoint' }
  );
  if (error) return json({ error: error.message }, { status: 500 });

  return json({ ok: true });
}

export async function DELETE(request: Request) {
  const who = await viewer();
  if (!who) return json({ error: 'Not signed in.' }, { status: 401 });

  const { endpoint } = await request.json().catch(() => ({}));
  if (!endpoint) return json({ error: 'No endpoint given.' }, { status: 400 });

  const db = createAdminClient();
  // Scoped to this user, so one person cannot unsubscribe another's device.
  const { error } = await db
    .from('push_subscriptions').delete()
    .eq('user_id', who.userId).eq('endpoint', endpoint);
  if (error) return json({ error: error.message }, { status: 500 });

  return json({ ok: true });
}
