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



-- ===========================================================================
-- E. brain_items.section (supabase-migrations-BRAIN-SECTIONS.sql)
--
-- AGENTS.md Boundary 8: a table structure change ships with an RLS policy test
-- plus a cross-account and unassigned-property negative test. brain_items was
-- previously absent from this harness, so its policies were being trusted rather
-- than asserted. Every denial below is paired with a positive control, because a
-- denial-only suite passes trivially against a table that returns nothing.
-- ===========================================================================

RESET ROLE;
INSERT INTO public.brain_items (id, property_id, category, title, body, section) VALUES
  ('e1111111-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111',
   'core', 'Wi-Fi', 'network and password', 'connectivity'),
  ('e1111111-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111',
   'core', 'Layout', 'three floors', NULL),
  ('e2222222-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222',
   'core', 'Foreign Wi-Fi', 'do not leak this', 'connectivity')
ON CONFLICT DO NOTHING;

-- The column exists, is nullable, and legacy rows are legal without it. NULL is
-- the deliberate representation of "predates sections" -- see the migration header
-- for why no backfill guess is written in.
SELECT pg_temp.expect_eq(
  (SELECT is_nullable FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'brain_items' AND column_name = 'section'),
  'YES', 'E1 brain_items.section is nullable so legacy rows need no backfill');

-- The vocabulary is enforced in the database, not only in TypeScript. Without
-- this CHECK an AI routing pass that hallucinates a section name would persist it
-- and the row would become unreachable from every section view.
SELECT pg_temp.expect_fail($$
  INSERT INTO public.brain_items (property_id, category, title, section)
  VALUES ('11111111-1111-1111-1111-111111111111','core','bad','not_a_real_domain')$$,
  'E2 an invented section is rejected by the CHECK constraint');

SELECT pg_temp.expect_fail($$
  INSERT INTO public.brain_items (property_id, category, title, section)
  VALUES ('11111111-1111-1111-1111-111111111111','core','bad','sys_provenance_audit')$$,
  'E3 a system domain is not a valid host-facing section');

SET ROLE authenticated;
SET "test.user_id" = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

-- POSITIVE CONTROLS. If these fail the denials below prove nothing.
SELECT pg_temp.expect_eq(
  (SELECT count(*)::int FROM public.brain_items), 2,
  'E4 POSITIVE CONTROL: an editor sees exactly their own property''s Brain rows');

SELECT pg_temp.expect_ok($$
  INSERT INTO public.brain_items (property_id, category, title, section)
  VALUES ('11111111-1111-1111-1111-111111111111','core','Parking','parking')$$,
  'E5 POSITIVE CONTROL: an editor can file a row into a section');

SELECT pg_temp.expect_affected($$
  UPDATE public.brain_items SET section = 'access_security'
  WHERE id = 'e1111111-0000-0000-0000-000000000002'$$, 1,
  'E6 POSITIVE CONTROL: an editor can re-section their own row');

-- Cross-account isolation. The foreign property's Wi-Fi row must be invisible and
-- immutable, including via the new column.
SELECT pg_temp.expect_eq(
  (SELECT count(*)::int FROM public.brain_items
    WHERE property_id = '22222222-2222-2222-2222-222222222222'), 0,
  'E7 a foreign property''s Brain rows are invisible');

SELECT pg_temp.expect_affected($$
  UPDATE public.brain_items SET section = 'house_rules'
  WHERE property_id = '22222222-2222-2222-2222-222222222222'$$, 0,
  'E8 cannot re-section a foreign property''s Brain row');

SELECT pg_temp.expect_affected($$
  DELETE FROM public.brain_items
  WHERE property_id = '22222222-2222-2222-2222-222222222222'$$, 0,
  'E9 cannot DELETE a foreign property''s Brain row');

