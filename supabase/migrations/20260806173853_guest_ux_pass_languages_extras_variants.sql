-- Guest UX pass — portal layout, languages, and richer Extras.
-- Additive and idempotent. No column is dropped or renamed.

alter table public.property_settings
  add column if not exists host_language text not null default 'en';

comment on column public.property_settings.host_language is
  'BCP-47 code from lib/guest/languages.ts. Guest escalations are translated into this language for host-facing surfaces. The guest''s original text is always preserved alongside it.';

alter table public.stays
  add column if not exists guest_language text;

comment on column public.stays.guest_language is
  'BCP-47 code chosen by the guest in the portal Globe picker. Null means auto (reply in whatever language the guest writes in).';

alter table public.guest_extras
  add column if not exists kind text not null default 'quantity';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'guest_extras_kind_check'
  ) then
    alter table public.guest_extras
      add constraint guest_extras_kind_check check (kind in ('quantity', 'package'));
  end if;
end $$;

alter table public.guest_extras
  add column if not exists option_label text;

alter table public.guest_extras
  add column if not exists options text[] not null default '{}'::text[];

alter table public.guest_extras
  add column if not exists unit_label text;

alter table public.guest_extras
  add column if not exists details text;

comment on column public.guest_extras.kind is
  'quantity = countable item with a stepper; package = single bookable bundle, no quantity.';
comment on column public.guest_extras.option_label is
  'Host-named axis of choice shown above the variant picker, e.g. "Colour" or "Size".';
comment on column public.guest_extras.options is
  'Guest-selectable variants, e.g. {"Blue bike","Pink bike"}. Empty means no choice to make.';
comment on column public.guest_extras.unit_label is
  'What one unit is, in guest words: "towels", "beach chairs". Renders beside the quantity stepper.';
comment on column public.guest_extras.details is
  'Longer guest-facing description: what is included, exclusions, lead time.';

alter table public.extras_orders
  add column if not exists item_variant text;

comment on column public.extras_orders.item_variant is
  'Snapshot of the variant the guest chose at request time, e.g. "Blue bike". Null when the offer had no options.';

alter table public.conversations
  add column if not exists title text;

comment on column public.conversations.title is
  'Short generated heading for the guest-facing chat history list. Derived from the first guest turn; never shown to the model as instructions.';
