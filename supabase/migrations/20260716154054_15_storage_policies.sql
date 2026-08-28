-- property-documents (private): path convention = <property_id>/<filename>.
-- Hosts/co-hosts with edit rights can manage; reads gated by property access. Service role bypasses.
create policy "docs_read" on storage.objects for select to authenticated using (
  bucket_id = 'property-documents' and can_access_property((split_part(name,'/',1))::uuid)
);
create policy "docs_insert" on storage.objects for insert to authenticated with check (
  bucket_id = 'property-documents' and can_edit_property((split_part(name,'/',1))::uuid)
);
create policy "docs_update" on storage.objects for update to authenticated using (
  bucket_id = 'property-documents' and can_edit_property((split_part(name,'/',1))::uuid)
);
create policy "docs_delete" on storage.objects for delete to authenticated using (
  bucket_id = 'property-documents' and can_edit_property((split_part(name,'/',1))::uuid)
);

-- property-branding (public read): anyone can read; only editors write to their property path.
create policy "branding_read" on storage.objects for select using (bucket_id = 'property-branding');
create policy "branding_insert" on storage.objects for insert to authenticated with check (
  bucket_id = 'property-branding' and can_edit_property((split_part(name,'/',1))::uuid)
);
create policy "branding_update" on storage.objects for update to authenticated using (
  bucket_id = 'property-branding' and can_edit_property((split_part(name,'/',1))::uuid)
);
create policy "branding_delete" on storage.objects for delete to authenticated using (
  bucket_id = 'property-branding' and can_edit_property((split_part(name,'/',1))::uuid)
);
