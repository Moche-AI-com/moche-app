-- iCal stay import (issue #133, item 4): one pasted Airbnb/Vrbo calendar export
-- URL per property keeps stays in sync automatically — new reservations create
-- stays and mint access codes, date changes update, cancellations revoke. No
-- platform API approval needed; the manual stay flow remains as fallback.

alter table public.properties
  add column if not exists ical_import_url text;

alter table public.properties
  add column if not exists ical_last_synced_at timestamptz;

alter table public.stays
  add column if not exists ical_uid text;

comment on column public.properties.ical_import_url is
  'Secret iCal export URL from the booking platform (contains an unguessable token). Never render it client-side after save.';
comment on column public.properties.ical_last_synced_at is
  'Last successful calendar sync, set by the iCal sync engine.';
comment on column public.stays.ical_uid is
  'VEVENT UID of the calendar event this stay was imported from; null for manual stays.';

-- One stay per calendar event per property. Manual stays (null uid) are
-- unaffected; the partial index keeps the constraint cheap.
create unique index if not exists stays_property_ical_uid_uniq
  on public.stays (property_id, ical_uid)
  where ical_uid is not null;

-- New columns inherit the existing table RLS policies — hosts read/write their
-- own properties' calendar URL through the same property-ownership policy that
-- already guards settings updates; no new policies required.