-- The reassignment attack: WITH CHECK on brain_write must make this raise rather
-- than merely filter, otherwise a tenant can push content into another tenancy.
SELECT pg_temp.expect_fail($$
  UPDATE public.brain_items SET property_id = '22222222-2222-2222-2222-222222222222'
  WHERE id = 'e1111111-0000-0000-0000-000000000001'$$,
  'E10 cannot move an owned Brain row into a foreign property');

SELECT pg_temp.expect_fail($$
  INSERT INTO public.brain_items (property_id, category, title, section)
  VALUES ('22222222-2222-2222-2222-222222222222','core','injected','connectivity')$$,
  'E11 cannot insert a Brain row into a foreign property');

-- Unassigned property: a user with no membership row anywhere must behave exactly
-- like a foreign tenant, which is the AGENTS.md negative-test requirement.
SET "test.user_id" = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
SELECT pg_temp.expect_eq(
  (SELECT count(*)::int FROM public.brain_items), 0,
  'E12 a user with no membership anywhere sees no Brain rows');

SELECT pg_temp.expect_fail($$
  INSERT INTO public.brain_items (property_id, category, title, section)
  VALUES ('11111111-1111-1111-1111-111111111111','core','injected','connectivity')$$,
  'E13 an unassigned user cannot file a Brain row');

-- Member-but-not-editor: reads sections, cannot write them.
SET "test.user_id" = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
SELECT pg_temp.expect_eq(
  (SELECT count(*)::int FROM public.brain_items), 3,
  'E14 POSITIVE CONTROL: a viewer reads their own property''s Brain rows');

SELECT pg_temp.expect_affected($$
  UPDATE public.brain_items SET section = 'amenities'
  WHERE property_id = '11111111-1111-1111-1111-111111111111'$$, 0,
  'E15 a viewer cannot re-section their own property''s rows');

SET "test.user_id" = '';
SELECT pg_temp.expect_eq(
  (SELECT count(*)::int FROM public.brain_items), 0,
  'E16 an unauthenticated session sees no Brain rows');

RESET ROLE;


-- ===========================================================================
-- F. proposed_updates (supabase-migrations-PROPOSED-UPDATES.sql)
--
-- Phase E moves the approval queue into a per-property tab, which means a page
-- rendered under one property's breadcrumb now issues the reads and the decision
-- writes for that property. The application scopes every query by property_id,
-- and test/ai-updates-surface.test.ts asserts that it does — but an application
-- filter is a correctness measure, not a security boundary. If that filter were
-- ever dropped, RLS is the thing that still stops a viewer of one property from
-- reading or approving another tenant's proposals. That was previously trusted
-- rather than asserted, so it is asserted here.
--
-- No table structure changed in Phase E; this section is added because the
-- surface reading the table changed, and the AGENTS.md Boundary 8 pattern
-- (policy test + cross-account + unassigned-property negative, each paired with
-- a positive control) is the right shape for that too.
-- ===========================================================================

RESET ROLE;
INSERT INTO public.host_accounts (id) VALUES
  ('dddddddd-dddd-dddd-dddd-dddddddddddd')
ON CONFLICT DO NOTHING;
INSERT INTO public.profiles (id) VALUES
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  ('cccccccc-cccc-cccc-cccc-cccccccccccc')
ON CONFLICT DO NOTHING;

-- One pending proposal on the property our editor can edit, one on the foreign
-- tenant's property. Inserted as owner, mirroring production where proposals are
-- written by server-side ingestion running as the service role.
INSERT INTO public.proposed_updates
  (id, property_id, host_account_id, field_path, label, proposed_value, source_type)
VALUES
  ('f0000000-0000-0000-0000-000000000001',
   '11111111-1111-1111-1111-111111111111', 'dddddddd-dddd-dddd-dddd-dddddddddddd',
   'brain_value.checkout_time', 'Check-out time', '"11:00 AM"'::jsonb, 'listing_url'),
  ('f0000000-0000-0000-0000-000000000002',
   '22222222-2222-2222-2222-222222222222', 'dddddddd-dddd-dddd-dddd-dddddddddddd',
   'brain_value.checkout_time', 'Check-out time', '"10:00 AM"'::jsonb, 'listing_url')
