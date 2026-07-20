import { requireSession } from '@/lib/auth/guards';
import { createClient } from '@/lib/supabase/server';
import { getEntitlements, canCreateProperty } from '@/lib/billing/entitlements';
import { PLANS, ACTIVATION_FEE_USD } from '@/lib/constants';
import { serverEnv } from '@/lib/env';
import { BillingActions } from './BillingActions';

export const dynamic = 'force-dynamic';

export default async function BillingPage() {
  const ctx = await requireSession();
  const supabase = createClient();
  const [ent, gate] = await Promise.all([
    getEntitlements(supabase, ctx.account.id),
    canCreateProperty(supabase, ctx.account.id),
  ]);

  const billingConfigured = !!serverEnv.stripeSecretKey;
  const currentPlan = ent.planId;

  return (
    <div>
      <div style={{ marginBottom: '1.5rem' }}>
        <h1 style={{ fontSize: '1.8rem' }}>Billing &amp; plan</h1>
        <p className="muted" style={{ fontSize: '.9rem' }}>
          {ent.active && currentPlan
            ? `You're on the ${PLANS[currentPlan].name} plan.`
            : 'You&rsquo;re on the free tier (1 property).'}{' '}
          Using {gate.used} of {ent.propertyLimit} properties.
        </p>
      </div>

      {ent.active && ent.currentPeriodEnd ? (
        <div className="card" style={{ padding: '1rem 1.25rem', marginBottom: '1.5rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '.75rem' }}>
            <div>
              <strong>{currentPlan ? PLANS[currentPlan].name : 'Active'}</strong>{' '}
              <span className="badge badge-teal">{ent.status}</span>
              <p className="faint" style={{ fontSize: '.8rem', margin: '.25rem 0 0' }}>
                {ent.cancelAtPeriodEnd ? 'Cancels' : 'Renews'} on{' '}
                {new Date(ent.currentPeriodEnd).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
              </p>
            </div>
            <BillingActions mode="portal" configured={billingConfigured} />
          </div>
        </div>
      ) : null}

      {!billingConfigured ? (
        <div className="alert alert-info" style={{ marginBottom: '1.5rem' }}>
          Billing is not yet connected. Add your Stripe keys in the environment to enable checkout and plan management. Plan details below are accurate; the buttons activate once Stripe is configured.
        </div>
      ) : null}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(260px,1fr))', gap: '1rem' }}>
        {(Object.keys(PLANS) as (keyof typeof PLANS)[]).map((id) => {
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
              <p style={{ margin: '0 0 .1rem' }}>
                <strong style={{ fontSize: '1.9rem' }}>${plan.monthly}</strong>
                <span className="muted" style={{ fontSize: '.85rem' }}>/mo</span>
              </p>
              <p className="faint" style={{ fontSize: '.78rem', margin: '0 0 1rem' }}>
                or ${plan.annual}/yr &middot; up to {plan.propertyLimit} propert{plan.propertyLimit === 1 ? 'y' : 'ies'}
              </p>
              <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 1.25rem', display: 'flex', flexDirection: 'column', gap: '.4rem' }}>
                {plan.features.map((f) => (
                  <li key={f} className="muted" style={{ fontSize: '.85rem', display: 'flex', gap: '.5rem', alignItems: 'flex-start' }}>
                    <span style={{ color: 'var(--teal)' }}>&#10003;</span> {f}
                  </li>
                ))}
              </ul>
              <BillingActions mode="checkout" planId={id} isCurrent={isCurrent} configured={billingConfigured} />
            </div>
          );
        })}
      </div>

      <p className="faint" style={{ fontSize: '.78rem', marginTop: '1.25rem' }}>
        A one-time ${ACTIVATION_FEE_USD} activation fee covers onboarding and initial Property Brain setup. Prices in USD.
      </p>
    </div>
  );
}
