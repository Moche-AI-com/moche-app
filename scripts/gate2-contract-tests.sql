-- Gate 2 / Gate 3 contract test suite.
--
-- Every constraint that the directive relies on is asserted here against a real
-- Postgres. A test that passes because a constraint is missing is worse than no
-- test, so each negative case is paired with a positive control proving the
-- write path works when it should (Section 0.1a).
--
-- Run via scripts/verify-gate2-sql.sh. Exits non-zero on the first failure.

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

CREATE OR REPLACE FUNCTION pg_temp.expect_ok(sql text, label text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE sql;
  RAISE NOTICE 'PASS  %', label;
END $$;

-- RLS filters writes silently: a denied UPDATE/DELETE affects zero rows rather
-- than raising. Asserting the row count is the only way to prove the denial.
CREATE OR REPLACE FUNCTION pg_temp.expect_affected(sql text, expected int, label text)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE n int;
BEGIN
  EXECUTE sql;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> expected THEN
    RAISE EXCEPTION 'FAIL  %  — % row(s) affected, expected %', label, n, expected;
  END IF;
  RAISE NOTICE 'PASS  %  (% rows affected)', label, n;
END $$;

CREATE OR REPLACE FUNCTION pg_temp.expect_eq(actual anyelement, expected anyelement, label text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF actual::text IS DISTINCT FROM expected::text THEN
    RAISE EXCEPTION 'FAIL  %  — got %, expected %', label, actual, expected;
  END IF;
  RAISE NOTICE 'PASS  %  (= %)', label, expected;
END $$;

-- ---------------------------------------------------------------------------
-- Fixtures: two properties in two different tenancies, and one user who is an
-- editor on property A only. This is the shape every isolation test needs.
-- ---------------------------------------------------------------------------

INSERT INTO public.properties (id, name) VALUES
  ('11111111-1111-1111-1111-111111111111', 'Property A (user is editor)'),
  ('22222222-2222-2222-2222-222222222222', 'Property B (foreign tenant)')
ON CONFLICT DO NOTHING;

INSERT INTO public.property_members (property_id, profile_id, can_edit) VALUES
  ('11111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', true),
  -- Viewer on A, so "member but not editor" is covered too.
  ('11111111-1111-1111-1111-111111111111', 'cccccccc-cccc-cccc-cccc-cccccccccccc', false)
ON CONFLICT DO NOTHING;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.brain_values TO authenticated;
GRANT SELECT ON public.field_registry TO authenticated;
GRANT SELECT ON public.properties, public.property_members TO authenticated;

-- ===========================================================================
-- A. Registry integrity
-- ===========================================================================

SELECT pg_temp.expect_eq(
  (SELECT count(*)::int FROM public.field_registry), 53,
  'A1 registry materialized with every declared field');

SELECT pg_temp.expect_eq(
  (SELECT count(*)::int FROM public.field_registry WHERE hard_block), 6,
  'A2 exactly six hard-block fields (Section 5.3)');

-- Amendment 001-A.2: the denominator excludes hidden system sections.
SELECT pg_temp.expect_eq(
  (SELECT count(*)::int FROM public.field_registry WHERE system_section AND gap_weight <> 0), 0,
  'A3 no system-section field carries scoring weight');

SELECT pg_temp.expect_eq(
  (SELECT count(*)::int FROM public.field_registry WHERE type = 'secret' AND NOT storage_vault), 0,
  'A4 every secret-typed field routes to Vault (Section 3.2)');

-- Section 3: a field declaring a fallback must name a real one.
SELECT pg_temp.expect_eq(
  (SELECT count(*)::int FROM public.field_registry r
   WHERE r.requires_on_failure
     AND (r.on_failure_field IS NULL
          OR NOT EXISTS (SELECT 1 FROM public.field_registry x WHERE x.field_id = r.on_failure_field))), 0,
  'A5 every on_failure_field resolves to a declared field');

-- Amendment 001-B.3 must hold for every registry default, not just at write time.
SELECT pg_temp.expect_eq(
  (SELECT count(*)::int FROM public.field_registry
   WHERE NOT public.audience_permitted_for_tier(sensitivity_tier, default_audience)), 0,
  'A6 every registry default_audience satisfies the compatibility matrix');

SELECT pg_temp.expect_fail($$
  INSERT INTO public.field_registry (
    field_id,label,domain,type,sensitivity_tier,default_audience,phase,
    storage_table,storage_column,interview_prompt,registry_version)
  VALUES ('bogus_leak','Leaky','connectivity','string',
          'stay_scoped_secret','guest_public','{check-in}',
          'brain_values','value','x',1)$$,
  'A7 registry rejects a secret tier addressed to a public guest surface');

SELECT pg_temp.expect_fail($$
  INSERT INTO public.field_registry (
    field_id,label,domain,type,sensitivity_tier,default_audience,phase,
    storage_table,storage_column,interview_prompt,registry_version,
    system_section,gap_weight)
  VALUES ('bogus_scored_system','Sys','sys_provenance_audit','text',
          'host_only','system_internal','{booking}',
          'brain_values','value','x',1,true,2.0)$$,
  'A8 registry rejects a scored system-section field');

-- ===========================================================================
-- B. brain_values envelope constraints (as table owner, RLS not yet in play)
-- ===========================================================================

SELECT pg_temp.expect_ok($$
  INSERT INTO public.brain_values
    (property_id, field_id, value, sensitivity_tier, audience, source, confidence)
  VALUES ('11111111-1111-1111-1111-111111111111','checkout_time',
          '"11:00"'::jsonb,'public_guest','guest_public','host_verified',1.00)$$,
  'B1 positive control: a well-formed public fact is accepted');

SELECT pg_temp.expect_ok($$
  INSERT INTO public.brain_values
    (property_id, field_id, secret_ref_or_ciphertext, sensitivity_tier, audience, source)
  VALUES ('11111111-1111-1111-1111-111111111111','door_code_or_entry_method',
          'vault://moche/prop-a/door_code','stay_scoped_secret','guest_instay','host_verified')$$,
  'B2 positive control: a Vault-pointer secret is accepted');

SELECT pg_temp.expect_fail($$
  INSERT INTO public.brain_values
    (property_id, field_id, value, sensitivity_tier, audience, source)
  VALUES ('11111111-1111-1111-1111-111111111111','wifi_password',
          '"hunter2"'::jsonb,'stay_scoped_secret','guest_instay','host_verified')$$,
  'B3 a stay-scoped secret cannot be stored as plaintext jsonb (Section 6)');

SELECT pg_temp.expect_fail($$
  INSERT INTO public.brain_values
    (property_id, field_id, value, secret_ref_or_ciphertext, sensitivity_tier, audience, source)
  VALUES ('11111111-1111-1111-1111-111111111111','nearest_pharmacy',
          '"CVS"'::jsonb,'vault://x','public_guest','guest_public','host_verified')$$,
  'B4 a row cannot carry both a value and a secret pointer');

SELECT pg_temp.expect_fail($$
  INSERT INTO public.brain_values
    (property_id, field_id, sensitivity_tier, audience, source)
  VALUES ('11111111-1111-1111-1111-111111111111','nearest_pharmacy',
          'public_guest','guest_public','host_verified')$$,
  'B5 a row cannot be empty of both payload columns');

-- Amendment 001-B.3 at the value layer. This is the leak the enum exists to stop.
SELECT pg_temp.expect_fail($$
  INSERT INTO public.brain_values
    (property_id, field_id, secret_ref_or_ciphertext, sensitivity_tier, audience, source)
  VALUES ('11111111-1111-1111-1111-111111111111','wifi_password',
          'vault://x','stay_scoped_secret','guest_prearrival','host_verified')$$,
  'B6 a door/Wi-Fi secret cannot be addressed to a pre-arrival surface');

SELECT pg_temp.expect_fail($$
  INSERT INTO public.brain_values
    (property_id, field_id, value, sensitivity_tier, audience, source)
  VALUES ('11111111-1111-1111-1111-111111111111','utility_shutoff_locations',
          '"basement"'::jsonb,'host_only','guest_instay','host_verified')$$,
  'B7 a host_only fact cannot be addressed to any guest surface');

-- The registry, not the caller, sets the tier.
SELECT pg_temp.expect_ok($$
  INSERT INTO public.brain_values
    (property_id, field_id, value, sensitivity_tier, audience, source)
  VALUES ('11111111-1111-1111-1111-111111111111','quiet_hours',
          '"10pm-8am"'::jsonb,'public_guest','guest_public','host_verified')$$,
  'B8a positive control: quiet_hours accepted at its registry tier');

SELECT pg_temp.expect_fail($$
  UPDATE public.brain_values SET sensitivity_tier = 'host_only'
  WHERE field_id = 'quiet_hours'$$,
  'B8b a caller cannot relabel a field''s tier away from the registry');

-- Audience may narrow, never widen, relative to the registry default.
SELECT pg_temp.expect_ok($$
  INSERT INTO public.brain_values
    (property_id, field_id, value, sensitivity_tier, audience, source)
  VALUES ('11111111-1111-1111-1111-111111111111','smoking_policy',
          '"No smoking"'::jsonb,'public_guest','host_private','host_verified')$$,
  'B9 positive control: a fact may be addressed more narrowly than the default');

SELECT pg_temp.expect_fail($$
  INSERT INTO public.brain_values
    (property_id, field_id, value, sensitivity_tier, audience, source)
  VALUES ('11111111-1111-1111-1111-111111111111','area_safety_notes',
          '"quiet"'::jsonb,'public_guest','guest_public','host_verified')$$,
  'B10 a fact cannot be addressed wider than its registry default');

SELECT pg_temp.expect_fail($$
  INSERT INTO public.brain_values
    (property_id, field_id, value, sensitivity_tier, audience, source)
  VALUES ('11111111-1111-1111-1111-111111111111','not_a_real_field',
          '"x"'::jsonb,'public_guest','guest_public','host_verified')$$,
  'B11 an undeclared field_id is rejected');

SELECT pg_temp.expect_fail($$
  INSERT INTO public.brain_values
    (property_id, field_id, value, sensitivity_tier, audience, source)
  VALUES ('11111111-1111-1111-1111-111111111111','checkout_time',
          '"12:00"'::jsonb,'public_guest','guest_public','host_verified')$$,
  'B12 a second active value for the same field is rejected');

-- TTL default comes from the registry, not the caller.
SELECT pg_temp.expect_eq(
  (SELECT (ttl_expires_at IS NOT NULL) FROM public.brain_values
   WHERE field_id = 'door_code_or_entry_method'), true,
  'B13 ttl_expires_at is populated from registry ttl_days');

-- ===========================================================================
-- C. Cross-property isolation regression suite
-- ===========================================================================
-- Standing regression tests. If any C-test flips, tenant isolation has broken.

-- Seed a fact on the FOREIGN property, as owner, so there is something to leak.
INSERT INTO public.brain_values
  (property_id, field_id, value, sensitivity_tier, audience, source)
VALUES ('22222222-2222-2222-2222-222222222222','checkout_time',
        '"09:00"'::jsonb,'public_guest','guest_public','host_verified');

SET ROLE authenticated;
SET "test.user_id" = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

-- C0 is the positive control required by Section 0.1a: a test suite that only
-- proves denial can pass trivially against a table that returns nothing at all.
SELECT pg_temp.expect_eq(
  (SELECT count(*)::int FROM public.brain_values
   WHERE property_id = '11111111-1111-1111-1111-111111111111'), 4,
  'C0 POSITIVE CONTROL: an editor does see their own property''s facts');

SELECT pg_temp.expect_eq(
  (SELECT count(*)::int FROM public.brain_values
   WHERE property_id = '22222222-2222-2222-2222-222222222222'), 0,
  'C1 a member of property A sees zero rows from property B');

SELECT pg_temp.expect_eq(
  (SELECT count(*)::int FROM public.brain_values), 4,
  'C2 an unqualified SELECT returns only in-tenant rows');

SELECT pg_temp.expect_fail($$
  INSERT INTO public.brain_values
    (property_id, field_id, value, sensitivity_tier, audience, source)
  VALUES ('22222222-2222-2222-2222-222222222222','quiet_hours',
          '"injected"'::jsonb,'public_guest','host_private','inferred')$$,
  'C3 cannot INSERT a fact into a foreign property');

-- The reassignment attack. Without WITH CHECK on the UPDATE policy this
-- succeeds and silently hands a tenant's facts to another tenant. WITH CHECK
-- makes it raise rather than merely filter, which is the stronger outcome.
SELECT pg_temp.expect_fail($$
  UPDATE public.brain_values SET property_id = '22222222-2222-2222-2222-222222222222'
  WHERE property_id = '11111111-1111-1111-1111-111111111111'$$,
  'C4 cannot move an owned fact into a foreign property');

SELECT pg_temp.expect_affected($$
  UPDATE public.brain_values SET value = '"tampered"'::jsonb
  WHERE property_id = '22222222-2222-2222-2222-222222222222'$$, 0,
  'C5 cannot UPDATE a foreign property''s fact');

SELECT pg_temp.expect_affected($$
  DELETE FROM public.brain_values
  WHERE property_id = '22222222-2222-2222-2222-222222222222'$$, 0,
  'C6 cannot DELETE a foreign property''s fact');

-- An unassigned property (no membership row at all) must behave like a foreign
-- one, which is the AGENTS.md negative-test requirement.
SET "test.user_id" = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
SELECT pg_temp.expect_eq(
  (SELECT count(*)::int FROM public.brain_values), 0,
  'C7 a user with no membership anywhere sees nothing');

-- Member-but-not-editor: can read, cannot write.
SET "test.user_id" = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
SELECT pg_temp.expect_eq(
  (SELECT count(*)::int FROM public.brain_values), 4,
  'C8 POSITIVE CONTROL: a viewer reads their own property''s facts');

SELECT pg_temp.expect_fail($$
  INSERT INTO public.brain_values
    (property_id, field_id, value, sensitivity_tier, audience, source)
  VALUES ('11111111-1111-1111-1111-111111111111','trash_schedule',
          '"Tuesday"'::jsonb,'public_guest','guest_instay','host_chat')$$,
  'C9 a viewer cannot write to their own property');

SELECT pg_temp.expect_affected($$
  UPDATE public.brain_values SET value = '"12:00"'::jsonb
  WHERE field_id = 'checkout_time'$$, 0,
  'C10 a viewer cannot update their own property');

-- A session with no identity at all is the anonymous case.
SET "test.user_id" = '';
SELECT pg_temp.expect_eq(
  (SELECT count(*)::int FROM public.brain_values), 0,
  'C11 an unauthenticated session sees nothing');

RESET ROLE;

-- The registry itself is read-only to authenticated: no policy grants writes.
SET ROLE authenticated;
SELECT pg_temp.expect_fail($$
  UPDATE public.field_registry SET gap_weight = 0 WHERE field_id = 'parking'$$,
  'C12 authenticated cannot mutate the registry');
RESET ROLE;

\echo '== all contract tests passed =='
