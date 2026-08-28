-- P0.1 Close anon-reachable SECURITY DEFINER surface.
-- match_property_knowledge filtered only on caller-supplied p_property_id with no
-- access check, and was EXECUTE-granted to PUBLIC/anon/authenticated: any holder of
-- the public anon key could read title/data/content for arbitrary property UUIDs.
-- Aligns these with match_property_chunks, which is already service_role-only.
-- All three are invoked exclusively via the server-only `admin` (service_role) client
-- in lib/guest/concierge.ts and lib/brain/cache.ts.
-- NOTE: RLS helper functions (can_access_property, can_edit_property, is_account_member,
-- is_account_owner, property_account, is_admin) are deliberately NOT revoked: ~50 RLS
-- policies reference them, many with roles={public}, and revoking EXECUTE would break
-- row-level security evaluation for authenticated users.

REVOKE EXECUTE ON FUNCTION public.match_property_knowledge(uuid, extensions.vector, text[], integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.bump_brain_version(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;

-- Defence in depth: internal guard so a future accidental re-grant is not immediately
-- exploitable. service_role bypasses RLS and is the only intended caller.
COMMENT ON FUNCTION public.match_property_knowledge(uuid, extensions.vector, text[], integer)
  IS 'service_role only. Performs NO access check on p_property_id - callers must authorize the property first. Never grant to anon or authenticated.';
COMMENT ON FUNCTION public.bump_brain_version(uuid)
  IS 'service_role only. Mutates brain cache version; do not expose to anon or authenticated.';

-- app_settings and host_otp_challenges have RLS enabled with zero policies, which is
-- deny-all for non-bypass roles, but table grants were still present. Remove them so the
-- intent is explicit and the linter is satisfied.
REVOKE ALL ON TABLE public.app_settings FROM anon, authenticated;
REVOKE ALL ON TABLE public.host_otp_challenges FROM anon, authenticated;

COMMENT ON TABLE public.app_settings IS 'service_role only. RLS on with no policies (deny-all) and no anon/authenticated grants by design.';
COMMENT ON TABLE public.host_otp_challenges IS 'service_role only. Contains OTP code hashes. RLS on with no policies (deny-all) and no anon/authenticated grants by design.';
