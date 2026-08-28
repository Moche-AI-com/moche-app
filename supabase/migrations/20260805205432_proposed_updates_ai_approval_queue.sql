begin;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'proposed_update_status') then
    create type public.proposed_update_status as enum
      ('pending', 'approved', 'modified', 'denied');
  end if;
end $$;

create table if not exists public.proposed_updates (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties (id) on delete cascade,
  host_account_id uuid not null references public.host_accounts (id) on delete cascade,
  status public.proposed_update_status not null default 'pending',
  field_path text not null
    check (field_path ~ '^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$' and length(field_path) <= 120),
  label text not null check (length(btrim(label)) between 1 and 160),
  proposed_value jsonb not null,
  original_value jsonb,
  applied_value jsonb,
  source_type text not null check (source_type in (
    'listing_url','document','text_paste','tone_migration','nearby_refresh','ai_suggestion'
  )),
  source_ref text check (source_ref is null or length(source_ref) <= 2000),
  confidence numeric(4, 3) check (confidence is null or (confidence >= 0 and confidence <= 1)),
  reviewed_by uuid references public.profiles (id) on delete set null,
  reviewed_at timestamptz,
  resolution_note text check (resolution_note is null or length(resolution_note) <= 1000),
  applied_at timestamptz,
  apply_error text check (apply_error is null or length(apply_error) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint proposed_updates_review_consistency check (
    (status = 'pending' and reviewed_at is null)
    or (status <> 'pending' and reviewed_at is not null)
  ),
  constraint proposed_updates_modified_has_value check (
    status <> 'modified' or applied_value is not null
  )
);

create or replace function public.tg_proposed_update_review_stamp()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  if new.status <> 'pending' and (old.status is null or old.status = 'pending') then
    new.reviewed_at := coalesce(new.reviewed_at, now());
  elsif new.status = 'pending' then
    new.reviewed_at := null;
  end if;
  return new;
end $$;

alter function public.tg_proposed_update_review_stamp() set search_path = '';

drop trigger if exists proposed_updates_review_stamp on public.proposed_updates;
create trigger proposed_updates_review_stamp
  before insert or update on public.proposed_updates
  for each row execute function public.tg_proposed_update_review_stamp();

create index if not exists proposed_updates_property_status_created_idx
  on public.proposed_updates (property_id, status, created_at);

create index if not exists proposed_updates_account_pending_idx
  on public.proposed_updates (host_account_id, created_at)
  where status = 'pending';

alter table public.proposed_updates enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'proposed_updates'
      and policyname = 'proposed_updates_select_members'
  ) then
    create policy proposed_updates_select_members
      on public.proposed_updates
      for select
      to authenticated
      using (public.can_access_property(property_id));
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'proposed_updates'
      and policyname = 'proposed_updates_update_editors'
  ) then
    create policy proposed_updates_update_editors
      on public.proposed_updates
      for update
      to authenticated
      using (public.can_edit_property(property_id))
      with check (public.can_edit_property(property_id));
  end if;
end $$;

revoke execute on function public.tg_proposed_update_review_stamp()
  from public, anon, authenticated;

commit;
