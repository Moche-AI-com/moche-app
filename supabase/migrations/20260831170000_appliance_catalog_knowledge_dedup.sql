-- Slice 4b: publishing a host-approved manual section into the shared catalog must be
-- idempotent — the same content arriving twice (two hosts, same model) is an upsert,
-- not a duplicate row. Applied to production 2026-08-31; committed here so the repo
-- captures the schema.

create unique index if not exists appliance_catalog_knowledge_dedup_uidx
  on public.appliance_catalog_knowledge (catalog_id, content_hash);
