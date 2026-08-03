import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getGuestSession } from '@/lib/guest/session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// WS-7 — a guest's own service request tickets for this stay. Sanitized: no
// resolution_notes or assigned_contact_id (internal-only fields).
export async function GET(_req: Request, { params }: { params: { slug: string } }) {
  const session = await getGuestSession();
  if (!session) return NextResponse.json({ error: 'Your session has expired. Please verify again.' }, { status: 401 });

  const admin = createAdminClient();
  const { data: property } = await admin
    .from('properties').select('id, slug').eq('id', session.propertyId).maybeSingle();
  if (!property || property.slug !== params.slug) {
    return NextResponse.json({ error: 'Session mismatch.' }, { status: 403 });
  }

  const { data: tickets, error } = await admin
    .from('service_requests')
    .select(
      'id, service_type, urgency, status, description, summary, location_note, guest_availability, media_urls, interview_status, interview_transcript, created_at, updated_at',
    )
    .eq('property_id', session.propertyId)
    .eq('stay_id', session.stayId)
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ error: 'Could not load your reports.' }, { status: 500 });

  return NextResponse.json({ tickets: tickets ?? [] });
}
