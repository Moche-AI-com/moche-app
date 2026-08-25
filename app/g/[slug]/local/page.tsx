import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { Cormorant_Garamond, Inter } from 'next/font/google';
import { createAdminClient } from '@/lib/supabase/admin';
import { getGuestSession } from '@/lib/guest/session';
import { getPropertyAccess } from '@/lib/auth/guards';
import { loadGuestLocalPlaces } from '@/lib/local/canonical';
import { LocalGuide } from './LocalGuide';

// Same luxury concierge typography as the portal shell — the Local Guide is a
// guest-facing portal page, so it shares the brand variables and fonts.
const displaySerif = Cormorant_Garamond({
  subsets: ['latin'],
  weight: ['500', '600', '700'],
  variable: '--font-portal-serif',
});
const bodySans = Inter({
  subsets: ['latin'],
  variable: '--font-portal-sans',
});

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Local Guide',
  // Guest surfaces are private per-stay; never index them.
  robots: { index: false, follow: false },
};

export default async function LocalGuidePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const admin = createAdminClient();

  const { data: property } = await admin
    .from('properties')
    .select('id, slug, display_name, city, region, country, brand_primary, brand_accent, logo_url, status')
    .eq('slug', slug)
    .is('deleted_at', null)
    .maybeSingle();
  if (!property || property.status !== 'live') notFound();

  // Guests need their verified session for THIS property. A logged-in host of
  // the property can preview the guide (same bypass as the portal shell).
  // Anyone else is sent back to the portal gate to verify first.
  const session = await getGuestSession();
  const verified = !!session && session.propertyId === property.id;
  if (!verified) {
    const hostAccess = await getPropertyAccess(property.id);
    if (!hostAccess) redirect(`/g/${property.slug}`);
  }

  // Canonical places first, legacy nearby_places/recommendations merge as the
  // fallback (see lib/local/canonical.ts). A data failure degrades to an empty
  // guide with a helpful note, never a broken page.
  const places = await loadGuestLocalPlaces(admin, property.id).catch(() => []);

  return (
    <LocalGuide
      fontClassName={`${displaySerif.variable} ${bodySans.variable}`}
      slug={property.slug}
      propertyName={property.display_name}
      location={[property.city, property.region, property.country].filter(Boolean).join(', ')}
      brandPrimary={property.brand_primary}
      brandAccent={property.brand_accent}
      logoUrl={property.logo_url}
      places={places}
    />
  );
}
