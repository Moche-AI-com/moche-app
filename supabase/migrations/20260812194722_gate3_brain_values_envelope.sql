CREATE TABLE IF NOT EXISTS public.brain_values (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id               uuid NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  field_id                  text NOT NULL REFERENCES public.field_registry(field_id),
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
  CONSTRAINT brain_values_payload_exclusive CHECK (
    (value IS NOT NULL AND secret_ref_or_ciphertext IS NULL)
    OR (value IS NULL AND secret_ref_or_ciphertext IS NOT NULL)
  ),
  CONSTRAINT brain_values_audience_matrix_chk
    CHECK (public.audience_permitted_for_tier(sensitivity_tier, audience)),
  CONSTRAINT brain_values_secret_never_plaintext CHECK (
    sensitivity_tier <> 'stay_scoped_secret' OR value IS NULL
  ),
  CONSTRAINT brain_values_verified_requires_timestamp CHECK (
    verified_by IS NULL OR verified_at IS NOT NULL
  ),
  CONSTRAINT brain_values_superseded_shape CHECK (
    (status = 'superseded') = (superseded_by IS NOT NULL)
  )
);

COMMENT ON TABLE public.brain_values IS
  'Single fact envelope. Directive Section 3.2 as amended by DIRECTIVE-AMENDMENT-001. One active row per (property_id, field_id); prior values are retained as superseded rows for audit.';

CREATE UNIQUE INDEX IF NOT EXISTS brain_values_one_active_per_field
  ON public.brain_values (property_id, field_id)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS brain_values_property_idx
  ON public.brain_values (property_id) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS brain_values_ttl_idx
  ON public.brain_values (ttl_expires_at) WHERE status = 'active' AND ttl_expires_at IS NOT NULL;

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

  IF NEW.sensitivity_tier <> reg.sensitivity_tier THEN
    RAISE EXCEPTION 'field % is tier %, cannot be written as %',
      NEW.field_id, reg.sensitivity_tier, NEW.sensitivity_tier
      USING ERRCODE = '23514';
  END IF;

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
