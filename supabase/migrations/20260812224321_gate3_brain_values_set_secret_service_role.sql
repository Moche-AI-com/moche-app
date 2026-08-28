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
