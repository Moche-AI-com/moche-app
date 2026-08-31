import { describe, it, expect } from 'vitest';
import { entitlementsFromSubscription, guestAiEnabled, isReadOnly } from './entitlements';
import {
  PLANS,
  TOP_TIER_PLAN_ID,
  FOUNDING_TRIAL_PROPERTY_LIMIT,
  SELF_SERVE_PLAN_IDS,
  ANNUAL_MULTIPLIER,
  GUIDED_SETUP_USD,
  HOST_PRICING_BANDS,
  SELF_SERVE_PROPERTY_MAX,
  effectiveRatePerProperty,
  guidedSetupTotal,
  monthlyTotalForProperties,
  type PlanId,
} from '@/lib/constants';
import type { Database } from '@/lib/database.types';

type Subscription = Database['public']['Tables']['subscriptions']['Row'];

// Minimal valid row; each test overrides only the fields it is exercising so a
// future column addition does not silently change what these tests assert.
function sub(over: Partial<Subscription> = {}): Subscription {
  return {
    id: 'sub-row-1',
    host_account_id: 'acct-1',
    plan: 'pro',
    status: 'active',
    quantity: 1,
    stripe_customer_id: 'cus_1',
    stripe_subscription_id: 'sub_1',
    stripe_price_id: 'price_1',
    current_period_end: '2026-09-01T00:00:00.000Z',
    trial_end: null,
    cancel_at_period_end: false,
    trial_property_limit: FOUNDING_TRIAL_PROPERTY_LIMIT,
    is_read_only: false,
    created_at: '2026-08-01T00:00:00.000Z',
    updated_at: '2026-08-01T00:00:00.000Z',
    ...over,
  } as Subscription;
}

describe('plan grid', () => {
  it('exposes every tier the pricing grid promises, in ascending order', () => {
    expect(Object.keys(PLANS)).toEqual([
      'starter',
      'pro',
      'portfolio',
      'enterprise',
    ]);
  });

  it('matches the published price points', () => {
    // See docs/pricing-model-2027.md. One free tier, one banded self-serve plan,
    // two contract tiers. Contract tiers carry 0 so they can never become a
    // self-serve checkout amount.
    expect(PLANS.starter.monthly).toBe(0);
    expect(PLANS.starter.annual).toBe(0);
    expect(PLANS.pro.monthly).toBe(29);
    expect(PLANS.pro.annual).toBe(290);
    expect(PLANS.portfolio.monthly).toBe(0);
    expect(PLANS.enterprise.monthly).toBe(0);
    expect(GUIDED_SETUP_USD).toBe(199);
  });

  it('leaves conversationAllowance unmetered on every tier', () => {
    // Guest messages are unlimited on every paid plan and there is no
    // per-conversation charge. Downstream code reads 0 as unmetered, so a
    // non-zero value here would silently start advertising a cap.
    for (const id of Object.keys(PLANS) as PlanId[]) {
      expect(PLANS[id].conversationAllowance).toBe(0);
    }
  });

  it('prices annual at exactly the monthly rate times the multiplier', () => {
    for (const id of SELF_SERVE_PLAN_IDS) {
      expect(PLANS[id].annual).toBe(PLANS[id].monthly * ANNUAL_MULTIPLIER);
    }
  });

  it('keeps propertyLimit equal to the top of propertyRange', () => {
    for (const id of Object.keys(PLANS) as PlanId[]) {
      const plan = PLANS[id];
      const max = plan.propertyRange[1];
      // The enterprise tier has an infinite range, which propertyLimit represents as
      // MAX_SAFE_INTEGER so arithmetic on it stays finite.
      if (Number.isFinite(max)) expect(plan.propertyLimit).toBe(max);
      else expect(plan.propertyLimit).toBe(Number.MAX_SAFE_INTEGER);
    }
  });

  it('starts the contract tiers exactly where self-serve ends, with no gap', () => {
    // Free is a single property. The Host plan runs to SELF_SERVE_PROPERTY_MAX,
    // and the contract ladder must continue from there without a gap.
    expect(PLANS.starter.propertyRange).toEqual([1, 1]);
    expect(PLANS.pro.propertyRange).toEqual([1, SELF_SERVE_PROPERTY_MAX]);
    expect(PLANS.portfolio.propertyRange[0]).toBe(PLANS.pro.propertyRange[1] + 1);
    expect(PLANS.enterprise.propertyRange[0]).toBe(PLANS.portfolio.propertyRange[1] + 1);
  });

  it('marks only the Host plan as self-serve', () => {
    // Free is the absence of a subscription, so it must never be checkout-able:
    // there is no Stripe object behind it.
    expect(SELF_SERVE_PLAN_IDS).toEqual(['pro']);
    expect(PLANS.starter.selfServe).toBe(false);
    expect(PLANS.portfolio.selfServe).toBe(false);
    expect(PLANS.enterprise.selfServe).toBe(false);
  });
});

