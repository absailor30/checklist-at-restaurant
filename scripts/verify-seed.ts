/**
 * Verifies the demo builder against a real PostgreSQL database.
 *
 * Supabase's API is not reachable from every environment, so this substitutes
 * a stand-in client that captures the rows buildDemo produces and writes them
 * out as SQL. Running that SQL against the real schema exercises every foreign
 * key, enum value and not-null constraint — which is where seed bugs actually
 * live.
 */
import { buildDemo } from '../src/lib/seed-core';

const captured: { table: string; rows: any[] }[] = [];

const fake: any = {
  from(table: string) {
    return {
      select: () => ({
        eq: () => ({
          eq: () => Promise.resolve({ data: [] }),
          maybeSingle: () => Promise.resolve({ data: null }),
        }),
        maybeSingle: () => Promise.resolve({ data: null }),
      }),
      insert: (rows: any) => {
        captured.push({ table, rows: Array.isArray(rows) ? rows : [rows] });
        return Promise.resolve({ error: null });
      },
      delete: () => ({ eq: () => Promise.resolve({ error: null }) }),
    };
  },
  auth: {
    admin: {
      createUser: ({ email }: { email: string }) =>
        Promise.resolve({ data: { user: { id: crypto.randomUUID(), email } }, error: null }),
      listUsers: () => Promise.resolve({ data: { users: [] } }),
    },
  },
};

function sqlValue(v: unknown): string {
  if (v === null || v === undefined) return 'NULL';
  if (typeof v === 'number') return String(v);
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (Array.isArray(v)) return `'{${v.join(',')}}'`;
  if (typeof v === 'object') return `'${JSON.stringify(v).replace(/'/g, "''")}'`;
  return `'${String(v).replace(/'/g, "''")}'`;
}

buildDemo(fake, { reset: false }).then((result) => {
  const lines: string[] = ['begin;'];
  let total = 0;

  for (const { table, rows } of captured) {
    for (const row of rows) {
      const cols = Object.keys(row);
      lines.push(
        `insert into ${table} (${cols.map((c) => `"${c}"`).join(', ')}) values ` +
        `(${cols.map((c) => sqlValue(row[c])).join(', ')});`
      );
      total++;
    }
  }
  lines.push('commit;');

  process.stderr.write(
    `${total} rows across ${new Set(captured.map((c) => c.table)).size} tables\n` +
    `${JSON.stringify(result)}\n`
  );
  process.stdout.write(lines.join('\n'));
});
