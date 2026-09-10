'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireSession, getPropertyAccess } from '@/lib/auth/guards';
import { stayCreateSchema } from '@/lib/validation';
import { hashContact } from '@/lib/crypto';
import { assertPublicUrl } from '@/lib/net/ssrf';
import { fetchIcalFeed, syncPropertyIcalFeed } from '@/lib/stays/ical-sync';
import { mintStayPortalAccess } from '@/lib/stays/mint-portal-access';
import { generateStayReference } from '@/lib/stays/reference';
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

  // The insert retries on a stay_reference unique collision (23505) with a
  // freshly drawn code — same allocation style as the visit-code loop in the
  // mint helper. A DB-side DEFAULT (migration stay_reference_default) covers
  // any insert path that does not set a reference explicitly.
  let stay: { id: string } | null = null;
  let insertError: string | null = null;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const { data, error } = await supabase
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
        stay_reference: generateStayReference(),
        created_by: ctx.user.id,
      } as never)
      .select('id')
      .single();
    if (!error && data) {
      stay = data as { id: string };
      break;
    }
    if ((error as { code?: string } | null)?.code === '23505') continue;
    insertError = error?.message ?? 'insert failed';
    break;
  }
  if (!stay) {
    log.warn('stay_create_failed', { propertyId, error: insertError ?? 'stay_reference collision retries exhausted' });
    return { error: 'Could not create the stay.' };
  }
  const stayId = stay.id;

  // Creating a stay auto-mints its portal link + 4-digit visit code in the same
  // action — no separate generate step. The mint lives in
  // lib/stays/mint-portal-access so the iCal importer mints identically.
  let portalCode: string | undefined;
  let portalUrl: string | undefined;
  let portalCodeExpiresAt: string | undefined;
  let portalError: string | undefined;
  try {
    const propertySlug = (access.property as { slug?: string | null }).slug;
    if (!propertySlug) throw new Error('property slug unavailable');
    const admin = createAdminClient();
    const minted = await mintStayPortalAccess(admin, {
      propertyId,
      stayId,
      propertySlug,
      checkOut,
      createdBy: ctx.user.id,
      hostAccountId: access.property.host_account_id,
    });
    portalCode = minted.code;
    portalUrl = minted.portalUrl;
    portalCodeExpiresAt = minted.codeExpiresAt;
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
  // guest_access_sessions and guest_access_links only carry a SELECT policy for
  // authenticated hosts — writes via the user-context client silently no-op under
  // RLS. Revocation must fail closed, so both writes go through the service role.
  const admin = createAdminClient();
  await admin
    .from('guest_access_sessions')
    .update({ status: 'revoked', revoked_at: new Date().toISOString() } as never)
    .eq('stay_id', stayId)
    .eq('property_id', propertyId);
  // Cancelling the stay also revokes any visit code minted for it (WS-1 lifecycle: fails
  // closed on reservation cancellation, not just on checkout or manual code revoke).
  await admin
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

export interface IcalActionState {
  error?: string;
  ok?: boolean;
  created?: number;
  updated?: number;
  revoked?: number;
}

// iCal stay import (issue #133, item 4): the host pastes their Airbnb/Vrbo
// calendar export URL once; the scheduled sync keeps stays current from then
// on. An empty URL disconnects the feed. The URL contains the platform's
// secret token — it is validated against the SSRF guard before saving and
// never rendered back to the client.
export async function saveIcalImportAction(formData: FormData): Promise<IcalActionState> {
  const propertyId = String(formData.get('propertyId') ?? '');
  const rawUrl = String(formData.get('icalUrl') ?? '').trim();
  const access = await getPropertyAccess(propertyId);
  if (!access) return { error: 'Property not found.' };
  if (!access.can.replyGuests && !access.isOwner) {
    return { error: 'You do not have permission to manage stays for this property.' };
  }

  const supabase = createClient();
  if (!rawUrl) {
    const { error } = await (supabase as any).from('properties').update({ ical_import_url: null }).eq('id', propertyId);
    if (error) return { error: 'Could not save. Please try again.' };
    revalidatePath(`/dashboard/properties/${propertyId}/stays`);
    return { ok: true };
  }
  if (!/^https:\/\//i.test(rawUrl)) return { error: 'Use the https calendar URL from your booking platform.' };
  try {
    await assertPublicUrl(rawUrl);
  } catch (guardError) {
    return { error: guardError instanceof Error ? guardError.message : 'That URL is not allowed.' };
  }
  const { error } = await (supabase as any).from('properties').update({ ical_import_url: rawUrl }).eq('id', propertyId);
  if (error) return { error: 'Could not save. Please try again.' };
  revalidatePath(`/dashboard/properties/${propertyId}/stays`);
  return { ok: true };
}

// Manual "sync now" — the same engine the scheduled task runs, on demand.
export async function syncIcalNowAction(formData: FormData): Promise<IcalActionState> {
  const propertyId = String(formData.get('propertyId') ?? '');
  const access = await getPropertyAccess(propertyId);
  if (!access) return { error: 'Property not found.' };
  if (!access.can.replyGuests && !access.isOwner) {
    return { error: 'You do not have permission to manage stays for this property.' };
  }
  const admin = createAdminClient();
  const { data: property } = await (admin as any)
    .from('properties')
    .select('id, slug, host_account_id, ical_import_url')
    .eq('id', propertyId)
    .maybeSingle();
  if (!property?.ical_import_url) return { error: 'Save a calendar URL first.' };
  try {
    const feed = await fetchIcalFeed(property.ical_import_url as string);
    const result = await syncPropertyIcalFeed(admin, {
      id: property.id as string,
      slug: property.slug as string,
      host_account_id: property.host_account_id as string,
    }, feed);
    revalidatePath(`/dashboard/properties/${propertyId}/stays`);
    return { ok: true, created: result.created, updated: result.updated, revoked: result.revoked };
  } catch (syncError) {
    return { error: syncError instanceof Error ? syncError.message : 'Could not sync the calendar.' };
  }
}
