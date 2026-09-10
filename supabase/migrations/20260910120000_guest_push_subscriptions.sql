-- Guest web-push (issue #133, item 5): the portal-default guest notification
-- channel. Guests get browser push on host replies without handing over a phone
-- number; SMS remains an explicit opt-in. Subscriptions bind to a guest SESSION
-- (stay + property), never to a person, and die with it.

create table if not exists public.guest_push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  stay_id uuid not null references public.stays(id) on delete cascade,
  guest_session_id uuid not null references public.guest_access_sessions(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now(),
  last_used_at timestamptz
);

comment on table public.guest_push_subscriptions is
  'Browser push subscriptions for guest portal notifications. Server-role only; the subscribe route writes via the admin client after session + slug checks.';

alter table public.guest_push_subscriptions enable row level security;

-- No policies: every read/write goes through the service role (subscribe route,
-- send path). RLS enabled with zero policies = deny-all for anon/authenticated.
create index if not exists guest_push_subscriptions_session_idx
  on public.guest_push_subscriptions (guest_session_id);