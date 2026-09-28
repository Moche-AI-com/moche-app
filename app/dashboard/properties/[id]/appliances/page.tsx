import Link from 'next/link';
import { requirePropertyAccess } from '@/lib/auth/guards';
import { createClient } from '@/lib/supabase/server';
import { ApplianceClient } from './ApplianceClient';
import { AppliancePrefillPanel } from './AppliancePrefillPanel';

export const dynamic = 'force-dynamic';

export default async function AppliancesPage({ params }: { params: Promise<{ id: string }> }) {
  const access = await requirePropertyAccess((await params).id);
  const propertyId = access.property.id;
  // The schema migration must be applied before this page ships. Never silently
  // hide a failed answer read or tell hosts their review queue is empty.
  const client = createClient() as any;
  const [inventory, manuals, answers] = await Promise.all([
    client.from('property_appliances').select('*').eq('property_id', propertyId).order('created_at', { ascending: false }),
    client.from('appliance_manual_sections').select('*').eq('property_id', propertyId).order('created_at', { ascending: false }),
    client.from('appliance_answers').select('id, property_id, appliance_id, question, answer, status, approved_at, model_number_snapshot').eq('property_id', propertyId).order('created_at', { ascending: false }),
  ]);
  if (inventory.error || manuals.error || answers.error) throw new Error('Appliance knowledge could not be loaded.');
  return (
    <div>
      <Link href={`/dashboard/properties/${propertyId}/brain`} className="faint">← Manage Brain</Link>
      <h1 style={{ fontSize: '1.8rem', margin: '.5rem 0 1rem' }}>Appliances</h1>
      {access.can.editProperty && <AppliancePrefillPanel
        propertyId={propertyId}
        appliances={(inventory.data ?? []).filter((item: { model_number: string | null }) => !!item.model_number).map((item: { id: string; display_name: string; model_number: string }) => ({ id: item.id, name: item.display_name, model: item.model_number }))}
      />}
      <ApplianceClient
        propertyId={propertyId}
        canEdit={access.can.editProperty}
        appliances={inventory.data ?? []}
        sections={manuals.data ?? []}
        answers={answers.data ?? []}
      />
    </div>
  );
}
