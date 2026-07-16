import Link from 'next/link';
import { requirePropertyAccess } from '@/lib/auth/guards';
import { createClient } from '@/lib/supabase/server';
import { StaysManager } from './StaysManager';

export const dynamic = 'force-dynamic';

export default async function StaysPage({ params }: { params: { id: string } }) {
  const access = await requirePropertyAccess(params.id);
  const supabase = createClient();

  const { data: stays } = await supabase
    .from('stays')
    .select('id, guest_display_name, contact_type, contact_last4, check_in, check_out, status, booking_reference')
    .eq('property_id', params.id)
    .is('deleted_at', null)
    .order('check_in', { ascending: false });

  const canManage = access.can.replyGuests || access.isOwner;

  return (
    <div>
      <Link href={`/dashboard/properties/${params.id}`} className="muted" style={{ fontSize: '.85rem' }}>← {access.property.display_name}</Link>
      <h1 style={{ fontSize: '1.8rem', margin: '.5rem 0 1.5rem' }}>Stays</h1>
      <StaysManager
        propertyId={params.id}
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
