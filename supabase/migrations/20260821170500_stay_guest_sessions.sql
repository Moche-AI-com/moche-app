begin;

alter table public.guest_access_sessions
  add column if not exists stay_guest_id uuid;

alter table public.guest_access_sessions
  add constraint guest_access_sessions_stay_guest_id_fkey
  foreign key (stay_guest_id) references public.stay_guests(id) on delete set null;

alter table public.stay_guests
  add column if not exists pin_stay_hash text;

update public.stay_guests
set pin_stay_hash = pin_hash
where pin_stay_hash is null;

alter table public.stay_guests
  alter column pin_stay_hash set not null;

create unique index if not exists stay_guests_stay_pin_stay_hash_key
  on public.stay_guests (stay_id, pin_stay_hash);
create index if not exists guest_access_sessions_stay_guest_idx
  on public.guest_access_sessions (stay_guest_id);

commit;
