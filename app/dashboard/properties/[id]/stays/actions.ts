'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireSession, getPropertyAccess } from '@/lib/auth/guards';
import { stayCreateSchema } from '@/lib/validation';
import { hashContact, generateSessionToken, hashSessionToken, generateVisitCode, hashVisitCode } from '@/lib/crypto';
import { publicEnv } from '@/lib/env';
import { DEFAULT_GRACE_PERIOD_HOURS, STAY_LINK_DEFAULT_MAX_REDEMPTIONS, VISIT_CODE_GRACE_PERIOD_HOURS } from '@/lib/constants';
import { audit } from '@/lib/audit';
import { log } from '@/lib/log';

export interface StayActionState {
  error?: string;
  ok?: boolean;
  stayId?: string;
  /** Raw 4-digit visit code — returned exactly once, never stored raw. */
  portalCode?: string;
  /** Full portal URL carrying the one-time token — returned exactly once. */
  portalUrl?: string;
  /** When the visit code stops working (check-out + grace). */
  portalCodeExpiresAt?: string;
  /** Set when the stay was created but its portal link/code could not be minted. */
  portalError?: string;
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
  const stayId = (stay as { id: string }).id;

  // Ticket 3: creating a stay auto-mints its portal link + 4-digit visit code in
  // the same action — no separate generate step. Hash-only storage is preserved:
  // the raw token and code are returned exactly once and never persisted. Expiry
  // math matches the manual mint route: the link/URL lives until check-out +
  // DEFAULT_GRACE_PERIOD_HOURS; the code fails closed at check-out +
  // VISIT_CODE_GRACE_PERIOD_HOURS.
  let portalCode: string | undefined;
  let portalUrl: string | undefined;
  let portalCodeExpiresAt: string | undefined;
  let portalError: string | undefined;
  try {
    const propertySlug = (access.property as { slug?: string | null }).slug;
    if (!propertySlug) throw new Error('property slug unavailable');
    const admin = createAdminClient();
    const token = generateSessionToken();
    const linkExpiresAt = new Date(checkOut.getTime() + DEFAULT_GRACE_PERIOD_HOURS * 60 * 60 * 1000).toISOString();
    const { data: link, error: linkError } = await admin
      .from('guest_access_links')
      .insert({
        property_id: propertyId,
        stay_id: stayId,
        token_hash: hashSessionToken(token),
        kind: 'stay',
        expires_at: linkExpiresAt,
        max_redemptions: STAY_LINK_DEFAULT_MAX_REDEMPTIONS,
        require_otp: false,
        created_by: ctx.user.id,
      } as never)
      .select('id')
      .single();
    if (linkError || !link) {
      throw new Error(linkError?.message ?? 'link insert failed');
    }
    const linkId = (link as { id: string }).id;
    const code = generateVisitCode();
    const codeExpiresAt = new Date(checkOut.getTime() + VISIT_CODE_GRACE_PERIOD_HOURS * 60 * 60 * 1000).toISOString();
    const { error: codeError } = await admin
      .from('guest_access_links')
      .update({ code_hash: hashVisitCode(code, linkId), code_expires_at: codeExpiresAt } as never)
      .eq('id', linkId);
    if (codeError) {
      throw new Error(codeError.message);
    }
    await audit(admin, {
      action: 'guest_link.code_issued',
      actorProfileId: ctx.user.id,
      hostAccountId: access.property.host_account_id,
      propertyId,
      targetType: 'guest_access_link',
      targetId: linkId,
    });
    portalCode = code;
    portalUrl = `${publicEnv.appUrl.replace(/\/$/, '')}/stay/${propertySlug}?k=${token}`;
    portalCodeExpiresAt = codeExpiresAt;
  } catch (mintError) {
    // The stay itself is already durable — never fail its creation because the
    // portal mint failed. The host can mint from the stay's Guest access pane.
    log.warn('stay_portal_automint_failed', { propertyId, stayId, error: mintError instanceof Error ? mintError.message : String(mintError) });
    portalError = 'Stay created, but the portal link could not be minted automatically — use the Guest access panel to create it.';
  }

  await audit(supabase, {
    action: 'stay.created',
    actorProfileId: ctx.user.id,
    hostAccountId: access.property.host_account_id,
    propertyId,
    targetType: 'stay',
    targetId: stayId,
  });
  revalidatePath(`/dashboard/properties/${propertyId}/stays`);
  return { ok: true, stayId, portalCode, portalUrl, portalCodeExpiresAt, portalError };
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
  // Cancelling the stay also revokes any visit code minted for it (WS-1 lifecycle: fails
  // closed on reservation cancellation, not just on checkout or manual code revoke).
  await supabase
    .from('guest_access_links')
    .update({ code_revoked_at: new Date().toISOString() } as never)
    .eq('stay_id', stayId)
    .eq('property_id', propertyId)
    .not('code_hash', 'is', null)
    .is('code_revoked_at', null);

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
