import { describe, expect, it } from 'vitest';
import {
  capsSentence,
  daysUntil,
  planBannerFor,
  pluralize,
  type PlanBannerInput,
} from './plan-banner';

const NOW = new Date('2026-08-05T12:00:00.000Z');

function ent(overrides: Partial<PlanBannerInput> = {}): PlanBannerInput {
  return {
    planId: null,
    active: false,
    isReadOnly: false,
    trialing: false,
    trialEnd: null,
    propertyLimit: 1,
    conversationAllowance: 0,
    ...overrides,
  };
}

describe('pluralize', () => {
  it('uses the singular for exactly one', () => {
    expect(pluralize(1, 'property', 'properties')).toBe('1 property');
  });

  it('uses the plural for more than one', () => {
    expect(pluralize(5, 'property', 'properties')).toBe('5 properties');
  });

  it('uses the plural for zero', () => {
    expect(pluralize(0, 'property', 'properties')).toBe('0 properties');
  });

  it('defaults to appending an s', () => {
    expect(pluralize(3, 'day')).toBe('3 days');
    expect(pluralize(1, 'day')).toBe('1 day');
  });
});

describe('daysUntil', () => {
  it('returns null for a missing date', () => {
    expect(daysUntil(null, NOW)).toBeNull();
    expect(daysUntil(undefined, NOW)).toBeNull();
  });

  it('returns null for an unparseable date rather than NaN', () => {
    expect(daysUntil('not a date', NOW)).toBeNull();
  });

  it('rounds a partial day up so the last day is not reported as zero', () => {
    expect(daysUntil('2026-08-06T01:00:00.000Z', NOW)).toBe(1);
  });

  it('counts whole days', () => {
    expect(daysUntil('2026-08-12T12:00:00.000Z', NOW)).toBe(7);
  });

  it('returns 0 for a date that has already passed', () => {
    expect(daysUntil('2026-08-01T12:00:00.000Z', NOW)).toBe(0);
  });
});

describe('capsSentence', () => {
  it('omits the conversation allowance when it is unset', () => {
    expect(capsSentence(1, 0)).toBe('1 property');
  });

  it('includes a thousands-separated allowance', () => {
    expect(capsSentence(15, 800)).toBe('15 properties and 800 guest conversations a month');
    expect(capsSentence(40, 1500)).toBe('40 properties and 1,500 guest conversations a month');
  });

  it('never renders a negative allowance', () => {
    expect(capsSentence(2, -1)).toBe('2 properties');
  });
});

describe('planBannerFor', () => {
  it('returns nothing for a healthy paid plan', () => {
    expect(planBannerFor(ent({ planId: 'pro', active: true, propertyLimit: 5, conversationAllowance: 200 }), NOW)).toBeNull();
  });

  it('shows the free build tier when the host has never subscribed', () => {
    const b = planBannerFor(ent(), NOW);
    expect(b?.variant).toBe('free_build');
    expect(b?.tone).toBe('info');
    expect(b?.ctaHref).toBe('/dashboard/profile/billing');
  });

  it('pluralizes the property cap instead of hardcoding the singular', () => {
    const b = planBannerFor(ent({ propertyLimit: 5 }), NOW);
    expect(b?.body).toContain('5 properties');
    expect(b?.body).not.toContain('5 property');
  });

  // The whole point of this module: a lapsed subscription is also active:false, and
  // that host needs to know their guests are being turned away, not be invited to
  // browse plans as if they were new.
  it('prefers the read-only message over the free build tier', () => {
    const b = planBannerFor(ent({ isReadOnly: true, planId: 'pro' }), NOW);
    expect(b?.variant).toBe('read_only');
    expect(b?.tone).toBe('error');
    expect(b?.ctaLabel).toBe('Fix billing');
    expect(b?.body).toContain('Host');
    expect(b?.body).toContain('not answering guests');
  });

  it('reassures a read-only host that their data survives', () => {
    const b = planBannerFor(ent({ isReadOnly: true, planId: 'pro' }), NOW);
    expect(b?.body).toContain('untouched');
  });

  it('handles a read-only account with no recorded plan', () => {
    const b = planBannerFor(ent({ isReadOnly: true, planId: null }), NOW);
    expect(b?.variant).toBe('read_only');
    expect(b?.body).not.toContain('undefined');
    expect(b?.body).not.toContain('null');
  });

  it('shows the trial countdown', () => {
    const b = planBannerFor(ent({ trialing: true, active: true, trialEnd: '2026-08-12T12:00:00.000Z', propertyLimit: 3 }), NOW);
    expect(b?.variant).toBe('trial');
    expect(b?.title).toBe('7 days left in your trial');
    expect(b?.tone).toBe('info');
  });

  it('escalates the tone in the last three days of the trial', () => {
    const b = planBannerFor(ent({ trialing: true, active: true, trialEnd: '2026-08-07T12:00:00.000Z' }), NOW);
    expect(b?.tone).toBe('warn');
    expect(b?.title).toBe('2 days left in your trial');
  });

  it('says today rather than 0 days on the final day', () => {
    const b = planBannerFor(ent({ trialing: true, active: true, trialEnd: '2026-08-05T11:00:00.000Z' }), NOW);
    expect(b?.title).toBe('Your trial ends today');
  });

  it('still renders a trial banner when the end date is missing', () => {
    const b = planBannerFor(ent({ trialing: true, active: true, trialEnd: null }), NOW);
    expect(b?.variant).toBe('trial');
    expect(b?.title).toBe('Founding Member trial');
  });

  // A trial that has lapsed into read-only must not read as a live trial.
  it('prefers read-only over trialing', () => {
    const b = planBannerFor(ent({ trialing: true, isReadOnly: true, trialEnd: '2026-08-12T12:00:00.000Z' }), NOW);
    expect(b?.variant).toBe('read_only');
  });
});
