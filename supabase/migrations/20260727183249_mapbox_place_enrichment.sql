alter table public.nearby_places add column if not exists address text;
alter table public.nearby_places add column if not exists url text;
alter table public.nearby_places add column if not exists phone text;
alter table public.nearby_places add column if not exists source text;
comment on column public.nearby_places.address is 'Street address from the geo provider (nullable).';
comment on column public.nearby_places.url is 'Official website from the geo provider (nullable).';
comment on column public.nearby_places.phone is 'Public business phone from the geo provider (nullable).';
comment on column public.nearby_places.source is 'Provenance of the row: mapbox | osm.';
create index if not exists nearby_places_property_distance_idx on public.nearby_places (property_id, distance_m);
