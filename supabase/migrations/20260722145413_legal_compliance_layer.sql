-- Legal / Compliance layer — additive, non-destructive.
create table if not exists public.legal_documents (
  id uuid primary key default gen_random_uuid(),
  slug text not null,
  version text not null,
  effective_date date not null,
  sha256 text,
  created_at timestamptz not null default now()
);
create unique index if not exists legal_documents_slug_version_uidx
  on public.legal_documents (slug, version);
create index if not exists legal_documents_slug_effective_idx
  on public.legal_documents (slug, effective_date desc);
create table if not exists public.legal_acceptances (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  host_account_id uuid references public.host_accounts(id) on delete set null,
  document_slug text not null,
  document_version text not null,
  accepted_at timestamptz not null default now(),
  ip inet,
  user_agent text,
  context text not null default 'signup'
);
create index if not exists legal_acceptances_user_slug_idx
  on public.legal_acceptances (user_id, document_slug);
create index if not exists legal_acceptances_host_account_idx
  on public.legal_acceptances (host_account_id);
alter table public.legal_documents enable row level security;
alter table public.legal_acceptances enable row level security;
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'legal_documents'
      and policyname = 'legal_documents_select_all'
  ) then
    create policy legal_documents_select_all
      on public.legal_documents
      for select
      using (true);
  end if;
end$$;
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'legal_acceptances'
      and policyname = 'legal_acceptances_insert_own'
  ) then
    create policy legal_acceptances_insert_own
      on public.legal_acceptances
      for insert
      with check (auth.uid() = user_id);
  end if;
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'legal_acceptances'
      and policyname = 'legal_acceptances_select_own'
  ) then
    create policy legal_acceptances_select_own
      on public.legal_acceptances
      for select
      using (auth.uid() = user_id);
  end if;
end$$;
