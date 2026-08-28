-- Pin search_path on set_updated_at
create or replace function set_updated_at()
returns trigger language plpgsql set search_path = public as $$
begin new.updated_at = now(); return new; end;$$;

-- Revoke direct API execution of internal helper functions.
-- They are still usable inside RLS policy expressions (evaluated as definer),
-- but should not be callable over the REST RPC endpoint.
revoke execute on function can_access_property(uuid) from anon, authenticated;
revoke execute on function can_edit_property(uuid) from anon, authenticated;
revoke execute on function is_account_member(uuid) from anon, authenticated;
revoke execute on function is_account_owner(uuid) from anon, authenticated;
revoke execute on function is_admin() from anon, authenticated;
revoke execute on function property_account(uuid) from anon, authenticated;
revoke execute on function handle_new_user() from anon, authenticated;

-- Move extensions out of public into a dedicated schema
create schema if not exists extensions;
alter extension vector set schema extensions;
alter extension pg_trgm set schema extensions;
