-- Extras requests workflow: requests arrive as Host Chat messages, not
-- escalations, and the order row remembers the thread it landed in.
--
-- notification_kind gains 'extras' so request alerts are distinguishable from
-- question escalations in the bell and fan out to email like them.

alter type public.notification_kind add value if not exists 'extras';

alter table public.extras_orders
  add column if not exists host_conversation_id uuid,
  add column if not exists guest_session_id uuid,
  add column if not exists guest_identity_id uuid;

alter table public.extras_orders
  add constraint extras_orders_host_conversation_id_fkey
    foreign key (host_conversation_id) references public.conversations(id) on delete set null,
  add constraint extras_orders_guest_session_id_fkey
    foreign key (guest_session_id) references public.guest_access_sessions(id) on delete set null,
  add constraint extras_orders_guest_identity_id_fkey
    foreign key (guest_identity_id) references public.guest_identities(id) on delete set null;

comment on column public.extras_orders.host_conversation_id is 'The Host Chat thread this request was posted into. Set at request time; the queue opens it directly.';
comment on column public.extras_orders.guest_session_id is 'Guest session that placed the request; used to resolve the Host Chat thread.';
comment on column public.extras_orders.guest_identity_id is 'Registered guest identity behind the request, when known.';
