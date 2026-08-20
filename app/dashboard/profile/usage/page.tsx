import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireSession } from '@/lib/auth/guards';
import { createClient } from '@/lib/supabase/server';
import { getEntitlements, canCreateProperty } from '@/lib/billing/entitlements';
import { PLANS, type PlanId } from '@/lib/constants';

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
  const [ent, gate] = await Promise.all([
    getEntitlements(supabase, ctx.account.id),
    canCreateProperty(supabase, ctx.account.id),
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
          : 'Where you stand this period.'}
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

      {/* Conversations are unmetered on every plan (pitch-deck pricing, Aug 2026):
          no allowance to watch and no per-conversation fees. The pooled-allowance
          meter from PR #17 only renders when a plan carries a nonzero allowance,
          which none currently do. */}
      <div className="card" style={{ padding: '1.25rem', maxWidth: 620 }}>
        <strong style={{ fontSize: '.95rem' }}>Guest conversations</strong>
        <p className="muted" style={{ fontSize: '.85rem', margin: '.35rem 0 0' }}>
          Unlimited on every plan — there are no per-conversation charges.
        </p>
      </div>
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
