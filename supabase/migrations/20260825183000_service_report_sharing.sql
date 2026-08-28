begin;

-- Service report sharing (2026-08-25)
--
-- 1) service_requests gains a host-editable share copy (edited_summary /
--    edited_details). The guest's original intake (summary / description) is
--    never overwritten: it is the record of what the guest reported and the
--    source purge.ts retains. Edits are stamped (edited_at / edited_by) and
--    audit-logged by the report API route.
--
-- 2) service_report_shares: delivery log for host-initiated report sends
--    (email via Resend / SMS via Twilio). Recipients are stored as salted
--    hash + last4 only, matching stay_share_invites' PII posture. The exact
--    body that left the platform is snapshotted — it is non-sensitive by
--    construction (allowlist renderer in lib/service-requests/share-report.ts).
--    RLS enabled with NO anon/authenticated policies on purpose: hosts read
--    send history through the share API route (requirePropertyAccess +
--    service role), never directly from the browser — same posture as
--    stay_share_invites and guest_access_links.

alter table public.service_requests
  add column if not exists edited_summary text,
  add column if not exists edited_details text,
  add column if not exists edited_at timestamptz,
  add column if not exists edited_by uuid references public.profiles(id) on delete set null;

comment on column public.service_requests.edited_summary is
  'Host-edited headline for outbound (emailed/texted/printed) reports. summary stays guest-original.';
comment on column public.service_requests.edited_details is
  'Host-edited body for outbound reports. description stays guest-original.';

create table if not exists public.service_report_shares (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  service_request_id uuid not null references public.service_requests(id) on delete cascade,
  channel text not null check (channel in ('sms', 'email')),
  destination_hash text not null,
  destination_last4 text,
  body_snapshot text not null,
  status text not null default 'queued' check (status in ('queued', 'sent', 'failed')),
  error text,
  sent_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists service_report_shares_request_created_idx
  on public.service_report_shares (service_request_id, created_at desc);

alter table public.service_report_shares enable row level security;

commit;
