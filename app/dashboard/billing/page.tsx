import { requireSession } from '@/lib/auth/guards';
import { createClient } from '@/lib/supabase/server';
import { getEntitlements, canCreateProperty } from '@/lib/billing/entitlements';
import { getConversationUsage } from '@/lib/billing/usage';
import {
  PLANS,
  SALES_EMAIL,
  FOUNDING_TRIAL_DAYS,
  FOUNDING_TRIAL_PROPERTY_LIMIT,
  CONVERSATION_OVERAGE_USD,
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

export default async function BillingPage() {
  const ctx = await requireSession();
  const supabase = createClient();
  const [ent, gate, usage] = await Promise.all([
    getEntitlements(supabase, ctx.account.id),
    canCreateProperty(supabase, ctx.account.id),
    getConversationUsage(supabase, ctx.account.id),
  ]);

  const billingConfigured = !!serverEnv.stripeSecretKey;
  const currentPlan = ent.planId;
  const planIds = Object.keys(PLANS) as PlanId[];

  return (
    <div>
      <div style={{ marginBottom: '1.5rem' }}>
        <h1 style={{ fontSize: '1.8rem' }}>Billing &amp; plan</h1>
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

      {ent.trialing && ent.trialEnd ? (
        <div className="alert alert-info" style={{ marginBottom: '1.5rem' }}>
          <strong>Founding Member trial.</strong> Your first {FOUNDING_TRIAL_DAYS} days are $0
          with top-tier features, up to {FOUNDING_TRIAL_PROPERTY_LIMIT} properties. Your card is
          already on file, so your plan continues automatically on {formatDate(ent.trialEnd)}. No
          second checkout, and you can cancel any time before then.
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

      {/* Pooled conversation usage. usage.used is -1 when the count could not be read,
          which must not render as "0 conversations used" — that would look like a
          working meter reporting no activity. */}
      {ent.active && usage.allowance > 0 ? (
        <div className="card" style={{ padding: '1rem 1.25rem', marginBottom: '1.5rem' }}>
          <strong style={{ fontSize: '.95rem' }}>Guest conversations this period</strong>
          {usage.used < 0 ? (
            <p className="muted" style={{ fontSize: '.85rem', margin: '.35rem 0 0' }}>
              Usage is temporarily unavailable. Your concierge is unaffected.
            </p>
          ) : (
            <>
              <p style={{ margin: '.35rem 0 .5rem', fontSize: '.9rem' }}>
                {usage.used.toLocaleString()} of {usage.allowance.toLocaleString()} included
                {usage.percentUsed !== null ? ` (${usage.percentUsed}%)` : ''}
              </p>
              <div
                aria-hidden="true"
                style={{ height: 6, borderRadius: 999, background: 'var(--border, #e5e7eb)', overflow: 'hidden' }}
              >
                <div
                  style={{
                    height: '100%',
                    width: `${Math.min(100, usage.percentUsed ?? 0)}%`,
                    background: 'var(--teal)',
                    borderRadius: 999,
                  }}
                />
              </div>
              <p className="faint" style={{ fontSize: '.78rem', margin: '.5rem 0 0' }}>
                Pooled across every property on your account. Beyond your allowance,
                conversations are ${CONVERSATION_OVERAGE_USD.toFixed(2)} each. We slow the
                concierge down rather than cutting your guests off.
              </p>
            </>
          )}
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
              {plan.selfServe ? (
                <>
                  <p style={{ margin: '0 0 .1rem' }}>
                    <strong style={{ fontSize: '1.9rem' }}>${plan.monthly}</strong>
                    <span className="muted" style={{ fontSize: '.85rem' }}>/mo</span>
                  </p>
                  <p className="faint" style={{ fontSize: '.78rem', margin: '0 0 .35rem' }}>
                    or ${plan.annual.toLocaleString()}/yr &middot; {propertyRangeLabel(plan)}
                  </p>
                  <p className="faint" style={{ fontSize: '.78rem', margin: '0 0 1rem' }}>
                    {plan.conversationAllowance.toLocaleString()} pooled conversations/mo
                  </p>
                </>
              ) : (
                <>
                  <p style={{ margin: '0 0 .1rem' }}>
                    <strong style={{ fontSize: '1.35rem' }}>Talk to us</strong>
                  </p>
                  <p className="faint" style={{ fontSize: '.78rem', margin: '0 0 1rem' }}>
                    {propertyRangeLabel(plan)} &middot; allowance agreed at contract
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
              {plan.selfServe ? (
                <BillingActions mode="checkout" planId={id} isCurrent={isCurrent} configured={billingConfigured} />
              ) : (
                <a
                  className="btn btn-secondary"
                  style={{ display: 'block', textAlign: 'center', minHeight: 44, lineHeight: '44px' }}
                  href={`mailto:${SALES_EMAIL}?subject=${encodeURIComponent(`Moche.AI ${plan.name} enquiry`)}`}
                >
                  Contact sales
                </a>
              )}
            </div>
          );
        })}
      </div>

      <p className="faint" style={{ fontSize: '.78rem', marginTop: '1.25rem' }}>
        No setup fees. Cancel anytime. Annual plans include two months free. Prices in USD.
        Conversation allowances are pooled across your whole account, not per property.
      </p>
    </div>
  );
}
