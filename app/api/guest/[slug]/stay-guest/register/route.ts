import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createHash, randomUUID } from 'node:crypto';
import { createAdminClient } from '@/lib/supabase/admin';
import { getGuestSession } from '@/lib/guest/session';
import { hashContact, hashIp } from '@/lib/crypto';
import { serverEnv } from '@/lib/env';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const schema = z.object({
  firstName: z.string().trim().min(1, 'Enter your first name.').max(80),
  lastName: z.string().trim().min(1, 'Enter your last name.').max(80),
  phone: z.string().trim().max(40).optional(),
  notificationConsent: z.boolean().optional().default(false),
  termsAccepted: z.literal(true),
});

function clientIp(req: Request) {
  return req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? req.headers.get('x-real-ip') ?? '0.0.0.0';
}

// "Who's joining?" registration (party access redesign 2026-08-28). Every party
// member registers on their own device after entering the shared stay code.
// Name is required; phone is OPTIONAL — it powers the SMS reply alert and
// reconnects the guest to the same identity when they open the portal on a new
// device later (identity is keyed by the phone contact hash).
export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const session = await getGuestSession();
  if (!session) return NextResponse.json({ error: 'Session expired.' }, { status: 401 });

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Enter your name and accept the host notification terms.' }, { status: 400 });
  }

  const { slug } = await params;
  const admin = createAdminClient();
  const db = admin as any;
  const { data: property } = await admin
    .from('properties')
    .select('id, slug')
    .eq('slug', slug)
    .maybeSingle();
  if (!property || property.id !== session.propertyId) return NextResponse.json({ error: 'Property not found.' }, { status: 404 });

  const phone = parsed.data.phone?.trim() ?? '';
  if (phone && phone.replace(/\D/g, '').length < 7) {
    return NextResponse.json({ error: 'Enter a valid phone number.' }, { status: 400 });
  }
  // SMS consent only means something when a phone number exists to text.
  const wantsSms = phone.length > 0 && parsed.data.notificationConsent;
  const now = new Date().toISOString();
  const fullName = `${parsed.data.firstName} ${parsed.data.lastName}`.trim();

  let identityId: string;
  let contactHash: string | null = null;
  let last4: string | null = null;

  if (phone) {
    const hashed = hashContact(phone);
    contactHash = hashed.contactHash;
    last4 = hashed.last4;

    const { data: existingIdentity } = await db
      .from('guest_identities')
      .select('id')
      .eq('property_id', session.propertyId)
      .eq('contact_hash', contactHash)
      .maybeSingle();

    if (existingIdentity) {
      identityId = existingIdentity.id as string;
      await db
        .from('guest_identities')
        .update({ first_name: parsed.data.firstName, last_name: parsed.data.lastName, display_name: fullName, contact_last4: last4 })
        .eq('id', identityId);
    } else {
      const { data: identity, error } = await db
        .from('guest_identities')
        .insert({
          property_id: session.propertyId,
          display_name: fullName,
          first_name: parsed.data.firstName,
          last_name: parsed.data.lastName,
          contact_hash: contactHash,
          contact_type: 'phone',
          contact_last4: last4,
        })
        .select('id')
        .single();
      if (error) return NextResponse.json({ error: 'Could not save your profile.' }, { status: 500 });
      identityId = identity.id as string;
    }
  } else {
    // Name-only guest: still a first-class identity (own concierge + host-chat
    // threads). contact_hash is NOT NULL, so mint an opaque synthetic one — its
    // namespace can never collide with a real phone hash.
    const syntheticHash = createHash('sha256')
      .update(`${serverEnv.guestContactSalt}:name-only:${randomUUID()}`)
      .digest('hex');
    const { data: identity, error } = await db
      .from('guest_identities')
      .insert({
        property_id: session.propertyId,
        display_name: fullName,
        first_name: parsed.data.firstName,
        last_name: parsed.data.lastName,
        contact_hash: syntheticHash,
        contact_type: 'name',
        contact_last4: null,
      })
      .select('id')
      .single();
    if (error) return NextResponse.json({ error: 'Could not save your profile.' }, { status: 500 });
    identityId = identity.id as string;
  }

  // Attach the identity to THIS session/device. Each session carries its own
  // registered_at + identity — that is what gives every party member their own
  // portal while sharing the one stay code.
  await db
    .from('guest_access_sessions')
    .update({
      guest_identity_id: identityId,
      guest_contact: phone || null,
      guest_contact_type: phone ? 'phone' : null,
      notification_consent: wantsSms,
      notification_consent_at: wantsSms ? now : null,
      registered_at: now,
    })
    .eq('id', session.sessionId);

  // The shared party pass (the stay_guests row that carried the code) is claimed
  // by the FIRST registrant — the primary booker in host-facing views. Later
  // party members keep their identity on their own session + identity rows
  // instead of overwriting the shared pass.
  const { data: sessionRow } = await db
    .from('guest_access_sessions')
    .select('id, stay_guest_id')
    .eq('id', session.sessionId)
    .maybeSingle();

  if (sessionRow?.stay_guest_id) {
    const { data: passRow } = await db
      .from('stay_guests')
      .select('id, guest_identity_id')
      .eq('id', sessionRow.stay_guest_id)
      .eq('stay_id', session.stayId)
      .maybeSingle();
    if (passRow && !passRow.guest_identity_id) {
      await db
        .from('stay_guests')
        .update({
          guest_identity_id: identityId,
          display_name: fullName,
          phone_hash: contactHash,
          phone_last4: last4,
          notification_consent: wantsSms,
          notification_consent_at: wantsSms ? now : null,
          terms_accepted_at: now,
        })
        .eq('id', passRow.id);
    }
  }

  const ipHash = hashIp(clientIp(req));
  await db.from('consent_records').insert([
    { stay_id: session.stayId, kind: 'terms', granted: true, ip_hash: ipHash },
    { stay_id: session.stayId, kind: 'guest_comms', granted: wantsSms, ip_hash: ipHash },
  ]).catch(() => undefined);

  return NextResponse.json({ ok: true, guestName: fullName });
}
