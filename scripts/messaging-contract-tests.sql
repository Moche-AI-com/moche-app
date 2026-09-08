\set ON_ERROR_STOP on
BEGIN;
INSERT INTO public.properties(id, name) VALUES
 ('a1000000-0000-4000-8000-000000000001','Synthetic property A'),
 ('a1000000-0000-4000-8000-000000000002','Synthetic property B');
INSERT INTO public.property_members(property_id, profile_id, can_edit) VALUES
 ('a1000000-0000-4000-8000-000000000001','a2000000-0000-4000-8000-000000000001',true),
 ('a1000000-0000-4000-8000-000000000002','a2000000-0000-4000-8000-000000000002',true);
INSERT INTO public.guest_access_sessions(id,property_id,stay_id,verified_at) VALUES
 ('a3000000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000001','a4000000-0000-4000-8000-000000000001',now()),
 ('a3000000-0000-4000-8000-000000000002','a1000000-0000-4000-8000-000000000002','a4000000-0000-4000-8000-000000000002',now());
INSERT INTO public.profiles(id,full_name) VALUES
 ('a2000000-0000-4000-8000-000000000001','Synthetic A'),
 ('a2000000-0000-4000-8000-000000000002','Synthetic B');

DO $$
BEGIN
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid='public.sms_suppressions'::regclass)
     OR NOT (SELECT relrowsecurity FROM pg_class WHERE oid='public.guest_access_sessions'::regclass)
  THEN RAISE EXCEPTION 'RLS must be enabled'; END IF;
  IF EXISTS (SELECT 1 FROM public.guest_access_sessions WHERE phone_verified_at IS NOT NULL OR terms_accepted_at IS NOT NULL)
  THEN RAISE EXCEPTION 'Stay-code verification must not backfill phone or terms proof'; END IF;
  IF EXISTS (
    (SELECT policyname,permissive,roles,cmd,qual,with_check FROM pg_policies WHERE schemaname='public' AND tablename='guest_access_sessions'
     EXCEPT SELECT * FROM public.messaging_policy_baseline)
    UNION ALL
    (SELECT * FROM public.messaging_policy_baseline
     EXCEPT SELECT policyname,permissive,roles,cmd,qual,with_check FROM pg_policies WHERE schemaname='public' AND tablename='guest_access_sessions')
  ) THEN RAISE EXCEPTION 'Existing guest session policy changed'; END IF;
  RAISE NOTICE 'PASS: RLS enabled, no false backfill, existing tenant policies unchanged';
END $$;

SET LOCAL ROLE service_role;
INSERT INTO public.sms_suppressions(phone_hash) VALUES ('synthetic-salted-destination-hash');
UPDATE public.sms_suppressions SET opted_out_at = now() WHERE phone_hash='synthetic-salted-destination-hash';
UPDATE public.guest_access_sessions SET phone_verified_at=now(), terms_accepted_at=now()
WHERE id='a3000000-0000-4000-8000-000000000001';
UPDATE public.profiles SET phone='+15005550006',phone_verified_at=now()
WHERE id='a2000000-0000-4000-8000-000000000001';
DO $$ BEGIN
  IF (SELECT count(*) FROM public.sms_suppressions) <> 1 THEN RAISE EXCEPTION 'Service suppression positive control failed'; END IF;
  IF (SELECT count(*) FROM public.guest_access_sessions WHERE phone_verified_at IS NOT NULL) <> 1 THEN RAISE EXCEPTION 'Service session proof positive control failed'; END IF;
  IF (SELECT count(*) FROM public.profiles WHERE phone_verified_at IS NOT NULL) <> 1 THEN RAISE EXCEPTION 'Service host proof positive control failed'; END IF;
  RAISE NOTICE 'PASS: service role can record and read suppression and session proof';
END $$;
RESET ROLE;

SET LOCAL ROLE anon;
DO $$
DECLARE operation text;
BEGIN
  FOREACH operation IN ARRAY ARRAY[
    'SELECT * FROM public.sms_suppressions',
    'INSERT INTO public.sms_suppressions(phone_hash) VALUES (''forged'')',
    'UPDATE public.sms_suppressions SET opted_out_at=now()',
    'DELETE FROM public.sms_suppressions'
  ] LOOP
    BEGIN
      EXECUTE operation;
      RAISE EXCEPTION 'Anonymous suppression operation unexpectedly allowed: %',operation;
    EXCEPTION WHEN insufficient_privilege THEN NULL;
    END;
  END LOOP;
  IF (SELECT count(*) FROM public.guest_access_sessions) <> 0 THEN RAISE EXCEPTION 'Anonymous guest session disclosure'; END IF;
  BEGIN
    INSERT INTO public.guest_access_sessions(property_id,stay_id,phone_verified_at)
    VALUES ('a1000000-0000-4000-8000-000000000001','a4000000-0000-4000-8000-000000000001',now());
    RAISE EXCEPTION 'Anonymous forged verification accepted';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  UPDATE public.guest_access_sessions SET phone_verified_at=now();
  IF FOUND THEN RAISE EXCEPTION 'Anonymous session update accepted'; END IF;
  DELETE FROM public.guest_access_sessions;
  IF FOUND THEN RAISE EXCEPTION 'Anonymous session delete accepted'; END IF;
  IF EXISTS(SELECT 1 FROM public.profiles) THEN RAISE EXCEPTION 'Anonymous profile disclosure'; END IF;
  UPDATE public.profiles SET phone_verified_at=now();
  IF FOUND THEN RAISE EXCEPTION 'Anonymous profile forgery'; END IF;
  RAISE NOTICE 'PASS: anonymous suppression read/write denied, session read/write denied';
