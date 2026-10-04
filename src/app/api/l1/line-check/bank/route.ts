import { json } from '@/lib/no-store';
import { createAdminClient } from '@/lib/supabase/admin';
import { readSession } from '@/lib/session';
import { loadBank } from '@/lib/line-check/bank';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// The signed-in L1's stations and questions. Brands without their own L1
// checklist get the global default, so existing outlets see no change.
export async function GET() {
  const session = await readSession();
  if (!session) return json({ error: 'Not signed in.' }, { status: 401 });

  const db = createAdminClient();
  const { data: outlet } = await db.from('outlets').select('station_count').eq('id', session.outletId).single();
  const bank = await loadBank(db, session.orgId, outlet?.station_count ?? 3);
  return json(bank);
}
