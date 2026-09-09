import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createHash, randomUUID } from 'node:crypto';
import { createAdminClient } from '@/lib/supabase/admin';
import { getGuestSession } from '@/lib/guest/session';
import { hashContact } from '@/lib/crypto';
import { normalizeSmsPhone } from '@/lib/notifications/phone';
import { serverEnv } from '@/lib/env';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Code-only entry (issue #133): the 4-digit stay code already routed the guest
// to the right party, so names are OPTIONAL and fall back to "Guest". Phone is
// collected only alongside the SMS opt-in, and terms remain a one-tap checkbox.
// Every field removed here is more guests actually reaching the concierge.
const schema = z.object({
  firstName: z.string().trim().max(80).optional().default(''),
  lastName: z.string().trim().max(80).optional().default(''),
  phone: z.string().trim().max(40).optional(),
  notificationConsent: z.boolean().optional().default(false),
  termsAccepted: z.literal(true),
});

// Anonymous guests retain the concierge. Registration does not prove phone
// ownership and must never reclaim another person's identity via a shared stay.
export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const session = await getGuestSession();
  if (!session) return NextResponse.json({ error: 'Session expired.' }, { status: 401 });
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Accept the terms to continue.' }, { status: 400 });
  const admin = createAdminClient();
  const db = admin as any;
  const { data: property } = await admin.from('properties').select('id, slug').eq('slug', (await params).slug).maybeSingle();
  if (property?.id !== session.propertyId) return NextResponse.json({ error: 'Property not found.' }, { status: 404 });
  const phone = normalizeSmsPhone(parsed.data.phone ?? '');
  if (parsed.data.phone && !phone) return NextResponse.json({ error: 'Use + and country code for your phone number.' }, { status: 400 });
  const { data: own } = await db.from('guest_access_sessions').select('*')
    .eq('id', session.sessionId).eq('property_id', session.propertyId).eq('stay_id', session.stayId).maybeSingle();
  if (!own) return NextResponse.json({ error: 'Session expired.' }, { status: 401 });
  const wantsSms = !!phone && parsed.data.notificationConsent;
  const now = new Date().toISOString();
  const fullName = `${parsed.data.firstName} ${parsed.data.lastName}`.trim() || 'Guest';
  const hashed = phone ? hashContact(phone) : null;
  let identityId = own.guest_identity_id;
  // Only reuse the identity already bound to this session, never a phone lookup.
  if (!identityId) {
    const { data: identity, error } = await db.from('guest_identities').insert({
      property_id: session.propertyId, display_name: fullName,
      first_name: parsed.data.firstName, last_name: parsed.data.lastName,
      contact_hash: hashed?.contactHash ?? createHash('sha256').update(`${serverEnv.guestContactSalt}:name-only:${randomUUID()}`).digest('hex'),
      contact_type: phone ? 'phone' : 'name', contact_last4: hashed?.last4 ?? null,
    }).select('id').single();
    if (error || !identity) return NextResponse.json({ error: 'Could not save your profile.' }, { status: 500 });
    identityId = identity.id;
  }
  const { error } = await db.from('guest_access_sessions').update({
    guest_identity_id: identityId, guest_contact: phone, guest_contact_type: phone ? 'phone' : null,
    notification_consent: wantsSms, notification_consent_at: wantsSms ? now : null,
    phone_verified_at: phone && own.guest_contact === phone ? own.phone_verified_at : null,
    terms_accepted_at: now, registered_at: now,
  }).eq('id', session.sessionId).eq('property_id', session.propertyId).eq('stay_id', session.stayId);
  if (error) return NextResponse.json({ error: 'Could not save your registration.' }, { status: 500 });
  // Shared pass names are display-only. Never copy its phone or consent into a session.
  if (own.stay_guest_id) await db.from('stay_guests').update({ guest_identity_id: identityId, display_name: fullName })
    .eq('id', own.stay_guest_id).eq('stay_id', session.stayId).is('guest_identity_id', null);
  return NextResponse.json({ ok: true, guestName: fullName, phoneVerificationRequired: wantsSms && !own.phone_verified_at });
}
