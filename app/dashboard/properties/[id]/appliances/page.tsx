import { requirePropertyAccess } from '@/lib/auth/guards';
import { createClient } from '@/lib/supabase/server';
import { ApplianceClient } from './ApplianceClient';

export const dynamic = 'force-dynamic';

export default async function AppliancesPage({ params }: { params: { id: string } }) {
  const access = await requirePropertyAccess(params.id);
  const client = createClient();
  const [{ data: appliances }, { data: sections }] = await Promise.all([
    client.from('property_appliances').select('*').eq('property_id', params.id).order('created_at', { ascending: false }),
    client.from('appliance_manual_sections').select('*').eq('property_id', params.id).order('created_at', { ascending: false }),
  ]);
  return <div><h1 style={{ fontSize: '1.8rem', margin: '.5rem 0 1rem' }}>Appliances</h1><ApplianceClient propertyId={access.property.id} appliances={appliances ?? []} sections={sections ?? []} /></div>;
}
