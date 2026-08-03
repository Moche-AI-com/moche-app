import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getGuestSession } from '@/lib/guest/session';
import { capture } from '@/lib/posthog-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// WS-5 — guest-facing place-detail lookup. The concierge only ever hands the client
// a verified place id (see lib/guest/concierge.ts); this route re-verifies that id
// against THIS guest's own property (session-scoped, defense in depth against IDOR)
// and never trusts anything the model said about the place. Hidden places 404 exactly
// like a place that does not exist, so a guest cannot probe host-hidden listings.
export async function GET(_req: Request, { params }: { params: { slug: string; id: string } }) {
  const session = await getGuestSession();
  if (!session) return NextResponse.json({ error: 'Your session has expired. Please verify again.' }, { status: 401 });

  const admin = createAdminClient();
  const { data: property } = await admin
    .from('properties').select('id, slug').eq('id', session.propertyId).maybeSingle();
  if (!property || property.slug !== params.slug) {
    return NextResponse.json({ error: 'Session mismatch.' }, { status: 403 });
  }

  const { data: place, error } = await admin
    .from('nearby_places')
    .select('id, name, category, address, phone, url, rating, review_count, price_level, distance_m, host_notes, host_starred, lat, lng, place_id')
    .eq('id', params.id)
    .eq('property_id', session.propertyId)
    .eq('hidden', false)
    .maybeSingle();

  if (error || !place) {
    return NextResponse.json({ error: 'not_found', verified: false }, { status: 404 });
  }

  // Build outbound links ourselves from trusted fields only — never surface a raw
  // model- or host-provided string as an href without validation (WS-5 security).
  const mapsUrl = place.lat != null && place.lng != null
    ? `https://www.google.com/maps/search/?api=1&query=${place.lat},${place.lng}`
    : place.place_id
      ? `https://www.google.com/maps/place/?q=place_id:${encodeURIComponent(place.place_id)}`
      : null;

  const websiteUrl = (() => {
    if (!place.url) return null;
    try {
      const u = new URL(place.url);
      return u.protocol === 'https:' || u.protocol === 'http:' ? u.toString() : null;
    } catch {
      return null;
    }
  })();

  const telHref = (() => {
    if (!place.phone) return null;
    const digits = place.phone.replace(/[^\d+]/g, '');
    return digits.length >= 7 ? `tel:${digits}` : null;
  })();

  void capture('place_link_click', session.propertyId, {
    property_id: session.propertyId,
    place_id: place.id,
    category: place.category,
  });

  return NextResponse.json({
    verified: true,
    place: {
      id: place.id,
      name: place.name,
      category: place.category,
      address: place.address,
      rating: place.rating,
      reviewCount: place.review_count,
      priceLevel: place.price_level,
      distanceM: place.distance_m,
      hostNote: place.host_notes,
      hostFavorite: place.host_starred,
      mapsUrl,
      websiteUrl,
      telHref,
    },
  });
}
