-- Property-scoped read access for authenticated users; writes remain service-role-only.
-- can_access_property(prop uuid) returns boolean (existing SECURITY DEFINER helper).

-- ai_usage
create policy ai_usage_select on public.ai_usage for select to authenticated using (public.can_access_property(property_id));

-- answer_cache
create policy answer_cache_select on public.answer_cache for select to authenticated using (public.can_access_property(property_id));

-- guest_access_links
create policy guest_access_links_select on public.guest_access_links for select to authenticated using (public.can_access_property(property_id));

-- guest_access_sessions
create policy guest_access_sessions_select on public.guest_access_sessions for select to authenticated using (public.can_access_property(property_id));

-- guest_verifications
create policy guest_verifications_select on public.guest_verifications for select to authenticated using (public.can_access_property(property_id));

-- property_brain_versions
create policy property_brain_versions_select on public.property_brain_versions for select to authenticated using (public.can_access_property(property_id));

-- stripe_events: server-side webhook log only. No user access. Service role bypasses RLS.
create policy stripe_events_no_access on public.stripe_events for all to authenticated, anon using (false) with check (false);
