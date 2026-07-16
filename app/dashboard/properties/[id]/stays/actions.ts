'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { requireSession, getPropertyAccess } from '@/lib/auth/guards';
import { stayCreateSchema } from '@/lib/validation';
import { hashContact } from '@/lib/crypto';
import { audit } from '@/lib/audit';
import { log } from '@/lib/log';

export interface StayActionState {
  error?: string;
  ok?: boolean;
}

// Host creates a stay. The guest's raw contact is hashed immediately and never stored raw;
// only contact_hash + last4 (for host display) are persisted.
export async function createStayAction(_prev: StayActionState, formData: FormData): Promise<StayActionState> {
  const propertyId = String(formData.get('propertyId') ?? '');
  const access = await getPropertyAccess(propertyId);
  if (!access) return { error: 'Property not found.' };
  // Owners and co-hosts with guest-reply permission can manage stays.
  if (!access.can.replyGuests && !access.isOwner) {
    return { error: 'You do not have permission to manage stays for this property.' };
  }

  const parsed = stayCreateSchema.safeParse({
    guestDisplayName: formData.get('guestDisplayName'),
    contact: formData.get('contact'),
    checkIn: formData.get('checkIn'),
    checkOut: formData.get('checkOut'),
    guestCount: Number(formData.get('guestCount') ?? 1),
    bookingReference: formData.get('bookingReference') ?? '',
    hostNotes: formData.get('hostNotes') ?? '',
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Please check the fields.' };
  }
  const d = parsed.data;

  // Validate date ordering.
  const checkIn = new Date(d.checkIn);
  const checkOut = new Date(d.checkOut);
  if (isNaN(checkIn.getTime()) || isNaN(checkOut.getTime())) return { error: 'Enter valid dates.' };
  if (checkOut <= checkIn) return { error: 'Check-out must be after check-in.' };

  const { contactHash, type, last4 } = hashContact(d.contact);
  const ctx = await requireSession();
  const supabase = createClient();

  // Determine initial status from dates.
  const now = new Date();
  const status = now < checkIn ? 'upcoming' : now > checkOut ? 'completed' : 'active';

  const { data: stay, error } = await supabase
    .from('stays')
    .insert({
      property_id: propertyId,
      guest_display_name: d.guestDisplayName,
      contact_hash: contactHash,
      contact_type: type,
      contact_last4: last4,
      check_in: checkIn.toISOString(),
      check_out: checkOut.toISOString(),
      guest_count: d.guestCount,
      booking_reference: d.bookingReference || null,
      host_notes: d.hostNotes || null,
      status,
      created_by: ctx.user.id,
    } as never)
    .select('id')
    .single();
  if (error || !stay) {
    log.warn('stay_create_failed', { propertyId, error: error?.message });
    return { error: 'Could not create the stay.' };
  }

  await audit(supabase, {
    action: 'stay.created',
    actorProfileId: ctx.user.id,
    hostAccountId: access.property.host_account_id,
    propertyId,
    targetType: 'stay',
    targetId: (stay as { id: string }).id,
  });
  revalidatePath(`/dashboard/properties/${propertyId}/stays`);
  return { ok: true };
}

// Revoke a stay's access immediately (revokes any active guest sessions too).
export async function revokeStayAction(formData: FormData): Promise<void> {
  const propertyId = String(formData.get('propertyId') ?? '');
  const stayId = String(formData.get('stayId') ?? '');
  const access = await getPropertyAccess(propertyId);
  if (!access || (!access.can.replyGuests && !access.isOwner)) return;
  const ctx = await requireSession();
  const supabase = createClient();

  await supabase.from('stays').update({ status: 'revoked' } as never).eq('id', stayId).eq('property_id', propertyId);
  await supabase
    .from('guest_access_sessions')
    .update({ status: 'revoked', revoked_at: new Date().toISOString() } as never)
    .eq('stay_id', stayId)
    .eq('property_id', propertyId);

  await audit(supabase, {
    action: 'stay.revoked',
    actorProfileId: ctx.user.id,
    hostAccountId: access.property.host_account_id,
    propertyId,
    targetType: 'stay',
    targetId: stayId,
  });
  revalidatePath(`/dashboard/properties/${propertyId}/stays`);
}
