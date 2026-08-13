-- Applied to production 2026-08-13. Recorded here so the schema history is complete.
--
-- Postgres grants EXECUTE to PUBLIC on every new function, so a SECURITY DEFINER function
-- in an exposed schema becomes an anon-callable REST endpoint by default -- which is how
-- brain_values_set_secret ended up reachable at /rest/v1/rpc/ without signing in.
--
-- The function's own gate already refused anon: it checks the role GUC for service_role and
-- otherwise calls can_edit_property, which returns false for an unauthenticated caller
-- (verified against production before the revoke). This is defense in depth, not a fix for a
-- live hole -- but an unauthenticated caller has no business reaching a vault write path,
-- and the authorization check should not be the only thing standing between anon and Vault.
revoke execute on function public.brain_values_set_secret(uuid, text, text, uuid) from anon;
revoke execute on function public.brain_values_set_secret(uuid, text, text, uuid) from public;
