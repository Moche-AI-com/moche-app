-- Completeness needs to know which registry fields apply to a property
-- (Amendment 001-A.2: a field whose applicability predicate is not true is
-- removed from the denominator, never credited as satisfied). Nothing in the
-- schema could answer "does this property have a pool", so the denominator was
-- unanswerable and completeness had no way to be correct.
--
-- Absent row = predicate not asserted = the field leaves the scored set. That is
-- the honest default: a host who has not said they have a hot tub should not be
-- marked down for having no hot tub instructions.
create table if not exists public.property_applicability (
  property_id uuid not null references public.properties(id) on delete cascade,
  predicate text not null,
  applies boolean not null default true,
  set_by uuid references public.profiles(id),
  set_at timestamptz not null default now(),
  primary key (property_id, predicate)
);

comment on table public.property_applicability is
  'Host assertions about which field_registry applicability predicates hold for a property. Drives the completeness denominator.';

-- The predicate list lives in field_registry.json and is mirrored here so a
-- typo cannot silently create a predicate no field will ever match.
alter table public.property_applicability
  drop constraint if exists property_applicability_known_predicate;
alter table public.property_applicability
  add constraint property_applicability_known_predicate check (
    predicate in (
      'has_wifi','has_pool','has_hot_tub','has_laundry','has_parking',
      'allows_pets','is_multi_story','has_elevator','has_smart_lock',
      'has_security_cameras','charges_deposit'
    )
  );

-- 'always' is implicit in the scoring code and must never be storable, or a row
-- asserting always=false would quietly delete 39 fields from the denominator.
alter table public.property_applicability
  drop constraint if exists property_applicability_not_always;
alter table public.property_applicability
  add constraint property_applicability_not_always check (predicate <> 'always');

create index if not exists property_applicability_property_idx
  on public.property_applicability (property_id);

alter table public.property_applicability enable row level security;

-- Host-private. Guests never read this; the concierge reads brain_values, not
-- the denominator inputs.
drop policy if exists property_applicability_host_read on public.property_applicability;
create policy property_applicability_host_read
  on public.property_applicability for select
  to authenticated
  using (public.can_access_property(property_id));

drop policy if exists property_applicability_host_write on public.property_applicability;
create policy property_applicability_host_write
  on public.property_applicability for insert
  to authenticated
  with check (public.can_access_property(property_id));

drop policy if exists property_applicability_host_update on public.property_applicability;
create policy property_applicability_host_update
  on public.property_applicability for update
  to authenticated
  using (public.can_access_property(property_id))
  with check (public.can_access_property(property_id));

drop policy if exists property_applicability_host_delete on public.property_applicability;
create policy property_applicability_host_delete
  on public.property_applicability for delete
  to authenticated
  using (public.can_access_property(property_id));
