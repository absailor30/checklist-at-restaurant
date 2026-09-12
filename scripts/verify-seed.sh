#!/usr/bin/env bash
# Runs the demo builder, turns the rows it produces into SQL, and applies them
# to a real schema. Catches foreign key, enum and not-null problems that a
# mocked database would not.
set -euo pipefail
export PATH=$PATH:/usr/lib/postgresql/16/bin

DB="seedverify_$$"
su pgtest -s /bin/bash -c "/usr/lib/postgresql/16/bin/pg_ctl -D /var/tmp/pgval -o '-k /var/tmp -h \"\"' -l /var/tmp/pg.log start" >/dev/null 2>&1 || true
sleep 2

npx tsx scripts/verify-seed.ts > /var/tmp/seed-verify.sql 2>/var/tmp/seed-verify.err
cat /var/tmp/seed-verify.err
chmod 644 /var/tmp/seed-verify.sql

for f in supabase/migrations/*.sql; do cp "$f" /var/tmp/; done
chmod 644 /var/tmp/0*.sql

su pgtest -s /bin/bash -c "/usr/lib/postgresql/16/bin/psql -h /var/tmp -d postgres -q -c 'drop database if exists $DB;' -c 'create database $DB;'"
su pgtest -s /bin/bash -c "/usr/lib/postgresql/16/bin/psql -h /var/tmp -d $DB -q -f /var/tmp/anon.sql" >/dev/null 2>&1 || true
su pgtest -s /bin/bash -c "/usr/lib/postgresql/16/bin/psql -h /var/tmp -d $DB -q -v ON_ERROR_STOP=1 -f /var/tmp/0001_initial_schema.sql -f /var/tmp/stub2.sql"
for f in /var/tmp/000[2-9]_*.sql; do
  su pgtest -s /bin/bash -c "/usr/lib/postgresql/16/bin/psql -h /var/tmp -d $DB -q -v ON_ERROR_STOP=1 -f $f"
done
su pgtest -s /bin/bash -c "/usr/lib/postgresql/16/bin/psql -h /var/tmp -d $DB -q -v ON_ERROR_STOP=1 -f /var/tmp/seed-verify.sql"

su pgtest -s /bin/bash -c "/usr/lib/postgresql/16/bin/psql -h /var/tmp -d $DB -At -c \"
select 'outlets='||(select count(*) from outlets)
     ||' submissions='||(select count(*) from submissions)
     ||' null_was_late='||(select count(*) from submissions where was_late is null)
     ||' photo_required_items='||(select count(*) from checklist_items where photo_mode='required')\""
su pgtest -s /bin/bash -c "/usr/lib/postgresql/16/bin/psql -h /var/tmp -d postgres -q -c 'drop database $DB;'"
