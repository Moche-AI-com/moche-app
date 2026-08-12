// Stripe Billing Meters scaffold (§10, sequenced after autopilot).
//
// Deliberately a scaffold: the meters are defined, the event producer is real and
// idempotent, and nothing is wired to a live price. Two reasons to keep it flagged off
// rather than "nearly live": the deployment is on a plan that cannot legally carry
// commercial traffic yet, and a meter event that lands before the price exists is silently
// unbilled usage that no one reconciles later.
//
// Meters are append-only in effect: Stripe aggregates by event_name, so renaming an
// event_name after any usage has landed orphans the history. Treat METERS as a contract.

import 'server-only';

import type Stripe from 'stripe';
import { getStripe, isBillingConfigured } from './stripe';
import { serverEnv } from '@/lib/env';

export const METERS = {
  guest_conversation: {
    event_name: 'moche_guest_conversation',
    display_name: 'Guest conversations',
    // Count of conversations, so each event carries value 1 and the meter sums them.
    formula: 'sum',
  },
  ai_answer: {
    event_name: 'moche_ai_answer',
    display_name: 'AI answers delivered',
    formula: 'sum',
  },
  property_import: {
    event_name: 'moche_property_import',
    display_name: 'Property imports',
    formula: 'sum',
  },
} as const;

export type MeterKey = keyof typeof METERS;

export function meteringEnabled(): boolean {
  return serverEnv.stripeMetersEnabled && isBillingConfigured();
}

export type MeterEventOutcome =
  | { recorded: true; identifier: string }
  | { recorded: false; reason: 'disabled' | 'not_configured' | 'failed'; detail?: string };

/**
 * Deterministic event identifier. Stripe enforces uniqueness over a rolling 24h window,
 * so a retry of the same logical unit of usage collapses instead of double-billing. The
 * inputs must therefore identify the usage, not the attempt.
 */
export function meterEventIdentifier(key: MeterKey, subjectId: string, occurredAt: string): string {
  return `${METERS[key].event_name}:${subjectId}:${occurredAt}`;
}

/**
 * Record one unit of metered usage. Never throws: billing telemetry must not be able to
 * fail a guest-facing request. A dropped meter event under-bills, which is recoverable;
 * a failed guest answer is not.
 */
export async function recordMeterEvent(args: {
  key: MeterKey;
  stripeCustomerId: string;
  /** Stable id of the thing being metered (conversation id, import id). */
  subjectId: string;
  occurredAt: string;
  value?: number;
}): Promise<MeterEventOutcome> {
  if (!serverEnv.stripeMetersEnabled) return { recorded: false, reason: 'disabled' };
  if (!isBillingConfigured()) return { recorded: false, reason: 'not_configured' };
  if (!args.stripeCustomerId) return { recorded: false, reason: 'not_configured', detail: 'no_customer' };

  const identifier = meterEventIdentifier(args.key, args.subjectId, args.occurredAt);
  const timestamp = Math.floor(new Date(args.occurredAt).getTime() / 1000);

  try {
    await getStripe().billing.meterEvents.create({
      event_name: METERS[args.key].event_name,
      identifier,
      timestamp,
      payload: {
        stripe_customer_id: args.stripeCustomerId,
        value: String(args.value ?? 1),
      },
    });
    return { recorded: true, identifier };
  } catch (err) {
    return { recorded: false, reason: 'failed', detail: err instanceof Error ? err.message : 'unknown' };
  }
}

/**
 * Idempotent meter provisioning for a sandbox. Reads the existing meters first and only
 * creates what is missing, so re-running it cannot produce duplicate meters competing for
 * the same event_name.
 */
export async function ensureMeters(): Promise<{ created: string[]; existing: string[] }> {
  const stripe = getStripe();
  const page = await stripe.billing.meters.list({ status: 'active', limit: 100 });
  const byName = new Map(page.data.map((m: Stripe.Billing.Meter) => [m.event_name, m]));

  const created: string[] = [];
  const existing: string[] = [];
  for (const def of Object.values(METERS)) {
    if (byName.has(def.event_name)) {
      existing.push(def.event_name);
      continue;
    }
    await stripe.billing.meters.create({
      display_name: def.display_name,
      event_name: def.event_name,
      default_aggregation: { formula: def.formula },
      value_settings: { event_payload_key: 'value' },
      customer_mapping: { type: 'by_id', event_payload_key: 'stripe_customer_id' },
    });
    created.push(def.event_name);
  }
  return { created, existing };
}
