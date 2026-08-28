-- PROFILES: self or admin
create policy profiles_self_select on profiles for select using (id = auth.uid() or is_admin());
create policy profiles_self_update on profiles for update using (id = auth.uid()) with check (id = auth.uid());

-- HOST ACCOUNTS: members can view; owner can update
create policy accounts_member_select on host_accounts for select using (is_account_member(id) or is_admin());
create policy accounts_owner_update on host_accounts for update using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- ORGANIZATION MEMBERS: visible to account members; owner manages
create policy orgmembers_select on organization_members for select using (is_account_member(host_account_id) or is_admin());
create policy orgmembers_owner_write on organization_members for all using (is_account_owner(host_account_id)) with check (is_account_owner(host_account_id));

-- PROPERTIES: account members or assigned co-hosts
create policy properties_select on properties for select using (is_account_member(host_account_id) or can_access_property(id) or is_admin());
create policy properties_insert on properties for insert with check (is_account_owner(host_account_id));
create policy properties_update on properties for update using (is_account_owner(host_account_id) or can_edit_property(id)) with check (is_account_owner(host_account_id) or can_edit_property(id));
create policy properties_delete on properties for delete using (is_account_owner(host_account_id));

-- PROPERTY MEMBERS
create policy propmembers_select on property_members for select using (can_access_property(property_id) or is_admin());
create policy propmembers_write on property_members for all using (is_account_owner(property_account(property_id))) with check (is_account_owner(property_account(property_id)));

-- PROPERTY SETTINGS
create policy propsettings_select on property_settings for select using (can_access_property(property_id));
create policy propsettings_write on property_settings for all using (can_edit_property(property_id)) with check (can_edit_property(property_id));

-- PROPERTY CONTACTS
create policy propcontacts_select on property_contacts for select using (can_access_property(property_id));
create policy propcontacts_write on property_contacts for all using (can_edit_property(property_id)) with check (can_edit_property(property_id));
