-- ===========================================================================
-- Extras request lifecycle, request-only mode.
--
-- Moche does not collect from a guest card or any card on file. `payment_mode`
-- is intentionally constrained to request_only; `payment_pending` means only
-- that the host is waiting for payment arranged outside Moche.
-- ===========================================================================

begin;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'extras_fulfillment_status') then
    create type public.extras_fulfillment_status as enum (
      'requested',
      'needs_details',
      'accepted',
      'payment_pending',
      'scheduled',
      'fulfilled',
      'declined',
      'canceled',
      'expired',
      'refunded'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'extras_order_event_actor') then
    create type public.extras_order_event_actor as enum ('guest', 'host', 'system');
  end if;
end $$;

alter table public.extras_orders
  add column if not exists fulfillment_status public.extras_fulfillment_status not null default 'requested',
  add column if not exists guest_note text,
  add column if not exists host_note text,
  add column if not exists quoted_amount_cents integer,
  add column if not exists quote_currency text not null default 'usd',
  add column if not exists payment_mode text not null default 'request_only',
  add column if not exists scheduled_for timestamptz,
  add column if not exists request_number text,
  add column if not exists declined_reason text,
  add column if not exists expires_at timestamptz;

alter table public.extras_orders
  drop constraint if exists extras_orders_payment_mode_check,
  add constraint extras_orders_payment_mode_check check (payment_mode = 'request_only'),
  drop constraint if exists extras_orders_quoted_amount_cents_check,
  add constraint extras_orders_quoted_amount_cents_check
    check (quoted_amount_cents is null or quoted_amount_cents >= 0),
  drop constraint if exists extras_orders_quote_currency_check,
  add constraint extras_orders_quote_currency_check
    check (quote_currency ~ '^[a-z]{3}$'),
  drop constraint if exists extras_orders_declined_reason_check,
  add constraint extras_orders_declined_reason_check
    check (declined_reason is null or length(declined_reason) between 1 and 1000);

-- Old values retain their closest equivalent. Keep `status` in place because
-- historical reporting still reads it; application writes mirror new states
-- back to it without implying that it remains the lifecycle authority.
update public.extras_orders
set fulfillment_status = case status::text
  when 'confirmed' then 'accepted'::public.extras_fulfillment_status
  when 'fulfilled' then 'fulfilled'::public.extras_fulfillment_status
  when 'declined' then 'declined'::public.extras_fulfillment_status
  when 'cancelled' then 'canceled'::public.extras_fulfillment_status
  else 'requested'::public.extras_fulfillment_status
end
where fulfillment_status = 'requested'::public.extras_fulfillment_status;

-- Existing rows did not receive application-generated references. The row
-- number is encoded through an unambiguous alphabet, remains deterministic on
-- this migration run, and is unique for the six-symbol range (16M rows).
with numbered as (
  select id, row_number() over (order by created_at, id) as ordinal
  from public.extras_orders
  where request_number is null
)
update public.extras_orders o
set request_number = 'MR-' || translate(
  lpad(to_hex(numbered.ordinal), 6, '0'),
  '0123456789abcdef',
  'ABCDEFGHJKLMNPQR'
)
from numbered
where o.id = numbered.id;

alter table public.extras_orders
  alter column request_number set not null;

create unique index if not exists extras_orders_request_number_uidx
  on public.extras_orders (request_number);
create index if not exists extras_orders_property_fulfillment_created_idx
  on public.extras_orders (property_id, fulfillment_status, created_at desc);
create index if not exists extras_orders_expires_at_idx
  on public.extras_orders (expires_at)
  where expires_at is not null;

create table if not exists public.extras_order_events (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.extras_orders (id) on delete cascade,
  property_id uuid not null references public.properties (id) on delete cascade,
  from_status public.extras_fulfillment_status,
  to_status public.extras_fulfillment_status not null,
  actor_type public.extras_order_event_actor not null,
  actor_id uuid references public.profiles (id) on delete set null,
  note text check (note is null or length(note) <= 1000),
  created_at timestamptz not null default now()
);

create index if not exists extras_order_events_order_created_idx
  on public.extras_order_events (order_id, created_at);

alter table public.extras_order_events enable row level security;

-- Guest reads and writes use the established httpOnly guest-session mechanism
-- in server routes. Those routes use the service client and explicitly scope
-- every order by the session's property_id and stay_id; there is deliberately
-- no anonymous Data API access path to invent or expose here.
create policy extras_order_events_select_members
  on public.extras_order_events
  for select
  to authenticated
  using (public.can_access_property(property_id));

-- Lifecycle API routes append as service_role after their guest-session or
-- property-access guard. No UPDATE or DELETE policy exists: the timeline is
-- append-only. This explicit policy documents the only write actor, although
-- service_role also bypasses RLS in Supabase.
create policy extras_order_events_insert_service
  on public.extras_order_events
  for insert
  to service_role
  with check (true);

comment on column public.extras_orders.payment_mode is
  'Request-only only. Moche does not collect guest payment; hosts arrange any payment off-platform.';
comment on column public.extras_orders.request_number is
  'Human-quotable request reference generated by application code.';
comment on table public.extras_order_events is
  'Append-only extras request timeline. Guest access is mediated by the established guest session server routes.';

commit;
