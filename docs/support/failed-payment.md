# Runbook: Failed Payment

**Trigger:** Stripe `invoice.payment_failed` webhook fires; host subscription moves to
`past_due`. Alternatively a host reports the concierge stopped working.

**Owner:** Billing / Support on-call.

## Steps

1. Confirm status in Stripe and in `subscriptions.status` (`past_due` or `unpaid`).
2. `past_due` = grace period: **guest AI still works** (`entitlements.ts` allows
   `trialing|active|past_due`). Reassure the host; no outage yet.
3. Verify **Smart Retries / dunning** is enabled in the Stripe Dashboard (see
   pre-launch checklist — this is a dashboard setting, not code). Confirm retry schedule.
4. Ask the host to update their card in **Dashboard → Billing** (Stripe customer portal).
5. On successful payment, Stripe sends `invoice.payment_succeeded`; the webhook
   auto-transitions `past_due`/`unpaid` → `active` (`app/api/stripe/webhook/route.ts`)
   and notifies the host "Payment received". No manual DB edit needed.
6. If retries are exhausted → `unpaid`: guest AI is suspended and guests see a graceful
   "temporarily unavailable" message. Help the host pay to restore access.

## Escalation path

Support → Billing lead → Engineering (if webhook/state mismatch suspected: compare
Stripe status vs. `subscriptions` row).

## Customer comms template

> Hi {name}, we had trouble processing your latest Moche-AI payment, so your account
> is in a short grace period. Your guest concierge is still running for now. Please
> update your card in Dashboard → Billing to avoid interruption. Reply here if you'd
> like a hand.
