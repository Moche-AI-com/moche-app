-- Both manual and catalog additions should remain hidden until the host opts in.
-- This changes only the default for future inserts, not existing inventory.
alter table public.property_appliances
  alter column guest_visible set default false;
