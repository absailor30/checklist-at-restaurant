import { json } from '@/lib/no-store';
import { createAdminClient } from '@/lib/supabase/admin';
import { provisionBrand, SHIFTS, type OutletInput, type Shift } from '@/lib/provision';
import * as XLSX from 'xlsx';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// One-row-per-station template. Same columns repeat for every station of an
// outlet; brand/L2/L3 columns only need to be filled on the outlet's first
// row (blank = "same as the row above" for that outlet).
//
// Brand | Outlet | Timezone | Station | Shift | L1 Manager Name |
// L2 Manager Name | L2 Email | L2 Password | L3 Owner Name | L3 Email | L3 Password
const HEADERS = [
  'Brand', 'Outlet', 'Timezone', 'Station', 'Shift', 'L1 Manager Name',
  'L2 Manager Name', 'L2 Email', 'L2 Password', 'L3 Owner Name', 'L3 Email', 'L3 Password',
] as const;

function normShift(v: unknown): Shift | null {
  const s = String(v ?? '').trim().toLowerCase();
  return (SHIFTS as string[]).includes(s) ? (s as Shift) : null;
}

export async function POST(request: Request) {
  const form = await request.formData();
  const file = form.get('file') as File | null;
  if (!file) return json({ error: 'Attach an .xlsx file.' }, { status: 400 });

  let rows: Record<string, any>[];
  try {
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type: 'array' });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });
  } catch (e: any) {
    return json({ error: `Could not read the file: ${e?.message ?? 'unknown error'}` }, { status: 400 });
  }
  if (rows.length === 0) return json({ error: 'The sheet has no rows.' }, { status: 400 });

  const missingHeaders = HEADERS.filter((h) => !(h in rows[0]));
  if (missingHeaders.length) {
    return json({ error: `Missing column(s): ${missingHeaders.join(', ')}` }, { status: 400 });
  }

  let brandName = '';
  let timezone = 'Asia/Kolkata';
  let l2Name = '', l2Email = '', l2Password = '';
  let l3Name = '', l3Email = '', l3Password = '';
  const outlets = new Map<string, OutletInput & { stationSet: Set<number> }>();

  for (const [i, row] of rows.entries()) {
    const line = i + 2; // header is row 1
    brandName = brandName || String(row['Brand'] ?? '').trim();
    timezone = String(row['Timezone'] ?? '').trim() || timezone;
    l2Name = l2Name || String(row['L2 Manager Name'] ?? '').trim();
    l2Email = l2Email || String(row['L2 Email'] ?? '').trim().toLowerCase();
    l2Password = l2Password || String(row['L2 Password'] ?? '');
    l3Name = l3Name || String(row['L3 Owner Name'] ?? '').trim();
    l3Email = l3Email || String(row['L3 Email'] ?? '').trim().toLowerCase();
    l3Password = l3Password || String(row['L3 Password'] ?? '');

    const outletName = String(row['Outlet'] ?? '').trim();
    if (!outletName) return json({ error: `Row ${line}: Outlet is required.` }, { status: 400 });
    const stationNo = Number(row['Station']);
    if (!Number.isInteger(stationNo) || stationNo < 1 || stationNo > 3) {
      return json({ error: `Row ${line}: Station must be 1, 2 or 3.` }, { status: 400 });
    }
    const shift = normShift(row['Shift']);
    if (!shift) {
      return json({ error: `Row ${line}: Shift must be morning, afternoon or evening.` }, { status: 400 });
    }
    const l1Name = String(row['L1 Manager Name'] ?? '').trim();

    if (!outlets.has(outletName)) {
      outlets.set(outletName, { name: outletName, stationCount: 0, l1: {}, stationSet: new Set() });
    }
    const outlet = outlets.get(outletName)!;
    outlet.stationSet.add(stationNo);
    outlet.stationCount = outlet.stationSet.size;
    if (l1Name) outlet.l1![shift] = { name: l1Name };
  }

  if (!brandName) return json({ error: 'Brand column is empty.' }, { status: 400 });
  if (!l2Name || !l2Email || !l2Password) return json({ error: 'L2 manager name, email and password are required (fill them on at least one row).' }, { status: 400 });
  if (!l3Name || !l3Email || !l3Password) return json({ error: 'L3 owner name, email and password are required (fill them on at least one row).' }, { status: 400 });

  const outletInputs: OutletInput[] = [...outlets.values()].map(({ stationSet, ...o }) => o);

  const db = createAdminClient();
  const { data: clash } = await db
    .from('organisations').select('id').eq('name', brandName).maybeSingle();
  if (clash) {
    return json({ error: 'A brand with that name already exists.' }, { status: 409 });
  }

  const createdIds: string[] = [];
  try {
    const { data: l2User, error: l2Err } = await db.auth.admin.createUser({
      email: l2Email, password: l2Password, email_confirm: true, user_metadata: { name: l2Name },
    });
    if (l2Err || !l2User?.user) throw new Error(l2Err?.message ?? 'Could not create the L2 manager account.');
    createdIds.push(l2User.user.id);

    const { data: l3User, error: l3Err } = await db.auth.admin.createUser({
      email: l3Email, password: l3Password, email_confirm: true, user_metadata: { name: l3Name },
    });
    if (l3Err || !l3User?.user) throw new Error(l3Err?.message ?? 'Could not create the L3 owner account.');
    createdIds.push(l3User.user.id);

    const result = await provisionBrand(db, {
      brandName, timezone, outlets: outletInputs,
      l2: { name: l2Name, email: l2Email, authUserId: l2User.user.id },
      l3: { name: l3Name, email: l3Email, authUserId: l3User.user.id },
    });
    return json({ ok: true, ...result });
  } catch (e: any) {
    for (const id of createdIds) await db.auth.admin.deleteUser(id).catch(() => {});
    return json({ error: e?.message ?? 'Setup failed.' }, { status: 500 });
  }
}
