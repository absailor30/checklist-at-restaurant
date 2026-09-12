import { json } from '@/lib/no-store';
import { createAdminClient } from '@/lib/supabase/admin';
import { currentManager } from '@/lib/supabase/server';
import { readSession } from '@/lib/session';
import { unwrap } from '@/lib/db';

export const dynamic = 'force-dynamic';

// Notifications for whoever is signed in, by either route: a manager with a
// real account, or floor staff on a shared device with a PIN session.
//
// Both need them. Managers get told a task is locked or needs approval; staff
// get told their work was approved or sent back, and being sent back with no
// way to find out is worse than not being reviewed at all.
async function viewer() {
  const manager = await currentManager();
  if (manager) return { userId: manager.id, orgId: manager.orgId };

  const staff = await readSession();
  if (staff) return { userId: staff.userId, orgId: staff.orgId };

  return null;
}

export async function GET(request: Request) {
  const who = await viewer();
  if (!who) return json({ error: 'Not signed in.' }, { status: 401 });

  const unreadOnly = new URL(request.url).searchParams.get('unread') === '1';
  const db = createAdminClient();

  let query = db
    .from('notifications')
    .select('id, kind, title, body, payload, read_at, created_at')
    .eq('user_id', who.userId)
    .order('created_at', { ascending: false })
    .limit(50);
  if (unreadOnly) query = query.is('read_at', null);

  try {
    const rows = unwrap<any[]>(await query, 'notifications');
    return json({
      unread: rows.filter((n) => !n.read_at).length,
      notifications: rows.map((n) => ({
        id: n.id,
        kind: n.kind,
        title: n.title,
        body: n.body,
        read: Boolean(n.read_at),
        createdAt: n.created_at,
      })),
    });
  } catch (e: any) {
    return json({ error: e?.message ?? 'Could not load notifications.' }, { status: 500 });
  }
}

// Mark one as read, or all of them.
export async function POST(request: Request) {
  const who = await viewer();
  if (!who) return json({ error: 'Not signed in.' }, { status: 401 });

  const { id } = await request.json().catch(() => ({}));
  const db = createAdminClient();

  // Scoped to this user's own rows, so an id from elsewhere changes nothing.
  let query = db
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('user_id', who.userId)
    .is('read_at', null);
  if (id) query = query.eq('id', id);

  const { error } = await query;
  if (error) return json({ error: error.message }, { status: 500 });
  return json({ ok: true });
}
