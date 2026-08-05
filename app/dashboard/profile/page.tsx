import Link from 'next/link';
import { requireSession } from '@/lib/auth/guards';
import { createClient } from '@/lib/supabase/server';
import { getEntitlements, canCreateProperty } from '@/lib/billing/entitlements';
import { PLANS, type PlanId } from '@/lib/constants';
import { visibleProfileSections } from '@/lib/dashboard/profile-nav';

export const dynamic = 'force-dynamic';

/**
 * Profile overview (backlog P6-05).
 *
 * Answers "what is the state of my account" in one screen, then routes to the
 * section that can change it. Section cards are generated from the same registry
 * the left-nav uses, so the two can never disagree.
 */
export default async function ProfileOverviewPage() {
  const ctx = await requireSession();
  const isOwner = ctx.account.owner_id === ctx.user.id;
  const sections = visibleProfileSections(isOwner).filter((s) => s.key !== 'overview');

  const supabase = createClient();
  // Plan facts are owner-only; a member sees their own details without a spend
  // figure they cannot act on.
  const [ent, gate] = isOwner
    ? await Promise.all([
        getEntitlements(supabase, ctx.account.id),
        canCreateProperty(supabase, ctx.account.id),
      ])
    : [null, null];

  const planLabel = !ent
    ? null
    : ent.trialing
      ? 'Founding Member trial'
      : ent.planId
        ? PLANS[ent.planId as PlanId].name
        : 'Free tier';

  const facts: Array<{ label: string; value: string }> = [
    { label: 'Signed in as', value: ctx.profile.email },
    { label: 'Name', value: ctx.profile.full_name?.trim() || 'Not set yet' },
    {
      label: 'Phone',
      value: !ctx.profile.phone
        ? 'Not added'
        : ctx.profile.phone_verified_at
          ? `${ctx.profile.phone} (verified)`
          : `${ctx.profile.phone} (unverified)`,
    },
    { label: 'Two-factor', value: ctx.profile.two_factor_enabled ? 'On' : 'Off' },
    { label: 'Role', value: isOwner ? 'Account owner' : 'Invited member' },
  ];

  if (planLabel && ent && gate) {
    facts.push({ label: 'Plan', value: planLabel });
    facts.push({ label: 'Properties', value: `${gate.used} of ${ent.propertyLimit}` });
  }

  return (
    <section>
      <h2 style={{ fontSize: '1.15rem', marginTop: 0 }}>Overview</h2>

      {ent?.isReadOnly && (
        <div className="alert alert-warn" style={{ marginBottom: '1.25rem' }}>
          <strong>Your account is in read-only mode.</strong> Your properties and Brain content
          are safe, and guests can still read your portal. The concierge is paused until you
          start a plan. <Link href="/dashboard/profile/billing">Fix this in Billing</Link>.
        </div>
      )}

      {ctx.profile.phone && !ctx.profile.phone_verified_at && (
        <div className="alert alert-info" style={{ marginBottom: '1.25rem' }}>
          Your phone number is not verified yet, so urgent escalations cannot text you.{' '}
          <Link href="/dashboard/profile/security">Verify it</Link>.
        </div>
      )}

      <div className="card" style={{ padding: '1.25rem', maxWidth: 620, marginBottom: '1.5rem' }}>
        <dl
          style={{
            margin: 0,
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
            gap: '1rem',
          }}
        >
          {facts.map((f) => (
            <div key={f.label}>
              <dt className="faint" style={{ fontSize: '.75rem' }}>{f.label}</dt>
              <dd style={{ margin: '.15rem 0 0', fontSize: '.92rem' }}>{f.value}</dd>
            </div>
          ))}
        </dl>
      </div>

      <h3 style={{ fontSize: '1rem', marginBottom: '.75rem' }}>Everything in your account</h3>
      <ul
        style={{
          listStyle: 'none',
          margin: 0,
          padding: 0,
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
          gap: '.75rem',
        }}
      >
        {sections.map((s) => (
          <li key={s.key}>
            <Link
              href={s.href}
              className="card card-interactive"
              style={{ display: 'block', padding: '1rem 1.1rem', textDecoration: 'none' }}
              data-testid={`profile-card-${s.key}`}
            >
              <strong style={{ fontSize: '.95rem' }}>{s.label}</strong>
              <p className="muted" style={{ fontSize: '.83rem', margin: '.25rem 0 0' }}>
                {s.summary}
              </p>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
