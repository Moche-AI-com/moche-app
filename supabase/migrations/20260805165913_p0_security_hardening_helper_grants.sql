-- Corrective follow-up to p0_security_hardening.
-- The first pass ran `revoke execute ... from anon`, which had no effect:
-- anon's EXECUTE privilege on these helpers is inherited from the implicit
-- PUBLIC grant that Postgres applies on CREATE FUNCTION, not from a direct
-- grant to anon. Revoking from a role does not remove a PUBLIC grant.
-- Correct form: revoke from PUBLIC, then grant back explicitly to the roles
-- that genuinely need it (authenticated, because RLS policies reference these
-- functions and a policy calling a non-executable function raises permission
-- denied instead of returning zero rows; and service_role).
revoke execute on function public.property_account(uuid) from public, anon;
grant execute on function public.property_account(uuid) to authenticated, service_role;

revoke execute on function public.can_access_property(uuid) from public, anon;
grant execute on function public.can_access_property(uuid) to authenticated, service_role;

revoke execute on function public.can_edit_property(uuid) from public, anon;
grant execute on function public.can_edit_property(uuid) to authenticated, service_role;

revoke execute on function public.is_account_member(uuid) from public, anon;
grant execute on function public.is_account_member(uuid) to authenticated, service_role;

revoke execute on function public.is_account_owner(uuid) from public, anon;
grant execute on function public.is_account_owner(uuid) to authenticated, service_role;

revoke execute on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated, service_role;
