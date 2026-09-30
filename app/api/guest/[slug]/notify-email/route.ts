import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/admin';
import { getGuestSession } from '@/lib/guest/session';
import { checkRateLimit } from '@/lib/rate-limit';
import { hashContact } from '@/lib/crypto';
import { startGuestEmailAlerts } from '@/lib/guest/email-alerts';
import { maskGuestEmail, normalizeGuestEmail } from '@/lib/guest/email-alerts-core';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const schema = z.object({ email: z.string().max(254), consent: z.literal(true) });

// Guest opts into email alerts for host replies on THIS session. Consent is
// explicit; nothing is sent until the one-tap confirmation link is used.
export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const session = await getGuestSession();
  if (!session) return NextResponse.json({ error: 'Session expired.' }, { status: 401 });
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Enter your email and agree to receive alerts.' }, { status: 400 });
  const email = normalizeGuestEmail(parsed.data.email);
  if (!email) return NextResponse.json({ error: 'Enter a valid email address.' }, { status: 400 });
  const admin = createAdminClient();
  const { data: property } = await admin.from('properties').select('slug, display_name').eq('id', session.propertyId).maybeSingle();
  if (!property || property.slug !== (await params).slug) return NextResponse.json({ error: 'Session mismatch.' }, { status: 403 });
  const sessionLimit = await checkRateLimit(admin, { key: session.sessionId, limit: 5, windowSeconds: 3600, action: 'guest.email.start' });
  const destinationLimit = await checkRateLimit(admin, { key: hashContact(email).contactHash, limit: 5, windowSeconds: 3600, action: 'guest.email.destination' });
  if (!sessionLimit.allowed || !destinationLimit.allowed) {
    return NextResponse.json({ error: 'Please wait before requesting another confirmation email.' }, { status: 429 });
  }
  const result = await startGuestEmailAlerts(admin, { sessionId: session.sessionId, propertyId: session.propertyId, stayId: session.stayId }, email, property.display_name ?? '');
  if (result === 'invalid_email') return NextResponse.json({ error: 'Enter a valid email address.' }, { status: 400 });
  if (result === 'failed') return NextResponse.json({ error: "We couldn't send the confirmation email. Try again in a minute." }, { status: 503 });
  return NextResponse.json({ ok: true, email: maskGuestEmail(email) });
}
