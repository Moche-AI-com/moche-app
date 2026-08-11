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
    .from('property_place_recommendations')
    .select(`
      id,
      host_note,
      is_favorite,
      distance_miles,
      places!inner(name, category, address, phone, website, lat, lon, provider_place_id)
    `)
    .eq('id', params.id)
    .eq('property_id', session.propertyId)
    .neq('status', 'hidden')
    .maybeSingle();

  if (error || !place) {
    return NextResponse.json({ error: 'not_found', verified: false }, { status: 404 });
  }
  const canonical = place as typeof place & {
    places: {
      name: string;
      category: string;
      address: string | null;
      phone: string | null;
      website: string | null;
      lat: number | null;
      lon: number | null;
      provider_place_id: string | null;
    };
  };

  // Build outbound links ourselves from trusted fields only — never surface a raw
  // model- or host-provided string as an href without validation (WS-5 security).
  const mapsUrl = canonical.places.lat != null && canonical.places.lon != null
    ? `https://www.google.com/maps/search/?api=1&query=${canonical.places.lat},${canonical.places.lon}`
    : canonical.places.address
      ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(canonical.places.address)}`
      : null;

  const websiteUrl = (() => {
    if (!canonical.places.website) return null;
    try {
      const u = new URL(canonical.places.website);
      return u.protocol === 'https:' || u.protocol === 'http:' ? u.toString() : null;
    } catch {
      return null;
    }
  })();

  const telHref = (() => {
    if (!canonical.places.phone) return null;
    const digits = canonical.places.phone.replace(/[^\d+]/g, '');
    return digits.length >= 7 ? `tel:${digits}` : null;
  })();

  void capture('place_link_click', session.propertyId, {
    property_id: session.propertyId,
    place_id: place.id,
    category: canonical.places.category,
  });

  return NextResponse.json({
    verified: true,
    place: {
      id: place.id,
      name: canonical.places.name,
      category: canonical.places.category,
      address: canonical.places.address,
      rating: null,
      reviewCount: null,
      priceLevel: null,
      distanceM: canonical.distance_miles == null ? null : canonical.distance_miles * 1609.344,
      hostNote: canonical.host_note,
      hostFavorite: canonical.is_favorite,
      mapsUrl,
      websiteUrl,
      telHref,
    },
  });
}
