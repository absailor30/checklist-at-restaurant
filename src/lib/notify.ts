import type { SupabaseClient } from '@supabase/supabase-js';
import { pushToUsers } from '@/lib/push';

// Notifications go to whoever is currently empowered to act, which for a
// frozen item is the roles the escalation has reached — not simply everyone
// senior. Telling the whole chain about every missed task is how an
// accountability tool becomes noise people mute.

export interface Recipient {
  id: string;
  name: string;
}

/**
 * The users holding the roles empowered to unlock an item at a given
 * escalation level, for the outlet the item belongs to.
 */
export async function recipientsForLock(
  db: SupabaseClient,
  orgId: string,
  outletId: string,
  submitterLevel: number,
  escalationLevel: number
): Promise<Recipient[]> {
  const { data: roles } = await db
    .from('roles').select('id, name, level, can_unlock').eq('org_id', orgId);

  const empowered = (roles ?? [])
    .filter((r) => r.can_unlock && r.level > submitterLevel)
    .sort((a, b) => a.level - b.level)
    .slice(0, escalationLevel + 1)
    .map((r) => r.id);
  if (!empowered.length) return [];

  const { data: users } = await db
    .from('users')
    .select('id, name, user_outlets!inner(outlet_id)')
    .eq('org_id', orgId)
    .eq('is_active', true)
    .in('role_id', empowered);

  // Only people who actually work at that outlet. A manager at another branch
  // can neither see the fridge nor do anything useful about it.
  return (users ?? [])
    .filter((u: any) =>
      (Array.isArray(u.user_outlets) ? u.user_outlets : [u.user_outlets])
        .some((uo: any) => uo?.outlet_id === outletId))
    .map((u: any) => ({ id: u.id, name: u.name }));
}

export async function notify(
  db: SupabaseClient,
  orgId: string,
  recipients: Recipient[],
  message: {
    kind: string; title: string; body: string;
    payload?: Record<string, unknown>; url?: string;
  }
): Promise<number> {
  if (!recipients.length) return 0;

  const { error } = await db.from('notifications').insert(
    recipients.map((r) => ({
      org_id: orgId,
      user_id: r.id,
      kind: message.kind,
      title: message.title,
      body: message.body,
      payload: message.payload ?? {},
      sent_channels: ['in_app', 'push'],
    }))
  );
  if (error) throw new Error(`notifications: ${error.message}`);

  // Push is best-effort on top of the stored notification. A push that fails
  // to send must never fail the work that triggered it, and the bell still
  // carries the message either way.
  try {
    await pushToUsers(db, recipients.map((r) => r.id), {
      title: message.title,
      body: message.body,
      url: message.url ?? '/manager',
      tag: String(message.payload?.itemId ?? message.kind),
    });
  } catch (e) {
    console.error('push delivery failed', e);
  }

  return recipients.length;
}
