-- ============================================================================
-- Configurations management: tone presets + structured restricted topics
-- Backlog: P4-06 (tone presets), P4-07 (tone backfill), P4-08 (restricted topics)
-- ============================================================================
--
-- Additive only. No column is dropped, no value is destroyed, and no property's
-- concierge behaviour changes as a result of running this.
--
-- `concierge_tone` becomes an ID column holding one of five preset IDs. Any
-- existing freeform prose is MOVED to `legacy_tone_note` rather than reinterpreted,
-- and stays in force in the guest prompt until its host explicitly decides what to
-- do with it (see lib/concierge/tone.ts -> resolveTonePrompt). That is P4-07's
-- "do not silently reinterpret" requirement, enforced at read time so it cannot be
-- defeated by this migration running twice.
--
-- Idempotent: safe to re-run.

-- ---------------------------------------------------------------------------
-- 1. New columns
-- ---------------------------------------------------------------------------
alter table public.property_settings
  -- Pre-preset freeform tone, preserved verbatim. NULL once resolved or never set.
  add column if not exists legacy_tone_note text,
  -- Set when the host chooses to keep or discard the legacy note. NULL = pending.
  add column if not exists legacy_tone_ack_at timestamptz,
  -- Checkbox selections for restricted topics. The default is what a brand-new
  -- property gets with zero host action, and backfills existing rows to match so
  -- no property is less protected because of when it was created.
  add column if not exists restricted_topic_keys jsonb not null
    default '["pricing","refunds","legal_advice","neighbor_disputes"]'::jsonb;

comment on column public.property_settings.concierge_tone is
  'Tone preset ID (see TONE_PRESETS in lib/constants.ts). Never prose - the prompt fragment is looked up in code so a host cannot inject instructions through this field.';
comment on column public.property_settings.legacy_tone_note is
  'Freeform tone prose from before tone presets existed. Still applied to the guest prompt while legacy_tone_ack_at is null, so a live concierge does not change voice before its host is asked.';
comment on column public.property_settings.legacy_tone_ack_at is
  'When the host resolved their legacy tone note. Null means the settings page is still asking.';
comment on column public.property_settings.restricted_topic_keys is
  'jsonb array of RESTRICTED_TOPIC_OPTIONS keys. Freeform additions live in restricted_topics.';
comment on column public.property_settings.restricted_topics is
  'Host-typed "other" restricted topics only. The checkbox selections are in restricted_topic_keys.';

-- ---------------------------------------------------------------------------
-- 2. Move, do not reinterpret, existing freeform tone values
-- ---------------------------------------------------------------------------
-- Guarded on legacy_tone_note is null so a re-run cannot overwrite a note the
-- host has already been shown, and cannot clobber a resolved one.
--
-- concierge_tone is NOT NULL, so the moved-from column is set to the default
-- preset rather than emptied. That stored value is a PLACEHOLDER, not a claim
-- about what the host wants: while legacy_tone_ack_at is null the guest prompt
-- ignores it entirely and the settings page pre-selects suggestTonePreset() on
-- the preserved note instead. Keeping classification in TypeScript keeps one
-- source of truth for it rather than a second copy of the heuristic in SQL.
alter table public.property_settings
  alter column concierge_tone set default 'friendly';

update public.property_settings
set legacy_tone_note = concierge_tone,
    concierge_tone = 'friendly'
where concierge_tone is not null
  and btrim(concierge_tone) <> ''
  and concierge_tone not in ('friendly', 'professional', 'luxury_concierge', 'casual', 'family_friendly')
  and legacy_tone_note is null;

-- A row whose tone was already a valid preset ID has nothing to decide.
update public.property_settings
set legacy_tone_ack_at = now()
where legacy_tone_note is null
  and legacy_tone_ack_at is null;

-- ---------------------------------------------------------------------------
-- 3. Constrain the tone column to real preset IDs
-- ---------------------------------------------------------------------------
-- Applied after the move above so it cannot fail on live data. The column is
-- NOT NULL today; the null branch is kept in the check so the constraint stays
-- correct if that is ever relaxed.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'property_settings_concierge_tone_preset_chk'
  ) then
    alter table public.property_settings
      add constraint property_settings_concierge_tone_preset_chk
      check (
        concierge_tone is null
        or concierge_tone in ('friendly', 'professional', 'luxury_concierge', 'casual', 'family_friendly')
      );
  end if;
end $$;

-- restricted_topic_keys must be an array, not an object or scalar, so read-time
-- code can rely on the shape.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'property_settings_restricted_topic_keys_is_array_chk'
  ) then
    alter table public.property_settings
      add constraint property_settings_restricted_topic_keys_is_array_chk
      check (jsonb_typeof(restricted_topic_keys) = 'array');
  end if;
end $$;
