do $$ declare t text; begin
  foreach t in array array[
    'profiles','host_accounts','organization_members','properties','property_members',
    'property_settings','property_contacts','brain_items','documents','document_chunks',
    'ingestion_jobs','recommendations','guest_identities','stays','guest_access_sessions',
    'guest_verifications','conversations','messages','message_feedback','escalations',
    'service_requests','notifications','subscriptions','stripe_events','audit_logs','consent_records'
  ] loop
    execute format('alter table %I enable row level security;', t);
    execute format('alter table %I force row level security;', t);
  end loop;
end $$;
