do $$
begin
  if not exists (select 1 from pg_type where typname = 'lifecycle_state') then
    create type public.lifecycle_state as enum ('active', 'archived');
  end if;
end $$;

alter table public.service_requests
  add column if not exists lifecycle_status public.lifecycle_state
    generated always as (
      case when status in ('resolved', 'closed') then 'archived'::public.lifecycle_state
           else 'active'::public.lifecycle_state end
    ) stored;

alter table public.service_requests add column if not exists archived_at timestamptz;

update public.service_requests set archived_at = updated_at
 where status in ('resolved','closed') and archived_at is null;

create or replace function public.tg_service_request_archived_at()
returns trigger language plpgsql as $fn$
begin
  if new.status in ('resolved','closed') then
    if old.status is null or old.status not in ('resolved','closed') then
      new.archived_at := now();
    end if;
  else
    new.archived_at := null;
  end if;
  return new;
end $fn$;

drop trigger if exists service_requests_archived_at on public.service_requests;
create trigger service_requests_archived_at
  before insert or update of status on public.service_requests
  for each row execute function public.tg_service_request_archived_at();

alter table public.stays
  add column if not exists lifecycle_status public.lifecycle_state
    generated always as (
      case when status in ('completed','revoked') then 'archived'::public.lifecycle_state
           else 'active'::public.lifecycle_state end
    ) stored;

alter table public.stays add column if not exists archived_at timestamptz;

update public.stays set archived_at = updated_at
 where status in ('completed','revoked') and archived_at is null;

create or replace function public.tg_stay_archived_at()
returns trigger language plpgsql as $fn$
begin
  if new.status in ('completed','revoked') then
    if old.status is null or old.status not in ('completed','revoked') then
      new.archived_at := now();
    end if;
  else
    new.archived_at := null;
  end if;
  return new;
end $fn$;

drop trigger if exists stays_archived_at on public.stays;
create trigger stays_archived_at
  before insert or update of status on public.stays
  for each row execute function public.tg_stay_archived_at();

create index if not exists service_requests_property_lifecycle_created_idx
  on public.service_requests (property_id, lifecycle_status, created_at desc);

create index if not exists stays_property_lifecycle_created_idx
  on public.stays (property_id, lifecycle_status, created_at desc);

revoke execute on function public.tg_service_request_archived_at() from public, anon, authenticated;
revoke execute on function public.tg_stay_archived_at() from public, anon, authenticated;
