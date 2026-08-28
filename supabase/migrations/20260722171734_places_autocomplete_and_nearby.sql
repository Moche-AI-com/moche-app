alter table public.properties add column if not exists lat numeric;
alter table public.properties add column if not exists lng numeric;

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

create unique index if not exists nearby_places_property_place_uidx
  on public.nearby_places (property_id, place_id);
create index if not exists nearby_places_property_idx
  on public.nearby_places (property_id);
create index if not exists nearby_places_property_category_idx
  on public.nearby_places (property_id, category);

alter table public.nearby_places enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='nearby_places' and policyname='nearby_places_select_members') then
    create policy nearby_places_select_members on public.nearby_places for select to authenticated using (public.can_access_property(property_id));
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='nearby_places' and policyname='nearby_places_insert_editors') then
    create policy nearby_places_insert_editors on public.nearby_places for insert to authenticated with check (public.can_edit_property(property_id));
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='nearby_places' and policyname='nearby_places_update_editors') then
    create policy nearby_places_update_editors on public.nearby_places for update to authenticated using (public.can_edit_property(property_id));
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='nearby_places' and policyname='nearby_places_delete_editors') then
    create policy nearby_places_delete_editors on public.nearby_places for delete to authenticated using (public.can_edit_property(property_id));
  end if;
end$$;
