-- URL-first property import jobs and the versioned readiness requirement catalog.
-- Processing stays in the request path, but each job transition is persisted before
-- the next operation so an interrupted request reports its honest last stage.
begin;

do $$ begin
  if not exists (select 1 from pg_type where typname = 'property_import_job_status') then
    create type public.property_import_job_status as enum ('queued', 'acquiring', 'extracting', 'drafting', 'awaiting_review', 'completed', 'failed', 'canceled');
  end if;
  if not exists (select 1 from pg_type where typname = 'knowledge_requirement_status') then
    create type public.knowledge_requirement_status as enum ('missing', 'partial', 'satisfied', 'not_applicable');
  end if;
end $$;

create table if not exists public.knowledge_requirements (
  key text not null check (key ~ '^[a-z][a-z0-9_]*$'),
  version integer not null check (version > 0),
  category text not null check (length(btrim(category)) between 1 and 80),
  label text not null check (length(btrim(label)) between 1 and 160),
  why text not null check (length(btrim(why)) between 1 and 500),
  weight_hint numeric(5,4) not null check (weight_hint > 0 and weight_hint <= 1),
  field_paths text[] not null default '{}',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (key, version)
);

insert into public.knowledge_requirements (key, version, category, label, why, weight_hint, field_paths) values
  ('arrival_instructions', 1, 'arrival_access_departure', 'Arrival instructions', 'Guests need to know how to arrive and get in.', .25, array['brain.arrival_instructions']),
  ('departure_instructions', 1, 'arrival_access_departure', 'Departure instructions', 'Guests need clear check-out steps.', .25, array['brain.departure_instructions']),
  ('emergency_contact', 1, 'safety_contacts', 'Emergency contact', 'Guests need a reliable contact for urgent issues.', .20, array['brain.emergency_contact']),
  ('safety_information', 1, 'safety_contacts', 'Safety information', 'Guests need to find essential safety information quickly.', .20, array['brain.safety_information']),
  ('house_rules', 1, 'rules', 'House rules', 'Clear rules prevent avoidable guest issues.', .15, array['brain.house_rules']),
  ('essential_amenities', 1, 'essential_amenities', 'Essential amenities', 'Guests need to know what essential amenities are available.', .15, array['brain.essential_amenities']),
  ('property_basics', 1, 'basics', 'Property basics', 'Guests need the key facts about the property.', .10, array['brain.property_basics']),
  ('appliance_guidance', 1, 'appliance_guidance', 'Appliance guidance', 'Guests need safe instructions for major appliances.', .05, array['property_appliances']),
  ('local_recommendations', 1, 'local_recommendations', 'Local recommendations', 'Guests benefit from a few host-approved nearby recommendations.', .05, array['recommendations']),
  ('frequently_asked_questions', 1, 'faqs', 'Frequently asked questions', 'Answers to common questions reduce avoidable messages.', .05, array['brain.faqs'])
on conflict (key, version) do nothing;

create table if not exists public.property_knowledge_requirement_status (
  property_id uuid not null references public.properties(id) on delete cascade,
  requirement_key text not null,
  requirement_version integer not null,
  status public.knowledge_requirement_status not null default 'missing',
  satisfied_at timestamptz,
  evidence jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (property_id, requirement_key),
  foreign key (requirement_key, requirement_version)
    references public.knowledge_requirements(key, version),
  constraint property_requirement_satisfied_stamp check (
    (status in ('satisfied', 'not_applicable') and satisfied_at is not null) or
    (status in ('missing', 'partial') and satisfied_at is null)
  )
);

create table if not exists public.property_import_jobs (
  id uuid primary key default gen_random_uuid(),
  host_account_id uuid not null references public.host_accounts(id) on delete cascade,
  property_id uuid references public.properties(id) on delete set null,
  source_url text not null check (length(source_url) between 1 and 2000),
  provider text not null default 'unknown' check (length(provider) <= 80),
  status public.property_import_job_status not null default 'queued',
  stage_detail text,
  progress_pct integer not null default 0 check (progress_pct between 0 and 100),
  error_reason text,
  error_message text,
  attempts integer not null default 0 check (attempts >= 0),
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint property_import_completed_stamp check ((status <> 'completed') or completed_at is not null)
);

create table if not exists public.property_import_artifacts (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.property_import_jobs(id) on delete cascade,
  kind text not null check (length(btrim(kind)) between 1 and 80),
  payload jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists property_import_jobs_account_updated_idx on public.property_import_jobs (host_account_id, updated_at desc);
create index if not exists property_import_jobs_property_updated_idx on public.property_import_jobs (property_id, updated_at desc) where property_id is not null;
create index if not exists property_import_artifacts_job_created_idx on public.property_import_artifacts (job_id, created_at);

alter table public.knowledge_requirements enable row level security;
alter table public.property_knowledge_requirement_status enable row level security;
alter table public.property_import_jobs enable row level security;
alter table public.property_import_artifacts enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'knowledge_requirements' and policyname = 'knowledge_requirements_select_authenticated') then
    create policy knowledge_requirements_select_authenticated on public.knowledge_requirements for select to authenticated using (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'property_knowledge_requirement_status' and policyname = 'property_requirement_status_select_members') then
    create policy property_requirement_status_select_members on public.property_knowledge_requirement_status for select to authenticated using (public.can_access_property(property_id));
    create policy property_requirement_status_insert_editors on public.property_knowledge_requirement_status for insert to authenticated with check (public.can_edit_property(property_id));
    create policy property_requirement_status_update_editors on public.property_knowledge_requirement_status for update to authenticated using (public.can_edit_property(property_id)) with check (public.can_edit_property(property_id));
    create policy property_requirement_status_delete_editors on public.property_knowledge_requirement_status for delete to authenticated using (public.can_edit_property(property_id));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'property_import_jobs' and policyname = 'property_import_jobs_select_members') then
    create policy property_import_jobs_select_members on public.property_import_jobs for select to authenticated using (public.is_account_member(host_account_id));
    create policy property_import_jobs_insert_members on public.property_import_jobs for insert to authenticated with check (public.is_account_member(host_account_id) and created_by = auth.uid());
    create policy property_import_jobs_update_members on public.property_import_jobs for update to authenticated using (public.is_account_member(host_account_id)) with check (public.is_account_member(host_account_id));
    create policy property_import_jobs_delete_members on public.property_import_jobs for delete to authenticated using (public.is_account_member(host_account_id));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'property_import_artifacts' and policyname = 'property_import_artifacts_select_members') then
    create policy property_import_artifacts_select_members on public.property_import_artifacts for select to authenticated using (
      exists (select 1 from public.property_import_jobs j where j.id = job_id and public.is_account_member(j.host_account_id))
    );
  end if;
end $$;

commit;
