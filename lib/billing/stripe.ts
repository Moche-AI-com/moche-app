import 'server-only';
import Stripe from 'stripe';
import { serverEnv } from '@/lib/env';
import type { PlanId, BillingInterval } from '@/lib/constants';

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
export function planFromPriceId(priceId: string | null | undefined): PlanId | null {
  if (!priceId) return null;
  for (const [key, value] of Object.entries(serverEnv.stripePrices)) {
    if (value && value === priceId) {
      return key.split('_')[0] as PlanId;
    }
  }
  return null;
}
