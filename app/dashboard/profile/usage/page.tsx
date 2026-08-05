import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireSession } from '@/lib/auth/guards';
import { createClient } from '@/lib/supabase/server';
import { getEntitlements, canCreateProperty } from '@/lib/billing/entitlements';
import { getConversationUsage } from '@/lib/billing/usage';
import { CONVERSATION_OVERAGE_USD, PLANS, type PlanId } from '@/lib/constants';

export const dynamic = 'force-dynamic';

/**
 * Usage against the plan, split out of the billing section so "what am I using"
 * is answerable without scrolling through plan cards.
 *
 * Owner-only for the same reason billing is: it is account spend.
 */
export default async function ProfileUsagePage() {
  const ctx = await requireSession();
  if (ctx.account.owner_id !== ctx.user.id) redirect('/dashboard/profile');

  const supabase = createClient();
  const [ent, gate, usage] = await Promise.all([
    getEntitlements(supabase, ctx.account.id),
    canCreateProperty(supabase, ctx.account.id),
    getConversationUsage(supabase, ctx.account.id),
  ]);

  const planName = ent.planId ? PLANS[ent.planId as PlanId].name : null;
  const propertyPercent = ent.propertyLimit > 0
    ? Math.min(100, Math.round((gate.used / ent.propertyLimit) * 100))
    : 0;

  return (
    <section>
      <h2 style={{ fontSize: '1.15rem', marginTop: 0 }}>Usage</h2>
      <p className="muted" style={{ fontSize: '.88rem', maxWidth: 560 }}>
        {planName
          ? `Where you stand on the ${planName} plan this period.`
          : 'Where you stand this period.'}{' '}
        Allowances are pooled across your whole account, never per property.
      </p>

      <div className="card" style={{ padding: '1.25rem', maxWidth: 620, marginBottom: '1rem' }}>
        <strong style={{ fontSize: '.95rem' }}>Properties</strong>
        <p style={{ margin: '.35rem 0 .5rem', fontSize: '.9rem' }}>
          {gate.used} of {ent.propertyLimit} used
        </p>
        <Meter percent={propertyPercent} />
        {!gate.ok && (
          <p className="muted" style={{ fontSize: '.82rem', margin: '.6rem 0 0' }}>
            You are at your property limit.{' '}
            <Link href="/dashboard/profile/billing">Move up a plan</Link> to add another.
          </p>
        )}
      </div>

      {/* usage.used is -1 when the count could not be read. That must never render
          as "0 conversations used", which would look like a working meter honestly
          reporting no activity. */}
      {ent.active && usage.allowance > 0 ? (
        <div className="card" style={{ padding: '1.25rem', maxWidth: 620 }}>
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
              <Meter percent={usage.percentUsed ?? 0} />
              <p className="faint" style={{ fontSize: '.78rem', margin: '.5rem 0 0' }}>
                Beyond your allowance, conversations are ${CONVERSATION_OVERAGE_USD.toFixed(2)}
                {' '}each. We slow the concierge down rather than cutting your guests off.
              </p>
            </>
          )}
        </div>
      ) : (
        <div className="card" style={{ padding: '1.25rem', maxWidth: 620 }}>
          <strong style={{ fontSize: '.95rem' }}>Guest conversations</strong>
          <p className="muted" style={{ fontSize: '.85rem', margin: '.35rem 0 0' }}>
            A conversation allowance starts with your plan.{' '}
            <Link href="/dashboard/profile/billing">See plans</Link>.
          </p>
        </div>
      )}
    </section>
  );
}

function Meter({ percent }: { percent: number }) {
  const pct = Math.max(0, Math.min(100, percent));
  return (
    <div
      aria-hidden="true"
      style={{ height: 6, borderRadius: 999, background: 'var(--border)', overflow: 'hidden' }}
    >
      <div
        style={{
          height: '100%',
          width: `${pct}%`,
          background: pct >= 100 ? 'var(--coral)' : 'var(--teal)',
          borderRadius: 999,
        }}
      />
    </div>
  );
}
