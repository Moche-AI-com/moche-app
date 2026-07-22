import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getGuestSession } from '@/lib/guest/session';
import { guestFeedbackSchema } from '@/lib/validation';
import { log } from '@/lib/log';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Add-on — one-tap product feedback from a verified guest. Writes a PRIVATE
// product_feedback row via the service-role client (guests are unauthenticated
// to Postgres, mirroring the guest chat/notify-consent pattern). The row is
// scoped to THIS guest's session + property; the slug is checked against the
// session's property as defense-in-depth. Feedback is owner-only analytics —
// there is no read path for guests or hosts here.
export async function POST(req: Request, { params }: { params: { slug: string } }) {
  const session = await getGuestSession();
  if (!session) return NextResponse.json({ error: 'Your session has expired. Please verify again.' }, { status: 401 });

  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  }
  const parsed = guestFeedbackSchema.safeParse(payload);
  if (!parsed.success) return NextResponse.json({ error: 'Please choose a rating.' }, { status: 400 });

  const admin = createAdminClient();

  // Defense in depth: the slug in the URL must match the session's property.
  const { data: property } = await admin
    .from('properties').select('id, slug').eq('id', session.propertyId).maybeSingle();
  if (!property || property.slug !== params.slug) {
    return NextResponse.json({ error: 'Session mismatch.' }, { status: 403 });
  }

  const { rating, comment, page } = parsed.data;
  const { error } = await admin.from('product_feedback').insert({
    source: 'guest',
    rating,
    comment: comment ? comment : null,
    property_id: session.propertyId,
    guest_session_id: session.sessionId,
    page: page ? page : 'guest_portal',
  } as never);

  if (error) {
    log.warn('guest_feedback_failed', { error: error.message });
    return NextResponse.json({ error: 'Could not save your feedback. Please try again.' }, { status: 500 });
  }

  return NextResponse.json({ ok: true, positive: rating >= 4 });
}
