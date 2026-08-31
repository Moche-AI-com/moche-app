import type { Metadata } from 'next';
import Link from 'next/link';
import {
  GUIDED_SETUP_USD,
  GUIDED_SETUP_ADDITIONAL_USD,
  FOUNDING_DISCOUNT_MONTHS,
  FOUNDING_DISCOUNT_PERCENT,
  HOST_PRICING_BANDS,
  LAUNCH_DATE_LABEL,
} from '@/lib/constants';

export const metadata: Metadata = {
  title: 'Trial Terms',
  description:
    'How the Moche-AI free trial works: what happens after the trial, price, billing, automatic renewal, and how to cancel.',
};

// Every figure on this page is read from lib/constants.ts rather than typed here,
// because a terms page that disagrees with what checkout actually charges is worse
// than no terms page. The card-required trial described in sections 1 to 5 still
// exists in the billing code, but nothing markets it before launch: pre-launch
// accounts are free outright, which section 0 states first so nobody reads the
// trial rules and concludes we are asking for a card today.
// The full authoritative billing policy lives at /legal/refund and /legal/terms.
export default function TrialTermsPage() {
  return (
    <main className="wrap">
      <article>
        <h1>Free Trial Terms</h1>

        <p>
          These terms explain how the Moche-AI free trial works. They summarize
          and are governed by our{' '}
          <Link href="/legal/terms">Terms of Service</Link> and{' '}
          <Link href="/legal/refund">Refund &amp; Billing Policy</Link>. If there
          is any conflict, those documents control.
        </p>

        <h2>0. Before we launch</h2>
        <p>
          Until {LAUNCH_DATE_LABEL} there is no trial to start and no card to
          enter. Accounts created before launch are free, with no expiry date and
          no charge, and the sections below do not apply to them yet. Founding
          accounts also keep {FOUNDING_DISCOUNT_PERCENT}% off their first{' '}
          {FOUNDING_DISCOUNT_MONTHS} months of billing once paid plans begin. See{' '}
          <Link href="/#pricing">pricing</Link> for the rates that take effect at
          launch.
        </p>

        <h2>1. What the trial includes</h2>
        <p>
          New accounts get a free trial of one (1) month for up to five (5)
          properties. A valid payment card is required to start the trial. You
          are not charged during the trial period.
        </p>

        <h2>2. What happens after the trial</h2>
        <p>
          Unless you cancel before the trial ends, your subscription
          automatically converts to a paid plan and your card is charged the
          then-current price for your selected plan. Guest AI access continues
          uninterrupted when the trial converts to a paid subscription.
        </p>

        <h2>3. Price</h2>
        <p>
          The price charged after the trial is the plan price shown at signup and
          on our pricing page at the time you started the trial. The Host plan is
          priced in bands by portfolio size, so each property you add is charged
          at a lower rate than the one before it, starting at{' '}
          {`$${HOST_PRICING_BANDS[0].ratePerProperty}`} for your first property and
          falling to{' '}
          {`$${HOST_PRICING_BANDS[HOST_PRICING_BANDS.length - 1].ratePerProperty}`}{' '}
          each in the top band. Your bill is the sum of those bands, not a single
          rate multiplied by your property count. Applicable taxes may be added at
          checkout. Prices may change with notice as described in the Terms of
          Service.
        </p>
        <p>
          Concierge Setup, where our team builds your Property Brain with you, is
          optional and charged once per account:{' '}
          {`$${GUIDED_SETUP_USD}`} for your first property and{' '}
          {`$${GUIDED_SETUP_ADDITIONAL_USD}`} for each additional property in the
          same engagement. It is arranged separately with our team. Setting up
          yourself is always included at no cost.
        </p>

        <h2>4. Billing &amp; automatic renewal</h2>
        <p>
          Paid subscriptions are billed in advance via Stripe on a recurring
          basis (monthly or annual, per your selection) and renew automatically
          until cancelled. Failed payments are retried and may enter a past-due
          grace period as described in the{' '}
          <Link href="/legal/refund">Refund &amp; Billing Policy</Link>.
        </p>

        <h2>5. Cancellation</h2>
        <p>
          You can cancel at any time — including during the trial to avoid being
          charged — from{' '}
          <strong>Dashboard → Billing</strong>, or by contacting{' '}
          <Link href="/legal/support">support</Link>. Cancelling stops future
          renewals; access continues until the end of the current billing
          period. Fees already paid are non-refundable except as stated in the
          Refund &amp; Billing Policy.
        </p>

        <p>
          Questions about the trial? Reach us via our{' '}
          <Link href="/legal/support">support page</Link>.
        </p>
      </article>
    </main>
  );
}
