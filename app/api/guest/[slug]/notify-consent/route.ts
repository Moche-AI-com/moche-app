import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getGuestSession } from '@/lib/guest/session';
import { guestNotifyConsentSchema } from '@/lib/validation';
import { log } from '@/lib/log';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Feature 4c — soft-gate consent capture. Stores the guest's preferred contact plus an
// explicit TCPA opt-in on THEIR verified session row, so that when the host later answers
// an escalation we may ping them (best-effort, only if they opted in). The contact itself
// is never logged. Requires a live verified session (cookie); the slug is checked against
// the session's property as defense-in-depth.
export async function POST(req: Request, { params }: { params: { slug: string } }) {
  const session = await getGuestSession();
  if (!session) return NextResponse.json({ error: 'Your session has expired. Please verify again.' }, { status: 401 });

  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  }
  const parsed = guestNotifyConsentSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Enter a valid contact and accept the notice.' }, { status: 400 });
  }

  const admin = createAdminClient();

  // Defense in depth: the slug in the URL must match the session's property.
  const { data: property } = await admin
    .from('properties').select('id, slug').eq('id', session.propertyId).maybeSingle();
  if (!property || property.slug !== params.slug) {
    return NextResponse.json({ error: 'Session mismatch.' }, { status: 403 });
  }

  const contact = parsed.data.contact;
  const contactType = contact.includes('@') ? 'email' : 'phone';

  const { error } = await admin
    .from('guest_access_sessions')
    .update({
      guest_contact: contact,
      guest_contact_type: contactType,
      notification_consent: true,
      notification_consent_at: new Date().toISOString(),
    } as never)
    .eq('id', session.sessionId);

  if (error) {
    log.warn('guest_notify_consent_failed', { error: error.message });
    return NextResponse.json({ error: 'Could not save your preference. Please try again.' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
