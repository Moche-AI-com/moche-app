import { notFound } from 'next/navigation';
import { Cormorant_Garamond, Inter } from 'next/font/google';
import { createAdminClient } from '@/lib/supabase/admin';
import { getGuestSession } from '@/lib/guest/session';
import { getPropertyAccess } from '@/lib/auth/guards';
import { publicEnv } from '@/lib/env';
import { GuestPortal } from './GuestPortal';

// Luxury concierge typography: serif display for headings, clean sans for body.
// Exposed as CSS variables so the brand-scoped portal styles can reference them.
const displaySerif = Cormorant_Garamond({
  subsets: ['latin'],
  weight: ['500', '600', '700'],
  variable: '--font-portal-serif',
  display: 'swap',
});
const bodySans = Inter({
  subsets: ['latin'],
  variable: '--font-portal-sans',
  display: 'swap',
});

export const dynamic = 'force-dynamic';

// Never cache guest portal responses (per-guest, per-stay data).
export const fetchCache = 'force-no-store';

export default async function GuestPortalPage({ params }: { params: { slug: string } }) {
  const admin = createAdminClient();

  // Only live properties expose a portal. Fetch public-safe branding only.
  const { data: property } = await admin
    .from('properties')
    .select('id, display_name, slug, status, brand_primary, brand_accent, logo_url, cover_image_url, city, region, country')
    .eq('slug', params.slug)
    .is('deleted_at', null)
    .maybeSingle();

  if (!property || property.status !== 'live') notFound();

  // Add-on data (public-safe, per-property): the review-nudge config and the
  // active upsell offers. Both are host-curated and safe to expose to a guest of
  // a live property. Fetched via the same admin client (RLS-bypassing) already used
  // for the public portal render.
  const [{ data: addonSettings }, { data: offers }] = await Promise.all([
    admin
      .from('property_settings')
      .select('review_nudge_enabled, review_nudge_auto, review_url')
      .eq('property_id', property.id)
      .maybeSingle(),
    admin
      .from('upsell_offers')
      .select('id, title, description, price_text, cta_label')
      .eq('property_id', property.id)
      .eq('active', true)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true }),
  ]);

  const reviewNudge = {
    enabled: !!addonSettings?.review_nudge_enabled && !!addonSettings?.review_url,
    auto: !!addonSettings?.review_nudge_auto,
    url: addonSettings?.review_url ?? null,
  };
  // Active offers are surfaced whenever the host has configured any — guest
  // visibility is intentionally NOT gated (creating an offer is the host's opt-in).
  const upsellOffers = offers ?? [];

  // If already verified for THIS property, start in the concierge view.
  const session = await getGuestSession();
  const verified = !!session && session.propertyId === property.id;

  // Host bypass: a logged-in host (owner or co-host) of THIS property can open the
  // portal on any device without the guest email/phone + Turnstile gate. They get a
  // read-only preview of the guest concierge (no guest session, conversation, or
  // escalation is created) via the host preview-chat endpoint. Only checked when the
  // visitor isn't already a verified guest, so guest behavior is unchanged.
  const hostAccess = verified ? null : await getPropertyAccess(property.id);
  const isHostPreview = !!hostAccess;

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
      guestName={verified ? session!.guestDisplayName : null}
      reviewNudge={reviewNudge}
      upsellOffers={upsellOffers}
    />
  );
}
