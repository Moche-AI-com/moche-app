import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getSessionContext } from '@/lib/auth/guards';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { ActivationJourney } from './ActivationJourney';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Activate your first property — Moche-AI',
  description: 'Create, test, publish, and share your first Moche-AI guest concierge.',
  robots: { index: false, follow: false },
};

export default async function WelcomePage() {
  const ctx = await getSessionContext();
  if (!ctx) redirect('/login');

  const supabase = createClient();
  const { data: properties } = await supabase
    .from('properties')
    .select('id, display_name, slug, status, address_line1, city, region')
    .eq('host_account_id', ctx.account.id)
    .is('deleted_at', null)
    .order('created_at', { ascending: true });

  const selected = properties?.find((property) => property.status !== 'live') ?? properties?.[0] ?? null;
  let brainCount = 0;
  let stayCount = 0;
  let accessCount = 0;

  if (selected) {
    const admin = createAdminClient();
    const [brainResult, stayResult, accessResult] = await Promise.all([
      supabase.from('brain_items').select('id', { count: 'exact', head: true }).eq('property_id', selected.id).is('deleted_at', null),
      supabase.from('stays').select('id', { count: 'exact', head: true }).eq('property_id', selected.id).is('deleted_at', null),
      admin.from('guest_access_links').select('id', { count: 'exact', head: true }).eq('property_id', selected.id).is('revoked_at', null),
    ]);
    brainCount = brainResult.count ?? 0;
    stayCount = stayResult.count ?? 0;
    accessCount = accessResult.count ?? 0;
  }

  return <ActivationJourney
    firstName={ctx.profile.full_name?.trim().split(/\s+/)[0] ?? null}
    profileComplete={Boolean(ctx.profile.full_name?.trim())}
    property={selected ? { id: selected.id, name: selected.display_name, slug: selected.slug, status: selected.status } : null}
    addressComplete={Boolean(selected?.address_line1 && selected?.city && selected?.region)}
    brainCount={brainCount}
    stayCount={stayCount}
    accessCount={accessCount}
  />;
}
