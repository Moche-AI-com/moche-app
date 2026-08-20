import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/admin';
import { getGuestSession } from '@/lib/guest/session';
import { hashContact } from '@/lib/crypto';
import { checkRateLimit } from '@/lib/rate-limit';
import { log } from '@/lib/log';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Guest registration (portal v2). Runs after the 4-digit access code has
// established a verified session. First/last name and phone are required;
// notification consent is optional and never blocks registration.
//
// PII posture matches the existing stack: the phone number is stored on the
// identity only as HMAC hash + last4; the plaintext number lands only on the
// guest's own session row (used for notification delivery when consented).
const registerSchema = z.object({
  firstName: z.string().trim().min(1, 'First name is required.').max(80),
  lastName: z.string().trim().min(1, 'Last name is required.').max(80),
  phone: z.string().trim().min(7, 'Enter a valid phone number.').max(40),
  notificationConsent: z.boolean().optional().default(false),
});

function clientIp(req: Request): string {
  const xff = req.headers.get('x-forwarded-for');
  if (xff) return xff.split(',')[0].trim();
  return req.headers.get('x-real-ip') ?? '0.0.0.0';
}

export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const session = await getGuestSession();
  if (!session) return NextResponse.json({ error: 'Session expired.' }, { status: 401 });

  const admin = createAdminClient();
  const { data: property } = await admin
    .from('properties')
    .select('id, slug, host_account_id')
    .eq('id', session.propertyId)
    .maybeSingle();
  if (!property || property.slug !== (await params).slug) {
    return NextResponse.json({ error: 'Not found.' }, { status: 404 });
  }

  const ip = clientIp(req);
  const rl = await checkRateLimit(admin, {
    key: `guest_register:${session.stayId}:${ip}`,
    limit: 10,
    windowSeconds: 3600,
    action: 'guest.register',
  });
  if (!rl.allowed) {
    return NextResponse.json({ error: 'Too many attempts. Please try again later.' }, { status: 429 });
  }

  const parsed = registerSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Please check your details and try again.' },
      { status: 400 },
    );
  }
  const { firstName, lastName, phone, notificationConsent } = parsed.data;

  const phoneDigits = phone.replace(/\D/g, '');
  if (phoneDigits.length < 7 || phoneDigits.length > 15) {
    return NextResponse.json({ error: 'Enter a valid phone number.' }, { status: 400 });
  }

  const { contactHash } = hashContact(phone);
  const displayName = `${firstName} ${lastName}`;
  const now = new Date().toISOString();

  // Create or update the guest profile, keyed by (property, contact hash).
  const { data: existing } = await admin
    .from('guest_identities')
    .select('id')
    .eq('property_id', session.propertyId)
    .eq('contact_hash', contactHash)
    .maybeSingle();

  const identityRow = {
    property_id: session.propertyId,
    display_name: displayName,
    first_name: firstName,
    last_name: lastName,
    contact_hash: contactHash,
    contact_type: 'phone',
    contact_last4: phoneDigits.slice(-4),
  };

  let identityId: string | null = existing?.id ?? null;
  if (identityId) {
    // first_name/last_name are GUEST-PORTAL-V2 columns — cast until
    // database.types.ts is regenerated post-migration.
    const { error } = await admin.from('guest_identities').update(identityRow as never).eq('id', identityId);
    if (error) {
      log.error('guest_register_identity_update_failed', { propertyId: session.propertyId, err: String(error) });
      return NextResponse.json({ error: 'Could not save your details. Please try again.' }, { status: 500 });
    }
  } else {
    const { data: created, error } = await admin
      .from('guest_identities')
      .insert(identityRow as never)
      .select('id')
      .single();
    if (error) {
      log.error('guest_register_identity_insert_failed', { propertyId: session.propertyId, err: String(error) });
      return NextResponse.json({ error: 'Could not save your details. Please try again.' }, { status: 500 });
    }
    identityId = created?.id ?? null;
  }

  // Associate the guest with the reservation.
  await admin.from('stays').update({ guest_identity_id: identityId }).eq('id', session.stayId);

  // Mark the session registered and record the consent choice on it.
  const { error: sessErr } = await admin
    .from('guest_access_sessions')
    .update({
      guest_contact: phone,
      guest_contact_type: 'phone',
      notification_consent: notificationConsent,
      notification_consent_at: notificationConsent ? now : null,
      registered_at: now,
      guest_identity_id: identityId,
    } as never)
    .eq('id', session.id);
  if (sessErr) {
    log.error('guest_register_session_update_failed', { propertyId: session.propertyId, err: String(sessErr) });
    return NextResponse.json({ error: 'Could not save your details. Please try again.' }, { status: 500 });
  }

  if (notificationConsent) {
    await admin.from('consent_records').insert({
      stay_id: session.stayId,
      kind: 'guest_comms',
      granted: true,
    } as never);
  }

  log.info('guest_registered', { propertyId: session.propertyId, stayId: session.stayId });
  return NextResponse.json({ ok: true, guestName: firstName });
}
