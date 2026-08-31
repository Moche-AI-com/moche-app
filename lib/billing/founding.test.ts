import { describe, it, expect, vi } from 'vitest';
import type Stripe from 'stripe';
import { isFoundingDiscountEligible, isFoundingCouponRedeemable } from './founding';

// A coupon shaped just enough for the code under test. Cast at the boundary so a
// future Stripe type change surfaces here rather than being papered over inline.
function coupon(over: Partial<Stripe.Coupon> = {}): Stripe.Coupon {
  return {
    valid: true,
    max_redemptions: 25,
    times_redeemed: 0,
    ...over,
  } as Stripe.Coupon;
}

function stripeWith(retrieve: () => unknown): Stripe {
  return { coupons: { retrieve } } as unknown as Stripe;
}

describe('isFoundingDiscountEligible', () => {
  // All four combinations, because this gate decides whether a real discount is
  // attached to a real charge. It must be AND, never OR.
  it('is eligible only for a never-subscribed account with a valid coupon', () => {
    expect(isFoundingDiscountEligible({ hasEverSubscribed: false, couponValid: true })).toBe(true);
  });

  it('is not eligible when the account has subscribed before, even if the coupon is valid', () => {
    // Guards the cancel-and-resubscribe loop that would restart the discounted months.
    expect(isFoundingDiscountEligible({ hasEverSubscribed: true, couponValid: true })).toBe(false);
  });

  it('is not eligible when the coupon is exhausted, even for a new account', () => {
    expect(isFoundingDiscountEligible({ hasEverSubscribed: false, couponValid: false })).toBe(false);
  });

  it('is not eligible when both conditions fail', () => {
    expect(isFoundingDiscountEligible({ hasEverSubscribed: true, couponValid: false })).toBe(false);
  });
});

describe('isFoundingCouponRedeemable', () => {
  it('is redeemable when the coupon is valid and has redemptions left', async () => {
    const stripe = stripeWith(() => Promise.resolve(coupon({ times_redeemed: 24 })));
    await expect(isFoundingCouponRedeemable(stripe)).resolves.toBe(true);
  });

  it('is not redeemable once every redemption is used', async () => {
    const stripe = stripeWith(() => Promise.resolve(coupon({ times_redeemed: 25 })));
    await expect(isFoundingCouponRedeemable(stripe)).resolves.toBe(false);
  });

  it('is not redeemable when Stripe reports the coupon invalid', async () => {
    // `valid` is Stripe's own verdict and must be respected even when the
    // arithmetic on max_redemptions would still allow a redemption.
    const stripe = stripeWith(() => Promise.resolve(coupon({ valid: false, times_redeemed: 0 })));
    await expect(isFoundingCouponRedeemable(stripe)).resolves.toBe(false);
  });

  it('treats a coupon with no redemption limit as redeemable', async () => {
    const stripe = stripeWith(() =>
      Promise.resolve(coupon({ max_redemptions: null, times_redeemed: 900 })),
    );
    await expect(isFoundingCouponRedeemable(stripe)).resolves.toBe(true);
  });

  it('treats a missing times_redeemed as zero rather than NaN', async () => {
    const stripe = stripeWith(() =>
      Promise.resolve(coupon({ times_redeemed: undefined as unknown as number })),
    );
    await expect(isFoundingCouponRedeemable(stripe)).resolves.toBe(true);
  });

  it('degrades to full price instead of throwing when the lookup fails', async () => {
    // The whole point of the try/catch: a Stripe outage must not break checkout.
    const stripe = stripeWith(() => Promise.reject(new Error('stripe unreachable')));
    await expect(isFoundingCouponRedeemable(stripe)).resolves.toBe(false);
  });

  it('does not rethrow a non-Error rejection', async () => {
    const stripe = stripeWith(() => Promise.reject('string failure'));
    await expect(isFoundingCouponRedeemable(stripe)).resolves.toBe(false);
  });
});

describe('the two functions compose the way checkout uses them', () => {
  it('yields full price for a new account when the coupon is sold out', async () => {
    const stripe = stripeWith(() => Promise.resolve(coupon({ times_redeemed: 25 })));
    const couponValid = await isFoundingCouponRedeemable(stripe);
    expect(isFoundingDiscountEligible({ hasEverSubscribed: false, couponValid })).toBe(false);
  });

  it('yields the discount for the last remaining seat', async () => {
    const retrieve = vi.fn(() => Promise.resolve(coupon({ times_redeemed: 24 })));
    const couponValid = await isFoundingCouponRedeemable(stripeWith(retrieve));
    expect(isFoundingDiscountEligible({ hasEverSubscribed: false, couponValid })).toBe(true);
    expect(retrieve).toHaveBeenCalledOnce();
  });
});
