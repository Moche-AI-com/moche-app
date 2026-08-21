import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/admin';
import { getGuestSession } from '@/lib/guest/session';
import { hashContact, hashIp } from '@/lib/crypto';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const schema = z.object({
  firstName: z.string().trim().min(1, 'Enter your first name.').max(80),
  lastName: z.string().trim().min(1, 'Enter your last name.').max(80),
  phone: z.string().trim().min(7, 'Enter a valid phone number.').max(40),
  notificationConsent: z.boolean().optional().default(false),
  termsAccepted: z.literal(true),
});

function clientIp(req: Request) {
  return req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? req.headers.get('x-real-ip') ?? '0.0.0.0';
}

export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const session = await getGuestSession();
  if (!session) return NextResponse.json({ error: 'Session expired.' }, { status: 401 });

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Enter your name, phone number, and accept the host notification terms.' }, { status: 400 });
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

  const { data: sessionRow } = await db
    .from('guest_access_sessions')
    .select('id, stay_guest_id')
    .eq('id', session.sessionId)
    .maybeSingle();
  if (!sessionRow?.stay_guest_id) {
    return NextResponse.json({ error: 'This session is not linked to a guest ID. Please verify again.' }, { status: 400 });
  }

  const phone = parsed.data.phone.trim();
  const contactHash = hashContact(phone);
  const last4 = phone.replace(/\D/g, '').slice(-4);
  const now = new Date().toISOString();
  const fullName = `${parsed.data.firstName} ${parsed.data.lastName}`.trim();

  const { data: existingIdentity } = await db
    .from('guest_identities')
    .select('id')
    .eq('property_id', session.propertyId)
    .eq('contact_hash', contactHash)
    .maybeSingle();

  let identityId = existingIdentity?.id as string | undefined;
  if (identityId) {
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
    identityId = identity.id;
  }

  await db
    .from('guest_access_sessions')
    .update({
      guest_identity_id: identityId,
      guest_contact: phone,
      guest_contact_type: 'phone',
      notification_consent: parsed.data.notificationConsent,
      notification_consent_at: parsed.data.notificationConsent ? now : null,
      registered_at: now,
    })
    .eq('id', session.sessionId);

  await db
    .from('stay_guests')
    .update({
      guest_identity_id: identityId,
      display_name: fullName,
      phone_hash: contactHash,
      phone_last4: last4,
      notification_consent: parsed.data.notificationConsent,
      notification_consent_at: parsed.data.notificationConsent ? now : null,
      terms_accepted_at: now,
    })
    .eq('id', sessionRow.stay_guest_id)
    .eq('stay_id', session.stayId);

  const ipHash = hashIp(clientIp(req));
  await db.from('consent_records').insert([
    { stay_id: session.stayId, kind: 'terms', granted: true, ip_hash: ipHash },
    { stay_id: session.stayId, kind: 'guest_comms', granted: parsed.data.notificationConsent, ip_hash: ipHash },
  ]).catch(() => undefined);

  return NextResponse.json({ ok: true, guestName: fullName });
}
