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
  on_failure_field    text REFERENCES public.field_registry(field_id)
                        DEFERRABLE INITIALLY IMMEDIATE,
  scrape_hint         text,
  interview_prompt    text NOT NULL,
  registry_version    integer NOT NULL,
  CONSTRAINT field_registry_gap_weight_nonneg CHECK (gap_weight >= 0),
  CONSTRAINT field_registry_system_unscored CHECK (NOT system_section OR gap_weight = 0),
  CONSTRAINT field_registry_hard_block_scored CHECK (NOT hard_block OR gap_weight > 0),
  CONSTRAINT field_registry_on_failure_named
    CHECK (NOT requires_on_failure OR on_failure_field IS NOT NULL),
  CONSTRAINT field_registry_secret_routes_to_vault
    CHECK (type <> 'secret' OR (storage_vault AND storage_column = 'secret_ref_or_ciphertext')),
  CONSTRAINT field_registry_secret_tier
    CHECK (type <> 'secret' OR sensitivity_tier IN ('stay_scoped_secret', 'host_only'))
);

COMMENT ON TABLE public.field_registry IS
  'Projection of field_registry.json (registry_version 1). Source of truth is the JSON file; CI enforces parity. Directive Section 3 + DIRECTIVE-AMENDMENT-001.';

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
  'Amendment 001-B.3 compatibility matrix. IMMUTABLE so it can back a CHECK constraint. SECURITY INVOKER by default; reads no tables.';

ALTER TABLE public.field_registry
  DROP CONSTRAINT IF EXISTS field_registry_audience_matrix_chk;
ALTER TABLE public.field_registry
  ADD CONSTRAINT field_registry_audience_matrix_chk
  CHECK (public.audience_permitted_for_tier(sensitivity_tier, default_audience));
