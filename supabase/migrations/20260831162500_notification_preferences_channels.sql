-- Repair production schema drift surfaced by the catalog type regeneration: the
-- shipped Notification Preferences UI reads and writes these channel columns, but the
-- live table predated the channel migration. Applied to production 2026-08-31 ahead of
-- this file; committed here so the repo captures the schema.
-- Defaults preserve existing behavior: email on, SMS opt-in/off by default.

alter table public.notification_preferences
  add column if not exists email_enabled boolean not null default true,
  add column if not exists sms_enabled boolean not null default false;

update public.notification_preferences
set email_enabled = coalesce(email_enabled, true),
    sms_enabled = coalesce(sms_enabled, false)
where email_enabled is null or sms_enabled is null;
