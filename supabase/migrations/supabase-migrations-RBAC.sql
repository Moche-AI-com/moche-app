-- PR #6: WS-3 RBAC foundation + founder claim
-- Applied via Supabase MCP apply_migration (3 calls); this file is the
-- repo-tracked archival copy per the supabase-migrations-<NAME>.sql convention.

-- 1) Security fix, part A: column-level revoke.
--    profiles.is_admin ("founder" / internal-staff claim) is read by the
--    is_admin() SECURITY DEFINER function and used as an RLS bypass across
--    profiles/host_accounts/properties/property_members policies. The
--    profiles_self_update policy (id = auth.uid()) has no column-level
--    restriction, so authenticated/anon previously held table-wide UPDATE
--    grant covering every column including is_admin -- any signed-in user
--    could self-elevate via a normal PostgREST PATCH.
revoke update (is_admin) on public.profiles from authenticated, anon;

-- 1b) Security fix, part B: trigger-based enforcement (required).
--     Postgres column-level REVOKE has no effect when a table-wide UPDATE
--     grant already exists (Supabase's default `GRANT ALL ON ALL TABLES IN
--     SCHEMA public TO authenticated`), because the table-wide grant still
--     permits writes to every column. Verified via SQL introspection that
--     authenticated/anon retained UPDATE at the table level after (1), so a
--     BEFORE UPDATE trigger is the actual enforcement layer: it silently
--     reverts is_admin to its previous value unless the request role is
--     service_role. Runtime-verified: authenticated self-update -> blocked
--     (is_admin stays false); service_role update -> allowed (is_admin true).
create or replace function public.prevent_is_admin_self_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.is_admin is distinct from old.is_admin then
    if coalesce(auth.role(), '') is distinct from 'service_role' then
      new.is_admin := old.is_admin;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_prevent_is_admin_self_update on public.profiles;
create trigger trg_prevent_is_admin_self_update
before update on public.profiles
for each row execute function public.prevent_is_admin_self_update();

-- Trigger-only function: no legitimate direct RPC caller, so close the
-- PostgREST /rest/v1/rpc/prevent_is_admin_self_update exposure the advisor
-- flagged. Trigger invocation does not require EXECUTE on the triggering
-- role (verified: self-elevation still blocked after this revoke).
revoke execute on function public.prevent_is_admin_self_update() from public, anon, authenticated;

-- 2) Extend property_members.role with the remaining WS-3 preset roles.
--    owner and co_host already existed; add property_manager (full property
--    scope, no billing), maintenance, cleaner, and viewer (read-only).
alter type member_role add value if not exists 'property_manager';
alter type member_role add value if not exists 'maintenance';
alter type member_role add value if not exists 'cleaner';
alter type member_role add value if not exists 'viewer';
