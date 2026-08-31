import type { Metadata } from 'next';
import Link from 'next/link';
import {
  FOUNDING_ACCOUNT_CAP,
  FOUNDING_DISCOUNT_MONTHS,
  FOUNDING_DISCOUNT_PERCENT,
  HOST_PRICING_BANDS,
  LAUNCH_DATE_LABEL,
  ANNUAL_MULTIPLIER,
} from '@/lib/constants';

export const metadata: Metadata = {
  title: 'Founding Host Terms',
  description:
    'How the Moche-AI founding host rate works: what it discounts, how long it lasts, how many accounts get it, and how billing, renewal, and cancellation work.',
};

// This page was previously /trial-terms and described a card-required 30-day
// trial. That trial no longer exists in the product: the founding offer is a
// percentage discount for a fixed number of months, applied automatically by a
// Stripe coupon at checkout, and a trial on top of it would have quietly eaten
// one of those discounted months (Stripe starts a repeating coupon's clock the
// moment it is applied). A redirect from the old path is configured in
// next.config.mjs.
//
// Every figure here is read from lib/constants.ts rather than typed in, because a
// terms page that disagrees with what checkout actually charges is worse than no
// terms page at all. The authoritative billing policy is /legal/refund and
// /legal/terms; this page only summarizes the founding offer.
export default function FoundingTermsPage() {
  const firstBand = HOST_PRICING_BANDS[0];
  const topBand = HOST_PRICING_BANDS[HOST_PRICING_BANDS.length - 1];

  return (
    <main className="wrap">
      <article>
        <h1>Founding Host Terms</h1>

        <p>
          These terms explain how the Moche-AI founding host rate works. They summarize
          and are governed by our{' '}
          <Link href="/legal/terms">Terms of Service</Link> and{' '}
          <Link href="/legal/refund">Refund &amp; Billing Policy</Link>. If there
          is any conflict, those documents control.
        </p>

        <h2>0. Before we launch</h2>
        <p>
          Until {LAUNCH_DATE_LABEL} there is no card to enter and nothing to pay. Accounts
          created before launch are free, with no expiry date, and you can build your whole
          setup in that time. The billing sections below describe what happens when paid
          plans begin at launch.
        </p>

        <h2>1. What the founding rate is</h2>
        <p>
          The founding host rate is {FOUNDING_DISCOUNT_PERCENT}% off your subscription for
          your first {FOUNDING_DISCOUNT_MONTHS} months of paid billing. It is limited to the
          first {FOUNDING_ACCOUNT_CAP} accounts to start a paid plan, counted by us rather
          than self-reported, and once those places are taken the offer ends. There is no
          free trial and no promotional code to enter: if the offer is still open when you
          check out, the discount is applied to your subscription automatically.
        </p>
        <p>
          The {FOUNDING_DISCOUNT_MONTHS} months run consecutively from the first invoice the
          discount applies to. It is one offer per account: a subscription that is cancelled
          and started again does not restart the discount, and the remaining months are not
          transferable or extendable.
        </p>

        <h2>2. What happens after the discounted months</h2>
        <p>
          At the end of the {FOUNDING_DISCOUNT_MONTHS} discounted months your subscription
          continues at the standard price for your plan and property count, with no action
          needed from you and no change to your service. You can cancel before that point
          and keep the discount for every month you were billed.
        </p>

        <h2>3. Price</h2>
        <p>
          The Host plan is priced per property per month in bands by portfolio size, so each
          property you add is charged at a lower rate than the one before it, starting at{' '}
          {`$${firstBand.ratePerProperty}`} for your first property and falling to{' '}
          {`$${topBand.ratePerProperty}`} each in the top band. Your bill is the sum of those
          bands, not a single rate multiplied by your property count. Applicable taxes may be
          added at checkout, and prices may change with notice as described in the Terms of
          Service.
        </p>
        <p>
          Annual billing is charged at {ANNUAL_MULTIPLIER} times the monthly rate for the
          same property count, so a year paid annually costs {12 - ANNUAL_MULTIPLIER} months
          less than the same year paid monthly.
        </p>
        <p>
          Setting up your account is self serve and included at no cost. We do not charge a
          setup or onboarding fee, and there is nothing to buy other than the subscription
          described above.
        </p>

        <h2>4. How your bill changes with your portfolio</h2>
        <p>
          Because pricing is per property, your subscription quantity follows the number of
          active properties on your account. Adding a property, archiving one, or deleting
          one updates that quantity, and the change is reflected on your next invoice rather
          than charged mid-cycle. Archived and deleted properties are not billed.
        </p>

        <h2>5. Billing &amp; automatic renewal</h2>
        <p>
          Paid subscriptions are billed in advance via Stripe on a recurring basis (monthly
          or annual, per your selection) and renew automatically until cancelled. Failed
          payments are retried and may enter a past-due grace period as described in the{' '}
          <Link href="/legal/refund">Refund &amp; Billing Policy</Link>. While an account is
          past due the guest concierge is paused and your content stays untouched; paying the
          outstanding invoice restores it.
        </p>

        <h2>6. Cancellation</h2>
        <p>
          You can cancel at any time from <strong>Dashboard → Billing</strong>, or by
          contacting <Link href="/legal/support">support</Link>. Cancelling stops future
          renewals; access continues until the end of the current billing period. Fees
          already paid are non-refundable except as stated in the Refund &amp; Billing
          Policy.
        </p>

        <p>
          Questions about the founding rate? Reach us via our{' '}
          <Link href="/legal/support">support page</Link>.
        </p>
      </article>
    </main>
  );
}
