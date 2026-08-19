-- ============================================================================
-- Add-ons — Review Nudge (functional) + Upsell Offers + Product Feedback.
-- Additive, non-destructive, idempotent. Safe to run repeatedly
-- (IF NOT EXISTS / guarded policy creation throughout).
--
-- Applied by the main agent (this coding agent has NO Supabase access).
--
-- Adds:
--   1. property_settings.review_url — where happy guests are sent to leave a
--      review (Google/Airbnb/VRBO). Complements the EXISTING review_nudge_enabled
--      + review_nudge_auto flags (no new enable/auto columns — those already exist).
--   2. upsell_offers — host-configurable paid enhancements surfaced to guests.
--      RLS: SELECT via can_access_property (guests see active ones); write via
--      can_edit_property. Guest CTA taps route through the EXISTING escalation +
--      notify() path (no new notification channel, no columns needed here).
--   3. product_feedback — PRIVATE owner analytics (source guest|host, rating 1-5,
--      comment, context). RLS enabled; NO general SELECT (service-role reads only,
--      so it stays private for the owner). Hosts INSERT their own source='host'
--      rows; guest rows are written server-side via the admin/service-role client.
--
-- Does NOT alter/drop existing tables, enums, columns, or policies.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Review Nudge — destination URL for the "leave a review" invitation.
--    NULL until the host sets it; the guest nudge only renders when the module
--    is enabled AND this is set.
-- ---------------------------------------------------------------------------
alter table public.property_settings
  add column if not exists review_url text;

-- ---------------------------------------------------------------------------
-- 2. Upsell offers. One row per host-configured enhancement (late checkout,
--    mid-stay clean, airport ride, local experiences, …). Guests see ACTIVE
--    offers in the portal; tapping the CTA opens a host-notified request via
--    the existing escalation path.
-- ---------------------------------------------------------------------------
create table if not exists public.upsell_offers (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  title text not null,
  description text,
  price_text text,
  cta_label text default 'Request',
  active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

-- Fast property-scoped listing, ordered.
create index if not exists upsell_offers_property_idx
  on public.upsell_offers (property_id);
create index if not exists upsell_offers_property_sort_idx
  on public.upsell_offers (property_id, sort_order);

alter table public.upsell_offers enable row level security;

do $$
begin
  -- SELECT: any host who can access the property (owner/co-host). Guests are
  -- unauthenticated to Postgres and read active offers via the service role.
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'upsell_offers'
      and policyname = 'upsell_offers_select_members'
  ) then
    create policy upsell_offers_select_members
      on public.upsell_offers
      for select
      to authenticated
      using (public.can_access_property(property_id));
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'upsell_offers'
      and policyname = 'upsell_offers_insert_editors'
  ) then
    create policy upsell_offers_insert_editors
      on public.upsell_offers
      for insert
      to authenticated
      with check (public.can_edit_property(property_id));
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'upsell_offers'
      and policyname = 'upsell_offers_update_editors'
  ) then
    create policy upsell_offers_update_editors
      on public.upsell_offers
      for update
      to authenticated
      using (public.can_edit_property(property_id))
      with check (public.can_edit_property(property_id));
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'upsell_offers'
      and policyname = 'upsell_offers_delete_editors'
  ) then
    create policy upsell_offers_delete_editors
      on public.upsell_offers
      for delete
      to authenticated
      using (public.can_edit_property(property_id));
  end if;
end$$;

-- ---------------------------------------------------------------------------
-- 3. Product feedback — PRIVATE owner analytics for John. Captures who
--    (source), how happy (rating), what they said (comment), and where
--    (property/page) so it can be queried by the service role only.
-- ---------------------------------------------------------------------------
create table if not exists public.product_feedback (
  id uuid primary key default gen_random_uuid(),
  source text not null check (source in ('guest', 'host')),
  rating int check (rating between 1 and 5),
  comment text,
  property_id uuid references public.properties(id) on delete set null,
  host_account_id uuid references public.host_accounts(id) on delete set null,
  guest_session_id uuid references public.guest_access_sessions(id) on delete set null,
  page text,
  created_at timestamptz not null default now()
);

create index if not exists product_feedback_source_idx
  on public.product_feedback (source, created_at desc);
create index if not exists product_feedback_property_idx
  on public.product_feedback (property_id);

alter table public.product_feedback enable row level security;

-- Intentionally NO SELECT policy: authenticated/anon read zero rows. Only the
-- service role (which bypasses RLS) reads this table — owner analytics stay private.
do $$
begin
  -- Hosts may INSERT their OWN source='host' rows (a row tied to a host_account
  -- they own). Guest rows are inserted server-side via the service role and are
  -- not covered by this policy.
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'product_feedback'
      and policyname = 'product_feedback_insert_host'
  ) then
    create policy product_feedback_insert_host
      on public.product_feedback
      for insert
      to authenticated
      with check (
        source = 'host'
        and host_account_id in (
          select ha.id from public.host_accounts ha where ha.owner_id = auth.uid()
        )
      );
  end if;
end$$;
