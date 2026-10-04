// Usage: npx tsx scripts/bakelore-bank.ts <path-to-Bakelore_line_check.xlsx> [org name] [id prefix]
// Writes supabase/seed/bakelore_l1_bank.sql, which installs the L1 bank on an
// existing organisation. Question ids are global, so every brand needs its own
// prefix (default "bkc" for the real client; the test brand was installed as "bk").
import fs from 'node:fs';
import { bankToSql, mergeStations, parseBakeryLineCheck } from '../src/lib/line-check/bank-import';

const file = process.argv[2];
if (!file) throw new Error('Pass the path to the .xlsx file.');
const org = process.argv[3] ?? 'Bakelore Bakery & Café';
const prefix = process.argv[4] ?? 'bkc';

// The client wants these two sections as one station.
const stations = mergeStations(parseBakeryLineCheck(fs.readFileSync(file)), ['Gift Hampers', 'Fillings'], 'Gift Hampers & Fillings');
for (const s of stations) {
  const numeric = s.questions.filter((q) => q.kind === 'numeric').length;
  console.log(`${s.name}: ${s.questions.length} questions (${numeric} temperature readings)`);
}
fs.writeFileSync('supabase/seed/bakelore_l1_bank.sql', bankToSql(org, stations, prefix));
console.log(`Wrote supabase/seed/bakelore_l1_bank.sql for "${org}" (${stations.length} stations)`);
