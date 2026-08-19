-- ============================================================================
-- Canonical Local places. Additive, idempotent and intentionally keeps the
-- legacy nearby_places and recommendations tables readable for one release.
--
-- Provider decision: Mapbox Search Box responses are temporary-use only, so
-- legacy rows marked source=mapbox are deliberately not migrated. See
-- docs/decisions/local-provider-data.md before changing that rule.
-- ============================================================================

do $$
begin
  if not exists (select 1 from pg_type where typname = 'place_recommendation_status') then
    create type public.place_recommendation_status as enum ('suggested', 'approved', 'hidden');
  end if;
end$$;

-- Canonical identity. This table has no authenticated write policy: durable
-- provider and manual ingestion is a trusted server workflow using service_role.
create table if not exists public.places (
  id uuid primary key default gen_random_uuid(),
  provider text not null check (provider in ('mapbox', 'osm', 'manual')),
  provider_place_id text,
  name text not null,
  normalized_name text not null,
  category text not null,
  address text,
  lat numeric,
  lon numeric,
  phone text,
  website text,
  provider_payload jsonb,
  first_seen_at timestamptz not null default now(),
  last_refreshed_at timestamptz not null default now()
);

create unique index if not exists places_provider_provider_place_id_uidx
  on public.places (provider, provider_place_id)
  where provider_place_id is not null;
create index if not exists places_normalized_name_idx on public.places (normalized_name);
create index if not exists places_category_idx on public.places (category);

create table if not exists public.property_place_recommendations (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  place_id uuid not null references public.places(id) on delete cascade,
  status public.place_recommendation_status not null default 'suggested',
  host_note text,
  tags text[] not null default '{}',
  is_favorite boolean not null default false,
  distance_miles numeric,
  intent_tags text[] not null default '{}',
  approved_by uuid references public.profiles(id) on delete set null,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (property_id, place_id)
);

create index if not exists property_place_recommendations_property_status_idx
  on public.property_place_recommendations (property_id, status);
create index if not exists property_place_recommendations_place_idx
  on public.property_place_recommendations (place_id);
create index if not exists property_place_recommendations_approved_by_idx
  on public.property_place_recommendations (approved_by);

drop trigger if exists property_place_recommendations_set_updated_at on public.property_place_recommendations;
create trigger property_place_recommendations_set_updated_at
  before update on public.property_place_recommendations
  for each row execute function public.set_updated_at();

alter table public.places enable row level security;
alter table public.property_place_recommendations enable row level security;

-- Reference rows contain public business information only. Hosts need to read
-- them while relationship rows provide the property-specific authorization gate.
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'places' and policyname = 'places_select_authenticated') then
    create policy places_select_authenticated on public.places
      for select to authenticated using (true);
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'property_place_recommendations' and policyname = 'property_place_recommendations_select_members') then
    create policy property_place_recommendations_select_members on public.property_place_recommendations
      for select to authenticated using (public.can_access_property(property_id));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'property_place_recommendations' and policyname = 'property_place_recommendations_insert_editors') then
    create policy property_place_recommendations_insert_editors on public.property_place_recommendations
      for insert to authenticated with check (public.can_edit_property(property_id));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'property_place_recommendations' and policyname = 'property_place_recommendations_update_editors') then
    create policy property_place_recommendations_update_editors on public.property_place_recommendations
      for update to authenticated using (public.can_edit_property(property_id)) with check (public.can_edit_property(property_id));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'property_place_recommendations' and policyname = 'property_place_recommendations_delete_editors') then
    create policy property_place_recommendations_delete_editors on public.property_place_recommendations
      for delete to authenticated using (public.can_edit_property(property_id));
  end if;
end$$;

-- Legacy mapping:
-- nearby_places: visible -> approved, hidden -> hidden; source osm is retained.
-- recommendations: approved/hidden map directly; legacy host and OSM provenance
-- is retained where available. A deterministic legacy provider id makes re-runs
-- idempotent. Mapbox rows stay in the old tables because durable storage is gated.
insert into public.places (
  provider, provider_place_id, name, normalized_name, category, address, lat, lon,
  phone, website, first_seen_at, last_refreshed_at
)
select
  'osm',
  coalesce(np.place_id, 'legacy-nearby:' || np.id::text),
  coalesce(nullif(trim(np.name), ''), 'Unnamed place'),
  trim(regexp_replace(regexp_replace(lower(coalesce(np.name, 'Unnamed place')), '\\b(incorporated|inc|llc|l\\.l\\.c|ltd|limited|corp|corporation|co|company|plc)\\b', '', 'g'), '[^a-z0-9]+', ' ', 'g')),
  coalesce(nullif(np.category, ''), 'attraction'), np.address, np.lat, np.lng, np.phone, np.url,
  np.created_at, np.refreshed_at
from public.nearby_places np
where coalesce(lower(np.source), 'osm') <> 'mapbox'
on conflict (provider, provider_place_id) where provider_place_id is not null do update
  set last_refreshed_at = greatest(public.places.last_refreshed_at, excluded.last_refreshed_at);

insert into public.property_place_recommendations (
  property_id, place_id, status, host_note, tags, is_favorite, distance_miles,
  approved_at, created_at, updated_at
)
select np.property_id, p.id,
  case when np.hidden then 'hidden'::public.place_recommendation_status else 'approved'::public.place_recommendation_status end,
  np.host_notes, coalesce(np.tags, '{}'), np.host_starred,
  case when np.distance_m is null then null else np.distance_m::numeric / 1609.344 end,
  case when np.hidden then null else np.created_at end, np.created_at, np.refreshed_at
from public.nearby_places np
join public.places p on p.provider = 'osm' and p.provider_place_id = coalesce(np.place_id, 'legacy-nearby:' || np.id::text)
where coalesce(lower(np.source), 'osm') <> 'mapbox'
on conflict (property_id, place_id) do nothing;

insert into public.places (
  provider, provider_place_id, name, normalized_name, category, address, lat, lon,
  website, first_seen_at, last_refreshed_at
)
select
  case when lower(coalesce(r.ai_source, 'host')) in ('osm', 'osm_overpass') then 'osm' else 'manual' end,
  'legacy-recommendation:' || r.id::text,
  r.name,
  trim(regexp_replace(regexp_replace(lower(r.name), '\\b(incorporated|inc|llc|l\\.l\\.c|ltd|limited|corp|corporation|co|company|plc)\\b', '', 'g'), '[^a-z0-9]+', ' ', 'g')),
  coalesce(nullif(r.category, ''), 'attraction'), r.address, r.lat, r.lng, r.url,
  r.created_at, r.created_at
from public.recommendations r
where coalesce(lower(r.ai_source), 'host') <> 'mapbox' and r.deleted_at is null
on conflict (provider, provider_place_id) where provider_place_id is not null do nothing;

insert into public.property_place_recommendations (
  property_id, place_id, status, host_note, tags, is_favorite, intent_tags,
  approved_at, created_at, updated_at
)
select r.property_id, p.id,
  case when r.hidden then 'hidden'::public.place_recommendation_status
       when r.approved then 'approved'::public.place_recommendation_status
       else 'suggested'::public.place_recommendation_status end,
  r.host_note, coalesce(r.tags, '{}'), r.host_preference = 'loved', coalesce(r.tags, '{}'),
  case when r.approved and not r.hidden then r.created_at else null end,
  r.created_at, r.created_at
from public.recommendations r
join public.places p on p.provider_place_id = 'legacy-recommendation:' || r.id::text
where coalesce(lower(r.ai_source), 'host') <> 'mapbox' and r.deleted_at is null
on conflict (property_id, place_id) do nothing;
