do $$
begin
  if not exists (select 1 from pg_type where typname = 'extras_order_status') then
    create type public.extras_order_status as enum
      ('requested', 'confirmed', 'fulfilled', 'declined', 'cancelled');
  end if;
end $$;

create table if not exists public.extras_orders (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties (id) on delete cascade,
  stay_id uuid references public.stays (id) on delete set null,
  conversation_id uuid references public.conversations (id) on delete set null,
  escalation_id uuid references public.escalations (id) on delete set null,
  extra_id uuid references public.guest_extras (id) on delete set null,
  item_title text not null check (length(btrim(item_title)) between 1 and 200),
  item_price_text text check (item_price_text is null or length(item_price_text) <= 80),
  quantity integer not null default 1 check (quantity between 1 and 20),
  guest_note text check (guest_note is null or length(guest_note) <= 1000),
  host_note text check (host_note is null or length(host_note) <= 1000),
  status public.extras_order_status not null default 'requested',
  lifecycle_status public.lifecycle_state
    generated always as (
      case
        when status in ('fulfilled', 'declined', 'cancelled') then 'archived'::public.lifecycle_state
        else 'active'::public.lifecycle_state
      end
    ) stored,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.tg_extras_order_archived_at()
returns trigger
language plpgsql
as $$
begin
  if new.status in ('fulfilled', 'declined', 'cancelled') then
    if old.status is null or old.status not in ('fulfilled', 'declined', 'cancelled') then
      new.archived_at := now();
    end if;
  else
    new.archived_at := null;
  end if;
  return new;
end $$;

alter function public.tg_extras_order_archived_at() set search_path = '';

drop trigger if exists extras_orders_archived_at on public.extras_orders;
create trigger extras_orders_archived_at
  before insert or update of status on public.extras_orders
  for each row execute function public.tg_extras_order_archived_at();

create or replace function public.tg_extras_order_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end $$;

alter function public.tg_extras_order_touch_updated_at() set search_path = '';

drop trigger if exists extras_orders_touch_updated_at on public.extras_orders;
create trigger extras_orders_touch_updated_at
  before update on public.extras_orders
  for each row execute function public.tg_extras_order_touch_updated_at();

create index if not exists extras_orders_property_lifecycle_created_idx
  on public.extras_orders (property_id, lifecycle_status, created_at desc);

create index if not exists extras_orders_stay_idx
  on public.extras_orders (stay_id)
  where stay_id is not null;

create index if not exists extras_orders_extra_idx
  on public.extras_orders (extra_id)
  where extra_id is not null;

alter table public.extras_orders enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'extras_orders'
      and policyname = 'extras_orders_select_members'
  ) then
    create policy extras_orders_select_members
      on public.extras_orders
      for select
      to authenticated
      using (public.can_access_property(property_id));
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'extras_orders'
      and policyname = 'extras_orders_update_editors'
  ) then
    create policy extras_orders_update_editors
      on public.extras_orders
      for update
      to authenticated
      using (public.can_edit_property(property_id))
      with check (public.can_edit_property(property_id));
  end if;
end $$;

revoke execute on function public.tg_extras_order_archived_at() from public, anon, authenticated;
revoke execute on function public.tg_extras_order_touch_updated_at() from public, anon, authenticated;
