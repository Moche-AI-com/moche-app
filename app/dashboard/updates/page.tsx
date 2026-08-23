import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireSession } from '@/lib/auth/guards';
import { createClient } from '@/lib/supabase/server';
import { resolveScope } from '@/lib/dashboard/scope';
import {
  AI_UPDATES_LABEL,
  propertyAiUpdatesHref,
  resolveAiUpdatesView,
} from '@/lib/brain/ai-updates';

export const dynamic = 'force-dynamic';

/**
 * The account-wide AI Updates roll-up — an index, not a manager (§3, §9).
 *
 * What changed and why. This page used to be the only place AI-drafted knowledge
 * could be approved, under the name "Knowledge Queue". Two problems: the surface
 * had two names (route "updates", heading "Knowledge Queue"), and a host who was
 * already inside a property's Brain had to leave it, decide, and come back. Both
 * are fixed by making the decision surface a per-property tab.
 *
 * Why the route still exists. The directive's §9 rules out a global Updates
 * *tab*, and that tab is gone from the primary nav. The route is kept because
 * things point at it — bookmarks, the dashboard tile, notification deep-links,
 * the listing-import panel — and because the original argument for an
 * account-wide view was sound as far as it went: a host with eight properties
 * should not open eight pages to learn whether anything is waiting. So this page
 * answers exactly that question and then hands off. It counts and links. It
 * renders no approve, edit, or decline control, which is asserted by
 * test/ai-updates-surface.test.ts so it cannot quietly grow back into a second
 * manager.
 *
 * Deliberate deviation from a literal reading of §9, flagged in the PR.
 */
export default async function AiUpdatesRollupPage({
  searchParams,
}: {
  searchParams?: { view?: string | string[]; property?: string | string[] };
}) {
  const view = resolveAiUpdatesView(searchParams?.view);
  const requestedProperty = Array.isArray(searchParams?.property)
    ? searchParams?.property[0]
    : searchParams?.property;

  const ctx = await requireSession();
  const supabase = createClient();

  const { data: properties } = await supabase
    .from('properties')
    .select('id, display_name')
    .eq('host_account_id', ctx.account.id)
    .is('deleted_at', null)
    .order('display_name', { ascending: true });

  const allPropIds = (properties ?? []).map((p) => p.id);

  // The ?property deep-link is resolved against the caller's already-authorized
  // property list, so an arbitrary id in the URL narrows at most — it can never
  // widen scope or reach another account's rows. A resolved id means the caller
  // asked for one property, which is what the per-property tab is for.
  const scopedPropertyId = resolveScope(requestedProperty, allPropIds);
  if (scopedPropertyId) redirect(propertyAiUpdatesHref(scopedPropertyId, view));
  const scopeMismatch = Boolean(requestedProperty);

  // One query, tallied here rather than per property, so the page cost does not
  // scale with the number of properties. Only pending rows are counted: this page
  // exists to answer "is anything waiting", and reviewed history belongs in the
  // property that owns it.
  const { data: pendingRows } = allPropIds.length
    ? await supabase
        .from('proposed_updates')
        .select('property_id, created_at')
        .in('property_id', allPropIds)
        .eq('status', 'pending')
        .limit(2000)
    : { data: [] };

  const tally = new Map<string, { pending: number; oldest: string }>();
  for (const row of pendingRows ?? []) {
    const current = tally.get(row.property_id);
    if (!current) tally.set(row.property_id, { pending: 1, oldest: row.created_at });
    else {
      current.pending += 1;
      if (row.created_at < current.oldest) current.oldest = row.created_at;
    }
  }

  const waiting = (properties ?? [])
    .map((p) => ({ ...p, ...(tally.get(p.id) ?? { pending: 0, oldest: '' }) }))
    .filter((p) => p.pending > 0)
    .sort((a, b) => b.pending - a.pending);

  const total = waiting.reduce((sum, p) => sum + p.pending, 0);

  return (
    <div>
      <div style={{ marginBottom: '1.1rem' }}>
        <h1 style={{ fontSize: '1.5rem', margin: '0 0 .3rem' }}>{AI_UPDATES_LABEL} across your properties</h1>
        <p className="muted" style={{ margin: 0, fontSize: '.92rem' }}>
          When the assistant reads a listing page, a document, or an escalation thread, it drafts the details for review
          first. Nothing reaches your guests until you approve it. Open a property to read and decide.
        </p>
        {scopeMismatch && (
          <p className="muted" style={{ margin: '.55rem 0 0', fontSize: '.85rem' }} data-testid="queue-scope-invalid">
            That property link is no longer available to you, so every property is shown instead.
          </p>
        )}
      </div>

      {waiting.length === 0 ? (
        <div className="card" style={{ padding: '2rem', textAlign: 'center' }} data-testid="ai-updates-rollup-empty">
          <p className="muted" style={{ margin: 0 }}>
            Nothing waiting on you. Suggestions appear here when the assistant drafts a change to one of your Brains.
          </p>
        </div>
      ) : (
        <>
          <p className="faint" style={{ fontSize: '.85rem', margin: '0 0 .7rem' }} data-testid="ai-updates-rollup-total">
            {total} suggestion{total === 1 ? '' : 's'} across {waiting.length} propert{waiting.length === 1 ? 'y' : 'ies'}.
          </p>
          <div style={{ display: 'grid', gap: '.6rem' }}>
            {waiting.map((p) => (
              <Link
                key={p.id}
                href={propertyAiUpdatesHref(p.id)}
                className="card"
                data-testid="ai-updates-rollup-row"
                style={{
                  padding: '.9rem 1rem',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '.75rem',
                  minHeight: 44,
                  textDecoration: 'none',
                  color: 'inherit',
                }}
              >
                <span style={{ minWidth: 0 }}>
                  <strong style={{ fontSize: '.95rem' }}>{p.display_name}</strong>
                  <span className="report-list-meta" style={{ display: 'block', margin: '.15rem 0 0' }}>
                    Oldest waiting since{' '}
                    {new Date(p.oldest).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                  </span>
                </span>
                <span className="badge badge-coral">
                  {p.pending} waiting
                </span>
              </Link>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
