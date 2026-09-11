/**
 * Verifies the demo builder against a real PostgreSQL database.
 *
 * Supabase's API is not reachable from every environment, so this substitutes
 * a stand-in client backed by an in-memory store. It captures the rows
 * buildDemo produces, answers the counts and lookups the builder performs, and
 * emits SQL. Running that SQL against the real schema exercises every foreign
 * key, enum value and not-null constraint — which is where seed bugs live.
 */
import { buildDemo } from '../src/lib/seed-core';

const store = new Map<string, any[]>();
const order: { table: string; rows: any[] }[] = [];

function rowsOf(table: string): any[] {
  return store.get(table) ?? [];
}

/** Minimal query builder: enough of the shape the seeder actually uses. */
function query(table: string) {
  const filters: { col: string; value: unknown }[] = [];

  const api: any = {
    select: (_cols?: string, opts?: { count?: string; head?: boolean }) => {
      api._counting = Boolean(opts?.count);
      return api;
    },
    eq: (col: string, value: unknown) => { filters.push({ col, value }); return api; },
    limit: (n: number) => { api._limit = n; return api; },
    order: () => api,
    not: () => api,
    maybeSingle: () => Promise.resolve({ data: matches()[0] ?? null, error: null }),
    single: () => Promise.resolve({ data: matches()[0] ?? null, error: null }),
    then: (resolve: (v: any) => void) => resolve(result()),
    insert: (rows: any) => {
      const list = Array.isArray(rows) ? rows : [rows];

      // Reproduce PostgREST's bulk-insert behaviour: the column list comes
      // from the first row, and any key missing from a later row is sent as
      // NULL. An earlier version of this harness wrote each row with its own
      // columns, which is not what the real API does — and so it missed a
      // NOT NULL violation that only appeared in production.
      const columns = Object.keys(list[0] ?? {});
      const normalised = list.map((row) => {
        const out: any = {};
        for (const c of columns) out[c] = row[c] ?? null;
        return out;
      });

      store.set(table, [...rowsOf(table), ...normalised]);
      order.push({ table, rows: normalised });
      return Promise.resolve({ error: null });
    },
    delete: () => ({
      eq: (col: string, value: unknown) => {
        store.set(table, rowsOf(table).filter((r) => r[col] !== value));
        // Deleting an organisation cascades in the real schema. Most tables
        // carry org_id directly; user_outlets does not, and cascades through
        // users, so it has to be handled by membership.
        if (table === 'organisations') {
          const goneUsers = new Set(
            rowsOf('users').filter((r) => r.org_id === value).map((r) => r.id)
          );
          for (const [t, rows] of store) {
            if (t === 'organisations') continue;
            if (t === 'user_outlets') {
              store.set(t, rows.filter((r) => !goneUsers.has(r.user_id)));
            } else {
              store.set(t, rows.filter((r) => r.org_id !== value));
            }
          }
        }
        return Promise.resolve({ error: null });
      },
    }),
  };

  function matches() {
    return rowsOf(table).filter((r) => filters.every((f) => r[f.col] === f.value));
  }
  function result() {
    let rows = matches();
    if (typeof api._limit === 'number') rows = rows.slice(0, api._limit);
    return api._counting
      ? { count: rows.length, data: rows, error: null }
      : { data: rows, error: null };
  }
  return api;
}

const fake: any = {
  from: (table: string) => query(table),
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

async function main() {
  // Run twice: the second pass proves a rebuild over existing data works,
  // which is the path that actually failed in production.
  const first = await buildDemo(fake, { reset: false });
  process.stderr.write(`first run: ${summary(first)}\n`);

  const second = await buildDemo(fake, { reset: true });
  process.stderr.write(`rebuild:   ${summary(second)}\n`);

  // Emit only the rows surviving in the store, which is what the database
  // would hold after the rebuild.
  const lines: string[] = ['begin;'];
  let total = 0;
  const seen = new Set<string>();

  for (const { table } of order) {
    if (seen.has(table)) continue;
    seen.add(table);
    for (const row of rowsOf(table)) {
      const cols = Object.keys(row);
      lines.push(
        `insert into ${table} (${cols.map((c) => `"${c}"`).join(', ')}) values ` +
        `(${cols.map((c) => sqlValue(row[c])).join(', ')});`
      );
      total++;
    }
  }
  lines.push('commit;');
  process.stderr.write(`${total} rows to write\n`);
  process.stdout.write(lines.join('\n'));
}

function summary(r: any): string {
  return 'alreadyExists' in r
    ? 'already exists'
    : `${r.outlets} outlets, ${r.staff} staff, ${r.submissions} submissions, ${r.frozen} locked`;
}

main().catch((e) => { process.stderr.write(`${e.message}\n`); process.exit(1); });
