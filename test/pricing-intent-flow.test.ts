import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parsePricingIntent, pricingIntentFromMetadata } from '../lib/billing/pricing-intent';

const read = (path: string) => readFileSync(path, 'utf8');

describe('pricing intent validation', () => {
  it('accepts self-serve plans and monthly or annual intervals only', () => {
    expect(parsePricingIntent('pro', 'annual')).toEqual({ planId: 'pro', interval: 'annual' });
    expect(parsePricingIntent('starter', 'monthly')).toEqual({ planId: 'starter', interval: 'monthly' });
    expect(parsePricingIntent('portfolio', 'annual')).toEqual({ planId: 'portfolio', interval: 'annual' });
    expect(parsePricingIntent('enterprise', 'annual')).toBeNull();
    expect(parsePricingIntent('free', 'monthly')).toBeNull();
    expect(parsePricingIntent('pro', 'weekly')).toBeNull();
    expect(parsePricingIntent('../pro', 'annual')).toBeNull();
    expect(parsePricingIntent(['pro'], 'annual')).toBeNull();
  });

  it('revalidates metadata rather than trusting the stored value', () => {
    expect(pricingIntentFromMetadata({ pricing_intent: { planId: 'pro', interval: 'annual' } }))
      .toEqual({ planId: 'pro', interval: 'annual' });
    expect(pricingIntentFromMetadata({ pricing_intent: { planId: 'enterprise', interval: 'annual' } }))
      .toBeNull();
    expect(pricingIntentFromMetadata({ pricing_intent: 'pro' })).toBeNull();
    expect(pricingIntentFromMetadata(null)).toBeNull();
  });
});

describe('pricing flow wiring', () => {
  it('sends intent in the signup form and stores it as user metadata only', () => {
    expect(read('app/(auth)/signup/page.tsx')).toContain('name="plan" value={intent.planId}');
    expect(read('app/(auth)/signup/page.tsx')).toContain('name="interval" value={intent.interval}');
    expect(read('app/(auth)/actions.ts')).toContain('pricing_intent: pricingIntent');
  });

  it('routes only successful signup verification to billing review', () => {
    const callback = read('app/auth/callback/route.ts');
    expect(callback).toContain("type === 'signup' && !searchParams.has('next')");
    expect(callback).toContain('pricingIntentFromMetadata(data.user?.user_metadata)');
    expect(callback).toContain("`${origin}/dashboard/profile/billing`");
  });

  it('uses stored intent for a free owner and preserves explicit checkout agreement', () => {
    const layout = read('app/dashboard/profile/billing/layout.tsx');
    const actions = read('app/dashboard/profile/billing/BillingActions.tsx');
    expect(layout).toContain('isOwner && !entitlements?.active');
    expect(actions).toContain('selectedAtSignup ? intent.interval');
    expect(actions).toContain('disabled={!props.configured || loading || !agreed}');
    expect(actions).toContain("go('/api/stripe/checkout', { planId: props.planId, interval, acceptTerms: true })");
  });
});
