-- Door-code host-only contract tests (2026-10-01).
--
-- Companion to scripts/gate2-contract-tests.sql. Run after it, against the same
-- database, via scripts/verify-gate2-sql.sh. Each denial is paired with a
-- positive control (Section 0.1a).
--
-- NOTE for scripts/gate2-contract-tests.sql (updated in the same PR checklist):
--   A1 expects 56 registry fields (entry_instructions added).
--   B2 must insert the door code at host_only / host_private.

\set ON_ERROR_STOP on
\timing off
SET client_min_messages = notice;

CREATE OR REPLACE FUNCTION pg_temp.expect_fail(sql text, label text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  BEGIN
    EXECUTE sql;
  EXCEPTION WHEN others THEN
    RAISE NOTICE 'PASS  %  (rejected: %)', label, left(SQLERRM, 90);
    RETURN;
  END;
  RAISE EXCEPTION 'FAIL  %  — the write was ACCEPTED but must be rejected', label;
END $$;

CREATE OR REPLACE FUNCTION pg_temp.expect_eq(actual anyelement, expected anyelement, label text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF actual::text IS DISTINCT FROM expected::text THEN
    RAISE EXCEPTION 'FAIL  %  — got %, expected %', label, actual, expected;
  END IF;
  RAISE NOTICE 'PASS  %  (= %)', label, expected;
END $$;

SELECT pg_temp.expect_eq(
  (SELECT count(*)::int FROM public.field_registry
   WHERE field_id = 'door_code_or_entry_method' AND type = 'secret'
     AND sensitivity_tier = 'host_only' AND default_audience = 'host_private'
     AND storage_vault AND gap_weight = 0 AND NOT hard_block), 1,
  'DC1 door code is a host-only Vault secret, optional and unscored');

SELECT pg_temp.expect_eq(
  (SELECT count(*)::int FROM public.field_registry
   WHERE field_id = 'entry_instructions' AND type = 'text'
     AND sensitivity_tier = 'guest_after_verification'
     AND storage_column = 'value' AND NOT storage_vault AND hard_block), 1,
  'DC2 guest entry instructions are guest-safe text and the access hard block');

SELECT pg_temp.expect_eq(
  (SELECT count(*)::int FROM public.field_registry WHERE hard_block), 6,
  'DC3 still exactly six hard blocks');

SELECT pg_temp.expect_eq(
  (SELECT count(*)::int FROM public.field_registry
   WHERE field_id = 'door_code_or_entry_method' AND hard_block), 0,
  'DC4 the door code is not a hard block');

SELECT pg_temp.expect_fail($$
  INSERT INTO public.brain_values
    (property_id, field_id, secret_ref_or_ciphertext, sensitivity_tier, audience, source)
  VALUES ('22222222-2222-2222-2222-222222222222','door_code_or_entry_method',
          'vault://x','host_only','guest_instay','host_verified')$$,
  'DC5 a door code cannot be addressed to any guest surface');

SELECT pg_temp.expect_fail($$
  INSERT INTO public.brain_values
    (property_id, field_id, value, sensitivity_tier, audience, source)
  VALUES ('22222222-2222-2222-2222-222222222222','door_code_or_entry_method',
          '"4821"'::jsonb,'host_only','host_private','host_verified')$$,
  'DC6 a door code cannot be stored as plaintext');

SELECT pg_temp.expect_eq(
  (SELECT has_function_privilege('authenticated',
     'public.brain_values_set_secret(uuid, text, text, uuid)', 'EXECUTE')), false,
  'DC7 authenticated cannot call the Vault write function directly');

SELECT pg_temp.expect_eq(
  (SELECT has_function_privilege('authenticated',
     'public.brain_values_read_host_secret(uuid, text)', 'EXECUTE')
   OR has_function_privilege('anon',
     'public.brain_values_read_host_secret(uuid, text)', 'EXECUTE')), false,
  'DC8 neither anon nor authenticated can call the host secret read');

\echo '== door-code contract tests passed =='
