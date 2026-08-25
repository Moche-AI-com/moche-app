-- Guest → host chat translation (guest portal language pass).
--
-- When a guest picks a language in the portal, every host-chat message they
-- send is translated into the host's language (property_settings.host_language,
-- default English) by the guest host-chat route. The guest's ORIGINAL text
-- stays in messages.content untouched — a mistranslated door code or address
-- must never be the only copy. The host-language rendering rides alongside in
-- these two columns and is shown under the original in the dashboard inbox.
begin;

alter table public.messages
  add column if not exists host_translation text,
  add column if not exists host_translation_lang text;

comment on column public.messages.host_translation is
  'Host-language rendering of a guest-authored message (null when no translation was needed or produced). Original always remains in content.';
comment on column public.messages.host_translation_lang is
  'BCP-47 code the host_translation was rendered into (e.g. en).';

commit;
