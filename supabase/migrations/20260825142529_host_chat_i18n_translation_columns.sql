alter table public.messages
  add column if not exists host_translation text,
  add column if not exists host_translation_lang text;

comment on column public.messages.host_translation is
  'Host-language rendering of a guest-authored message (null when no translation was needed or produced). Original always remains in content.';
comment on column public.messages.host_translation_lang is
  'BCP-47 code the host_translation was rendered into (e.g. en).';
