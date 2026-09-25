import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { Cormorant_Garamond, Inter } from 'next/font/google';
import { createAdminClient } from '@/lib/supabase/admin';
import { getGuestSession } from '@/lib/guest/session';
import { getPropertyAccess } from '@/lib/auth/guards';
import { loadGuestLocalPlaces } from '@/lib/local/canonical';
import { guestGuideAccess } from '@/lib/local/guide-access';
import { LocalGuide } from './LocalGuide';

const displaySerif = Cormorant_Garamond({
  subsets: ['latin'], weight: ['500', '600', '700'], variable: '--font-portal-serif',
});
const bodySans = Inter({ subsets: ['latin'], variable: '--font-portal-sans' });
export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Local Guide', robots: { index: false, follow: false } };

export default async function LocalGuidePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const admin = createAdminClient();
  const { data: property } = await admin.from('properties')
    .select('id, slug, display_name, city, region, country, brand_primary, brand_accent, logo_url, status')
    .eq('slug', slug).is('deleted_at', null).maybeSingle();
  if (!property) notFound();
  const session = await getGuestSession();
  const verifiedGuest = !!session && session.propertyId === property.id;
  const hostAccess = !verifiedGuest || property.status !== 'live' ? await getPropertyAccess(property.id) : null;
  const access = guestGuideAccess(property.status, verifiedGuest, !!hostAccess);
  if (access === 'not_found') notFound();
  if (access === 'verify') redirect(`/g/${property.slug}`);
  const { places, loadError } = await loadGuestLocalPlaces(admin, property.id)
    .then((places) => ({ places, loadError: false }))
    .catch(() => ({ places: [], loadError: true }));
  return (
    <LocalGuide
      fontClassName={`${displaySerif.variable} ${bodySans.variable}`}
      slug={property.slug} propertyName={property.display_name}
      location={[property.city, property.region, property.country].filter(Boolean).join(', ')}
      brandPrimary={property.brand_primary} brandAccent={property.brand_accent}
      logoUrl={property.logo_url} places={places} loadError={loadError}
      liveNearbyEnabled={verifiedGuest && property.status === 'live' && process.env.LOCAL_LIVE_MAPBOX_ENABLED === 'true'}
    />
  );
}
