-- Local-only stubs. NEVER applied to a hosted project.
--
-- Recreates the minimum of the production schema that the Gate 2 migration
-- depends on, so the migration and its RLS policies can be exercised against a
-- real Postgres with real constraint enforcement. The helper bodies mirror the
-- production definitions (SECURITY DEFINER, pinned search_path, membership
-- lookup) so an isolation test here means what it means in production.

CREATE SCHEMA IF NOT EXISTS auth;
CREATE SCHEMA IF NOT EXISTS extensions;

DO $$ BEGIN
  CREATE ROLE authenticated NOLOGIN;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE ROLE anon NOLOGIN;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE ROLE service_role NOLOGIN BYPASSRLS;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

GRANT USAGE ON SCHEMA public TO authenticated, anon, service_role;

-- Stands in for Supabase's auth.uid(). Production reads the JWT; here we read a
-- session GUC so a test can impersonate a user.
CREATE OR REPLACE FUNCTION auth.uid()
RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('test.user_id', true), '')::uuid
$$;

CREATE TABLE IF NOT EXISTS public.properties (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL
);

CREATE TABLE IF NOT EXISTS public.property_members (
  property_id uuid NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  profile_id  uuid NOT NULL,
  can_edit    boolean NOT NULL DEFAULT false,
  PRIMARY KEY (property_id, profile_id)
);

CREATE OR REPLACE FUNCTION public.can_access_property(p_property_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = 'public', 'extensions'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.property_members m
    WHERE m.property_id = p_property_id
      AND m.profile_id = (SELECT auth.uid())
  )
$$;

CREATE OR REPLACE FUNCTION public.can_edit_property(p_property_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = 'public', 'extensions'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.property_members m
    WHERE m.property_id = p_property_id
      AND m.profile_id = (SELECT auth.uid())
      AND m.can_edit
  )
$$;

-- Matches production, where both helpers are executable by authenticated: RLS
-- policy expressions are evaluated as the querying role, so revoking EXECUTE
-- here would make every policy raise permission denied rather than return false.
-- (This is the source of the two standing `authenticated_security_definer_
-- function_executable` advisor warnings on the hosted project. They are
-- load-bearing, not oversights.)
GRANT EXECUTE ON FUNCTION public.can_access_property(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_edit_property(uuid) TO authenticated;

-- brain_items, stubbed so supabase-migrations-BRAIN-SECTIONS.sql can be applied
-- and its `section` column exercised under the REAL production policies. Only the
-- columns the migration and its isolation tests touch are recreated; brain_category
-- is stubbed as text because the section work deliberately does not migrate the
-- enum, so its exact variant list is not part of this contract.
CREATE TABLE IF NOT EXISTS public.brain_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  category text NOT NULL,
  title text NOT NULL,
  body text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

ALTER TABLE public.brain_items ENABLE ROW LEVEL SECURITY;

-- Verbatim from supabase/schema.sql:1020-1021, minus is_admin() which is not part
-- of the tenant-isolation contract being asserted here. UPDATE needs both USING
-- and WITH CHECK, and brain_write supplies both via FOR ALL -- the reassignment
-- test below is what proves it.
DROP POLICY IF EXISTS brain_select ON public.brain_items;
CREATE POLICY brain_select ON public.brain_items AS PERMISSIVE FOR SELECT
  TO authenticated USING (can_access_property(property_id));
DROP POLICY IF EXISTS brain_write ON public.brain_items;
CREATE POLICY brain_write ON public.brain_items AS PERMISSIVE FOR ALL
  TO authenticated USING (can_edit_property(property_id))
  WITH CHECK (can_edit_property(property_id));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.brain_items TO authenticated;

-- host_accounts and profiles, stubbed only so
-- supabase-migrations-PROPOSED-UPDATES.sql can be applied against real Postgres.
-- Its RLS anchors on property_id, not on either of these — both exist purely to
-- satisfy the foreign keys, so only the referenced columns are recreated.
CREATE TABLE IF NOT EXISTS public.host_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid()
);

CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid()
);

-- The AI Updates tab reads and decides proposals as the *caller*, under RLS, so
-- the caller needs the same table-level grants production gives it. The migration
-- deliberately grants no INSERT or DELETE to authenticated (see its header note
-- 3), and section F asserts that absence rather than trusting it.
DO $$ BEGIN
  EXECUTE 'GRANT SELECT, UPDATE ON public.proposed_updates TO authenticated';
EXCEPTION WHEN undefined_table THEN NULL; END $$;
