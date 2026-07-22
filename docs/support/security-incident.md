# Runbook: Security Incident

**Trigger:** Suspected or confirmed security incident — data breach, unauthorized access,
leaked credential/service-role key, vulnerability report, or anomalous activity in Sentry.

**Owner:** Security on-call + Engineering lead.

## Steps

1. **Triage & contain.** Assess scope and severity. Contain the immediate threat: rotate
   compromised credentials (especially `SUPABASE_SERVICE_ROLE_KEY`, Stripe, AI keys),
   revoke sessions, and disable affected access paths.
2. **Preserve evidence.** Capture logs (Sentry, Supabase, Vercel), audit-log rows, and
   timelines before remediation overwrites them.
3. **Assess personal-data impact.** Determine whether personal data was affected and which
   controllers (hosts) are impacted.
4. **Breach-notification clock (72h).** If a personal-data breach affecting controller
   data is confirmed, notify affected controllers **without undue delay and within 72
   hours** of awareness — this is our DPA commitment (`/legal/dpa` §3, `/legal/security`).
   Track the awareness timestamp explicitly.
5. **Remediate.** Patch the root cause; verify the fix; confirm containment held.
6. **Post-incident review.** Document root cause, impact, and corrective actions. Update
   controls and this runbook. Feed forward-looking control changes into `/legal/security`
   (subject to attorney review).

## Escalation path

Security on-call → Engineering lead → Company leadership / legal (for notification
decisions) → affected controllers (hosts) within 72h → regulators/individuals if legally
required.

## Customer comms template

> We're contacting you about a security incident that may affect data processed on your
> behalf. Here's what we know: {summary}. Here's what we've done: {containment/remediation}.
> Here's what you should do: {actions}. We'll follow up with more detail as our
> investigation continues.
