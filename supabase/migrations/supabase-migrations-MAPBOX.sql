-- ============================================================================
-- MAPBOX / local-places enrichment migration
-- Purely ADDITIVE and idempotent. No drops, no type changes, no data rewrites.
-- Safe to run repeatedly against production.
--
-- Why: the Mapbox Search Box category endpoint returns a street address, phone
-- number and website for each POI (Overpass only sometimes does). We store them
-- so hosts can curate, and so the concierge can answer "what's their number?"
-- without another API call. `source` records provenance per row.
-- ============================================================================

alter table public.nearby_places add column if not exists address text;
alter table public.nearby_places add column if not exists url text;
alter table public.nearby_places add column if not exists phone text;
alter table public.nearby_places add column if not exists source text;

comment on column public.nearby_places.address is 'Street address from the geo provider (nullable).';
comment on column public.nearby_places.url is 'Official website from the geo provider (nullable).';
comment on column public.nearby_places.phone is 'Public business phone from the geo provider (nullable).';
comment on column public.nearby_places.source is 'Provenance of the row: mapbox | osm.';

-- Helps the host dashboard list starred/visible places by distance.
create index if not exists nearby_places_property_distance_idx
  on public.nearby_places (property_id, distance_m);