ON CONFLICT DO NOTHING;

-- The status/review consistency constraint is what stops "denied 3 weeks ago, by
-- nobody, at no time" from being representable. The trigger stamps reviewed_at on
-- the transition out of pending, so the constraint can only be violated by
-- inserting an already-decided row directly.
SELECT pg_temp.expect_fail($$
  INSERT INTO public.proposed_updates
    (property_id, host_account_id, field_path, label, proposed_value, source_type,
     status, reviewed_at)
  VALUES ('11111111-1111-1111-1111-111111111111',
          'dddddddd-dddd-dddd-dddd-dddddddddddd',
          'brain_value.parking', 'Parking', '"street"'::jsonb, 'listing_url',
          'modified', now())$$,
  'F1 a modified proposal cannot exist without the value that was applied');

-- The source vocabulary is a CHECK, not free text: an unrecognized source would
-- let ingestion invent a provenance the review UI cannot label.
SELECT pg_temp.expect_fail($$
  INSERT INTO public.proposed_updates
    (property_id, host_account_id, field_path, label, proposed_value, source_type)
  VALUES ('11111111-1111-1111-1111-111111111111',
          'dddddddd-dddd-dddd-dddd-dddddddddddd',
          'brain_value.parking', 'Parking', '"street"'::jsonb, 'guesswork')$$,
  'F2 an unrecognized source_type is rejected');

-- field_path is free-form by design (the allowlist lives in the application) but
-- shape-checked, so a path that could never resolve cannot even be stored.
SELECT pg_temp.expect_fail($$
  INSERT INTO public.proposed_updates
    (property_id, host_account_id, field_path, label, proposed_value, source_type)
  VALUES ('11111111-1111-1111-1111-111111111111',
          'dddddddd-dddd-dddd-dddd-dddddddddddd',
          '../../etc/passwd', 'Parking', '"street"'::jsonb, 'listing_url')$$,
  'F3 a malformed field_path is rejected at the column');

SET ROLE authenticated;

-- Editor on property A.
SET "test.user_id" = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

SELECT pg_temp.expect_eq(
  (SELECT count(*)::int FROM public.proposed_updates), 1,
  'F4 POSITIVE CONTROL: an editor sees their own property''s proposal');

SELECT pg_temp.expect_eq(
  (SELECT count(*)::int FROM public.proposed_updates
   WHERE property_id = '22222222-2222-2222-2222-222222222222'), 0,
  'F5 CROSS-ACCOUNT: the foreign tenant''s proposal is invisible even when named');

SELECT pg_temp.expect_affected($$
  UPDATE public.proposed_updates SET status = 'approved'
  WHERE id = 'f0000000-0000-0000-0000-000000000002'$$, 0,
  'F6 CROSS-ACCOUNT: an editor cannot decide a foreign tenant''s proposal');

-- The reassignment attack, the same one brain_items is tested for: WITH CHECK is
-- what stops a decidable row from being moved somewhere the caller cannot edit.
-- expect_fail, not expect_affected: USING filters silently, but a WITH CHECK
-- violation raises. The distinction matters — an expect_affected here would pass
-- even if the policy had no WITH CHECK at all and the row simply moved.
SELECT pg_temp.expect_fail($$
  UPDATE public.proposed_updates
  SET property_id = '22222222-2222-2222-2222-222222222222'
  WHERE id = 'f0000000-0000-0000-0000-000000000001'$$,
  'F7 a proposal cannot be reassigned into a property the caller cannot edit');

