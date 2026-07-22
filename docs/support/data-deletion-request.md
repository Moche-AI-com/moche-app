# Runbook: Data Deletion Request (GDPR Art. 17)

**Trigger:** A host (or a guest via support) requests erasure of personal data, or a host
uses the in-app delete flow.

**Owner:** Support on-call + Engineering (for the confirm step).

## Background

Erasure is a **two-step** flow backed by `lib/legal/data-rights.ts` and
`app/api/legal/delete/route.ts`:

- **request** — non-destructive. Sets `profiles.deletion_requested_at` and returns a
  summary of what will be erased vs. retained.
- **confirm** — destructive. Requires the exact confirmation phrase and the service-role
  admin client. Deletes guest/property personal data, anonymizes the profile, and
  soft-deletes the account.

**Retained by design** (legal/tax obligation): `subscriptions` (billing), `legal_acceptances`
(proof of consent), `audit_logs`. The auth user is **not** deleted (that would cascade-delete
retained `legal_acceptances`); the profile PII is anonymized instead.

## Steps

1. **Verify identity** of the requester (must own the account or be a verified guest).
2. Record the request. For hosts, the in-app flow / `step: "request"` sets
   `deletion_requested_at` and returns the erase-vs-retain summary. Share it with the requester.
3. Honor any grace/cooling-off window per policy.
4. **Confirm**: call `step: "confirm"` with the confirmation phrase (`DELETE MY DATA`).
   This runs `confirmDeletion` (service-role): removes stays, guest identities, property
   contacts, recommendations, brain items, knowledge nodes, then properties; anonymizes
   `full_name/phone/avatar_url`; soft-deletes `host_accounts`.
5. Verify the response `ok: true` and no `errors[]`. Each failed table is logged
   (`data_deletion_step_failed`) — retry failed steps.
6. Confirm completion to the requester and note retained-record categories.

## Escalation path

Support → Engineering (if `confirm` returns errors, or service-role key unavailable →
503 `data_deletion_no_service_role`). Do not hand-delete in the DB without engineering.

## Customer comms template

> Hi {name}, we've received your data-deletion request. We'll erase your personal and
> property data. For legal and tax reasons we must retain limited billing and
> consent records, as described in our Privacy Policy. We'll confirm once complete
> (typically within 30 days).
