import { requirePropertyAccess } from '@/lib/auth/guards';
import { createClient } from '@/lib/supabase/server';
import { LifecycleToggle, parseLifecycleView, lifecycleStatusFor } from '@/components/dashboard/LifecycleToggle';
import { StaysManager } from './StaysManager';

export const dynamic = 'force-dynamic';

export default async function StaysPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: { view?: string | string[] };
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

  return (
    <div>
      <h1 style={{ fontSize: '1.8rem', margin: '.5rem 0 .35rem' }}>Stays</h1>
      <p className="muted" style={{ fontSize: '.9rem', margin: '0 0 1.25rem' }}>
        {view === 'past'
          ? 'Completed and revoked stays. Their guest links no longer work.'
          : 'Upcoming and in-progress stays. These guests can reach the concierge.'}
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
    </div>
  );
}
