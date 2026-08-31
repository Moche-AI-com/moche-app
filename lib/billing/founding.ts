import 'server-only';
import type Stripe from 'stripe';
import { FOUNDING_COUPON_ID } from '@/lib/constants';
import { log } from '@/lib/log';

/**
 * Whether this account should get the founding discount attached at checkout.
 *
 * Pure so the rule is testable without a Stripe client. Two conditions:
 *
 * 1. The account has never had a Stripe subscription. Without this a host could
 *    cancel and re-checkout to restart the 12 discounted months indefinitely.
 * 2. The coupon is still valid. Stripe flips `valid` to false once
 *    `max_redemptions` is reached, which is how the account cap is enforced.
 *
 * Both must hold, because attaching an exhausted coupon does not degrade
 * gracefully: Stripe rejects the whole Checkout Session, so a sold-out founding
 * offer would break checkout for everyone rather than just charge full price.
 */
export function isFoundingDiscountEligible(input: {
  hasEverSubscribed: boolean;
  couponValid: boolean;
}): boolean {
  return !input.hasEverSubscribed && input.couponValid;
}

/**
 * Reads the founding coupon from Stripe and reports whether it can still be
 * redeemed. Returns false on any error rather than throwing: a coupon lookup
 * failure must degrade to full-price checkout, never to a failed checkout.
 */
export async function isFoundingCouponRedeemable(stripe: Stripe): Promise<boolean> {
  try {
    const coupon = await stripe.coupons.retrieve(FOUNDING_COUPON_ID);
    // `valid` already accounts for max_redemptions and redeem_by. The explicit
    // times_redeemed check is belt-and-braces for the race between two hosts
    // checking out on the last remaining redemption.
    const remaining =
      coupon.max_redemptions == null
        ? Number.POSITIVE_INFINITY
        : coupon.max_redemptions - (coupon.times_redeemed ?? 0);
    return coupon.valid && remaining > 0;
  } catch (e) {
    log.warn('founding_coupon_lookup_failed', {
      couponId: FOUNDING_COUPON_ID,
      error: e instanceof Error ? e.message : String(e),
    });
    return false;
  }
}
