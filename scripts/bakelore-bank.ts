// Usage: npx tsx scripts/bakelore-bank.ts <path-to-Bakelore_line_check.xlsx>
// Writes supabase/seed/bakelore_l1_bank.sql, which installs the L1 bank on an
// existing "Bakelore Bakery & Café" organisation.
import fs from 'node:fs';
import { bankToSql, parseBakeryLineCheck } from '../src/lib/line-check/bank-import';

const file = process.argv[2];
if (!file) throw new Error('Pass the path to the .xlsx file.');

const stations = parseBakeryLineCheck(fs.readFileSync(file));
for (const s of stations) {
  const numeric = s.questions.filter((q) => q.kind === 'numeric').length;
  console.log(`${s.name}: ${s.questions.length} questions (${numeric} temperature readings)`);
}
fs.writeFileSync('supabase/seed/bakelore_l1_bank.sql', bankToSql('Bakelore Bakery & Café', stations, 'bk'));
console.log('Wrote supabase/seed/bakelore_l1_bank.sql');
