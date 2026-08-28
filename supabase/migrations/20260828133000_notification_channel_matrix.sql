-- Per-channel notification matrix (follow-up to 20260828120000_notification_preferences.sql)
-- -----------------------------------------------------------------------------------------
-- Adds channel columns to notification_preferences so each member controls not
-- just WHETHER a category reaches them (`enabled` = the in-app master switch:
-- bell, badge, and history) but WHERE else it goes:
--   email_enabled  default true   -- preserves pre-matrix behavior for email kinds
--   sms_enabled    default false  -- texts stay double opt-in: the member's global
--                                 -- TCPA sms_opt_in AND a per-category switch
-- No RLS changes: the existing notif_prefs_* policies govern the row; these are
-- just more columns on it.

alter table public.notification_preferences
  add column if not exists email_enabled boolean not null default true,
  add column if not exists sms_enabled boolean not null default false;