describe('graduated per-property pricing', () => {
  it('prices each band marginally, matching the published table', () => {
    // These totals are the ones printed on the pricing page and in
    // docs/pricing-model-2027.md. If this test changes, that doc must change.
    const expected: Record<number, number> = {
      1: 29,
      2: 48,
      3: 67,
      4: 86,
      5: 100,
      8: 142,
      10: 167,
      15: 222,
      20: 277,
      24: 321,
    };
    for (const [count, total] of Object.entries(expected)) {
      expect(monthlyTotalForProperties(Number(count))).toBe(total);
    }
  });

  it('never charges less for more properties', () => {
    for (let n = 1; n < 40; n += 1) {
      expect(monthlyTotalForProperties(n + 1)).toBeGreaterThan(monthlyTotalForProperties(n));
    }
  });

  it('makes the blended rate fall monotonically as a portfolio grows', () => {
    // This is the whole point of the structure: adding a property must never
    // raise the effective per-property rate.
    for (let n = 1; n < SELF_SERVE_PROPERTY_MAX; n += 1) {
      expect(effectiveRatePerProperty(n + 1)).toBeLessThanOrEqual(effectiveRatePerProperty(n));
    }
  });

  it('returns zero for zero, negative and non-finite counts', () => {
    expect(monthlyTotalForProperties(0)).toBe(0);
    expect(monthlyTotalForProperties(-3)).toBe(0);
    expect(monthlyTotalForProperties(Number.NaN)).toBe(0);
    expect(effectiveRatePerProperty(0)).toBe(0);
  });

  it('keeps the entry rate on the Host plan equal to the first band', () => {
    expect(PLANS.pro.monthly).toBe(HOST_PRICING_BANDS[0].ratePerProperty);
    expect(PLANS.pro.monthly).toBe(monthlyTotalForProperties(1));
  });

  it('prices Concierge Setup per account, not per property', () => {
    expect(guidedSetupTotal(1)).toBe(199);
    expect(guidedSetupTotal(5)).toBe(395);
    expect(guidedSetupTotal(10)).toBe(640);
    expect(guidedSetupTotal(0)).toBe(0);
    // The old model was a flat fee per property. Five properties must now cost
    // materially less than that, or the change did not achieve its purpose.
    expect(guidedSetupTotal(5)).toBeLessThan(5 * 149);
  });
});

describe('isReadOnly', () => {
  it('is false with no subscription (never subscribed is pre-trial, not degraded)', () => {
    expect(isReadOnly(null)).toBe(false);
  });

  it('honours the explicit latch even on an otherwise active row', () => {
    expect(isReadOnly(sub({ status: 'active', is_read_only: true }))).toBe(true);
  });

  it('derives read-only from terminal statuses without needing the latch', () => {
    for (const status of ['unpaid', 'canceled', 'incomplete_expired', 'paused'] as const) {
      expect(isReadOnly(sub({ status }))).toBe(true);
    }
  });

  it('does NOT degrade past_due, which is a dunning grace period', () => {
    expect(isReadOnly(sub({ status: 'past_due' }))).toBe(false);
  });
});

describe('guestAiEnabled', () => {
  it('is false with no subscription (the guest concierge is a paid capability)', () => {
    expect(guestAiEnabled(null)).toBe(false);
  });

  it('serves guests while trialing, active, and past_due', () => {
    for (const status of ['trialing', 'active', 'past_due'] as const) {
      expect(guestAiEnabled(sub({ status }))).toBe(true);
    }
  });

  it('stops serving guests once read-only, even if the status still says active', () => {
    expect(guestAiEnabled(sub({ status: 'active', is_read_only: true }))).toBe(false);
  });

  it('stops serving guests on terminal statuses', () => {
    for (const status of ['canceled', 'unpaid', 'incomplete', 'incomplete_expired', 'paused'] as const) {
      expect(guestAiEnabled(sub({ status }))).toBe(false);
    }
  });
});

