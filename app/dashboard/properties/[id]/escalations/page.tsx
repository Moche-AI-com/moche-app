import { requirePropertyAccess } from '@/lib/auth/guards';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { EscalationInbox, type EscalationRowData } from '@/components/dashboard/EscalationInbox';

export const dynamic = 'force-dynamic';

export default async function PropertyEscalationsPage({ params }: { params: { id: string } }) {
  const propertyAccess = await requirePropertyAccess(params.id);
  const { property } = propertyAccess;
  if (!propertyAccess.can.receiveEscalations) redirect(`/dashboard/properties/${params.id}`);
  const supabase = createClient();
  const { data: escalations } = await supabase
    .from('escalations')
    .select('id, property_id, question, status, host_response, created_at, responded_at')
    .eq('property_id', property.id)
    .order('created_at', { ascending: false })
    .limit(200);

  const rows: EscalationRowData[] = (escalations ?? []).map((e) => ({
    id: e.id,
    propertyId: e.property_id,
    propertyName: property.display_name,
    question: e.question,
    status: e.status,
    hostResponse: e.host_response,
    createdAt: e.created_at,
    respondedAt: e.responded_at,
  }));
  const openCount = rows.filter((row) => row.status === 'open').length;

  return (
    <div>
      <h2 style={{ fontSize: '1.45rem', margin: '.5rem 0 .35rem' }}>Guest escalations</h2>
      <p className="muted" style={{ fontSize: '.9rem', margin: '0 0 1.25rem' }}>
        Questions your AI concierge couldn&apos;t answer on its own for this property.
      </p>
      <EscalationInbox
        rows={rows}
        properties={[{ id: property.id, name: property.display_name }]}
        openCountByProperty={{ [property.id]: openCount }}
        activeFilter={property.id}
        propertyPermissions={{ [property.id]: { canReceiveEscalations: propertyAccess.can.receiveEscalations, canReplyGuests: propertyAccess.can.replyGuests, canEditBrain: propertyAccess.can.editBrain } }}
      />
    </div>
  );
}
