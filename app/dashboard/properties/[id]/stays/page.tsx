import { requirePropertyAccess } from '@/lib/auth/guards';
import { createClient } from '@/lib/supabase/server';
import { LifecycleToggle, parseLifecycleView, lifecycleStatusFor } from '@/components/dashboard/LifecycleToggle';
import { listPropertySessions } from '@/lib/guest/sessions';
import { StaysManager } from './StaysManager';
import { SessionsPanel } from '../SessionsPanel';
import { ChatPermissionsPanel } from '../guest-chat/ChatPermissionsPanel';

export const dynamic = 'force-dynamic';

export default async function StaysPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: { view?: string | string[]; stay?: string | string[] };
}) {
  const view = parseLifecycleView(searchParams?.view);
  const access = await requirePropertyAccess((await params).id);
  const supabase = createClient();

  // deleted_at is filtered on every branch, including the counts: a soft-deleted
  // stay is gone, not "past", so it must not inflate either tab's badge.
  const [{ data: stays }, activeRes, pastRes] = await Promise.all([
    supabase
      .from('stays')
      .select('id, guest_display_name, contact_type, contact_last4, check_in, check_out, status, booking_reference')
      .eq('property_id', (await params).id)
      .is('deleted_at', null)
      .eq('lifecycle_status', lifecycleStatusFor(view))
      .order('check_in', { ascending: false }),
    supabase
      .from('stays')
      .select('id', { count: 'exact', head: true })
      .eq('property_id', (await params).id)
      .is('deleted_at', null)
      .eq('lifecycle_status', 'active'),
    supabase
      .from('stays')
      .select('id', { count: 'exact', head: true })
      .eq('property_id', (await params).id)
      .is('deleted_at', null)
      .eq('lifecycle_status', 'archived'),
  ]);

  const canManage = access.can.replyGuests || access.isOwner;
  // Same permission shape the guest-chat page used for announcements and
  // Brain-learning; the chat surface now lives inside this tab.
  const canAnnounce = access.isOwner || (access.member as any)?.can_send_announcements === true;
  const canLearn = access.isOwner || (access.member as any)?.can_publish_guest_answers === true;
  const canManagePermissions = access.isOwner || access.can.editProperty;
  // Deep links (notifications, legacy /guest-chat redirect) arrive as ?stay=<id>.
  const initialStayId = typeof searchParams?.stay === 'string' ? searchParams.stay : null;

  // Active guest sessions move here from the property overview: session hygiene
  // (lost devices, early checkouts) is part of running stays, not an overview widget.
  const sessions = canManage ? await listPropertySessions((await params).id, true) : [];

  return (
    <div>
      <h1 style={{ fontSize: '1.8rem', margin: '.5rem 0 .35rem' }}>Stays</h1>
      <p className="muted" style={{ fontSize: '.9rem', margin: '0 0 1.25rem' }}>
        {view === 'past'
          ? 'Completed and revoked stays. Their guest links no longer work.'
          : 'Upcoming and in-progress stays. Select a stay to manage its guest access and conversation.'}
      </p>

      <LifecycleToggle
        basePath={`/dashboard/properties/${(await params).id}/stays`}
        view={view}
        activeCount={activeRes.count ?? 0}
        pastCount={pastRes.count ?? 0}
        ariaLabel="Filter stays by status"
      />

      <StaysManager
        propertyId={(await params).id}
        canManage={canManage}
        canAnnounce={canAnnounce}
        canLearn={canLearn}
        initialStayId={initialStayId}
        stays={(stays ?? []).map((s) => ({
          id: s.id,
          guestDisplayName: s.guest_display_name,
          contactType: s.contact_type,
          contactLast4: s.contact_last4,
          checkIn: s.check_in,
          checkOut: s.check_out,
          status: s.status,
          bookingReference: s.booking_reference,
        }))}
      />

      {canManage ? <SessionsPanel propertyId={(await params).id} initialSessions={sessions} /> : null}

      {canManagePermissions ? (
        <div style={{ marginTop: '1.25rem' }}>
          <ChatPermissionsPanel propertyId={(await params).id} />
        </div>
      ) : null}
    </div>
  );
}
