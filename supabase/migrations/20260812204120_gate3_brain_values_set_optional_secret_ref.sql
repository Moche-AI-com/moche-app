-- p_secret_ref had no default, so every non-secret write had to pass an explicit
-- null. The generated TypeScript types render a defaultless text parameter as
-- non-nullable `string`, which made the honest call site (`p_secret_ref: null`)
-- a type error. Defaulting it lets non-secret callers omit it entirely.
drop function if exists public.brain_values_set(uuid, text, jsonb, text, public.brain_value_source, numeric, uuid, public.audience_tier);

create or replace function public.brain_values_set(
  p_property_id uuid,
  p_field_id text,
  p_value jsonb,
  p_source public.brain_value_source,
  p_confidence numeric,
  p_actor uuid,
  p_secret_ref text default null,
  p_audience public.audience_tier default null
) returns uuid
language plpgsql
security invoker
set search_path to ''
as $fn$
declare
  reg record;
  new_id uuid := gen_random_uuid();
  v_audience public.audience_tier;
  prev_id uuid;
begin
  select * into reg from public.field_registry where field_id = p_field_id;
  if not found then
    raise exception 'unknown field_id: %', p_field_id using errcode = '23514';
  end if;

  v_audience := coalesce(p_audience, reg.default_audience);

  -- Lock the outgoing active row before touching it so two concurrent writes to
  -- the same field cannot both pass the one-active-per-field unique index.
  select id into prev_id
  from public.brain_values
  where property_id = p_property_id
    and field_id = p_field_id
    and status = 'active'
  for update;

  -- Retire first, insert second. The reverse order trips the partial unique
  -- index on (property_id, field_id) where status = 'active'.
  if prev_id is not null then
    update public.brain_values
       set status = 'superseded',
           superseded_by = new_id
     where id = prev_id;
  end if;

  insert into public.brain_values (
    id, property_id, field_id, value, secret_ref_or_ciphertext,
    sensitivity_tier, audience, source, confidence, created_by,
    verified_at, verified_by,
    version
  ) values (
    new_id, p_property_id, p_field_id, p_value, p_secret_ref,
    reg.sensitivity_tier, v_audience, p_source, p_confidence, p_actor,
    case when p_source = 'host_verified' then now() else null end,
    case when p_source = 'host_verified' then p_actor else null end,
    coalesce((select version from public.brain_values where id = prev_id), 0) + 1
  );

  return new_id;
end;
$fn$;

revoke all on function public.brain_values_set(uuid, text, jsonb, public.brain_value_source, numeric, uuid, text, public.audience_tier) from public;
grant execute on function public.brain_values_set(uuid, text, jsonb, public.brain_value_source, numeric, uuid, text, public.audience_tier) to service_role;
