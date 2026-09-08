\set ON_ERROR_STOP on
BEGIN;
INSERT INTO public.host_accounts(id,owner_id) VALUES
 ('b0000000-0000-4000-8000-000000000001','b2000000-0000-4000-8000-000000000001'),
 ('b0000000-0000-4000-8000-000000000002','b2000000-0000-4000-8000-000000000005');
INSERT INTO public.properties(id,name,host_account_id) VALUES
 ('b1000000-0000-4000-8000-000000000001','Synthetic A','b0000000-0000-4000-8000-000000000001'),
 ('b1000000-0000-4000-8000-000000000002','Synthetic B','b0000000-0000-4000-8000-000000000001'),
 ('b1000000-0000-4000-8000-000000000003','Synthetic other account','b0000000-0000-4000-8000-000000000002');
INSERT INTO public.organization_members VALUES
 ('b0000000-0000-4000-8000-000000000001','b2000000-0000-4000-8000-000000000001'),
 ('b0000000-0000-4000-8000-000000000001','b2000000-0000-4000-8000-000000000002'),
 ('b0000000-0000-4000-8000-000000000001','b2000000-0000-4000-8000-000000000003'),
 ('b0000000-0000-4000-8000-000000000001','b2000000-0000-4000-8000-000000000004'),
 ('b0000000-0000-4000-8000-000000000002','b2000000-0000-4000-8000-000000000005');
INSERT INTO public.property_members(property_id,profile_id) VALUES
 ('b1000000-0000-4000-8000-000000000001','b2000000-0000-4000-8000-000000000002'),
 ('b1000000-0000-4000-8000-000000000002','b2000000-0000-4000-8000-000000000003');
SET LOCAL ROLE service_role;
INSERT INTO public.notifications(host_account_id,property_id,recipient_profile_id,title) VALUES
 ('b0000000-0000-4000-8000-000000000001','b1000000-0000-4000-8000-000000000001',null,'Property A'),
 ('b0000000-0000-4000-8000-000000000001','b1000000-0000-4000-8000-000000000002',null,'Property B'),
 ('b0000000-0000-4000-8000-000000000001','b1000000-0000-4000-8000-000000000001','b2000000-0000-4000-8000-000000000002','Assigned A only'),
 ('b0000000-0000-4000-8000-000000000001',null,null,'Account broadcast'),
 ('b0000000-0000-4000-8000-000000000001','b1000000-0000-4000-8000-000000000002','b2000000-0000-4000-8000-000000000002','Wrong property even when targeted'),
 ('b0000000-0000-4000-8000-000000000002','b1000000-0000-4000-8000-000000000003','b2000000-0000-4000-8000-000000000002','Wrong account even when targeted');
DO $$ BEGIN
 IF (SELECT count(*) FROM public.notifications) <> 6 THEN RAISE EXCEPTION 'Service notification insert/read positive control failed'; END IF;
END $$;
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('test.user_id','b2000000-0000-4000-8000-000000000002',true);
DO $$
DECLARE n integer;
BEGIN
 IF (SELECT count(*) FROM public.notifications) <> 3 THEN RAISE EXCEPTION 'Assigned A sees unassigned-property or cross-account notifications'; END IF;
 UPDATE public.notifications SET read_at=now();
 GET DIAGNOSTICS n=ROW_COUNT;
 IF n<>3 THEN RAISE EXCEPTION 'Assigned A notification update scope wrong'; END IF;
 BEGIN
   UPDATE public.notifications SET property_id=null;
   RAISE EXCEPTION 'Client can broaden notification scope';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN
   UPDATE public.notifications SET recipient_profile_id=null;
   RAISE EXCEPTION 'Client can broaden targeted recipient';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN
   UPDATE public.notifications SET title='Forged notification';
   RAISE EXCEPTION 'Client can forge stored notification content';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 RAISE NOTICE 'PASS: assigned property read/read_at update positive; cross-property, cross-account and scope/content forgery denied';
END $$;
SELECT set_config('test.user_id','b2000000-0000-4000-8000-000000000003',true);
DO $$ BEGIN
 IF (SELECT count(*) FROM public.notifications) <> 2 THEN RAISE EXCEPTION 'Assigned B can read another recipient or property'; END IF;
 IF EXISTS(SELECT 1 FROM public.notifications WHERE read_at IS NOT NULL AND property_id IS NOT NULL) THEN RAISE EXCEPTION 'Assigned A marked B notification read'; END IF;
 RAISE NOTICE 'PASS: member B sees own property and broadcast, never another targeted recipient';
END $$;
SELECT set_config('test.user_id','b2000000-0000-4000-8000-000000000004',true);
DO $$ BEGIN
 IF (SELECT count(*) FROM public.notifications) <> 1 THEN RAISE EXCEPTION 'Unassigned member reads private property notifications'; END IF;
 UPDATE public.notifications SET read_at=now() WHERE property_id IS NOT NULL;
 IF FOUND THEN RAISE EXCEPTION 'Unassigned member mutates private property notification'; END IF;
 RAISE NOTICE 'PASS: unassigned member sees only account broadcast';
END $$;
SELECT set_config('test.user_id','b2000000-0000-4000-8000-000000000001',true);
DO $$ BEGIN
 IF (SELECT count(*) FROM public.notifications) <> 3 THEN RAISE EXCEPTION 'Owner positive control or targeted recipient isolation failed'; END IF;
 RAISE NOTICE 'PASS: owner sees property broadcasts but not messages targeted to another member';
END $$;
SELECT set_config('test.user_id','b2000000-0000-4000-8000-000000000005',true);
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM public.notifications) THEN RAISE EXCEPTION 'Other-account member reads another targeted recipient'; END IF;
 UPDATE public.notifications SET read_at=now();
 IF FOUND THEN RAISE EXCEPTION 'Other-account mutation'; END IF;
END $$;
RESET ROLE;
SET LOCAL ROLE anon;
DO $$
DECLARE operation text;
BEGIN
 FOREACH operation IN ARRAY ARRAY[
   'SELECT * FROM public.notifications',
   'UPDATE public.notifications SET read_at=now()',
   'INSERT INTO public.notifications(host_account_id,title) VALUES (''b0000000-0000-4000-8000-000000000001'',''Forged'')',
   'DELETE FROM public.notifications',
   'TRUNCATE public.notifications'
 ] LOOP
   BEGIN EXECUTE operation; RAISE EXCEPTION 'Anonymous notification operation allowed: %',operation;
   EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 END LOOP;
 RAISE NOTICE 'PASS: anonymous notification read/write/truncate denied';
END $$;
RESET ROLE;
SET LOCAL ROLE authenticated;
DO $$
DECLARE operation text;
BEGIN
 FOREACH operation IN ARRAY ARRAY[
   'INSERT INTO public.notifications(host_account_id,title) VALUES (''b0000000-0000-4000-8000-000000000001'',''Forged'')',
   'DELETE FROM public.notifications',
   'TRUNCATE public.notifications'
 ] LOOP
   BEGIN EXECUTE operation; RAISE EXCEPTION 'Host notification operation allowed: %',operation;
   EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 END LOOP;
 RAISE NOTICE 'PASS: authenticated notification insert/delete/truncate denied';
END $$;
RESET ROLE;
ROLLBACK;
\echo 'MESSAGING NOTIFICATION RLS VERIFIED'
