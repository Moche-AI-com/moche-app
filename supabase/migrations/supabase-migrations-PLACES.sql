-- ============================================================================
-- Feature 1 + 5 — Address autocomplete coordinates + auto-find nearby places.
-- Additive, non-destructive migration. Safe to run repeatedly
-- (IF NOT EXISTS / CREATE OR REPLACE / guarded policy creation throughout).
--
-- Adds:
--   1. properties.lat / properties.lng  — coordinates captured from the address
--      autocomplete (Photon/OSM) so nearby discovery has a fixed origin.
--   2. nearby_places                     — auto-found OSM POIs per property with
--      host curation (star / note / hide) + refresh bookkeeping.
--   3. RLS: host read/curate scoped by can_access_property / can_edit_property.
--      Bulk auto-find writes run as the service role (which bypasses RLS).
--
-- Does NOT alter/drop existing tables, enums, or the recommendations feature.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Property coordinates. NULL until a host picks an address or drops a pin.
-- ---------------------------------------------------------------------------
alter table public.properties add column if not exists lat numeric;
alter table public.properties add column if not exists lng numeric;

-- ---------------------------------------------------------------------------
-- 2. Nearby places. One row per (property, OSM element). Auto-found rows are
--    upserted by the service role; hosts curate host_starred / host_notes /
--    hidden. refreshed_at drives the 30-day staleness auto-refresh.
-- ---------------------------------------------------------------------------
create table if not exists public.nearby_places (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  place_id text,
  category text not null,
  name text,
  rating numeric,
  review_count integer,
  photo_ref text,
  lat numeric,
  lng numeric,
  price_level integer,
  host_starred boolean not null default false,
  host_notes text,
  hidden boolean not null default false,
  distance_m integer,
  created_at timestamptz not null default now(),
  refreshed_at timestamptz not null default now()
);

-- Upsert target: one row per property + OSM element id.
create unique index if not exists nearby_places_property_place_uidx
  on public.nearby_places (property_id, place_id);

-- Fast property-scoped listing + category grouping.
create index if not exists nearby_places_property_idx
  on public.nearby_places (property_id);
create index if not exists nearby_places_property_category_idx
  on public.nearby_places (property_id, category);

-- ---------------------------------------------------------------------------
-- 3. RLS. Hosts who can access the property may read; hosts who can edit the
--    property may curate (insert/update/delete). The service role bypasses RLS
--    for the bulk auto-find writes.
-- ---------------------------------------------------------------------------
alter table public.nearby_places enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'nearby_places'
      and policyname = 'nearby_places_select_members'
  ) then
    create policy nearby_places_select_members
      on public.nearby_places
      for select
      to authenticated
      using (public.can_access_property(property_id));
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'nearby_places'
      and policyname = 'nearby_places_insert_editors'
  ) then
    create policy nearby_places_insert_editors
      on public.nearby_places
      for insert
      to authenticated
      with check (public.can_edit_property(property_id));
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'nearby_places'
      and policyname = 'nearby_places_update_editors'
  ) then
    create policy nearby_places_update_editors
      on public.nearby_places
      for update
      to authenticated
      using (public.can_edit_property(property_id))
      with check (public.can_edit_property(property_id));
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'nearby_places'
      and policyname = 'nearby_places_delete_editors'
  ) then
    create policy nearby_places_delete_editors
      on public.nearby_places
      for delete
      to authenticated
      using (public.can_edit_property(property_id));
  end if;
end$$;
