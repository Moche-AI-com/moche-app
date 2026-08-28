-- superseded_by is a forward reference by nature: the row that replaces this one
-- does not exist yet at the moment we retire it. Combined with the partial unique
-- index brain_values_one_active_per_field (which correctly refuses two active
-- rows for one field), there is no statement order that satisfies both an
-- immediate FK and the unique index. Deferring the FK to commit resolves it
-- without weakening either guarantee: at commit, superseded_by must still point
-- at a real row.
alter table public.brain_values
  drop constraint brain_values_superseded_by_fkey;

alter table public.brain_values
  add constraint brain_values_superseded_by_fkey
  foreign key (superseded_by) references public.brain_values(id)
  deferrable initially deferred;

-- Retire first, then insert. Retiring frees the one-active slot, and the FK to
-- the not-yet-inserted successor is checked at commit.
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
  new_id uuid := gen_random_uuid();
  next_version integer := 1;
  v_audience public.audience_tier;
begin
  select * into reg from public.field_registry where field_id = p_field_id;
  if not found then
    raise exception 'field_id % is not declared in field_registry', p_field_id
      using errcode = '23514';
  end if;

  -- The registry default is a ceiling, not a floor: the enforcement trigger
  -- rejects anything wider, so null means "use the registry" and an explicit
  -- narrower audience is still permitted.
  v_audience := coalesce(p_audience, reg.default_audience);

  select * into prev
  from public.brain_values
  where property_id = p_property_id
    and field_id = p_field_id
    and status = 'active'
  order by version desc
  limit 1
  for update;

  if prev.id is not null then
    next_version := prev.version + 1;
    update public.brain_values
       set status = 'superseded', superseded_by = new_id
     where id = prev.id;
  end if;

  insert into public.brain_values (
    id, property_id, field_id, value, secret_ref_or_ciphertext,
    sensitivity_tier, audience, source, confidence,
    verified_at, verified_by, status, version, created_by
  ) values (
    new_id, p_property_id, p_field_id, p_value, p_secret_ref,
    reg.sensitivity_tier, v_audience, p_source, coalesce(p_confidence, 0.50),
    case when p_actor is not null then now() else null end,
    p_actor,
    'active', next_version, p_actor
  );

  return new_id;
end
$$;

comment on function public.brain_values_set is
  'Atomically retires the prior active row and writes a new brain_values version. Tier and audience come from field_registry; the caller cannot widen them.';

revoke all on function public.brain_values_set(uuid, text, jsonb, text, public.brain_value_source, numeric, uuid, public.audience_tier) from public;
grant execute on function public.brain_values_set(uuid, text, jsonb, text, public.brain_value_source, numeric, uuid, public.audience_tier) to service_role;
