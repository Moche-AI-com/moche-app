import { requireSession } from '@/lib/auth/guards';
import { createClient } from '@/lib/supabase/server';
import { knowledgeQueueHref } from '@/lib/dashboard/knowledge-queue-link';
import { resolveScope } from '@/lib/dashboard/scope';
import { UpdateQueueClient, type ProposalRow } from './UpdateQueueClient';

export const dynamic = 'force-dynamic';

/**
 * The Knowledge Queue: everything the AI has drafted, waiting on a human.
 *
 * Deliberately not called "Reviews" anywhere in the UI. To a short-term-rental
 * host a review is what a guest writes about them after checkout, and naming an
 * internal approval list after it sent hosts here looking for guest ratings.
 * The /dashboard/updates route predates the rename and is kept so existing
 * links, bookmarks, and notification deep-links do not break.
 *
 * A single account-wide page rather than a tab inside each property's Brain.
 * A host with eight properties should not have to visit eight pages to find out
 * whether anything is waiting, and the risk being managed here (unreviewed AI
 * output going live) is the same risk regardless of which property produced it.
 */
export default async function UpdatesPage({
  searchParams,
}: {
  searchParams?: { view?: string | string[]; property?: string | string[] };
}) {
  const raw = Array.isArray(searchParams?.view) ? searchParams?.view[0] : searchParams?.view;
  const view: 'pending' | 'reviewed' = raw === 'reviewed' ? 'reviewed' : 'pending';
  const requestedProperty = Array.isArray(searchParams?.property)
    ? searchParams?.property[0]
    : searchParams?.property;

  const ctx = await requireSession();
  const supabase = createClient();
  const isOwner = ctx.account.owner_id === ctx.user.id;

  const { data: properties } = await supabase
    .from('properties')
    .select('id, display_name')
    .eq('host_account_id', ctx.account.id)
    .is('deleted_at', null);

  const allPropIds = (properties ?? []).map((p) => p.id);
  const propertyNames = Object.fromEntries((properties ?? []).map((p) => [p.id, p.display_name]));

  // The ?property deep-link is resolved against the caller's already-authorized
  // property list, so an arbitrary id in the URL narrows the view at most — it
  // can never widen it or leak another account's rows into the counts below.
  const scopedPropertyId = resolveScope(requestedProperty, allPropIds);
  const propIds = scopedPropertyId ? [scopedPropertyId] : allPropIds;
  const scopeMismatch = Boolean(requestedProperty) && !scopedPropertyId;

  let rows: ProposalRow[] = [];
  let pendingCount = 0;
  let reviewedCount = 0;
  // Mirrors can_edit_property in the database: owner, or a member with brain
  // edit rights. Anything outside this set renders read-only rather than showing
  // buttons the API would reject.
  let manageable = new Set<string>(isOwner ? propIds : []);

  if (propIds.length) {
    const select =
      'id, property_id, field_path, label, status, proposed_value, original_value, applied_value, source_type, source_ref, confidence, resolution_note, reviewed_at, created_at';

    const [{ data }, pendingRes, reviewedRes] = await Promise.all([
      view === 'pending'
        ? supabase
            .from('proposed_updates')
            .select(select)
            .in('property_id', propIds)
            .eq('status', 'pending')
            // Oldest first: a suggestion that has waited a week is the one most
            // likely to be quietly rotting.
            .order('created_at', { ascending: true })
            .limit(200)
        : supabase
            .from('proposed_updates')
            .select(select)
            .in('property_id', propIds)
            .neq('status', 'pending')
            .order('reviewed_at', { ascending: false, nullsFirst: false })
            .limit(200),
      supabase
        .from('proposed_updates')
        .select('id', { count: 'exact', head: true })
        .in('property_id', propIds)
        .eq('status', 'pending'),
      supabase
        .from('proposed_updates')
        .select('id', { count: 'exact', head: true })
        .in('property_id', propIds)
        .neq('status', 'pending'),
    ]);

    rows = (data ?? []) as ProposalRow[];
    pendingCount = pendingRes.count ?? 0;
    reviewedCount = reviewedRes.count ?? 0;

    if (!isOwner) {
      const { data: members } = await supabase
        .from('property_members')
        .select('property_id, can_edit_brain')
        .in('property_id', propIds)
        .eq('profile_id', ctx.user.id);
      manageable = new Set((members ?? []).filter((m) => m.can_edit_brain).map((m) => m.property_id));
    }
  }

  return (
    <div>
      <div style={{ marginBottom: '1.1rem' }}>
        <h1 style={{ fontSize: '1.5rem', margin: '0 0 .3rem' }}>Knowledge Queue</h1>
        <p className="muted" style={{ margin: 0, fontSize: '.92rem' }}>
          When the assistant reads a listing page or a document, it drafts the details here first. Nothing reaches your
          guests until you approve it, and you can correct a draft before approving.
        </p>
        {scopedPropertyId && (
          <p style={{ margin: '.55rem 0 0', fontSize: '.85rem' }} data-testid="queue-scope-note">
            Showing <strong>{propertyNames[scopedPropertyId]}</strong> only.{' '}
            <a href={knowledgeQueueHref({ view })}>Show all properties</a>
          </p>
        )}
        {scopeMismatch && (
          <p className="muted" style={{ margin: '.55rem 0 0', fontSize: '.85rem' }} data-testid="queue-scope-invalid">
            That property link is no longer available to you, so the full account queue is shown instead.
          </p>
        )}
      </div>

      <div
        role="group"
        aria-label="Filter suggestions"
        style={{ display: 'flex', gap: '.4rem', marginBottom: '1rem', flexWrap: 'wrap' }}
      >
        <a
          href={knowledgeQueueHref({ propertyId: scopedPropertyId })}
          className={`btn btn-sm ${view === 'pending' ? 'btn-primary' : 'btn-ghost'}`}
          aria-current={view === 'pending' ? 'page' : undefined}
        >
          Waiting for you ({pendingCount})
        </a>
        <a
          href={knowledgeQueueHref({ propertyId: scopedPropertyId, view: 'reviewed' })}
          className={`btn btn-sm ${view === 'reviewed' ? 'btn-primary' : 'btn-ghost'}`}
          aria-current={view === 'reviewed' ? 'page' : undefined}
        >
          Reviewed ({reviewedCount})
        </a>
      </div>

      <UpdateQueueClient
        rows={rows}
        view={view}
        propertyNames={propertyNames}
        manageableProperties={[...manageable]}
      />
    </div>
  );
}
