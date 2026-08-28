-- BRAIN ITEMS
create policy brain_select on brain_items for select using (can_access_property(property_id) or is_admin());
create policy brain_write on brain_items for all using (can_edit_property(property_id)) with check (can_edit_property(property_id));

-- DOCUMENTS
create policy docs_select on documents for select using (can_access_property(property_id) or is_admin());
create policy docs_write on documents for all using (can_edit_property(property_id)) with check (can_edit_property(property_id));

-- DOCUMENT CHUNKS: read-only to hosts (writes via service role)
create policy chunks_select on document_chunks for select using (can_access_property(property_id) or is_admin());

-- INGESTION JOBS
create policy jobs_select on ingestion_jobs for select using (can_access_property(property_id) or is_admin());
create policy jobs_write on ingestion_jobs for all using (can_edit_property(property_id)) with check (can_edit_property(property_id));

-- RECOMMENDATIONS
create policy recs_select on recommendations for select using (can_access_property(property_id));
create policy recs_write on recommendations for all using (can_edit_property(property_id)) with check (can_edit_property(property_id));

-- STAYS: host/co-host visibility (guest access is service-role only)
create policy stays_select on stays for select using (can_access_property(property_id) or is_admin());
create policy stays_write on stays for all using (can_access_property(property_id)) with check (can_access_property(property_id));

-- GUEST IDENTITIES: host visibility only
create policy guestid_select on guest_identities for select using (can_access_property(property_id) or is_admin());

-- CONVERSATIONS / MESSAGES: host read (guest writes via service role)
create policy conv_select on conversations for select using (can_access_property(property_id) or is_admin());
create policy msg_select on messages for select using (can_access_property(property_id) or is_admin());
create policy msg_host_insert on messages for insert with check (can_access_property(property_id) and role = 'host');
create policy feedback_select on message_feedback for select using (can_access_property(property_id) or is_admin());

-- ESCALATIONS
create policy esc_select on escalations for select using (can_access_property(property_id) or is_admin());
create policy esc_update on escalations for update using (can_access_property(property_id)) with check (can_access_property(property_id));

-- SERVICE REQUESTS
create policy svc_select on service_requests for select using (can_access_property(property_id) or is_admin());
create policy svc_update on service_requests for update using (can_access_property(property_id)) with check (can_access_property(property_id));

-- NOTIFICATIONS
create policy notif_select on notifications for select using (recipient_profile_id = auth.uid() or is_account_member(host_account_id));
create policy notif_update on notifications for update using (recipient_profile_id = auth.uid()) with check (recipient_profile_id = auth.uid());

-- SUBSCRIPTIONS: owner-only
create policy subs_select on subscriptions for select using (is_account_owner(host_account_id) or is_admin());

-- AUDIT LOGS: account members read; admin all
create policy audit_select on audit_logs for select using (is_account_member(host_account_id) or is_admin());

-- CONSENT RECORDS: self
create policy consent_select on consent_records for select using (profile_id = auth.uid() or is_admin());

-- GUEST-ONLY tables (access_sessions, verifications, stripe_events): NO authenticated policies.
-- These are exclusively service-role managed; RLS with no policy = deny-all for authenticated/anon.
