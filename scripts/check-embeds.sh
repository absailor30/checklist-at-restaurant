#!/usr/bin/env bash
# Guards against ambiguous PostgREST relationship hints.
#
# `submissions` references `users` twice (user_id and reviewed_by), so writing
# users(...) in a select is ambiguous and PostgREST rejects the entire query.
# The resulting null data reads as "no rows", which is how completed tasks came
# to display as still outstanding. The relationship must be named.
set -uo pipefail
cd "$(dirname "$0")/.."

BAD=$(grep -rn "\.select(" src/app/api src/lib \
      | grep -E "[^!_a-zA-Z]users\(" \
      | grep -v "users!" || true)

if [ -n "$BAD" ]; then
  echo "Ambiguous users(...) embed — name the relationship, e.g. users!submissions_user_id_fkey(name):"
  echo "$BAD"
  exit 1
fi

echo "no ambiguous relationship hints"
