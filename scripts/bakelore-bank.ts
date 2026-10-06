// Usage: npx tsx scripts/bakelore-bank.ts <path-to-Bakelore_line_check.xlsx> [org name] [id prefix]
// Writes supabase/seed/bakelore_l1_bank.sql, which installs the L1 bank on an
// existing "Bakelore Bakery & Café" organisation.
import fs from 'node:fs';
import { bankToSql, parseBakeryLineCheck } from '../src/lib/line-check/bank-import';

const file = process.argv[2];
if (!file) throw new Error('Pass the path to the .xlsx file.');

const org = process.argv[3] ?? 'Bakelore Bakery & Café';
// Question ids are global, so every brand needs its own prefix (the test brand was installed as "bk").
const prefix = process.argv[4] ?? 'bkc';

const stations = parseBakeryLineCheck(fs.readFileSync(file));
for (const s of stations) {
  const numeric = s.questions.filter((q) => q.kind === 'temp_check').length;
  console.log(`${s.name}: ${s.questions.length} questions (${numeric} temperature readings)`);
}
fs.writeFileSync('supabase/seed/bakelore_l1_bank.sql', bankToSql(org, stations, prefix));
console.log('Wrote supabase/seed/bakelore_l1_bank.sql');
