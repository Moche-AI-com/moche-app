// The per-property AI Updates tab (§3).
//
// Why this is the primary surface, not /dashboard/updates: every decision here is
// about one property's knowledge, and the host is almost always already inside
// that property when they make it — they just imported a listing, or read an
// escalation thread that revealed the door code changed. Putting the queue in the
// property's own tab rail means approving a suggestion never costs a trip out to
// an account-level page and back. Nav order puts it directly after Brain because
// the two are the same job: Brain is what is known, AI Updates is what wants to
// change it.
//
// Host edits do not come here. A host who types a value into their own Brain has
// already made the decision; asking them to approve themselves is theatre. This
// queue is only for changes the host did not author — imports, document parses,
// and suggestions derived from escalation threads — which is exactly the set
// Boundary 4 requires a human to approve before it reaches the Brain.

import Link from 'next/link';
import { requirePropertyAccess } from '@/lib/auth/guards';
import { createClient } from '@/lib/supabase/server';
import {
  AI_UPDATES_BLURB,
  AI_UPDATES_LABEL,
  AI_UPDATES_ROW_LIMIT,
  AI_UPDATES_SELECT,
  aiUpdatesRollupHref,
  propertyAiUpdatesHref,
  resolveAiUpdatesView,
} from '@/lib/brain/ai-updates';
import { AiUpdatesQueue, type ProposalRow } from '@/components/dashboard/AiUpdatesQueue';

export const dynamic = 'force-dynamic';

export default async function PropertyAiUpdatesPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ view?: string }>;
}) {
  const propertyId = (await params).id;
  const access = await requirePropertyAccess(propertyId);
  const view = resolveAiUpdatesView((await searchParams).view);

  // Request-scoped client, so RLS decides visibility. A co-host who cannot see
  // this property cannot see its queue either, and the guard above has already
  // redirected anyone without read access.
  const supabase = createClient();

  const base = supabase.from('proposed_updates').select(AI_UPDATES_SELECT).eq('property_id', propertyId);

  const [{ count: pendingCount }, { count: reviewedCount }, { data: rows }] = await Promise.all([
    supabase
      .from('proposed_updates')
      .select('id', { count: 'exact', head: true })
      .eq('property_id', propertyId)
      .eq('status', 'pending'),
    supabase
      .from('proposed_updates')
      .select('id', { count: 'exact', head: true })
      .eq('property_id', propertyId)
      .neq('status', 'pending'),
    view === 'pending'
      ? // Oldest first: the longest-waiting suggestion is the one most likely to
        // have gone stale, so it should be decided first.
        base.eq('status', 'pending').order('created_at', { ascending: true }).limit(AI_UPDATES_ROW_LIMIT)
      : base
          .neq('status', 'pending')
          .order('reviewed_at', { ascending: false, nullsFirst: false })
          .limit(AI_UPDATES_ROW_LIMIT),
  ]);

  const queueRows = (rows ?? []) as unknown as ProposalRow[];

  return (
    <div>
      <div style={{ marginBottom: '1rem' }}>
        <h1 style={{ fontSize: '1.5rem', margin: '0 0 .3rem' }}>{AI_UPDATES_LABEL}</h1>
        <p className="faint" style={{ fontSize: '.85rem', margin: 0 }}>
          {AI_UPDATES_BLURB}
        </p>
      </div>

      {!access.can.editBrain && (
        <div className="alert alert-info" style={{ marginBottom: '1rem' }} data-testid="ai-updates-readonly">
          You can read these suggestions but not approve them.
        </div>
      )}

      <div style={{ display: 'flex', gap: '.4rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
        <Link
          href={propertyAiUpdatesHref(propertyId)}
          className={`btn btn-sm ${view === 'pending' ? 'btn-primary' : 'btn-ghost'}`}
          style={{ minHeight: 44 }}
          aria-current={view === 'pending' ? 'page' : undefined}
        >
          Waiting on you ({pendingCount ?? 0})
        </Link>
        <Link
          href={propertyAiUpdatesHref(propertyId, 'reviewed')}
          className={`btn btn-sm ${view === 'reviewed' ? 'btn-primary' : 'btn-ghost'}`}
          style={{ minHeight: 44 }}
          aria-current={view === 'reviewed' ? 'page' : undefined}
        >
          Already decided ({reviewedCount ?? 0})
        </Link>
      </div>

      <AiUpdatesQueue
        rows={queueRows}
        view={view}
        propertyNames={{ [propertyId]: access.property.display_name }}
        showPropertyName={false}
        manageableProperties={access.can.editBrain ? [propertyId] : []}
        emptyPendingCopy="Nothing waiting for this property. Import a listing URL or paste a document on the Brain tab and the draft will land here."
      />

      <p className="faint" style={{ fontSize: '.8rem', marginTop: '1rem' }}>
        <Link href={aiUpdatesRollupHref()}>See what is waiting across all your properties</Link>
      </p>
    </div>
  );
}
