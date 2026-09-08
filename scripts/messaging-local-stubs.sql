-- Disposable local database only. Existing policy copied from supabase/schema.sql:
-- guest_access_sessions_select FOR SELECT TO authenticated USING (can_access_property(property_id)).
CREATE TABLE public.guest_access_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL REFERENCES public.properties(id),
  stay_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'verified',
  verified_at timestamptz,
  registered_at timestamptz,
  guest_contact text,
  notification_consent boolean NOT NULL DEFAULT false
);
ALTER TABLE public.guest_access_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY guest_access_sessions_select ON public.guest_access_sessions
  AS PERMISSIVE FOR SELECT TO authenticated USING (can_access_property(property_id));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.guest_access_sessions TO anon, authenticated, service_role;
-- Persist the pre-migration policy definition to prove the additive migration
-- neither drops nor replaces the existing tenant authorization predicate.
CREATE TABLE public.messaging_policy_baseline AS
SELECT policyname, permissive, roles, cmd, qual, with_check
FROM pg_policies WHERE schemaname = 'public' AND tablename = 'guest_access_sessions';

-- Existing host self-update access must not permit forging phone ownership.
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY,
  full_name text,
  phone text,
  phone_verified_at timestamptz,
  sms_opt_in boolean NOT NULL DEFAULT false
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY profiles_self_select ON public.profiles FOR SELECT TO authenticated
  USING (id = (SELECT auth.uid()));
CREATE POLICY profiles_self_update ON public.profiles FOR UPDATE TO authenticated
  USING (id = (SELECT auth.uid())) WITH CHECK (id = (SELECT auth.uid()));
GRANT USAGE ON SCHEMA auth TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO anon, authenticated, service_role;

CREATE TABLE public.host_accounts (id uuid PRIMARY KEY, owner_id uuid NOT NULL);
CREATE TABLE public.organization_members (host_account_id uuid NOT NULL, profile_id uuid NOT NULL);
ALTER TABLE public.properties ADD COLUMN host_account_id uuid;
CREATE OR REPLACE FUNCTION public.is_account_member(acc uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.organization_members WHERE host_account_id=acc AND profile_id=(SELECT auth.uid()))
$$;
CREATE OR REPLACE FUNCTION public.is_account_owner(acc uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.host_accounts WHERE id=acc AND owner_id=(SELECT auth.uid()))
$$;
CREATE OR REPLACE FUNCTION public.can_access_property(p_property_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.properties p JOIN public.host_accounts a ON a.id=p.host_account_id
    WHERE p.id=p_property_id AND a.owner_id=(SELECT auth.uid()))
  OR EXISTS (SELECT 1 FROM public.property_members WHERE property_id=p_property_id AND profile_id=(SELECT auth.uid()))
$$;
CREATE TABLE public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), host_account_id uuid NOT NULL,
  property_id uuid, recipient_profile_id uuid, title text NOT NULL, read_at timestamptz
);
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
-- Reproduce the permissive legacy policies to prove the new isolation tests fail.
CREATE POLICY notif_select ON public.notifications FOR SELECT TO authenticated
  USING ((recipient_profile_id=(SELECT auth.uid())) OR public.is_account_member(host_account_id));
CREATE POLICY notif_update ON public.notifications FOR UPDATE TO authenticated
  USING ((recipient_profile_id=(SELECT auth.uid())) OR public.is_account_member(host_account_id))
  WITH CHECK ((recipient_profile_id=(SELECT auth.uid())) OR public.is_account_member(host_account_id));
GRANT SELECT,INSERT,UPDATE,DELETE,TRUNCATE,TRIGGER,REFERENCES ON public.notifications TO anon,authenticated,service_role;
