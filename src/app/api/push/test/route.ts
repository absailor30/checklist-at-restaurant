import { json } from '@/lib/no-store';
import { createAdminClient } from '@/lib/supabase/admin';
import { currentManager } from '@/lib/supabase/server';
import { readSession } from '@/lib/session';
import { pushToUsers } from '@/lib/push';

export const dynamic = 'force-dynamic';

// Sends a test notification to the signed-in user's own devices.
export async function POST() {
  const manager = await currentManager();
  const staff = manager ? null : await readSession();
  const userId = manager?.id ?? staff?.userId;
  if (!userId) return json({ error: 'Not signed in.' }, { status: 401 });

  const errors: string[] = [];
  const sent = await pushToUsers(createAdminClient(), [userId], {
    title: 'Test notification',
    body: 'Notifications are working on this device.',
    url: '/l1',
    tag: 'test',
  }, errors);
  return json({ ok: sent > 0, sent, error: sent > 0 ? undefined : errors.join('; ') || undefined });
}
