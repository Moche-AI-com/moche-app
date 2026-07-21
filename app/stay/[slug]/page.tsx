import { notFound } from 'next/navigation';
import { createAdminClient } from '@/lib/supabase/admin';
import { StayRedeem } from './StayRedeem';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

// Magic-link / QR landing page. The token arrives in ?k=. This page resolves the
// property for branding, then a small client redeems the token and routes the guest
// into the existing portal at /g/{slug} (verified session, or OTP gate pre-filled).
export default async function StayLandingPage({
  params,
  searchParams,
}: {
  params: { slug: string };
  searchParams: { k?: string };
}) {
  const admin = createAdminClient();
  const { data: property } = await admin
    .from('properties')
    .select('display_name, slug, status, brand_accent, logo_url')
    .eq('slug', params.slug)
    .is('deleted_at', null)
    .maybeSingle();

  if (!property || property.status !== 'live') notFound();

  return (
    <StayRedeem
      slug={property.slug}
      propertyName={property.display_name}
      brandAccent={property.brand_accent}
      logoUrl={property.logo_url}
      token={searchParams.k ?? ''}
    />
  );
}
