#!/usr/bin/env bash
# Full verification: types, build, database migrations, the seeder against a
# real PostgreSQL instance, every route rendering, and contrast in all four
# theme variants. Exits non-zero if anything fails.
set -uo pipefail
cd "$(dirname "$0")/.."

PASS=0
FAIL=0
step() {
  local name="$1"; shift
  if "$@" >/tmp/verify-step.log 2>&1; then
    echo "  PASS  $name"
    PASS=$((PASS+1))
  else
    echo "  FAIL  $name"
    tail -6 /tmp/verify-step.log | sed 's/^/        /'
    FAIL=$((FAIL+1))
  fi
}

echo "--- types and build ---"
step "typecheck"         npx tsc --noEmit
step "production build"  npx next build

echo "--- queries ---"
step "no ambiguous relationship hints"  bash scripts/check-embeds.sh

echo "--- database ---"
step "migrations apply cleanly"  bash scripts/verify-db.sh
step "seeder produces valid rows" bash scripts/verify-seed.sh

echo "--- rendering ---"
npx next start -p 3125 >/tmp/verify-server.log 2>&1 &
SERVER=$!
for _ in $(seq 1 30); do
  curl -sf -o /dev/null "http://localhost:3125/staff" && break
  sleep 1
done
step "all routes render"  node scripts/page-audit.mjs http://localhost:3125
kill "$SERVER" 2>/dev/null
wait "$SERVER" 2>/dev/null

echo "--- accessibility ---"
cp src/app/globals.css scripts/globals.css
step "contrast in all themes"  bash -c 'node scripts/theme-audit.mjs /tmp/verify-theme | grep -q "TOTAL FAILURES: 0"'
rm -f scripts/globals.css

echo
echo "PASSED: $PASS   FAILED: $FAIL"
[ "$FAIL" -eq 0 ]
