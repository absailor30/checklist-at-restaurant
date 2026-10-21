import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { currentManager } from '@/lib/supabase/server';
import { buildL3Report, parseRange } from '@/lib/l3-report';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

// L3's report: replaces the old /owner dashboard, which queried a different
// (department-checklist) data model that no longer applies here.
export async function GET(request: Request) {
  const manager = await currentManager();
  if (!manager) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
  if (!(manager.canManage || manager.canReview)) {
    return NextResponse.json({ error: 'Operations Manager or CEO/Owner access required.' }, { status: 403 });
  }

  const url = new URL(request.url);
  const range = parseRange(url);

  try {
    const report = await buildL3Report(createAdminClient(), manager, range);
    return NextResponse.json({ ...report, viewerRole: manager.roleName });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? 'Report failed.' }, { status: 500 });
  }
}
