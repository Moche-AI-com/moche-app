import type { Metadata } from 'next';
import Link from 'next/link';
import {
  PLANS,
  FOUNDING_ACCOUNT_CAP,
  FOUNDING_DISCOUNT_MONTHS,
  FOUNDING_DISCOUNT_PERCENT,
  LAUNCH_DATE_LABEL,
} from '@/lib/constants';

export const metadata: Metadata = {
  title: 'Founding Host Terms',
  description: 'How the Moche-AI founding discount, plan selection, renewal and cancellation work.',
};

export default function FoundingTermsPage() {
  return (
    <main className="wrap">
      <article>
        <h1>Founding Host Terms</h1>
        <p>
          This page summarizes the founding offer. The <Link href="/legal/terms">Terms of Service</Link>{' '}
          and <Link href="/legal/refund">Refund &amp; Billing Policy</Link> govern your subscription
          if there is a conflict. Review the price, any discount and applicable tax at checkout
          before you confirm a paid plan.
        </p>

        <h2>During the public beta</h2>
        <p>
          Moche-AI is in public beta until {LAUNCH_DATE_LABEL}. You can create a free account
          without a card, build one draft property and preview the guest portal and AI answers.
          Publishing a property for guests requires an active paid plan. Creating an account
          or selecting a plan on the landing page does not start a subscription or charge you.
        </p>

        <h2>Founding discount</h2>
        <p>
          If the offer is still available when you start your first eligible paid subscription,
          {` ${FOUNDING_DISCOUNT_PERCENT}%`} off applies automatically for the first{' '}
          {FOUNDING_DISCOUNT_MONTHS} months of paid billing. No promotion code is required.
          Availability is limited to the first {FOUNDING_ACCOUNT_CAP} eligible accounts that
          start a paid plan; signing up for Free does not reserve a discounted place.
          The discount and amount due are shown at checkout before you confirm payment.
        </p>
        <p>
          The discount period begins with the first eligible paid invoice and runs for{' '}
          {FOUNDING_DISCOUNT_MONTHS} consecutive months. Cancelling and resubscribing does not
          restart it. Once the discount ends, subsequent renewals use the then-applicable
          standard plan price, subject to the Terms of Service.
        </p>

        <h2>Plans and billing</h2>
        <p>
          Current self-serve plans are Starter ({`$${PLANS.starter.monthly}`}/month, up to{' '}
          {PLANS.starter.propertyLimit} live property), Pro ({`$${PLANS.pro.monthly}`}/month,
          up to {PLANS.pro.propertyLimit} live properties), and Portfolio
          ({`$${PLANS.portfolio.monthly}`}/month, up to {PLANS.portfolio.propertyLimit} live
          properties). Annual prices are ${PLANS.starter.annual}, ${PLANS.pro.annual}, and
          ${PLANS.portfolio.annual} respectively, billed in advance for the full year.
          Scale starts at ${PLANS.enterprise.monthly}/month with contracted terms; contact sales
          for the applicable price and included usage. Plan limits and current prices are also
          shown on the <Link href="/#pricing">pricing section</Link>.
        </p>
        <p>
          Paid subscriptions renew automatically on the selected monthly or annual cycle until
          cancelled. Prices are in USD; applicable taxes may be added at checkout. No
          per-property multiplier or setup fee is added to the self-serve plan price.
          Included AI conversation and outbound SMS allowances vary by plan and are shown
          before checkout. At launch, usage overages are tracked but not automatically charged.
        </p>

        <h2>Cancellation and support</h2>
        <p>
          You can manage or cancel a paid subscription from{' '}
          <Link href="/dashboard/profile/billing">Profile → Billing</Link>. Cancelling stops
          future renewals; access continues through the paid period, subject to the{' '}
          <Link href="/legal/refund">Refund &amp; Billing Policy</Link>. For questions about
          the founding offer, <Link href="/legal/support">contact support</Link>.
        </p>
      </article>
    </main>
  );
}