END $$;
RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT set_config('test.user_id','a2000000-0000-4000-8000-000000000001',true);
DO $$
DECLARE operation text;
BEGIN
  IF (SELECT count(*) FROM public.guest_access_sessions) <> 1 THEN RAISE EXCEPTION 'Assigned-property positive control failed'; END IF;
  IF (SELECT count(*) FROM public.profiles) <> 1 THEN RAISE EXCEPTION 'Host profile self-read positive control failed'; END IF;
  UPDATE public.profiles SET full_name='Synthetic updated',sms_opt_in=true
  WHERE id='a2000000-0000-4000-8000-000000000001';
  IF NOT FOUND THEN RAISE EXCEPTION 'Normal profile and explicit own consent update blocked'; END IF;
  BEGIN
    UPDATE public.profiles SET phone_verified_at=now() + interval '1 minute'
    WHERE id='a2000000-0000-4000-8000-000000000001';
    RAISE EXCEPTION 'Host forged phone verification accepted';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    UPDATE public.profiles SET phone='+15005550001'
    WHERE id='a2000000-0000-4000-8000-000000000001';
    RAISE EXCEPTION 'Host swapped verified destination without OTP';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  UPDATE public.profiles SET full_name='Forged'
  WHERE id='a2000000-0000-4000-8000-000000000002';
  IF FOUND THEN RAISE EXCEPTION 'Cross-account profile update accepted'; END IF;
  IF EXISTS(SELECT 1 FROM public.guest_access_sessions WHERE property_id='a1000000-0000-4000-8000-000000000002')
  THEN RAISE EXCEPTION 'Cross-account guest session disclosure'; END IF;
  FOREACH operation IN ARRAY ARRAY[
    'SELECT * FROM public.sms_suppressions',
    'INSERT INTO public.sms_suppressions(phone_hash) VALUES (''forged'')',
    'UPDATE public.sms_suppressions SET opted_out_at=now()',
    'DELETE FROM public.sms_suppressions'
  ] LOOP
    BEGIN
      EXECUTE operation;
      RAISE EXCEPTION 'Host suppression operation unexpectedly allowed: %',operation;
    EXCEPTION WHEN insufficient_privilege THEN NULL;
    END;
  END LOOP;
  BEGIN
    INSERT INTO public.guest_access_sessions(property_id,stay_id,phone_verified_at)
    VALUES ('a1000000-0000-4000-8000-000000000001','a4000000-0000-4000-8000-000000000001',now());
    RAISE EXCEPTION 'Host forged verification accepted';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  UPDATE public.guest_access_sessions SET phone_verified_at=now();
  IF FOUND THEN RAISE EXCEPTION 'Host session verification update accepted'; END IF;
  DELETE FROM public.guest_access_sessions;
  IF FOUND THEN RAISE EXCEPTION 'Host session deletion accepted'; END IF;
  RAISE NOTICE 'PASS: assigned host reads own session only; suppression and session writes denied';
  RAISE NOTICE 'PASS: host profile positive controls; forged proof, swapped phone and cross-account writes denied';
END $$;
SELECT set_config('test.user_id','a2000000-0000-4000-8000-000000000002',true);
DO $$ BEGIN
  IF (SELECT count(*) FROM public.guest_access_sessions) <> 1 OR EXISTS (
    SELECT 1 FROM public.guest_access_sessions WHERE property_id='a1000000-0000-4000-8000-000000000001'
  ) THEN RAISE EXCEPTION 'Other-account isolation failed'; END IF;
  RAISE NOTICE 'PASS: other account cannot read first account session';
END $$;
SELECT set_config('test.user_id','a2000000-0000-4000-8000-000000000003',true);
DO $$ BEGIN
  IF (SELECT count(*) FROM public.guest_access_sessions) <> 0 THEN RAISE EXCEPTION 'Unassigned member can read sessions'; END IF;
  IF EXISTS(SELECT 1 FROM public.profiles) THEN RAISE EXCEPTION 'Unassigned profile disclosure'; END IF;
  UPDATE public.profiles SET full_name='Forged';
  IF FOUND THEN RAISE EXCEPTION 'Unassigned profile mutation'; END IF;
  RAISE NOTICE 'PASS: unassigned member cannot read any session';
END $$;
RESET ROLE;
SET LOCAL ROLE service_role;
DELETE FROM public.sms_suppressions WHERE phone_hash='synthetic-salted-destination-hash';
DO $$ BEGIN
  IF EXISTS(SELECT 1 FROM public.sms_suppressions) THEN RAISE EXCEPTION 'Service delete positive control failed'; END IF;
  RAISE NOTICE 'PASS: service suppression deletion positive control';
END $$;
RESET ROLE;
ROLLBACK;
\echo 'MESSAGING SQL CONTRACT VERIFIED'
