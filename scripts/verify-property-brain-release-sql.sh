#!/usr/bin/env bash
# Offline regression for the exact SQL assembled by release-property-brain.mjs.
# Uses a private Unix-socket-only Postgres cluster, never a hosted database.
# Run: bash scripts/verify-property-brain-release-sql.sh
set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PGBIN="$(ls -d /usr/lib/postgresql/*/bin | tail -1)"
WORK="$(mktemp -d "${TMPDIR:-/tmp}/property-brain-release-sql.XXXXXX")"
PORT="${PROPERTY_BRAIN_RELEASE_TEST_PORT:-55587}"
mkdir "$WORK/socket"
echo "Offline SQL evidence: $WORK"
trap '"$PGBIN/pg_ctl" -D "$WORK/data" stop >/dev/null 2>&1 || true' EXIT

# Capture through an injected transport. Real migration reads and real assembly;
# no access token, environment file, hosted client or network request is used.
node --input-type=module - "$REPO" "$WORK" <<'JS'
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
const [root, work] = process.argv.slice(2);
globalThis.fetch = () => { throw new Error('Network forbidden in offline SQL test'); };
const { releasePropertyBrain } = await import(pathToFileURL(`${root}/scripts/release-property-brain.mjs`));
const sha = 'a'.repeat(40);
let captured;
await releasePropertyBrain({
  root,
  env: {
    GITHUB_ACTIONS: 'true', GITHUB_REF: 'refs/heads/main',
    GITHUB_EVENT_NAME: 'workflow_dispatch', GITHUB_SHA: sha,
    EXPECTED_SHA: sha, SUPABASE_ACCESS_TOKEN: 'synthetic-offline-fixture',
  },
  fetcher: async (_url, request) => {
    assert.equal(captured, undefined, 'release must submit only once');
    captured = JSON.parse(request.body).query;
    return { ok: true };
  },
});
assert.equal(typeof captured, 'string');
const marker = 'DO $verify$\n    BEGIN';
assert.equal(captured.split(marker).length, 2, 'final verification must exist exactly once');
await writeFile(`${work}/actual.sql`, captured);
await writeFile(`${work}/fault.sql`, captured.replace(marker,
  `${marker}\n      RAISE EXCEPTION 'SYNTHETIC_RELEASE_ASSERTION_FAILURE';`));
JS

"$PGBIN/initdb" -D "$WORK/data" -U "$(id -un)" --auth=trust > "$WORK/init.log"
"$PGBIN/pg_ctl" -D "$WORK/data" \
  -o "-p $PORT -k $WORK/socket -c listen_addresses=''" \
  -l "$WORK/server.log" start > /dev/null
"$PGBIN/createdb" -h "$WORK/socket" -p "$PORT" -U "$(id -un)" release_contract
psql() {
  "$PGBIN/psql" -X -h "$WORK/socket" -p "$PORT" -U "$(id -un)" \
    -d release_contract -v ON_ERROR_STOP=1 "$@"
}
psql -f "$REPO/scripts/gate2-local-stubs.sql" > "$WORK/setup.log" 2>&1
psql -f "$REPO/supabase/migrations/supabase-migrations-GATE2-REGISTRY.sql" >> "$WORK/setup.log" 2>&1
psql -f "$REPO/scripts/messaging-local-stubs.sql" >> "$WORK/setup.log" 2>&1

# -c sends the entire payload as one query, like the release's one API request.
# A failure must be the deliberate final assertion, not an earlier schema error.
if psql -c "$(cat "$WORK/fault.sql")" > "$WORK/fault.log" 2>&1; then
  echo 'FAIL: final assertion unexpectedly succeeded'
  exit 1
fi
if ! grep -q 'ERROR:  SYNTHETIC_RELEASE_ASSERTION_FAILURE' "$WORK/fault.log"; then
  cat "$WORK/fault.log"
  echo 'FAIL: SQL did not reach the final assertion'
  exit 1
fi

# A fresh connection proves the failure did not durably commit either migration.
psql > "$WORK/rollback.log" 2>&1 <<'SQL'
DO $rollback$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'guest_access_sessions'
      AND column_name IN ('terms_accepted_at', 'phone_verified_at', 'sms_opted_out_at')
  ) THEN RAISE EXCEPTION 'Messaging columns persisted after failed verification'; END IF;
  IF to_regclass('public.sms_suppressions') IS NOT NULL
    THEN RAISE EXCEPTION 'Suppression table persisted after failed verification'; END IF;
  IF EXISTS (SELECT 1 FROM public.field_registry
    WHERE field_id IN ('wifi_password_location', 'wifi_connection_instructions'))
    THEN RAISE EXCEPTION 'Wi-Fi definitions persisted after failed verification'; END IF;
  IF EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_protect_profile_phone_verification')
    THEN RAISE EXCEPTION 'Phone-proof trigger persisted after failed verification'; END IF;
END $rollback$;
SQL
echo 'PASS: final assertion failure rolls back both actual migrations'

psql -c "$(cat "$WORK/actual.sql")" > "$WORK/apply.log" 2>&1
echo 'PASS: actual release succeeds with its final assertions'
psql -c "$(cat "$WORK/actual.sql")" > "$WORK/reapply.log" 2>&1
echo 'PASS: actual release is idempotent'
psql -f "$REPO/scripts/messaging-contract-tests.sql" > "$WORK/messaging.log" 2>&1
echo 'PASS: real messaging authorization and proof contracts'
echo 'PROPERTY BRAIN RELEASE SQL VERIFIED'
