import 'server-only';
import Stripe from 'stripe';
import { serverEnv } from '@/lib/env';
import { PLANS, type PlanId, type BillingInterval } from '@/lib/constants';

// Thrown when Stripe is not configured (STRIPE_SECRET_KEY missing). Callers should
// translate this into a clean 503 { error } rather than a 500 — billing is an
// optional integration and the UI already gates on its presence.
export class BillingNotConfiguredError extends Error {
  constructor(message = 'Billing is not configured.') {
    super(message);
    this.name = 'BillingNotConfiguredError';
  }
}

// Pinned so upgrades are deliberate. Cast because the SDK's literal type tracks the
// version it shipped with; the account is on the pinned version.
const STRIPE_API_VERSION = '2024-06-20' as Stripe.LatestApiVersion;

let cached: Stripe | null = null;

// Server-only Stripe client. NEVER call from client code — the secret key must not
// reach the browser. Throws BillingNotConfiguredError when the key is absent.
export function getStripe(): Stripe {
  if (!serverEnv.stripeSecretKey) {
    throw new BillingNotConfiguredError();
  }
  if (cached) return cached;
  cached = new Stripe(serverEnv.stripeSecretKey, {
    apiVersion: STRIPE_API_VERSION,
    typescript: true,
    appInfo: { name: 'moche-app' },
  });
  return cached;
}

export function isBillingConfigured(): boolean {
  return !!serverEnv.stripeSecretKey;
}

type PriceKey = keyof typeof serverEnv.stripePrices;

// Resolves the configured Stripe price ID for a plan + interval, or null if unset.
export function priceIdFor(planId: PlanId, interval: BillingInterval): string | null {
  const key = `${planId}_${interval}` as PriceKey;
  return serverEnv.stripePrices[key] || null;
}

// Reverse lookup: map a Stripe price ID back to our plan id (for the webhook).
//
// This deliberately iterates plan ids rather than splitting the env key on '_'.
// Plan ids have contained underscores before (the retired growth_lower /
// growth_upper flat tiers), so key.split('_')[0] would have resolved
// 'growth_lower_monthly' to the plan id 'growth', which does not exist, and the
// webhook would have written a plan value the entitlement lookup could never match.
// Retired tiers are absent from PLANS, so their old price ids resolve to null —
// intentional: no current subscription should still be on them.
export function planFromPriceId(priceId: string | null | undefined): PlanId | null {
  if (!priceId) return null;
  const intervals: BillingInterval[] = ['monthly', 'annual'];
  for (const planId of Object.keys(PLANS) as PlanId[]) {
    for (const interval of intervals) {
      const key = `${planId}_${interval}` as PriceKey;
      if (serverEnv.stripePrices[key] && serverEnv.stripePrices[key] === priceId) {
        return planId;
      }
    }
  }
  return null;
}
