alter table public.guest_access_links
  add column if not exists code_hash text,
  add column if not exists code_expires_at timestamptz,
  add column if not exists code_revoked_at timestamptz,
  add column if not exists code_first_used_at timestamptz,
  add column if not exists code_attempt_count integer not null default 0;

alter table public.guest_access_links
  add constraint guest_access_links_code_kind_check
  check (kind = 'stay' or code_hash is null);

comment on column public.guest_access_links.code_hash is
  'HMAC hash of the 4-digit visit code, bound to this link id. Never store plaintext.';
comment on column public.guest_access_links.code_expires_at is
  'Code stops being accepted after this time (checkout + grace window). Session, once established, has its own expiry.';
comment on column public.guest_access_links.code_revoked_at is
  'Set on host manual revoke, reservation cancellation, or attempt-cap lockout. Fails closed everywhere once set.';
comment on column public.guest_access_links.code_first_used_at is
  'Set on the first successful code entry. Informational only — code stays valid for repeat entry until expiry/revoke.';
comment on column public.guest_access_links.code_attempt_count is
  'Failed-attempt counter. Auto-locks (sets code_revoked_at) at VISIT_CODE_MAX_ATTEMPTS.';
