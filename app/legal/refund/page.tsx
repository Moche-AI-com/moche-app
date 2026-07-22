import { LegalDocHeader } from '@/components/legal/LegalDocHeader';

export default function RefundPage() {
  return (
    <article>
      <LegalDocHeader slug="refund" />

      <p>
        This policy explains how subscription billing, cancellations, refunds, and failed payments
        work. It complements our <a href="/legal/terms">Terms of Service</a> and matches how the
        Service handles Stripe billing events.
      </p>

      <h2>1. Plans &amp; renewal</h2>
      <p>
        Subscriptions are billed in advance on a monthly or annual basis via Stripe and renew
        automatically until cancelled. Applicable taxes may be added at checkout.
      </p>

      <h2>2. Monthly plans</h2>
      <p>
        You may cancel at any time. Cancellation stops future renewals; your access continues until
        the end of the current billing period. Monthly fees are <strong>not prorated</strong> and
        past periods are non-refundable.
      </p>

      <h2>3. Annual plans</h2>
      <p>
        Annual plans include a <strong>14-day refund window</strong> from the start of the term,
        provided the Service has not been materially used. After 14 days, annual fees are
        non-refundable, though you keep access through the paid term.
      </p>

      <h2>4. Failed payments, grace period &amp; dunning</h2>
      <p>
        If a renewal payment fails, your subscription enters a <strong>past-due grace period</strong>
        during which the AI concierge continues to operate. We retry the payment on Stripe&rsquo;s
        schedule. If a subsequent payment succeeds, your subscription automatically returns to
        active. If retries are exhausted, the subscription becomes <strong>unpaid</strong> and guest
        AI access is suspended until billing is resolved.
      </p>

      <h2>5. Guest AI availability during billing issues</h2>
      <p>
        Guest concierge access remains available while a subscription is <em>trialing</em>,
        <em> active</em>, or <em>past due</em> (grace). It is paused when a subscription is
        <em> unpaid</em>, <em>cancelled</em>, or <em>expired</em>. During a pause, guests see a
        polite &ldquo;temporarily unavailable&rdquo; message rather than an error.
      </p>

      <h2>6. Chargebacks</h2>
      <p>
        Please contact <a href="/legal/support">support</a> before initiating a chargeback so we can
        resolve billing issues directly. Chargebacks may result in suspension of the account pending
        resolution.
      </p>

      <h2>7. How to cancel</h2>
      <p>
        Manage or cancel your subscription from <em>Dashboard &rarr; Billing</em>, or contact
        support for help.
      </p>
    </article>
  );
}
