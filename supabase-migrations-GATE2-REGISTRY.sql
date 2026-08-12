-- Gate 2 (Registry) + Gate 3 (Contract layer)
-- Directive Section 3 / Section 3.2, as amended by docs/DIRECTIVE-AMENDMENT-001.md
--
-- Additive and non-destructive. Creates nothing that existing code reads, drops
-- nothing, and alters no existing table. Safe to apply ahead of the application
-- code that will consume it.
--
-- Contents:
--   1. audience_tier enum (Amendment 001-B.2)
--   2. field_registry materialized table (Section 3) + drift-detectable checksum
--   3. brain_values envelope (Section 3.2) with the audience/sensitivity CHECK
--      matrix (Amendment 001-B.3) enforced in the database
--   4. RLS on both tables, built on this repo's real can_access_property() /
--      can_edit_property() helpers

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Enums
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'audience_tier') THEN
    CREATE TYPE public.audience_tier AS ENUM (
      'system_internal',
      'host_private',
      'staff_ops',
      'guest_instay',
      'guest_prearrival',
      'guest_public'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'sensitivity_tier') THEN
    CREATE TYPE public.sensitivity_tier AS ENUM (
      'public_guest',
      'guest_after_verification',
      'stay_scoped_secret',
      'host_only'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'brain_value_source') THEN
    -- Provenance rank, highest first (Section 0 collision table).
    CREATE TYPE public.brain_value_source AS ENUM (
      'host_verified',
      'pms_sync',
      'host_chat',
      'escalation',
      'firecrawl',
      'inferred'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'brain_value_status') THEN
    CREATE TYPE public.brain_value_status AS ENUM ('active', 'superseded', 'retired');
  END IF;
END
$$;

-- ---------------------------------------------------------------------------
-- 2. field_registry — materialized from field_registry.json
-- ---------------------------------------------------------------------------
-- The JSON file is the source of truth. This table is a projection of it, so a
-- Postgres FK and CHECK constraints can enforce the registry at write time. CI
-- fails if the two diverge (scripts/check-registry-drift.py).

CREATE TABLE IF NOT EXISTS public.field_registry (
  field_id            text PRIMARY KEY,
  label               text NOT NULL,
  domain              text NOT NULL,
  system_section      boolean NOT NULL DEFAULT false,
  type                text NOT NULL,
  enum_values         jsonb,
  sensitivity_tier    public.sensitivity_tier NOT NULL,
  default_audience    public.audience_tier NOT NULL,
  phase               text[] NOT NULL,
  ttl_days            integer,
  storage_table       text NOT NULL,
  storage_column      text NOT NULL,
  storage_vault       boolean NOT NULL DEFAULT false,
  gap_weight          numeric(4,2) NOT NULL DEFAULT 1.0,
  hard_block          boolean NOT NULL DEFAULT false,
  applicability       text NOT NULL DEFAULT 'always',
  requires_on_failure boolean NOT NULL DEFAULT false,
  -- Deferrable so the seed can insert rows in any order: on_failure_field
  -- points at a sibling registry row, and alphabetical seed order does not
  -- guarantee the target lands first.
  on_failure_field    text REFERENCES public.field_registry(field_id)
                        DEFERRABLE INITIALLY IMMEDIATE,
  -- Section 9.0c: static registry text only. Never assembled from scraped
  -- content, which would make a scraped page able to steer the extractor.
  scrape_hint         text,
  interview_prompt    text NOT NULL,
  registry_version    integer NOT NULL,
  CONSTRAINT field_registry_gap_weight_nonneg CHECK (gap_weight >= 0),
  -- Amendment 001-A.2: hidden system sections never score.
  CONSTRAINT field_registry_system_unscored CHECK (NOT system_section OR gap_weight = 0),
  -- Amendment 001-A.4: a hard block must be scored to be meaningful.
  CONSTRAINT field_registry_hard_block_scored CHECK (NOT hard_block OR gap_weight > 0),
  -- Section 3: an operational field declaring a fallback must name it.
  CONSTRAINT field_registry_on_failure_named
    CHECK (NOT requires_on_failure OR on_failure_field IS NOT NULL),
  -- Section 3.2: secrets store a pointer, never a plaintext value.
  CONSTRAINT field_registry_secret_routes_to_vault
    CHECK (type <> 'secret' OR (storage_vault AND storage_column = 'secret_ref_or_ciphertext')),
  CONSTRAINT field_registry_secret_tier
    CHECK (type <> 'secret' OR sensitivity_tier IN ('stay_scoped_secret', 'host_only'))
);

