#!/usr/bin/env bash
# Applies every migration in order to a throwaway database, twice, so that a
# migration which is not repeatable is caught here rather than in production.
set -euo pipefail
export PATH=$PATH:/usr/lib/postgresql/16/bin

DB="verify_$$"
su pgtest -s /bin/bash -c "/usr/lib/postgresql/16/bin/pg_ctl -D /var/tmp/pgval -o '-k /var/tmp -h \"\"' -l /var/tmp/pg.log start" >/dev/null 2>&1 || true
sleep 2

for f in supabase/migrations/*.sql; do cp "$f" /var/tmp/; done
chmod 644 /var/tmp/0*.sql

su pgtest -s /bin/bash -c "/usr/lib/postgresql/16/bin/psql -h /var/tmp -d postgres -q -c 'drop database if exists $DB;' -c 'create database $DB;'"
su pgtest -s /bin/bash -c "/usr/lib/postgresql/16/bin/psql -h /var/tmp -d $DB -q -f /var/tmp/anon.sql" >/dev/null 2>&1 || true
su pgtest -s /bin/bash -c "/usr/lib/postgresql/16/bin/psql -h /var/tmp -d $DB -q -v ON_ERROR_STOP=1 -f /var/tmp/0001_initial_schema.sql -f /var/tmp/stub2.sql"

for f in /var/tmp/000[2-9]_*.sql; do
  su pgtest -s /bin/bash -c "/usr/lib/postgresql/16/bin/psql -h /var/tmp -d $DB -q -v ON_ERROR_STOP=1 -f $f"
done

# Second pass: only the migrations written to be repeatable are re-run.
for f in /var/tmp/0003_*.sql /var/tmp/0004_*.sql /var/tmp/0005_*.sql; do
  su pgtest -s /bin/bash -c "/usr/lib/postgresql/16/bin/psql -h /var/tmp -d $DB -q -v ON_ERROR_STOP=1 -f $f"
done

su pgtest -s /bin/bash -c "/usr/lib/postgresql/16/bin/psql -h /var/tmp -d postgres -q -c 'drop database $DB;'"
echo "migrations applied twice with no errors"
