-- Atomic writer for the brain_values envelope (Directive Gate 3).
--
-- Superseding a value is two writes: insert the new version, then point the old
-- row at it. Doing that from the application means a crash between the two
-- leaves either two active rows for one field_id (the concierge would then pick
-- arbitrarily) or an orphaned 'superseded' row that violates
-- brain_values_superseded_shape. One function, one transaction, no window.
--
-- SECURITY INVOKER on purpose. This is called with the service-role client from
-- the proposal applier, which is already past the host-approval choke point.
-- Making it SECURITY DEFINER would hand every role in an exposed schema an
-- RLS-bypassing write primitive into the Brain, for no gain.
create or replace function public.brain_values_set(
  p_property_id uuid,
  p_field_id text,
  p_value jsonb,
  p_secret_ref text,
  p_source public.brain_value_source,
  p_confidence numeric,
  p_actor uuid,
  p_audience public.audience_tier default null
) returns uuid
language plpgsql
security invoker
set search_path to ''
as $$
declare
  reg public.field_registry;
  prev public.brain_values;
  new_id uuid;
  next_version integer := 1;
  v_audience public.audience_tier;
begin
  select * into reg from public.field_registry where field_id = p_field_id;
  if not found then
    raise exception 'field_id % is not declared in field_registry', p_field_id
      using errcode = '23514';
  end if;

  -- The registry default is the ceiling, never a floor the caller can raise:
  -- the enforcement trigger rejects anything wider, so passing null here is the
  -- safe path and an explicit narrower audience is still allowed.
  v_audience := coalesce(p_audience, reg.default_audience);

  select * into prev
  from public.brain_values
  where property_id = p_property_id
    and field_id = p_field_id
    and status = 'active'
  order by version desc
  limit 1
  for update;

  if found then
    next_version := prev.version + 1;
  end if;

  insert into public.brain_values (
    property_id, field_id, value, secret_ref_or_ciphertext,
    sensitivity_tier, audience, source, confidence,
    verified_at, verified_by, status, version, created_by
  ) values (
    p_property_id, p_field_id, p_value, p_secret_ref,
    reg.sensitivity_tier, v_audience, p_source, coalesce(p_confidence, 0.50),
    case when p_actor is not null then now() else null end,
    p_actor,
    'active', next_version, p_actor
  ) returning id into new_id;

  if prev.id is not null then
    update public.brain_values
       set status = 'superseded', superseded_by = new_id
     where id = prev.id;
  end if;

  return new_id;
end
$$;

comment on function public.brain_values_set is
  'Atomically writes a brain_values version and supersedes the prior active row. Tier and audience are taken from field_registry; the caller cannot widen them.';

-- Only the service role writes through this. Revoking PUBLIC is what keeps a new
-- function in the public schema from being an anon-callable API endpoint.
revoke all on function public.brain_values_set(uuid, text, jsonb, text, public.brain_value_source, numeric, uuid, public.audience_tier) from public;
grant execute on function public.brain_values_set(uuid, text, jsonb, text, public.brain_value_source, numeric, uuid, public.audience_tier) to service_role;
