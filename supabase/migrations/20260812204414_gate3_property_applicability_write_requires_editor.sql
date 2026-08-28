-- The write policies were gated on can_access_property, which is true for
-- read-only members. Asserting "this property has a pool" changes the
-- completeness denominator and therefore whether the property can be published,
-- so it is an edit, not a read.
drop policy if exists property_applicability_host_write on public.property_applicability;
create policy property_applicability_host_write
  on public.property_applicability for insert
  to authenticated
  with check (public.can_edit_property(property_id));

drop policy if exists property_applicability_host_update on public.property_applicability;
create policy property_applicability_host_update
  on public.property_applicability for update
  to authenticated
  using (public.can_edit_property(property_id))
  with check (public.can_edit_property(property_id));

drop policy if exists property_applicability_host_delete on public.property_applicability;
create policy property_applicability_host_delete
  on public.property_applicability for delete
  to authenticated
  using (public.can_edit_property(property_id));
