alter table public.property_settings
  add column if not exists legacy_tone_note text,
  add column if not exists legacy_tone_ack_at timestamptz,
  add column if not exists restricted_topic_keys jsonb not null
    default '["pricing","refunds","legal_advice","neighbor_disputes"]'::jsonb;

comment on column public.property_settings.concierge_tone is 'Tone preset ID (see TONE_PRESETS in lib/constants.ts). Never prose - the prompt fragment is looked up in code so a host cannot inject instructions through this field.';
comment on column public.property_settings.legacy_tone_note is 'Freeform tone prose from before tone presets existed. Still applied to the guest prompt while legacy_tone_ack_at is null, so a live concierge does not change voice before its host is asked.';
comment on column public.property_settings.legacy_tone_ack_at is 'When the host resolved their legacy tone note. Null means the settings page is still asking.';
comment on column public.property_settings.restricted_topic_keys is 'jsonb array of RESTRICTED_TOPIC_OPTIONS keys. Freeform additions live in restricted_topics.';
comment on column public.property_settings.restricted_topics is 'Host-typed "other" restricted topics only. The checkbox selections are in restricted_topic_keys.';

alter table public.property_settings
  alter column concierge_tone set default 'friendly';

update public.property_settings
set legacy_tone_note = concierge_tone,
    concierge_tone = 'friendly'
where concierge_tone is not null
  and btrim(concierge_tone) <> ''
  and concierge_tone not in ('friendly', 'professional', 'luxury_concierge', 'casual', 'family_friendly')
  and legacy_tone_note is null;

update public.property_settings
set legacy_tone_ack_at = now()
where legacy_tone_note is null
  and legacy_tone_ack_at is null;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'property_settings_concierge_tone_preset_chk') then
    alter table public.property_settings
      add constraint property_settings_concierge_tone_preset_chk
      check (concierge_tone is null or concierge_tone in ('friendly', 'professional', 'luxury_concierge', 'casual', 'family_friendly'));
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'property_settings_restricted_topic_keys_is_array_chk') then
    alter table public.property_settings
      add constraint property_settings_restricted_topic_keys_is_array_chk
      check (jsonb_typeof(restricted_topic_keys) = 'array');
  end if;
end $$;
