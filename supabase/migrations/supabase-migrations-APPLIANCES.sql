-- Verified appliance inventory and manual sections. Manual content remains host
-- review-only until an explicit proposal is approved and applied to the Brain.
begin;

do $$ begin
  if not exists (select 1 from pg_type where typname = 'appliance_verification_status') then
    create type public.appliance_verification_status as enum ('unverified', 'model_confirmed', 'manual_ingested');
  end if;
end $$;

create table if not exists public.property_appliances (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  category text not null check (length(btrim(category)) between 1 and 80),
  display_name text not null check (length(btrim(display_name)) between 1 and 160),
  brand text,
  model_number text,
  serial_number text,
  location_note text,
  manual_url text,
  manual_document_id uuid references public.documents(id) on delete set null,
  verification_status public.appliance_verification_status not null default 'unverified',
  last_verified_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint appliance_unverified_without_model check (
    model_number is not null or (verification_status = 'unverified' and manual_url is null and manual_document_id is null)
  )
);

create unique index if not exists property_appliances_property_category_model_uidx
  on public.property_appliances (property_id, category, model_number);
create index if not exists property_appliances_property_idx on public.property_appliances (property_id, created_at desc);

create table if not exists public.appliance_manual_sections (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  appliance_id uuid not null references public.property_appliances(id) on delete cascade,
  section_title text not null check (length(btrim(section_title)) between 1 and 240),
  body text not null check (length(btrim(body)) between 1 and 30000),
  page_ref text,
  requires_licensed_technician boolean not null default false,
  source_document_id uuid references public.documents(id) on delete set null,
  approved_at timestamptz,
  approved_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists appliance_manual_sections_property_appliance_idx on public.appliance_manual_sections (property_id, appliance_id);

alter table public.property_appliances enable row level security;
alter table public.appliance_manual_sections enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'property_appliances' and policyname = 'property_appliances_select_members') then
    create policy property_appliances_select_members on public.property_appliances for select to authenticated using (public.can_access_property(property_id));
    create policy property_appliances_insert_editors on public.property_appliances for insert to authenticated with check (public.can_edit_property(property_id));
    create policy property_appliances_update_editors on public.property_appliances for update to authenticated using (public.can_edit_property(property_id)) with check (public.can_edit_property(property_id));
    create policy property_appliances_delete_editors on public.property_appliances for delete to authenticated using (public.can_edit_property(property_id));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'appliance_manual_sections' and policyname = 'appliance_manual_sections_select_members') then
    create policy appliance_manual_sections_select_members on public.appliance_manual_sections for select to authenticated using (public.can_access_property(property_id));
    create policy appliance_manual_sections_insert_editors on public.appliance_manual_sections for insert to authenticated with check (public.can_edit_property(property_id));
    create policy appliance_manual_sections_update_editors on public.appliance_manual_sections for update to authenticated using (public.can_edit_property(property_id)) with check (public.can_edit_property(property_id));
    create policy appliance_manual_sections_delete_editors on public.appliance_manual_sections for delete to authenticated using (public.can_edit_property(property_id));
  end if;
end $$;

commit;
