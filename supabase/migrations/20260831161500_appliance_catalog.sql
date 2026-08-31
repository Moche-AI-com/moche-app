-- Shared appliance catalog (Manage Brain redesign, slice 4a; decisions D1/D2).
-- One catalog across all hosts: knowledge is normalized once per model and referenced
-- per property, so the 50th host adding a model costs a SELECT, not a fetch.
-- Catalog + knowledge are host-readable reference data (no tenant rows); writes are
-- service-role only via guarded server actions. Candidates are the host-submitted
-- growth path, writable only as the submitting profile.

create table if not exists public.appliance_catalog (
  id uuid primary key default gen_random_uuid(),
  category text not null check (length(btrim(category)) between 1 and 80),
  brand text not null check (length(btrim(brand)) between 1 and 120),
  model text not null check (length(btrim(model)) between 1 and 160),
  model_aliases text[] not null default '{}',
  oem_support_url text check (oem_support_url is null or length(oem_support_url) <= 2000),
  normalized_key text not null,
  times_added integer not null default 0 check (times_added >= 0),
  status text not null default 'seed' check (status = any (array['seed','active','needs_source'])),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists appliance_catalog_normalized_key_uidx on public.appliance_catalog (normalized_key);
create index if not exists appliance_catalog_brand_model_idx on public.appliance_catalog (brand, model);

create table if not exists public.appliance_catalog_knowledge (
  id uuid primary key default gen_random_uuid(),
  catalog_id uuid not null references public.appliance_catalog(id) on delete cascade,
  kind text not null check (kind = any (array['troubleshooting','error_code','usage','care'])),
  question text not null check (length(btrim(question)) between 1 and 300),
  answer text not null check (length(btrim(answer)) between 1 and 8000),
  source_url text check (source_url is null or length(source_url) <= 2000),
  source_tier text not null check (source_tier = any (array['oem','aggregator'])),
  content_hash text not null,
  verified_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists appliance_catalog_knowledge_catalog_idx on public.appliance_catalog_knowledge (catalog_id, kind);

create table if not exists public.appliance_catalog_candidates (
  id uuid primary key default gen_random_uuid(),
  raw_category text not null check (length(btrim(raw_category)) between 1 and 80),
  raw_brand text check (raw_brand is null or length(raw_brand) <= 120),
  raw_model text not null check (length(btrim(raw_model)) between 1 and 160),
  normalized_key text not null,
  submit_count integer not null default 1 check (submit_count >= 1),
  status text not null default 'pending' check (status = any (array['pending','merged','rejected'])),
  submitted_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists appliance_catalog_candidates_key_uidx on public.appliance_catalog_candidates (normalized_key);

alter table public.property_appliances add column if not exists catalog_id uuid references public.appliance_catalog(id) on delete set null;
create index if not exists property_appliances_catalog_idx on public.property_appliances (catalog_id) where catalog_id is not null;

alter table public.appliance_catalog enable row level security;
alter table public.appliance_catalog_knowledge enable row level security;
alter table public.appliance_catalog_candidates enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'appliance_catalog' and policyname = 'appliance_catalog_select_authenticated') then
    -- Shared reference catalog: every signed-in host may read it; no tenant data.
    create policy appliance_catalog_select_authenticated on public.appliance_catalog for select to authenticated using (true);
    create policy appliance_catalog_knowledge_select_authenticated on public.appliance_catalog_knowledge for select to authenticated using (true);
    -- Candidates grow the catalog: a host may only submit as themselves, and only sees their own.
    create policy appliance_catalog_candidates_insert_self on public.appliance_catalog_candidates for insert to authenticated with check (submitted_by = auth.uid());
    create policy appliance_catalog_candidates_select_self on public.appliance_catalog_candidates for select to authenticated using (submitted_by = auth.uid());
  end if;
end $$;
