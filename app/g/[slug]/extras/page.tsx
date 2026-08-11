import { redirect } from 'next/navigation';
import { createAdminClient } from '@/lib/supabase/admin';
import { getGuestSession } from '@/lib/guest/session';
import { GuestExtrasExperience, type GuestExtraOffer } from './GuestExtrasExperience';

export const dynamic = 'force-dynamic';

export default async function GuestExtrasPage({ params }: { params: { slug: string } }) {
  const session = await getGuestSession();
  if (!session) redirect(`/g/${params.slug}`);

  const admin = createAdminClient();
  const { data: property } = await admin.from('properties')
    .select('id, slug, display_name')
    .eq('id', session.propertyId)
    .maybeSingle();
  if (!property || property.slug !== params.slug) redirect(`/g/${params.slug}`);

  const { data: offers } = await admin.from('guest_extras')
    .select('id, title, description, details, price_text, cta_label, category, max_quantity, kind, unit_label, option_label, options')
    .eq('property_id', session.propertyId)
    .eq('active', true)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true });

  return (
    <GuestExtrasExperience
      slug={params.slug}
      propertyName={property.display_name}
      offers={(offers ?? []) as GuestExtraOffer[]}
    />
  );
}
