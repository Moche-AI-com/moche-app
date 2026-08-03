import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requirePropertyAccess, getUser } from '@/lib/auth/guards';
import { createAdminClient } from '@/lib/supabase/admin';
import { audit } from '@/lib/audit';
import { log } from '@/lib/log';
import type { Json as DbJson } from '@/lib/database.types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const BodySchema = z.object({
  contactId: z.string().uuid().nullable(),
});

// Assigns (or unassigns, contactId: null) a service request to a property contact.
export async function POST(req: Request, { params }: { params: { id: string; ticketId: string } }) {
  const access = await requirePropertyAccess(params.id);
  if (!access.can.resolveMaintenance) {
    return NextResponse.json({ error: 'You do not have permission to manage service requests for this property.' }, { status: 403 });
  }

  const json = await req.json().catch(() => null);
  const parsed = BodySchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  const { contactId } = parsed.data;

  const admin = createAdminClient();
  const { data: ticket } = await admin
    .from('service_requests')
    .select('id, property_id, timeline')
    .eq('id', params.ticketId)
    .eq('property_id', params.id)
    .maybeSingle();
  if (!ticket) return NextResponse.json({ error: 'Service request not found.' }, { status: 404 });

  if (contactId) {
    const { data: contact } = await admin
      .from('property_contacts')
      .select('id, property_id')
      .eq('id', contactId)
      .eq('property_id', params.id)
      .maybeSingle();
    if (!contact) return NextResponse.json({ error: 'Contact not found for this property.' }, { status: 404 });
  }

  const user = await getUser();
  const priorTimeline = Array.isArray(ticket.timeline) ? ticket.timeline : [];
  const timelineEvent = { at: new Date().toISOString(), type: 'assigned', contactId, by: user?.id ?? null };

  const { error } = await admin
    .from('service_requests')
    .update({
      assigned_contact_id: contactId,
      timeline: [...priorTimeline, timelineEvent] as unknown as DbJson,
    } as never)
    .eq('id', params.ticketId);

  if (error) {
    log.warn('service_request_assign_failed', { ticketId: params.ticketId, error: error.message });
    return NextResponse.json({ error: 'Could not assign this request.' }, { status: 500 });
  }

  await audit(admin, {
    action: 'service_request.assigned',
    actorProfileId: user?.id ?? null,
    hostAccountId: access.property.host_account_id,
    propertyId: params.id,
    targetType: 'service_request',
    targetId: params.ticketId,
    metadata: { contactId } as unknown as DbJson,
  });

  return NextResponse.json({ ok: true, contactId });
}
