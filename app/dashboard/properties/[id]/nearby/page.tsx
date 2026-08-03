import Link from 'next/link';
import { requirePropertyAccess } from '@/lib/auth/guards';
import { createClient } from '@/lib/supabase/server';
import { isNearbyStale, refreshNearbyPlaces, NEARBY_RADIUS_M } from '@/lib/local/nearby';
import { formatRadiusMiles } from '@/lib/local/distance';
import { geoProvider } from '@/lib/local/geo';
import { NearbyPlacesManager } from './NearbyPlacesManager';

export const dynamic = 'force-dynamic';

export default async function NearbyPlacesPage({ params }: { params: { id: string } }) {
  const access = await requirePropertyAccess(params.id);
  const p = access.property as typeof access.property & { lat: number | null; lng: number | null };
  const hasCoords = typeof p.lat === 'number' && typeof p.lng === 'number';

  // Auto-refresh (b): when the newest row is older than 30 days (or none exist)
  // and we have coordinates, pull a fresh set before rendering. Never per-guest —
  // this only runs on the host dashboard.
  if (hasCoords && access.can.editProperty && (await isNearbyStale(params.id))) {
    await refreshNearbyPlaces(params.id, { lat: p.lat, lng: p.lng });
  }

  const supabase = createClient();
  const { data: places } = await supabase
    .from('nearby_places')
    .select('id, place_id, category, name, rating, review_count, lat, lng, price_level, host_starred, host_notes, hidden, distance_m, refreshed_at, address, url, phone, source')
    .eq('property_id', params.id)
    .order('category', { ascending: true })
    .order('distance_m', { ascending: true });

  return (
    <div>
      <Link href={`/dashboard/properties/${params.id}`} className="muted" style={{ fontSize: '.85rem' }}>
        ← Back to property
      </Link>
      <h1 style={{ marginTop: '.5rem' }}>Nearby places</h1>
      <p className="muted" style={{ maxWidth: 640 }}>
        Auto-discovered within ~{formatRadiusMiles(NEARBY_RADIUS_M)} of your property using{' '}
        {geoProvider() === 'mapbox' ? 'Mapbox place data' : 'free OpenStreetMap data'}. Star the places
        you love, add a note, or hide the ones you don&apos;t. Your concierge recommends starred places
        first (with your notes) and never mentions hidden ones.
      </p>
      <NearbyPlacesManager
        propertyId={params.id}
        canEdit={access.can.editProperty}
        hasCoords={hasCoords}
        propertyLat={typeof p.lat === 'number' ? p.lat : null}
        propertyLng={typeof p.lng === 'number' ? p.lng : null}
        initialPlaces={(places ?? []) as never}
      />
    </div>
  );
}
