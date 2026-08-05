import { describe, it, expect } from 'vitest';
import { entitlementsFromSubscription, guestAiEnabled, isReadOnly } from './entitlements';
import {
  PLANS,
  TOP_TIER_PLAN_ID,
  FOUNDING_TRIAL_PROPERTY_LIMIT,
  SELF_SERVE_PLAN_IDS,
  ANNUAL_MULTIPLIER,
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
      'growth_lower',
      'growth_upper',
      'portfolio',
      'enterprise',
      'custom',
    ]);
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
      // The custom tier has an infinite range, which propertyLimit represents as
      // MAX_SAFE_INTEGER so arithmetic on it stays finite.
      if (Number.isFinite(max)) expect(plan.propertyLimit).toBe(max);
      else expect(plan.propertyLimit).toBe(Number.MAX_SAFE_INTEGER);
    }
  });

  it('leaves no gap or overlap between consecutive property ranges', () => {
    const ids = Object.keys(PLANS) as PlanId[];
    for (let i = 1; i < ids.length; i++) {
      expect(PLANS[ids[i]].propertyRange[0]).toBe(PLANS[ids[i - 1]].propertyRange[1] + 1);
    }
  });

  it('marks exactly the two sales-assisted tiers as not self-serve', () => {
    expect(SELF_SERVE_PLAN_IDS).toEqual(['starter', 'pro', 'growth_lower', 'growth_upper', 'portfolio']);
    expect(PLANS.enterprise.selfServe).toBe(false);
    expect(PLANS.custom.selfServe).toBe(false);
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

  it('reads limits and allowance off the stored plan when active', () => {
    const ent = entitlementsFromSubscription(sub({ plan: 'growth_upper', status: 'active' }));
    expect(ent.planId).toBe('growth_upper');
    expect(ent.propertyLimit).toBe(PLANS.growth_upper.propertyLimit);
    expect(ent.conversationAllowance).toBe(PLANS.growth_upper.conversationAllowance);
    expect(ent.reviewNudge).toBe(true);
  });

  it('resolves growth_lower rather than a nonexistent "growth" plan', () => {
    // Guards the underscore bug class: a plan id containing an underscore must
    // resolve as a whole key, never as its first segment.
    const ent = entitlementsFromSubscription(sub({ plan: 'growth_lower', status: 'active' }));
    expect(ent.planId).toBe('growth_lower');
    expect(ent.propertyLimit).toBe(10);
    expect(ent.conversationAllowance).toBe(500);
  });

  it('falls back to the minimum when the stored plan is not in the grid', () => {
    // A stale plan string from an older deploy must not throw or grant top tier.
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
    // The whole point of the offer: a Starter checkout gets top-tier features...
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
    const ent = entitlementsFromSubscription(sub({ plan: 'pro', status: 'past_due' }));
    expect(ent.active).toBe(true);
    expect(ent.isReadOnly).toBe(false);
    expect(ent.propertyLimit).toBe(PLANS.pro.propertyLimit);
  });

  it('withholds co-hosts and cloning from Starter only', () => {
    expect(entitlementsFromSubscription(sub({ plan: 'starter' })).coHosts).toBe(false);
    expect(entitlementsFromSubscription(sub({ plan: 'starter' })).cloning).toBe(false);
    expect(entitlementsFromSubscription(sub({ plan: 'pro' })).coHosts).toBe(true);
  });
});