-- Proposals are created by server-side ingestion only. A session that could
-- insert here could fabricate a proposal and then approve its own fabrication,
-- which defeats the entire purpose of the queue.
SELECT pg_temp.expect_fail($$
  INSERT INTO public.proposed_updates
    (property_id, host_account_id, field_path, label, proposed_value, source_type)
  VALUES ('11111111-1111-1111-1111-111111111111',
          'dddddddd-dddd-dddd-dddd-dddddddddddd',
          'brain_value.wifi_password', 'Wi-Fi password', '"redacted"'::jsonb,
          'ai_suggestion')$$,
  'F8 a browser session cannot fabricate a proposal');

-- No DELETE grant at all, so this is a table-level rejection rather than a
-- silent no-op. Either would be acceptable; asserting the stronger one.
SELECT pg_temp.expect_fail($$
  DELETE FROM public.proposed_updates
  WHERE id = 'f0000000-0000-0000-0000-000000000001'$$,
  'F9 a proposal cannot be deleted: rows retire by status, so the record survives');

-- Member but not editor: the tab renders read-only for this user, and the
-- database agrees rather than relying on the UI to withhold the buttons.
SET "test.user_id" = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
SELECT pg_temp.expect_eq(
  (SELECT count(*)::int FROM public.proposed_updates), 1,
  'F10 POSITIVE CONTROL: a viewer reads their own property''s proposals');

SELECT pg_temp.expect_affected($$
  UPDATE public.proposed_updates SET status = 'denied'
  WHERE id = 'f0000000-0000-0000-0000-000000000001'$$, 0,
  'F11 a viewer cannot decide a proposal on a property they only read');

-- The editor's own decision, asserted last so the denials above ran against a
-- genuinely pending row. This is the positive control for the whole section: if
-- it failed, every denial above would be passing trivially.
SET "test.user_id" = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
SELECT pg_temp.expect_affected($$
  UPDATE public.proposed_updates SET status = 'approved'
  WHERE id = 'f0000000-0000-0000-0000-000000000001'$$, 1,
  'F12 POSITIVE CONTROL: an editor can decide their own property''s proposal');

-- And the trigger stamped the review time without the API having to remember to.
SELECT pg_temp.expect_eq(
  (SELECT reviewed_at IS NOT NULL FROM public.proposed_updates
   WHERE id = 'f0000000-0000-0000-0000-000000000001'), true,
  'F13 the review timestamp is stamped by the trigger, not trusted to the caller');

-- UNASSIGNED PROPERTY: a property with no membership row at all. The queue must
-- not treat "nobody owns this" as "everybody may decide it".
RESET ROLE;
INSERT INTO public.properties (id, name) VALUES
  ('33333333-3333-3333-3333-333333333333', 'Property C (unassigned)')
ON CONFLICT DO NOTHING;
INSERT INTO public.proposed_updates
  (id, property_id, host_account_id, field_path, label, proposed_value, source_type)
VALUES ('f0000000-0000-0000-0000-000000000003',
        '33333333-3333-3333-3333-333333333333', 'dddddddd-dddd-dddd-dddd-dddddddddddd',
        'brain_value.parking', 'Parking', '"driveway"'::jsonb, 'listing_url')
ON CONFLICT DO NOTHING;

SET ROLE authenticated;
SET "test.user_id" = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
SELECT pg_temp.expect_eq(
  (SELECT count(*)::int FROM public.proposed_updates
   WHERE property_id = '33333333-3333-3333-3333-333333333333'), 0,
  'F14 UNASSIGNED: an unassigned property''s proposals are visible to nobody');

SELECT pg_temp.expect_affected($$
  UPDATE public.proposed_updates SET status = 'approved'
  WHERE id = 'f0000000-0000-0000-0000-000000000003'$$, 0,
  'F15 UNASSIGNED: an unassigned property''s proposals are decidable by nobody');

SET "test.user_id" = '';
SELECT pg_temp.expect_eq(
  (SELECT count(*)::int FROM public.proposed_updates), 0,
  'F16 an unauthenticated session sees no proposals');

RESET ROLE;

\echo '== all contract tests passed =='
