'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireSession, getPropertyAccess } from '@/lib/auth/guards';
import { stayCreateSchema } from '@/lib/validation';
import { hashContact, generateSessionToken, hashSessionToken, generateVisitCode, hashVisitCode, verifyVisitCode } from '@/lib/crypto';
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

// Alphabet for stay_reference excludes visually ambiguous characters (no 0/O,
// 1/I/L) so a reference read over the phone transcribes cleanly.
const STAY_REFERENCE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

/**
 * Human-quotable stay reference (Reports rework, #81): 'STY-' + 6 random chars,
 * unique across all stays via the stays_stay_reference_key index. Displayable
 * and filterable — unlike the 4-digit visit code, which stays hash-only.
 */
function generateStayReference(): string {
  const bytes = new Uint8Array(6);
  globalThis.crypto.getRandomValues(bytes);
  let ref = 'STY-';
  for (const b of bytes) ref += STAY_REFERENCE_ALPHABET[b % STAY_REFERENCE_ALPHABET.length];
  return ref;
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
  // freshly drawn code — same allocation style as the visit-code loop below.
  // A DB-side DEFAULT (migration stay_reference_default) covers any insert
  // path that does not set a reference explicitly.
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

    // One stay code (2026-08-24): the tokenless portal entry (/auth/code without
    // ?k=) resolves a bare code to one stay, so codes must be unique across the
    // property's concurrently coded links. Hashes are per-link salted, so
    // candidates are verified one by one until one is clear.
    const { data: siblingLinks } = await admin
      .from('guest_access_links')
      .select('id, code_hash')
      .eq('property_id', propertyId)
      .not('code_hash', 'is', null)
      .is('code_revoked_at', null)
      .gt('code_expires_at', new Date().toISOString());
    let code = '';
    for (let attempt = 0; attempt < 30; attempt += 1) {
      const candidate = generateVisitCode();
      const clash = (siblingLinks ?? []).some((sibling: any) =>
        verifyVisitCode(candidate, sibling.id as string, sibling.code_hash as string));
      if (!clash) {
        code = candidate;
        break;
      }
    }
    if (!code) throw new Error('could not allocate a unique visit code');

    const codeExpiresAt = new Date(checkOut.getTime() + VISIT_CODE_GRACE_PERIOD_HOURS * 60 * 60 * 1000).toISOString();
    const { error: codeError } = await admin
      .from('guest_access_links')
      .update({ code_hash: hashVisitCode(code, linkId), code_expires_at: codeExpiresAt } as never)
      .eq('id', linkId);
    if (codeError) {
      throw new Error(codeError.message);
    }

    // Ticket 2B: vault the code so it stays host-viewable for the life of the stay.
    // The hash remains the verification path; a Vault failure degrades to hash-only.
    try {
      const { data: secretId, error: vaultError } = await (admin as any).rpc('portal_code_store', {
        p_secret: code,
        p_name: `stay-link:${linkId}:${Date.now()}`,
      });
      if (!vaultError && secretId) {
        await admin
          .from('guest_access_links')
          .update({ code_secret_ref: `vault:${secretId}` } as never)
          .eq('id', linkId);
      }
    } catch {
      // Display-only enhancement — never fail the mint over it.
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
