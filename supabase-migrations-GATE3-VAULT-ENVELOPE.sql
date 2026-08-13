-- Gate 3 / decision D-0011 part b — Vault envelope for secret-tier brain values.
--
-- Already true: the registry trigger required a secret_ref_or_ciphertext for
-- `type = 'secret'` fields. NOT true: nothing stopped a writer from supplying both a
-- ref AND the plaintext in `value`. Such a row passes every existing check while
-- defeating the envelope. The D-0011 part-a redaction guard keeps that plaintext out
-- of model prompts; it does not keep it out of the table, a PITR snapshot, or a
-- logical backup.
--
-- Invariants established here:
--   * vault-routed field  -> MUST carry a ref, MUST NOT carry a plaintext value
--   * non-vault field     -> MUST NOT carry a ref (no silent second storage path)
--   * every ref           -> well-formed `vault:<uuid>` (decision D-0012)
-- plus the one write path that can produce a conforming secret row.

-- Table constraint, not a trigger check, so it still holds for any writer that
-- bypasses the trigger (e.g. triggers disabled during a maintenance window).
alter table public.brain_values
  drop constraint if exists brain_values_secret_ref_format;

alter table public.brain_values
  add constraint brain_values_secret_ref_format
  check (
    secret_ref_or_ciphertext is null
    or secret_ref_or_ciphertext ~ '^vault:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  );

create or replace function public.brain_values_enforce_registry()
returns trigger
language plpgsql
set search_path to ''
as $function$
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

  -- Vault envelope (D-0011 part b). storage_vault is the registry's own declaration
  -- of "this never sits in a column as plaintext"; honour it in both directions so a
  -- secret has exactly one home and a non-secret has exactly one home.
  IF reg.storage_vault THEN
    IF NEW.secret_ref_or_ciphertext IS NULL THEN
      RAISE EXCEPTION 'field % is vault-routed and requires a vault reference; use brain_values_set_secret()',
        NEW.field_id USING ERRCODE = '23514';
    END IF;
    IF NEW.value IS NOT NULL AND NEW.value <> 'null'::jsonb THEN
      RAISE EXCEPTION 'field % is vault-routed; plaintext must not be stored in value',
        NEW.field_id USING ERRCODE = '23514';
    END IF;
    -- Normalise a JSON null to SQL NULL so `value is null` stays a reliable probe.
    NEW.value := NULL;
  ELSIF NEW.secret_ref_or_ciphertext IS NOT NULL THEN
    RAISE EXCEPTION 'field % is not vault-routed and must not carry a secret reference',
      NEW.field_id USING ERRCODE = '23514';
  END IF;

  IF reg.ttl_days IS NOT NULL AND NEW.ttl_expires_at IS NULL THEN
    NEW.ttl_expires_at := now() + (reg.ttl_days || ' days')::interval;
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END
$function$;

-- SECURITY DEFINER is unavoidable: vault.create_secret is not grantable to
-- `authenticated`, and the point is that the plaintext crosses into Vault without ever
-- landing in a column the client role can select. Because it runs privileged it
-- carries its own authorization check as its first statement, and EXECUTE is revoked
-- from PUBLIC so it is not an open endpoint.
create or replace function public.brain_values_set_secret(
  p_property_id uuid,
  p_field_id text,
  p_plaintext text,
  p_actor uuid
)
returns uuid
language plpgsql
security definer
set search_path to ''
as $function$
declare
  reg record;
  v_secret_id uuid;
  v_role text := coalesce(current_setting('role', true), '');
begin
  -- Authorization before the registry lookup, so an unauthorized caller learns
  -- nothing about which fields exist.
  --
  -- `role` is the GUC PostgREST sets per request; SECURITY DEFINER changes current_user
  -- but leaves it intact, so it is a reliable read of who is actually calling. The
  -- service_role branch is not an escalation: that key already bypasses RLS and could
  -- insert into brain_values directly. It exists so the server-side brain writers --
  -- which authorize through PropertyAccess before they ever reach SQL -- can use the
  -- one write path that produces a conforming envelope instead of hand-rolling one.
  if v_role <> 'service_role' and not public.can_edit_property(p_property_id) then
    raise exception 'not authorized to write values for this property' using errcode = '42501';
  end if;

  if p_plaintext is null or length(btrim(p_plaintext)) = 0 then
    raise exception 'secret value must not be empty' using errcode = '23514';
  end if;

  select * into reg from public.field_registry where field_id = p_field_id;
  if not found then
    raise exception 'unknown field_id: %', p_field_id using errcode = '23514';
  end if;
  if not reg.storage_vault then
    raise exception 'field % is not vault-routed; use brain_values_set()', p_field_id
      using errcode = '23514';
  end if;

  -- Vault secret names are unique, so a name cannot encode only (property, field):
  -- rotating a credential would collide with the retired one. The random suffix keeps
  -- prior versions addressable for audit while brain_values decides which is active.
  v_secret_id := vault.create_secret(
    p_plaintext,
    'bv:' || p_property_id::text || ':' || p_field_id || ':' || gen_random_uuid()::text,
    'brain_values ' || p_field_id || ' for property ' || p_property_id::text
  );

  -- p_value is NULL by construction; the trigger rejects anything else here.
  return public.brain_values_set(
    p_property_id := p_property_id,
    p_field_id    := p_field_id,
    p_value       := null,
    p_source      := 'host_verified',
    p_confidence  := 1,
    p_actor       := p_actor,
    p_secret_ref  := 'vault:' || v_secret_id::text
  );
end;
$function$;

revoke all on function public.brain_values_set_secret(uuid, text, text, uuid) from public;
grant execute on function public.brain_values_set_secret(uuid, text, text, uuid) to authenticated, service_role;
