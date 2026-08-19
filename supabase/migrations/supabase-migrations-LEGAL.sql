-- ============================================================================
-- Legal / Compliance layer — additive, non-destructive migration.
-- Safe to run repeatedly (IF NOT EXISTS / CREATE OR REPLACE throughout).
--
-- DO NOT APPLY AUTOMATICALLY. The main agent applies this via Supabase tooling
-- AFTER attorney + engineering review. It is intentionally kept out of the app's
-- runtime path.
--
-- Adds ONLY:
--   1. legal_documents   — versioned registry of published legal docs (public read).
--   2. legal_acceptances — immutable clickwrap acceptance log (per user, per doc).
--   3. RLS: users insert/select their OWN acceptances; service role full access;
--           legal_documents is world-readable (published policy versions).
--   4. Supporting indexes.
--
-- Does NOT alter/drop any existing table, enum, function, or policy.
-- FKs reference auth.users(id) and public.host_accounts(id) — the real tenant
-- (there is NO organizations table; subscriptions are keyed by host_account_id).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Versioned registry of published legal documents. One row per (slug, version).
--    `sha256` pins the exact published text so an acceptance can be tied to an
--    immutable snapshot even if the source file later changes.
-- ---------------------------------------------------------------------------
create table if not exists public.legal_documents (
  id uuid primary key default gen_random_uuid(),
  slug text not null,
  version text not null,
  effective_date date not null,
  sha256 text,
  created_at timestamptz not null default now()
);

-- One published row per slug+version; re-publishing the same version is a no-op upsert target.
create unique index if not exists legal_documents_slug_version_uidx
  on public.legal_documents (slug, version);

-- Fast "current version for this slug" lookups (used by the re-acceptance gate).
create index if not exists legal_documents_slug_effective_idx
  on public.legal_documents (slug, effective_date desc);

-- ---------------------------------------------------------------------------
-- 2. Immutable clickwrap acceptance log. Append-only from the user's side:
--    RLS grants INSERT + SELECT of own rows but no UPDATE/DELETE, so the record
--    of what a user agreed to (and when, from where) cannot be rewritten.
--    `context` is a free-text tag: 'signup' | 'checkout' | 'dpa' | 'reacceptance'.
-- ---------------------------------------------------------------------------
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

-- Primary access pattern: "has this user accepted the current version of <slug>?"
create index if not exists legal_acceptances_user_slug_idx
  on public.legal_acceptances (user_id, document_slug);

create index if not exists legal_acceptances_host_account_idx
  on public.legal_acceptances (host_account_id);

-- ---------------------------------------------------------------------------
-- 3. RLS.
-- ---------------------------------------------------------------------------
alter table public.legal_documents enable row level security;
alter table public.legal_acceptances enable row level security;

-- legal_documents: published policy versions are public reference data. Anyone
-- (including anon, so the re-acceptance gate and public legal center can read
-- the current version) may SELECT. Writes stay service-role only (no write policy).
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

-- legal_acceptances: a user may INSERT rows for themselves and SELECT their own
-- history. No UPDATE/DELETE policy => append-only for end users. The service role
-- bypasses RLS for admin export/retention tooling.
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