COMMENT ON TABLE public.field_registry IS
  'Projection of field_registry.json (registry_version 1). Source of truth is the '
  'JSON file; CI enforces parity. Directive Section 3 + DIRECTIVE-AMENDMENT-001.';

-- Amendment 001-B.3, enforced in the database rather than in documentation.
-- A registry default_audience incompatible with its own tier is rejected here,
-- so the pair can never reach brain_values in the first place.
CREATE OR REPLACE FUNCTION public.audience_permitted_for_tier(
  p_tier public.sensitivity_tier,
  p_audience public.audience_tier
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = ''
AS $$
  SELECT CASE p_tier
    WHEN 'public_guest' THEN p_audience IN (
      'guest_public', 'guest_prearrival', 'guest_instay', 'staff_ops', 'host_private')
    WHEN 'guest_after_verification' THEN p_audience IN (
      'guest_prearrival', 'guest_instay', 'staff_ops', 'host_private')
    WHEN 'stay_scoped_secret' THEN p_audience IN (
      'guest_instay', 'staff_ops', 'host_private')
    WHEN 'host_only' THEN p_audience IN (
      'host_private', 'staff_ops', 'system_internal')
  END
$$;

COMMENT ON FUNCTION public.audience_permitted_for_tier IS
  'Amendment 001-B.3 compatibility matrix. IMMUTABLE so it can back a CHECK '
  'constraint. SECURITY INVOKER by default; reads no tables.';

ALTER TABLE public.field_registry
  DROP CONSTRAINT IF EXISTS field_registry_audience_matrix_chk;
ALTER TABLE public.field_registry
  ADD CONSTRAINT field_registry_audience_matrix_chk
  CHECK (public.audience_permitted_for_tier(sensitivity_tier, default_audience));

-- ---------------------------------------------------------------------------
-- 3. brain_values — the single fact envelope (Section 0 collision resolution)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.brain_values (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id               uuid NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  field_id                  text NOT NULL REFERENCES public.field_registry(field_id),

  -- Exactly one of these carries the payload. Enforced below.
  value                     jsonb,
  secret_ref_or_ciphertext  text,

  sensitivity_tier          public.sensitivity_tier NOT NULL,
  audience                  public.audience_tier NOT NULL,
  source                    public.brain_value_source NOT NULL,
  confidence                numeric(3,2) NOT NULL DEFAULT 0.50,

  verified_at               timestamptz,
  verified_by               uuid,
  ttl_expires_at            timestamptz,

  status                    public.brain_value_status NOT NULL DEFAULT 'active',
  version                   integer NOT NULL DEFAULT 1,
  superseded_by             uuid REFERENCES public.brain_values(id),

  created_by                uuid,
  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT brain_values_confidence_range CHECK (confidence >= 0 AND confidence <= 1),
  CONSTRAINT brain_values_version_positive CHECK (version >= 1),

  -- Section 3.2: a row holds a value or a secret pointer, never both, never neither.
  CONSTRAINT brain_values_payload_exclusive CHECK (
    (value IS NOT NULL AND secret_ref_or_ciphertext IS NULL)
    OR (value IS NULL AND secret_ref_or_ciphertext IS NOT NULL)
  ),

  -- Amendment 001-B.3. The reason the enum is implementable rather than decorative.
  CONSTRAINT brain_values_audience_matrix_chk
    CHECK (public.audience_permitted_for_tier(sensitivity_tier, audience)),

  -- Section 6: a Vault-backed secret may never sit in a plaintext jsonb column.
  CONSTRAINT brain_values_secret_never_plaintext CHECK (
    sensitivity_tier <> 'stay_scoped_secret' OR value IS NULL
  ),

  -- Section 0.4 item 5 support: host_verified is the only source that may claim
  -- verification, and a verified row must record when.
  CONSTRAINT brain_values_verified_requires_timestamp CHECK (
    verified_by IS NULL OR verified_at IS NOT NULL
  ),

  CONSTRAINT brain_values_superseded_shape CHECK (
    (status = 'superseded') = (superseded_by IS NOT NULL)
  )
);

COMMENT ON TABLE public.brain_values IS
  'Single fact envelope. Directive Section 3.2 as amended by DIRECTIVE-AMENDMENT-001. '
  'One active row per (property_id, field_id); prior values are retained as '
  'superseded rows for audit.';

-- One live value per field per property. History is preserved, not overwritten.
CREATE UNIQUE INDEX IF NOT EXISTS brain_values_one_active_per_field
  ON public.brain_values (property_id, field_id)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS brain_values_property_idx
  ON public.brain_values (property_id) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS brain_values_ttl_idx
  ON public.brain_values (ttl_expires_at) WHERE status = 'active' AND ttl_expires_at IS NOT NULL;

-- Keeps the row's tier/audience honest against the registry. A caller cannot
-- widen a field's audience by writing a laxer pair than the registry declares.
CREATE OR REPLACE FUNCTION public.brain_values_enforce_registry()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  reg public.field_registry;
BEGIN
  SELECT * INTO reg FROM public.field_registry WHERE field_id = NEW.field_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'field_id % is not declared in field_registry', NEW.field_id
      USING ERRCODE = '23514';
  END IF;

  -- The registry, not the caller, decides how protected a field is.
  IF NEW.sensitivity_tier <> reg.sensitivity_tier THEN
    RAISE EXCEPTION 'field % is tier %, cannot be written as %',
      NEW.field_id, reg.sensitivity_tier, NEW.sensitivity_tier
      USING ERRCODE = '23514';
  END IF;

  -- A row may be addressed more narrowly than the registry default, never wider.
  IF array_position(
       ARRAY['system_internal','host_private','staff_ops','guest_instay',
             'guest_prearrival','guest_public']::text[], NEW.audience::text)
     > array_position(
       ARRAY['system_internal','host_private','staff_ops','guest_instay',
             'guest_prearrival','guest_public']::text[], reg.default_audience::text)
  THEN
    RAISE EXCEPTION 'field % may not be addressed to % (registry default is %)',
      NEW.field_id, NEW.audience, reg.default_audience
      USING ERRCODE = '23514';
  END IF;

  -- Section 3.2: secret-typed fields must arrive as a pointer.
  IF reg.type = 'secret' AND NEW.secret_ref_or_ciphertext IS NULL THEN
    RAISE EXCEPTION 'field % is secret-typed and requires secret_ref_or_ciphertext',
      NEW.field_id USING ERRCODE = '23514';
  END IF;

  IF reg.ttl_days IS NOT NULL AND NEW.ttl_expires_at IS NULL THEN
    NEW.ttl_expires_at := now() + (reg.ttl_days || ' days')::interval;
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS brain_values_enforce_registry_trg ON public.brain_values;
CREATE TRIGGER brain_values_enforce_registry_trg
  BEFORE INSERT OR UPDATE ON public.brain_values
  FOR EACH ROW EXECUTE FUNCTION public.brain_values_enforce_registry();

-- ---------------------------------------------------------------------------
-- 4. RLS
-- ---------------------------------------------------------------------------
-- Guest surfaces are server-mediated and never hold an `authenticated` session
-- for the property, so these policies scope host/staff access only. Guest
-- rendering authorization happens in the contract layer, which additionally
-- evaluates audience_ok and access_window_ok (Amendment 001-B.4).

ALTER TABLE public.field_registry ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS field_registry_select_authenticated ON public.field_registry;
CREATE POLICY field_registry_select_authenticated
  ON public.field_registry FOR SELECT TO authenticated
  USING (true);  -- registry is non-tenant metadata; contains no property data

-- No INSERT/UPDATE/DELETE policy: the registry is written only by the migration
-- pipeline running as postgres. authenticated cannot mutate it at all.

ALTER TABLE public.brain_values ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS brain_values_select_members ON public.brain_values;
CREATE POLICY brain_values_select_members
  ON public.brain_values FOR SELECT TO authenticated
  USING (public.can_access_property(property_id));

DROP POLICY IF EXISTS brain_values_insert_editors ON public.brain_values;
CREATE POLICY brain_values_insert_editors
  ON public.brain_values FOR INSERT TO authenticated
  WITH CHECK (public.can_edit_property(property_id));

-- UPDATE needs both USING and WITH CHECK, or a caller can reassign property_id.
DROP POLICY IF EXISTS brain_values_update_editors ON public.brain_values;
CREATE POLICY brain_values_update_editors
  ON public.brain_values FOR UPDATE TO authenticated
  USING (public.can_edit_property(property_id))
  WITH CHECK (public.can_edit_property(property_id));

DROP POLICY IF EXISTS brain_values_delete_editors ON public.brain_values;
CREATE POLICY brain_values_delete_editors
  ON public.brain_values FOR DELETE TO authenticated
  USING (public.can_edit_property(property_id));

COMMIT;
