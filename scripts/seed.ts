/**
 * Command-line demo seeder. The same logic is available in a browser at
 * /setup, which is the route to use when there is no development environment.
 *
 *   npm run db:seed        create the demo if it is not there
 *   npm run db:reset-demo  delete and rebuild it
 */
import { createClient } from '@supabase/supabase-js';
import { buildDemo } from '../src/lib/seed-core';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. See SETUP.md.');
  process.exit(1);
}

buildDemo(createClient(url, key, { auth: { persistSession: false } }), {
  reset: process.argv.includes('--reset'),
})
  .then((result) => {
    if ('alreadyExists' in result) {
      console.log('Demo already exists. Use "npm run db:reset-demo" to rebuild it.');
      return;
    }
    console.log(
      `\nDemo ready.\n` +
      `  Outlets     : ${result.outlets}\n` +
      `  Staff       : ${result.staff} (PIN for everyone: ${result.pin})\n` +
      `  Checklists  : ${result.templates}\n` +
      `  Submissions : ${result.submissions}\n` +
      `  Locked items: ${result.frozen}\n`
    );
  })
  .catch((e) => { console.error(e.message ?? e); process.exit(1); });
