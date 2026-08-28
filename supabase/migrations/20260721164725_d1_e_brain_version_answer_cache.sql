create table if not exists public.property_brain_versions (
  property_id uuid primary key references public.properties(id) on delete cascade,
  version integer not null default 1,
  updated_at timestamptz not null default now()
);
alter table public.property_brain_versions enable row level security;

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
alter table public.answer_cache enable row level security;
