import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Trial Terms',
  description:
    'How the Moche-AI free trial works: what happens after the trial, price, billing, automatic renewal, and how to cancel.',
};

// Figures below (trial length, property cap) are confirmed against the billing source
// of truth: FOUNDING_TRIAL_DAYS and FOUNDING_TRIAL_PROPERTY_LIMIT in lib/constants.ts.
// Post-trial pricing is per property and follows the pitch-deck grid (Essentials
// $29/property/mo, Pro $49/property/mo; Portfolio and Enterprise by contract). The
// full authoritative billing policy lives at /legal/refund and /legal/terms.
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
          The price charged after the trial is the plan price shown at signup
          and on our pricing page at the time you started the trial, billed per
          property per month. Applicable taxes may be added at checkout. Prices
          may change with notice as described in the Terms of Service.
        </p>
        <p>
          Optional guided setup — a white-glove onboarding where our team builds
          your Property Brain with you — is $149 per property, one time, and is
          arranged separately with our team. Self-service onboarding is always
          included at no cost.
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
