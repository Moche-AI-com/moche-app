#!/usr/bin/env bash
# Applies the Gate 2 migrations to a throwaway local Postgres and runs the
# contract tests against real constraints. No hosted project is touched.
#
# Usage: bash scripts/verify-gate2-sql.sh
set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PGBIN="$(ls -d /usr/lib/postgresql/*/bin | tail -1)"
export PGDATA="${PGDATA:-/tmp/gate2-pgdata}"
export PGPORT="${PGPORT:-55432}"
export PGHOST=/tmp
export PGDATABASE=gate2
export PGUSER="$(id -un)"

if [ ! -d "$PGDATA" ]; then
  "$PGBIN/initdb" -U "$PGUSER" -D "$PGDATA" --auth=trust >/dev/null
fi

"$PGBIN/pg_ctl" -D "$PGDATA" -o "-p $PGPORT -k /tmp -c listen_addresses=''" -l /tmp/gate2-pg.log start >/dev/null 2>&1 || true
for _ in $(seq 1 30); do "$PGBIN/pg_isready" -q -p "$PGPORT" -h /tmp && break; sleep 0.5; done

"$PGBIN/dropdb" --if-exists -p "$PGPORT" -h /tmp "$PGDATABASE" >/dev/null
"$PGBIN/createdb" -p "$PGPORT" -h /tmp "$PGDATABASE"

psql() { "$PGBIN/psql" -p "$PGPORT" -h /tmp -d "$PGDATABASE" -v ON_ERROR_STOP=1 -q "$@"; }

echo "== stubbing the pieces the hosted schema already provides =="
psql -f "$REPO/scripts/gate2-local-stubs.sql"

echo "== applying supabase-migrations-GATE2-REGISTRY.sql =="
psql -f "$REPO/supabase-migrations-GATE2-REGISTRY.sql"

echo "== applying supabase-migrations-GATE2-REGISTRY-SEED.sql =="
psql -f "$REPO/supabase-migrations-GATE2-REGISTRY-SEED.sql"

echo "== applying supabase-migrations-BRAIN-SECTIONS.sql =="
psql -f "$REPO/supabase-migrations-BRAIN-SECTIONS.sql"

echo "== applying supabase-migrations-PROPOSED-UPDATES.sql =="
psql -f "$REPO/supabase-migrations-PROPOSED-UPDATES.sql"
# The grant lives in the stub file because the table does not exist until the
# migration above runs; re-running the stubs is idempotent by construction.
psql -f "$REPO/scripts/gate2-local-stubs.sql"

echo "== idempotency: re-applying all four =="
psql -f "$REPO/supabase-migrations-GATE2-REGISTRY.sql"
psql -f "$REPO/supabase-migrations-GATE2-REGISTRY-SEED.sql"
psql -f "$REPO/supabase-migrations-BRAIN-SECTIONS.sql"
psql -f "$REPO/supabase-migrations-PROPOSED-UPDATES.sql"

echo "== contract tests =="
"$PGBIN/psql" -p "$PGPORT" -h /tmp -d "$PGDATABASE" -v ON_ERROR_STOP=1 \
  -f "$REPO/scripts/gate2-contract-tests.sql"

"$PGBIN/pg_ctl" -D "$PGDATA" stop >/dev/null 2>&1 || true
echo "== GATE 2 SQL VERIFIED =="
