# Runbook: Login Issue

**Trigger:** Host cannot sign in (bad password, no reset email, session drops, "account
not found").

**Owner:** Support on-call.

## Steps

1. Confirm the email against `profiles` / Supabase auth users. Watch for typos and
   alternate addresses.
2. Check whether the account was soft-deleted: `profiles.deletion_requested_at` set or
   `host_accounts.deleted_at` set. If so, follow the data-deletion runbook — do not
   silently reactivate.
3. Password reset: have the host use the reset flow. If reset emails aren't arriving,
   check **Resend** delivery logs and spam folders.
4. Session issues (logged out immediately): usually cookie/browser related — try a
   different browser/incognito; confirm system clock; clear cookies for the domain.
5. If auth is degraded platform-wide, check **Supabase** status and Sentry for auth errors.

## Escalation path

Support → Engineering (Supabase auth / cookie/session bug) → Supabase support if the
provider is implicated.

## Customer comms template

> Hi {name}, thanks for flagging the sign-in trouble. I've {checked your account / sent
> a fresh password-reset link to {email}}. Please try the link within 30 minutes and
> let me know if you're still stuck — happy to jump on it.
