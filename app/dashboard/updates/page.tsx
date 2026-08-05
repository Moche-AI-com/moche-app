import { requireSession } from '@/lib/auth/guards';
import { createClient } from '@/lib/supabase/server';
import { UpdateQueueClient, type ProposalRow } from './UpdateQueueClient';

export const dynamic = 'force-dynamic';

/**
 * The review queue: everything the AI has drafted, waiting on a human.
 *
 * A single account-wide page rather than a tab inside each property's Brain.
 * A host with eight properties should not have to visit eight pages to find out
 * whether anything is waiting, and the risk being managed here (unreviewed AI
 * output going live) is the same risk regardless of which property produced it.
 */
export default async function UpdatesPage({ searchParams }: { searchParams?: { view?: string | string[] } }) {
  const raw = Array.isArray(searchParams?.view) ? searchParams?.view[0] : searchParams?.view;
  const view: 'pending' | 'reviewed' = raw === 'reviewed' ? 'reviewed' : 'pending';

  const ctx = await requireSession();
  const supabase = createClient();
  const isOwner = ctx.account.owner_id === ctx.user.id;

  const { data: properties } = await supabase
    .from('properties')
    .select('id, display_name')
    .eq('host_account_id', ctx.account.id)
    .is('deleted_at', null);

  const propIds = (properties ?? []).map((p) => p.id);
  const propertyNames = Object.fromEntries((properties ?? []).map((p) => [p.id, p.display_name]));

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
        <h1 style={{ fontSize: '1.5rem', margin: '0 0 .3rem' }}>Review queue</h1>
        <p className="muted" style={{ margin: 0, fontSize: '.92rem' }}>
          When the assistant reads a listing page or a document, it drafts the details here first. Nothing reaches your
          guests until you approve it, and you can correct a draft before approving.
        </p>
      </div>

      <div
        role="group"
        aria-label="Filter suggestions"
        style={{ display: 'flex', gap: '.4rem', marginBottom: '1rem', flexWrap: 'wrap' }}
      >
        <a
          href="/dashboard/updates"
          className={`btn btn-sm ${view === 'pending' ? 'btn-primary' : 'btn-ghost'}`}
          aria-current={view === 'pending' ? 'page' : undefined}
        >
          Waiting for you ({pendingCount})
        </a>
        <a
          href="/dashboard/updates?view=reviewed"
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
