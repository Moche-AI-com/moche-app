import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireSession } from '@/lib/auth/guards';
import { createClient } from '@/lib/supabase/server';
import { getEntitlements, canCreateProperty } from '@/lib/billing/entitlements';
import {
  PLANS,
  SALES_EMAIL,
  FOUNDING_ACCOUNT_CAP,
  FOUNDING_DISCOUNT_MONTHS,
  FOUNDING_DISCOUNT_PERCENT,
  GUIDED_SETUP_USD,
  GUIDED_SETUP_ADDITIONAL_USD,
  HOST_PRICING_BANDS,
  effectiveRatePerProperty,
  monthlyTotalForProperties,
  type PlanId,
} from '@/lib/constants';
import { serverEnv } from '@/lib/env';
import { BillingActions } from './BillingActions';

export const dynamic = 'force-dynamic';

function propertyRangeLabel(plan: (typeof PLANS)[PlanId]): string {
  const [min, max] = plan.propertyRange;
  if (!Number.isFinite(max)) return `${min}+ properties`;
  if (min === max) return min === 1 ? '1 property' : `${min} properties`;
  return `${min} to ${max} properties`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export default async function ProfileBillingPage() {
  const ctx = await requireSession();

  // Only the account owner manages billing. The checkout, portal, and refund
  // APIs already return 403 for everyone else, so this is not the security
  // boundary — it exists so an invited co-host who deep-links here gets sent
  // somewhere useful instead of a page of buttons that would all fail, and so
  // account spend stays with the person who owns it.
  // The profile shell already hides this section from a non-owner; this is the
  // real check, and it sends them somewhere useful instead of a page of buttons
  // whose APIs would every one of them return 403.
  if (ctx.account.owner_id !== ctx.user.id) redirect('/dashboard/profile');

  const supabase = createClient();
  const [ent, gate] = await Promise.all([
    getEntitlements(supabase, ctx.account.id),
    canCreateProperty(supabase, ctx.account.id),
  ]);

  const billingConfigured = !!serverEnv.stripeSecretKey;
  const currentPlan = ent.planId;
  const planIds = Object.keys(PLANS) as PlanId[];
  // An account with nothing added yet is quoted for one property rather than $0,
  // which would read as though the plan were free.
  const billableProperties = Math.max(1, gate.used);

  return (
    <div>
      <div style={{ marginBottom: '1.5rem' }}>
        <h2 style={{ fontSize: '1.15rem', marginTop: 0 }}>Billing and plan</h2>
        <p className="muted" style={{ fontSize: '.9rem' }}>
          {ent.trialing
            ? `You're on your Founding Member month, with top-tier features unlocked.`
            : ent.active && currentPlan
              ? `You're on the ${PLANS[currentPlan].name} plan.`
              : `You're on the free tier (1 property).`}{' '}
          Using {gate.used} of {ent.propertyLimit} properties.
        </p>
      </div>

      {/* Read-only degradation notice. The account keeps every byte of its data and
          guests can still read the static portal, but the AI concierge is paused, so
          the host needs to know exactly what to do about it. */}
      {ent.isReadOnly ? (
        <div className="alert alert-warn" style={{ marginBottom: '1.5rem' }}>
          <strong>Your account is in read-only mode.</strong> Your properties and Brain content
          are safe and untouched, and guests can still read your portal. The AI concierge is
          paused until you start a plan below. Nothing is deleted while you decide.
        </div>
      ) : null}

      {/* The founding offer, stated where the host is about to choose a plan. Shown
          only before there is a subscription, because that is exactly when checkout
          will attach it (see lib/billing/founding.ts). Deliberately hedged with "if
          you are among": the real cap is the Stripe coupon's max_redemptions, so
          this page cannot promise a seat it does not control. */}
      {!ent.active ? (
        <div className="alert alert-info" style={{ marginBottom: '1.5rem' }}>
          <strong>Founding host rate.</strong> If you are among the first{' '}
          {FOUNDING_ACCOUNT_CAP} accounts, {FOUNDING_DISCOUNT_PERCENT}% off is applied
          automatically at checkout and holds for your first {FOUNDING_DISCOUNT_MONTHS} months.
          There is no code to enter, and you can cancel at any point.
        </div>
      ) : null}

      {/* Defensive: no new subscription starts on a trial, but one that Stripe reports
          as trialing (a legacy row, or a subscription adjusted by hand in the Stripe
          dashboard) should still explain itself rather than show nothing. */}
      {ent.trialing && ent.trialEnd ? (
        <div className="alert alert-info" style={{ marginBottom: '1.5rem' }}>
          <strong>Your plan is in a trial period.</strong> Your card is already on file, so your
          plan continues automatically on {formatDate(ent.trialEnd)}. No second checkout, and you
          can cancel any time before then.
        </div>
      ) : null}

      {ent.active && ent.currentPeriodEnd ? (
        <div className="card" style={{ padding: '1rem 1.25rem', marginBottom: '1.5rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '.75rem' }}>
            <div>
              <strong>{currentPlan ? PLANS[currentPlan].name : 'Active'}</strong>{' '}
              <span className="badge badge-teal">{ent.status}</span>
              <p className="faint" style={{ fontSize: '.8rem', margin: '.25rem 0 0' }}>
                {ent.cancelAtPeriodEnd ? 'Cancels' : 'Renews'} on{' '}
                {formatDate(ent.currentPeriodEnd)}
              </p>
            </div>
            <div style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
              <BillingActions mode="portal" configured={billingConfigured} />
              <BillingActions mode="refund" configured={billingConfigured} />
            </div>
          </div>
        </div>
      ) : null}

      {!billingConfigured ? (
        <div className="alert alert-info" style={{ marginBottom: '1.5rem' }}>
          Billing is not yet connected. Add your Stripe keys in the environment to enable checkout and plan management. Plan details below are accurate; the buttons activate once Stripe is configured.
        </div>
      ) : null}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(260px,1fr))', gap: '1rem' }}>
        {planIds.map((id) => {
          const plan = PLANS[id];
          const isCurrent = currentPlan === id;
          const isFree = id === 'starter';
          return (
            <div
              key={id}
              className="card"
              style={{
                padding: '1.5rem 1.35rem',
                border: isCurrent ? '1px solid var(--teal)' : undefined,
                position: 'relative',
              }}
            >
              {isCurrent ? (
                <span className="badge badge-teal" style={{ position: 'absolute', top: '1rem', right: '1rem' }}>Current</span>
              ) : null}
              <h2 style={{ fontSize: '1.15rem', marginBottom: '.15rem' }}>{plan.name}</h2>
              {isFree ? (
                <>
                  {/* Free is the absence of a subscription, not a product. It has
                      no Stripe price and no checkout, so it gets neither a
                      per-property rate nor a Contact sales button: both would be
                      inviting the owner to buy something that does not exist. */}
                  <p style={{ margin: '0 0 .1rem' }}>
                    <strong style={{ fontSize: '1.9rem' }}>$0</strong>
                    <span className="muted" style={{ fontSize: '.85rem' }}>/mo</span>
                  </p>
                  <p className="faint" style={{ fontSize: '.78rem', margin: '0 0 1rem' }}>
                    {propertyRangeLabel(plan)} &middot; no card, no expiry
                  </p>
                </>
              ) : plan.selfServe ? (
                <>
                  {/* This card used to print `plan.monthly` as the flat rate for
                      every property. Under graduated bands that number is only
                      ever correct for a single-property account, so it showed
                      the owner of ten properties a figure less than a third of
                      their real bill. It now prices the portfolio they actually
                      have. */}
                  <p style={{ margin: '0 0 .1rem' }}>
                    <strong style={{ fontSize: '1.9rem' }}>
                      ${monthlyTotalForProperties(billableProperties).toLocaleString()}
                    </strong>
                    <span className="muted" style={{ fontSize: '.85rem' }}>/mo</span>
                  </p>
                  <p className="faint" style={{ fontSize: '.78rem', margin: '0 0 1rem' }}>
                    {billableProperties === 1
                      ? '1 property'
                      : `${billableProperties} properties`}{' '}
                    at ${effectiveRatePerProperty(billableProperties)} each on average
                    &middot; {propertyRangeLabel(plan)}
                  </p>
                </>
              ) : (
                <>
                  <p style={{ margin: '0 0 .1rem' }}>
                    <strong style={{ fontSize: '1.35rem' }}>Talk to us</strong>
                  </p>
                  <p className="faint" style={{ fontSize: '.78rem', margin: '0 0 1rem' }}>
                    {propertyRangeLabel(plan)} &middot; pricing agreed at contract
                  </p>
                </>
              )}
              <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 1.25rem', display: 'flex', flexDirection: 'column', gap: '.4rem' }}>
                {plan.features.map((f) => (
                  <li key={f} className="muted" style={{ fontSize: '.85rem', display: 'flex', gap: '.5rem', alignItems: 'flex-start' }}>
                    <span style={{ color: 'var(--teal)' }}>&#10003;</span> {f}
                  </li>
                ))}
              </ul>
              {isFree ? (
                <p className="faint" style={{ fontSize: '.8rem', margin: 0, minHeight: 44 }}>
                  {isCurrent
                    ? 'This is where you are now. Upgrade when you add a second property.'
                    : 'Cancel a paid plan to return here.'}
                </p>
              ) : plan.selfServe ? (
                <BillingActions
                  mode="checkout"
                  planId={id}
                  isCurrent={isCurrent}
                  configured={billingConfigured}
                  monthlyTotal={monthlyTotalForProperties(billableProperties)}
                />
              ) : (
                <a
                  className="btn btn-secondary"
                  style={{ display: 'block', textAlign: 'center', minHeight: 44, lineHeight: '44px' }}
                  href={`mailto:${SALES_EMAIL}?subject=${encodeURIComponent(`Moche-AI ${plan.name} enquiry`)}`}
                >
                  Contact sales
                </a>
              )}
            </div>
          );
        })}
      </div>

      <p className="faint" style={{ fontSize: '.78rem', marginTop: '1.25rem' }}>
        Watching your usage? See <Link href="/dashboard/profile/usage">Usage</Link>.
      </p>

      <p className="faint" style={{ fontSize: '.78rem', marginTop: '.5rem' }}>
        The Host plan is priced in bands, so each property you add costs less than the one
        before it: {`$${HOST_PRICING_BANDS[0].ratePerProperty}`} for your first, down to{' '}
        {`$${HOST_PRICING_BANDS[HOST_PRICING_BANDS.length - 1].ratePerProperty}`} each in the
        top band. Checkout bills the number of active properties on your account. Every plan
        includes unlimited guests, stays, and conversations, with no per-conversation
        charges. Optional Concierge Setup is ${GUIDED_SETUP_USD} for your first property and
        ${GUIDED_SETUP_ADDITIONAL_USD} for each one after that, one time per account;
        setting up yourself is self serve and included. Cancel anytime. Pay annually and you
        are billed ten months for twelve, so two months are free. Prices in USD.
      </p>
    </div>
  );
}
