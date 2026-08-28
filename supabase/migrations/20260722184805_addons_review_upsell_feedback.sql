alter table public.property_settings add column if not exists review_url text;

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
create index if not exists upsell_offers_property_idx on public.upsell_offers (property_id);
create index if not exists upsell_offers_property_sort_idx on public.upsell_offers (property_id, sort_order);
alter table public.upsell_offers enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='upsell_offers' and policyname='upsell_offers_select_members') then
    create policy upsell_offers_select_members on public.upsell_offers for select to authenticated using (public.can_access_property(property_id));
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='upsell_offers' and policyname='upsell_offers_insert_editors') then
    create policy upsell_offers_insert_editors on public.upsell_offers for insert to authenticated with check (public.can_edit_property(property_id));
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='upsell_offers' and policyname='upsell_offers_update_editors') then
    create policy upsell_offers_update_editors on public.upsell_offers for update to authenticated using (public.can_edit_property(property_id));
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='upsell_offers' and policyname='upsell_offers_delete_editors') then
    create policy upsell_offers_delete_editors on public.upsell_offers for delete to authenticated using (public.can_edit_property(property_id));
  end if;
end$$;

create table if not exists public.product_feedback (
  id uuid primary key default gen_random_uuid(),
  source text not null check (source in ('guest','host')),
  rating int check (rating between 1 and 5),
  comment text,
  property_id uuid references public.properties(id) on delete set null,
  host_account_id uuid references public.host_accounts(id) on delete set null,
  guest_session_id uuid references public.guest_access_sessions(id) on delete set null,
  page text,
  created_at timestamptz not null default now()
);
create index if not exists product_feedback_source_idx on public.product_feedback (source, created_at desc);
create index if not exists product_feedback_property_idx on public.product_feedback (property_id);
alter table public.product_feedback enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='product_feedback' and policyname='product_feedback_insert_host') then
    create policy product_feedback_insert_host on public.product_feedback for insert to authenticated with check (source='host' and host_account_id in (select ha.id from public.host_accounts ha where ha.owner_id = auth.uid()));
  end if;
end$$;
