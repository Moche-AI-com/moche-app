import Link from 'next/link';
import { requirePropertyAccess } from '@/lib/auth/guards';
import { createClient } from '@/lib/supabase/server';
import { LifecycleToggle, parseLifecycleView, lifecycleStatusFor } from '@/components/dashboard/LifecycleToggle';
import { GuestChatInbox } from '../guest-chat/GuestChatInbox';

export const dynamic = 'force-dynamic';

// Property Inbox: every guest conversation for the property in one place —
// answering guests, handling escalations, and tracking extras requests. Threads
// open on their own conversation page. The Active/Past switch scopes the list by
// the stay's lifecycle and lives in the URL, so it survives refresh and shares
// (see LifecycleToggle). A ?stay=<id> deep link narrows the inbox to one party.
export default async function PropertyInboxPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: { view?: string | string[]; stay?: string | string[] };
}) {
  const propertyId = (await params).id;
  const access = await requirePropertyAccess(propertyId);
  const view = parseLifecycleView(searchParams?.view);
  const stayFilter = typeof searchParams?.stay === 'string' ? searchParams.stay : null;

  // Mirrors the guest-chats API gate: the inbox is for roles that answer guests.
  const canManage = access.can.replyGuests || access.isOwner;
  if (!canManage) {
    return (
      <div>
        <div className="alert alert-error" style={{ marginTop: '1rem' }}>You do not have permission to view guest chats.</div>
      </div>
    );
  }

  // Announcements only make sense to guests who are still on the books, so the
  // composer stays on the Active view (and off single-stay deep links).
  const canAnnounce =
    (access.isOwner || (access.member as { can_send_announcements?: boolean } | null)?.can_send_announcements === true) &&
    view === 'active' &&
    !stayFilter;

  const supabase = createClient();
  const [{ data: stayRows }, { data: convoRows }, { data: filteredStay }] = await Promise.all([
    supabase.from('stays').select('id, lifecycle_status').eq('property_id', propertyId).is('deleted_at', null),
    supabase.from('conversations').select('id, stay_id').eq('property_id', propertyId).in('channel', ['host_chat', 'announcement']),
    stayFilter
      ? supabase.from('stays').select('id, guest_display_name').eq('id', stayFilter).eq('property_id', propertyId).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  // Toggle counts: conversations bucketed by their stay's lifecycle. Threads
  // with no stay (property-level chats) count as active.
  const lifecycleByStayId = new Map((stayRows ?? []).map((stay) => [stay.id, stay.lifecycle_status ?? 'active']));
  let activeCount = 0;
  let pastCount = 0;
  for (const convo of convoRows ?? []) {
    const lifecycle = convo.stay_id ? lifecycleByStayId.get(convo.stay_id) ?? 'active' : 'active';
    if (lifecycle === 'archived') pastCount += 1;
    else activeCount += 1;
  }

  return (
    <div>
      <h1 style={{ fontSize: '1.8rem', margin: '.5rem 0 .35rem' }}>Property Inbox</h1>
      <p className="muted" style={{ fontSize: '.9rem', margin: '0 0 1.25rem' }}>
        {stayFilter
          ? `Showing the conversation for ${(filteredStay as { guest_display_name?: string } | null)?.guest_display_name ?? 'this stay'}.`
          : view === 'past'
            ? 'Threads from completed and revoked stays.'
            : 'Every guest conversation for this property — answer guests, handle escalations, and track extras requests.'}
      </p>

      {stayFilter ? (
        <p style={{ margin: '0 0 1rem' }}>
          <Link href={`/dashboard/properties/${propertyId}/inbox`} className="dash-panel-link" style={{ marginTop: 0 }}>
            ← All conversations
          </Link>
        </p>
      ) : (
        <LifecycleToggle
          basePath={`/dashboard/properties/${propertyId}/inbox`}
          view={view}
          activeCount={activeCount}
          pastCount={pastCount}
          ariaLabel="Filter conversations by stay status"
        />
      )}

      <GuestChatInbox
        propertyId={propertyId}
        stayId={stayFilter}
        view={lifecycleStatusFor(view)}
        canAnnounce={canAnnounce}
      />
    </div>
  );
}
