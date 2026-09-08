import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

// Deliberately fixed project and files. This is not a general-purpose SQL runner.
export const PROJECT_REF = 'sqpdzhannyskdiyuarhp';
export const MIGRATIONS = [
  'supabase/migrations/20260908134135_guest_messaging_phone_consent.sql',
  'supabase/migrations/20260908135705_wifi_instruction_registry.sql',
];

export async function releasePropertyBrain({
  env = process.env,
  fetcher = fetch,
  read = readFile,
  root = fileURLToPath(new URL('../', import.meta.url)),
} = {}) {
  if (env.GITHUB_ACTIONS !== 'true' || env.GITHUB_REF !== 'refs/heads/main' ||
      env.GITHUB_EVENT_NAME !== 'workflow_dispatch') {
    throw new Error('This release is only allowed from a manual main-branch CI run.');
  }
  if (!/^[a-f0-9]{40}$/.test(env.EXPECTED_SHA ?? '') || env.EXPECTED_SHA !== env.GITHUB_SHA) {
    throw new Error('The reviewed release SHA must match this workflow revision.');
  }
  if (!env.SUPABASE_ACCESS_TOKEN) throw new Error('The CI Supabase credential is missing.');
  const files = await Promise.all(MIGRATIONS.map((path) => read(resolve(root, path), 'utf8')));
  // The reviewed files may have standalone transaction wrappers for normal CLI
  // use. Strip only those boundary lines so no inner COMMIT escapes this release.
  const statements = files.map((sql) => sql.replace(/^[ \t]*(?:BEGIN|COMMIT);[ \t]*$/gmi, ''));
  // DDL and registry updates are atomic. No credentials or guest records are
  // returned, and retries are intentionally manual after checking the outcome.
  const query = [
    'BEGIN;',
    "SET LOCAL lock_timeout = '5s';",
    "SET LOCAL statement_timeout = '30s';",
    ...statements,
    `DO $verify$
    BEGIN
      IF (SELECT count(*) FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'guest_access_sessions'
          AND column_name IN ('terms_accepted_at', 'phone_verified_at', 'sms_opted_out_at')) <> 3
        THEN RAISE EXCEPTION 'Messaging schema verification failed'; END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
          WHERE n.nspname = 'public' AND c.relname = 'sms_suppressions' AND c.relrowsecurity)
        THEN RAISE EXCEPTION 'SMS suppression RLS verification failed'; END IF;
      IF (SELECT count(*) FROM public.field_registry
          WHERE field_id IN ('wifi_password_location', 'wifi_connection_instructions')) <> 2
        THEN RAISE EXCEPTION 'Wi-Fi registry verification failed'; END IF;
    END $verify$;`,
    'COMMIT;',
  ].join('\n');
  const response = await fetcher(`https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.SUPABASE_ACCESS_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query, read_only: false }),
    signal: AbortSignal.timeout(45_000),
  });
  if (!response.ok) {
    // Never echo a provider body: it can include SQL, headers or other internals.
    throw new Error(`Migration API returned HTTP ${response.status}. Inspect the CI/provider audit before retrying.`);
  }
  return { project: PROJECT_REF, revision: env.GITHUB_SHA, migrations: MIGRATIONS.length };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  releasePropertyBrain()
    .then((result) => console.log(JSON.stringify({ status: 'applied_and_checked', ...result })))
    .catch((error) => {
      console.error(error?.name === 'TimeoutError'
        ? 'Migration outcome unknown after timeout. Inspect the schema before retrying.'
        : 'Release failed. Check the reviewed revision, CI credentials, and provider audit; no automatic retry was attempted.');
      process.exitCode = 1;
    });
}
