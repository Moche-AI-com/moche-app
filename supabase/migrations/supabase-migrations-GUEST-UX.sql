-- Guest UX pass — portal layout, languages, and richer Extras.
--
-- Additive and idempotent. No column is dropped or renamed: existing guest
-- extras keep working byte-for-byte and simply default to the previous
-- behaviour (a plain quantity item with no variants).

-- 1) Host's own reading language ------------------------------------------
-- property_settings.language already exists and controls the language the
-- CONCIERGE replies to the GUEST in. This is the other direction: the language
-- a guest's escalation is translated INTO before the host reads it.
alter table public.property_settings
  add column if not exists host_language text not null default 'en';

comment on column public.property_settings.host_language is
  'BCP-47 code from lib/guest/languages.ts. Guest escalations are translated into this language for host-facing surfaces. The guest''s original text is always preserved alongside it.';

-- 2) Guest's chosen portal language ---------------------------------------
-- Persisted per stay so a guest who reopens the portal on another device (or
-- after the tab is closed) keeps their language, and so server-side surfaces
-- know what language the guest is actually reading without trusting the client.
alter table public.stays
  add column if not exists guest_language text;

comment on column public.stays.guest_language is
  'BCP-47 code chosen by the guest in the portal Globe picker. Null means auto (reply in whatever language the guest writes in).';

-- 3) Richer Extras ---------------------------------------------------------
-- Two shapes of extra, because they are genuinely different purchases:
--   'quantity' — a countable thing (extra towels, beach chairs, a bike). The
--                guest picks how many, and optionally which variant.
--   'package'  — a single bookable bundle (golf package, wedding package).
--                Quantity is meaningless; the guest requests it once.
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

-- Variant support: the host names the axis of choice ("Colour", "Size") and
-- lists the options ("Blue bike", "Pink bike"). Guests must be able to tell
-- exactly what they are getting, so an offer with options requires a pick.
alter table public.guest_extras
  add column if not exists option_label text;

alter table public.guest_extras
  add column if not exists options text[] not null default '{}'::text[];

-- What one unit IS, in the guest's words: "towels", "chairs", "nights".
-- Renders next to the stepper so "3" is never ambiguous.
alter table public.guest_extras
  add column if not exists unit_label text;

-- Longer, guest-facing detail: what is included, what is not, lead time.
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

-- 4) Snapshot the chosen variant on the order ------------------------------
-- item_title / item_price_text are already snapshots so a later catalog edit
-- cannot rewrite what a guest was quoted. The variant needs the same treatment.
alter table public.extras_orders
  add column if not exists item_variant text;

comment on column public.extras_orders.item_variant is
  'Snapshot of the variant the guest chose at request time, e.g. "Blue bike". Null when the offer had no options.';

-- 5) Chat history sectioning ----------------------------------------------
-- The portal groups a guest''s history into titled sections. Titles are derived
-- once and cached on the conversation so every device shows the same headings
-- rather than each client inventing its own.
alter table public.conversations
  add column if not exists title text;

comment on column public.conversations.title is
  'Short generated heading for the guest-facing chat history list. Derived from the first guest turn; never shown to the model as instructions.';
