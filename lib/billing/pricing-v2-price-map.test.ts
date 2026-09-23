import { describe, expect, it, vi } from 'vitest';

const stripePrices = vi.hoisted(() => ({
  starter_monthly: 'price_starter_monthly_v2',
  starter_annual: 'price_starter_annual_v2',
  pro_monthly: 'price_pro_monthly_v2',
  pro_annual: 'price_pro_annual_v2',
  portfolio_monthly: 'price_portfolio_monthly_v2',
  portfolio_annual: 'price_portfolio_annual_v2',
}));

vi.mock('@/lib/env', () => ({ serverEnv: { stripePrices } }));

import { planFromPriceId, priceIdFor } from './stripe';

describe('Pricing V2 plan and price mapping', () => {
  const cases = [
    ['starter', 'monthly', 'price_starter_monthly_v2'],
    ['starter', 'annual', 'price_starter_annual_v2'],
    ['pro', 'monthly', 'price_pro_monthly_v2'],
    ['pro', 'annual', 'price_pro_annual_v2'],
    ['portfolio', 'monthly', 'price_portfolio_monthly_v2'],
    ['portfolio', 'annual', 'price_portfolio_annual_v2'],
  ] as const;

  it.each(cases)('maps %s %s in both directions', (plan, interval, price) => {
    expect(priceIdFor(plan, interval)).toBe(price);
    expect(planFromPriceId(price)).toBe(plan);
  });

  it('does not assign unknown or retired prices to a current plan', () => {
    expect(planFromPriceId('price_retired')).toBeNull();
    expect(planFromPriceId(null)).toBeNull();
  });
});
