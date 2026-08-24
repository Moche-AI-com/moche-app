import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Cormorant_Garamond, Inter } from 'next/font/google';
import { createAdminClient } from '@/lib/supabase/admin';
import { getGuestSession } from '@/lib/guest/session';
import { getPropertyAccess } from '@/lib/auth/guards';
import { publicEnv } from '@/lib/env';
import { GuestPortal } from './GuestPortal';
import type { GuestExtraOffer } from './ExtrasWorkflow';

// Luxury concierge typography: serif display for headings, clean sans for body.
// Exposed as CSS variables so the brand-scoped portal styles can reference them.
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
  title: 'Guest Portal',
  // Guest portals are private per-stay surfaces; never index them.
  robots: { index: false, follow: false },
};

export default async function GuestPortalPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ token?: string }>;
}) {
  const { slug } = await params;
  const { token } = await searchParams;
  const admin = createAdminClient();

  const { data: property } = await admin
    .from('properties')
    .select('id, slug, display_name, city, region, country, brand_primary, brand_accent, logo_url, cover_image_url, status')
    .eq('slug', slug)
    .is('deleted_at', null)
    .maybeSingle();
  if (!property || property.status !== 'live') notFound();

  // If already verified for THIS property, skip code entry entirely.
  const session = await getGuestSession();
  const verified = !!session && session.propertyId === property.id;

  // Host bypass: a logged-in host (owner or co-host) of THIS property can open the
  // portal on any device without the guest gate. Only checked when the visitor
  // isn't already a verified guest, so guest behavior is unchanged.
  const hostAccess = verified ? null : await getPropertyAccess(property.id);
  const isHostPreview = !!hostAccess;

  // Registration state decides between the registration form and the main menu.
  // registered_at is a GUEST-PORTAL-V2 column; read via a loose cast until
  // database.types.ts is regenerated after the migration lands.
  let initialRegistered = false;
  let guestName: string | null = null;
  if (verified && session) {
    const { data: sess } = await admin
      .from('guest_access_sessions')
      .select('*')
      .eq('id', session.sessionId)
      .maybeSingle();
    initialRegistered = !!(sess as Record<string, unknown> | null)?.registered_at;
    guestName = session.guestDisplayName ?? null;
  }

  // The stay's saved language (written by the chat/host-chat routes whenever the
  // guest picks one) restores the Globe picker on return visits and other devices.
  // Same loose-cast pattern as registered_at until database.types.ts regenerates.
  let initialLanguage: string | null = null;
  if (verified && session) {
    const { data: stayRow } = await admin
      .from('stays')
      .select('guest_language')
      .eq('id', session.stayId)
      .maybeSingle();
    const lang = (stayRow as Record<string, unknown> | null)?.guest_language;
    initialLanguage = typeof lang === 'string' && lang.length > 0 ? lang : null;
  }

  // Extras are loaded server-side only once a session exists (they are stay-scoped).
  let offers: GuestExtraOffer[] = [];
  if (verified) {
    const { data } = await admin
      .from('guest_extras')
      .select('id, title, description, details, price_text, cta_label, category, max_quantity, kind, unit_label, option_label, options')
      .eq('property_id', property.id)
      .eq('active', true)
      .order('sort_order', { ascending: true });
    offers = (data ?? []) as GuestExtraOffer[];
  }

  return (
    <GuestPortal
      fontClassName={`${displaySerif.variable} ${bodySans.variable}`}
      slug={property.slug}
      propertyId={property.id}
      propertyName={property.display_name}
      location={[property.city, property.region, property.country].filter(Boolean).join(', ')}
      brandPrimary={property.brand_primary}
      brandAccent={property.brand_accent}
      logoUrl={property.logo_url}
      coverImageUrl={property.cover_image_url}
      turnstileSiteKey={publicEnv.turnstileSiteKey}
      initialVerified={verified || isHostPreview}
      hostPreview={isHostPreview}
      guestName={guestName}
      initialRegistered={initialRegistered || isHostPreview}
      extrasOffers={offers}
      accessToken={typeof token === 'string' && token.length > 0 ? token : null}
      initialLanguage={initialLanguage}
    />
  );
}
