-- Postgres grants EXECUTE to PUBLIC on every new function, so a SECURITY DEFINER function
-- in an exposed schema becomes an anon-callable REST endpoint by default. The function's own
-- authorization gate already refuses anon (can_edit_property returns false and the role GUC
-- is not service_role), so this is defense in depth rather than a fix -- but an unauthenticated
-- caller has no business reaching a vault write path at all.
revoke execute on function public.brain_values_set_secret(uuid, text, text, uuid) from anon;
revoke execute on function public.brain_values_set_secret(uuid, text, text, uuid) from public;
