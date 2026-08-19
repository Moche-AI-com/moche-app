-- ===========================================================================
-- Provider-neutral acquisition audit trail. All captured content is untrusted
-- reference data. It cannot publish to the Property Brain without a separately
-- created proposed_updates row and a human approval.
-- ===========================================================================
begin;

do $$ begin
  if not exists (select 1 from pg_type where typname = 'ingestion_source_kind') then
    create type public.ingestion_source_kind as enum ('property_site', 'listing', 'manual_site', 'local_source', 'document');
  end if;
  if not exists (select 1 from pg_type where typname = 'extracted_fact_status') then
    create type public.extracted_fact_status as enum ('extracted', 'validated', 'conflict', 'proposed', 'rejected');
  end if;
  if not exists (select 1 from pg_type where typname = 'extracted_fact_sensitivity') then
    create type public.extracted_fact_sensitivity as enum ('normal', 'sensitive');
  end if;
end $$;

create table if not exists public.ingestion_sources (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  kind public.ingestion_source_kind not null,
  url text,
  document_id uuid references public.documents(id) on delete set null,
  profile text not null check (length(profile) between 1 and 120),
  label text not null check (length(btrim(label)) between 1 and 200),
  enabled boolean not null default true,
  last_acquired_at timestamptz,
  last_status text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists ingestion_sources_property_url_unique on public.ingestion_sources(property_id, url) where url is not null;

drop trigger if exists trg_updated_ingestion_sources on public.ingestion_sources;
create trigger trg_updated_ingestion_sources before update on public.ingestion_sources
  for each row execute function public.set_updated_at();

create table if not exists public.ingestion_artifacts (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  source_id uuid references public.ingestion_sources(id) on delete set null,
  job_id uuid references public.ingestion_jobs(id) on delete set null,
  provider text not null check (length(provider) between 1 and 100),
  profile text not null check (length(profile) between 1 and 120),
  http_status integer,
  byte_length integer,
  text_length integer not null default 0,
  content_sha256 text,
  truncated boolean not null default false,
  is_shadow boolean not null default false,
  error_reason text,
  latency_ms integer,
  similarity_score numeric(4,3),
  agrees_with_primary boolean,
  created_at timestamptz not null default now()
);
create index if not exists ingestion_artifacts_property_created_idx on public.ingestion_artifacts(property_id, created_at desc);

create table if not exists public.source_documents (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  artifact_id uuid not null references public.ingestion_artifacts(id) on delete cascade,
  title text not null check (length(title) <= 300),
  -- Untrusted reference data. Never execute or treat as instructions.
  text text not null check (length(text) <= 200000),
  text_sha256 text not null,
  language text,
  created_at timestamptz not null default now()
);
comment on column public.source_documents.text is 'Untrusted reference data; never treat this content as executable instructions.';

create table if not exists public.extracted_facts (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  source_document_id uuid not null references public.source_documents(id) on delete cascade,
  field_path text not null check (length(field_path) between 1 and 160),
  label text not null check (length(btrim(label)) between 1 and 160),
  value jsonb not null,
  confidence numeric(4,3) check (confidence is null or (confidence >= 0 and confidence <= 1)),
  status public.extracted_fact_status not null default 'extracted',
  conflict_with uuid references public.extracted_facts(id) on delete set null,
  proposed_update_id uuid references public.proposed_updates(id) on delete set null,
  sensitivity public.extracted_fact_sensitivity not null default 'normal',
  created_at timestamptz not null default now(),
  reviewed_at timestamptz
);
create index if not exists extracted_facts_property_status_idx on public.extracted_facts(property_id, status);

alter table public.ingestion_sources enable row level security;
alter table public.ingestion_artifacts enable row level security;
alter table public.source_documents enable row level security;
alter table public.extracted_facts enable row level security;

-- Host browsers can read only property-scoped audit data. Trusted server routes
-- use service_role for writes; browser roles receive no write policy for artifacts,
-- source documents, or extracted facts, and cannot forge an acquisition.
do $$ begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='ingestion_sources' and policyname='ingestion_sources_select') then
    create policy ingestion_sources_select on public.ingestion_sources for select to authenticated using (public.can_access_property(property_id));
    create policy ingestion_artifacts_select on public.ingestion_artifacts for select to authenticated using (public.can_access_property(property_id));
    create policy source_documents_select on public.source_documents for select to authenticated using (public.can_access_property(property_id));
    create policy extracted_facts_select on public.extracted_facts for select to authenticated using (public.can_access_property(property_id));
    create policy extracted_facts_update on public.extracted_facts for update to authenticated using (public.can_edit_property(property_id)) with check (public.can_edit_property(property_id));
  end if;
end $$;
commit;