describe('entitlementsFromSubscription', () => {
  it('grants the minimum with no subscription so hosts can build before paying', () => {
    const ent = entitlementsFromSubscription(null);
    expect(ent.active).toBe(false);
    expect(ent.status).toBe('none');
    expect(ent.propertyLimit).toBe(1);
    expect(ent.conversationAllowance).toBe(0);
    expect(ent.isReadOnly).toBe(false);
    expect(ent.trialing).toBe(false);
  });

  it('caps properties at the paid quantity for per-property tiers', () => {
    // Per-property pricing: the Stripe line-item quantity is the cap. 4 paid
    // properties on Pro (ceiling 9) entitle exactly 4.
    const ent = entitlementsFromSubscription(sub({ plan: 'pro', status: 'active', quantity: 4 }));
    expect(ent.planId).toBe('pro');
    expect(ent.propertyLimit).toBe(4);
    expect(ent.conversationAllowance).toBe(PLANS.pro.conversationAllowance);
    expect(ent.reviewNudge).toBe(true);
  });

  it('never lets a hand-edited Stripe quantity exceed the tier ceiling', () => {
    const ent = entitlementsFromSubscription(sub({ plan: 'pro', status: 'active', quantity: 25 }));
    expect(ent.propertyLimit).toBe(PLANS.pro.propertyLimit);
  });

  it('treats a missing or zero quantity as one property, never as none', () => {
    const ent = entitlementsFromSubscription(sub({ plan: 'pro', status: 'active', quantity: 0 }));
    expect(ent.propertyLimit).toBe(1);
  });

  it('falls back to the minimum when the stored plan is not in the grid', () => {
    // A stale plan string from an older deploy (e.g. a retired flat tier) must not
    // throw or grant top tier.
    const ent = entitlementsFromSubscription(sub({ plan: 'growth', status: 'active' }));
    expect(ent.active).toBe(false);
    expect(ent.propertyLimit).toBe(1);
  });

  it('grants top-tier FEATURES during a trial but the lower trial property cap', () => {
    const ent = entitlementsFromSubscription(
      sub({ plan: 'starter', status: 'trialing', trial_property_limit: 5, trial_end: '2026-09-04T00:00:00.000Z' }),
    );
    expect(ent.trialing).toBe(true);
    expect(ent.planId).toBe(TOP_TIER_PLAN_ID);
    // The whole point of the offer: an Essentials checkout gets top-tier features...
    expect(ent.conversationAllowance).toBe(PLANS[TOP_TIER_PLAN_ID].conversationAllowance);
    expect(ent.conciergeCustomization).toBe(true);
    // ...but NOT the top tier's property ceiling.
    expect(ent.propertyLimit).toBe(5);
    expect(ent.propertyLimit).toBeLessThan(PLANS[TOP_TIER_PLAN_ID].propertyLimit);
  });

  it('uses the constant when a trial row has no stored trial cap', () => {
    const ent = entitlementsFromSubscription(
      sub({ status: 'trialing', trial_property_limit: null as unknown as number }),
    );
    expect(ent.propertyLimit).toBe(FOUNDING_TRIAL_PROPERTY_LIMIT);
  });

  it('strips paid features and reports read-only on a degraded account', () => {
    const ent = entitlementsFromSubscription(sub({ plan: 'portfolio', status: 'canceled' }));
    expect(ent.isReadOnly).toBe(true);
    expect(ent.active).toBe(false);
    expect(ent.propertyLimit).toBe(1);
    expect(ent.conversationAllowance).toBe(0);
    expect(ent.smsEscalation).toBe(false);
    // The plan id is retained so the UI can say what they had, and offer it back.
    expect(ent.planId).toBe('portfolio');
  });

  it('keeps a past_due account fully entitled through the dunning window', () => {
    const ent = entitlementsFromSubscription(sub({ plan: 'pro', status: 'past_due', quantity: 3 }));
    expect(ent.active).toBe(true);
    expect(ent.isReadOnly).toBe(false);
    expect(ent.propertyLimit).toBe(3);
  });

  it('withholds co-hosts and cloning from Essentials only', () => {
    expect(entitlementsFromSubscription(sub({ plan: 'starter' })).coHosts).toBe(false);
    expect(entitlementsFromSubscription(sub({ plan: 'starter' })).cloning).toBe(false);
    expect(entitlementsFromSubscription(sub({ plan: 'pro' })).coHosts).toBe(true);
  });
});
