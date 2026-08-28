alter table public.nearby_places
  add column if not exists tags text[] not null default '{}';

alter table public.nearby_places
  add column if not exists reviewed_at timestamptz;

create index if not exists nearby_places_property_reviewed_idx
  on public.nearby_places (property_id, reviewed_at);
