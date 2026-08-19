-- ============================================================================
-- Part D1 / D1b / E hardening — additive, non-destructive migration.
-- Safe to run repeatedly (IF NOT EXISTS / CREATE OR REPLACE throughout).
--
-- Adds:
--   1. property_brain_versions  — per-property Brain version counter (cache key).
--   2. bump_brain_version(uuid) — atomic increment used to invalidate the cache.
--   3. answer_cache             — Postgres exact-match concierge answer cache.
--
-- No enum values are added: brain_category.host_qa, source_type.host_qa,
-- conversation_role.assistant, ai_usage.cache_hit and
-- escalations.converted_brain_item_id / responded_by already exist.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Per-property Brain version. Absence of a row == version 1 (implicit).
-- ---------------------------------------------------------------------------
create table if not exists public.property_brain_versions (
  property_id uuid primary key references public.properties(id) on delete cascade,
  version integer not null default 1,
  updated_at timestamptz not null default now()
);

-- RLS on, no policies => only the service role (which bypasses RLS) may touch it.
-- Mirrors the ai_usage / answer_cache server-only access pattern.
alter table public.property_brain_versions enable row level security;

-- ---------------------------------------------------------------------------
-- 2. Atomic bump. First bump on an absent row lands at 2 (was implicitly 1).
-- ---------------------------------------------------------------------------
create or replace function public.bump_brain_version(p_property_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v integer;
begin
  insert into public.property_brain_versions (property_id, version, updated_at)
  values (p_property_id, 2, now())
  on conflict (property_id)
  do update set version = public.property_brain_versions.version + 1,
                updated_at = now()
  returning version into v;
  return v;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Exact-match answer cache. question_norm is lowercased/whitespace-collapsed/
--    trailing-punctuation-stripped on the app side before lookup + write.
-- ---------------------------------------------------------------------------
create table if not exists public.answer_cache (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  question_norm text not null,
  answer text not null,
  confidence numeric not null default 0,
  brain_version integer not null default 1,
  created_at timestamptz not null default now()
);

create unique index if not exists answer_cache_property_question_uidx
  on public.answer_cache (property_id, question_norm);

-- RLS on, no policies => service-role only (mirrors ai_usage / guest_access_links).
alter table public.answer_cache enable row level security;
