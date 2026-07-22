-- ===========================================================================
-- Feature 4 — 2FA + Escalation magic link + Host SMS consent + Guest pinging
--
-- ADDITIVE ONLY. No column is dropped or altered destructively. Safe to run more
-- than once (guarded with IF NOT EXISTS / pg_policies checks). The subagent has no
-- Supabase access — the main agent applies this against the project.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. profiles — resolve notify.ts TODO(consent) + per-host 2FA toggle.
--    `phone` already exists (notify.ts reads it). We only ADD consent + 2FA state.
--      * phone_verified_at  — set once the host proves control of the number via OTP.
--      * sms_opt_in         — TCPA opt-in for operational SMS (default false).
--      * sms_opt_in_at      — timestamp of the affirmative consent (audit trail).
--      * two_factor_enabled — host chooses to require an SMS OTP as a 2nd login factor.
-- ---------------------------------------------------------------------------
alter table public.profiles add column if not exists phone_verified_at timestamptz;
alter table public.profiles add column if not exists sms_opt_in boolean not null default false;
alter table public.profiles add column if not exists sms_opt_in_at timestamptz;
alter table public.profiles add column if not exists two_factor_enabled boolean not null default false;

-- ---------------------------------------------------------------------------
-- 2. host_otp_challenges — short-lived, hashed host OTP rows for phone
--    verification and optional login 2FA. Mirrors the guest_verifications
--    pattern (hashed code, expiry, bounded attempts, single-use via consumed_at).
--    The raw code is NEVER stored — only hashOtp(code, userId). Service-role only:
--    RLS is enabled with NO policies, so PostgREST/anon/auth clients cannot read it;
--    all access flows through the service-role admin client on the server.
-- ---------------------------------------------------------------------------
create table if not exists public.host_otp_challenges (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  purpose text not null default 'login',          -- 'login' | 'phone_verify'
  code_hash text not null,
  phone_last4 text,                               -- display hint only; never the full number
  attempts int not null default 0,
  max_attempts int not null default 5,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists host_otp_challenges_user_purpose_idx
  on public.host_otp_challenges (user_id, purpose, created_at desc);

alter table public.host_otp_challenges enable row level security;
-- No policies on purpose: service-role only (bypasses RLS). Denies all direct client access.

-- ---------------------------------------------------------------------------
-- 3. guest_access_sessions — capture the guest's optional "Notify Me" contact +
--    TCPA consent so the host answering an escalation can (best-effort) ping the
--    guest. Consent defaults to false; nothing is required to use the portal.
--      * guest_contact          — raw email/phone the guest chose to be reached at
--                                 (needed to actually deliver the ping; distinct from
--                                 the salted booking contact_hash used for identity).
--      * guest_contact_type     — 'email' | 'phone'
--      * notification_consent   — affirmative TCPA opt-in (default false).
--      * notification_consent_at— timestamp of the consent (audit trail).
-- ---------------------------------------------------------------------------
alter table public.guest_access_sessions add column if not exists guest_contact text;
alter table public.guest_access_sessions add column if not exists guest_contact_type text;
alter table public.guest_access_sessions add column if not exists notification_consent boolean not null default false;
alter table public.guest_access_sessions add column if not exists notification_consent_at timestamptz;
