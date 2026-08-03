import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requirePropertyAccess, getUser } from '@/lib/auth/guards';
import { createAdminClient } from '@/lib/supabase/admin';
import { audit } from '@/lib/audit';
import { log } from '@/lib/log';
import type { Database, Json as DbJson } from '@/lib/database.types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type ServiceStatus = Database['public']['Enums']['service_status'];
type Json = Database['public']['Tables']['service_requests']['Row']['timeline'];

// Ordered lifecycle. Forward-only for the common path, but 'waiting_on_guest'
// can bounce back to 'in_progress', and either can move straight to 'resolved'.
const ALLOWED_TRANSITIONS: Record<ServiceStatus, ServiceStatus[]> = {
  new: ['acknowledged', 'resolved', 'closed'],
  acknowledged: ['in_progress', 'waiting_on_guest', 'resolved', 'closed'],
  in_progress: ['waiting_on_guest', 'resolved', 'closed'],
  waiting_on_guest: ['in_progress', 'resolved', 'closed'],
  resolved: ['closed', 'in_progress'], // reopen if the fix didn't hold
  closed: [],
};

const BodySchema = z.object({
  status: z.enum(['new', 'acknowledged', 'in_progress', 'waiting_on_guest', 'resolved', 'closed']),
  resolutionNotes: z.string().trim().max(1000).optional(),
});

export async function POST(req: Request, { params }: { params: { id: string; ticketId: string } }) {
  const access = await requirePropertyAccess(params.id);
  if (!access.can.resolveMaintenance) {
    return NextResponse.json({ error: 'You do not have permission to manage service requests for this property.' }, { status: 403 });
  }

  const json = await req.json().catch(() => null);
  const parsed = BodySchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  const { status: nextStatus, resolutionNotes } = parsed.data;

  const admin = createAdminClient();
  const { data: ticket } = await admin
    .from('service_requests')
    .select('id, property_id, status, timeline, resolution_notes')
    .eq('id', params.ticketId)
    .eq('property_id', params.id)
    .maybeSingle();
  if (!ticket) return NextResponse.json({ error: 'Service request not found.' }, { status: 404 });

  const current = ticket.status as ServiceStatus;
  if (current !== nextStatus && !ALLOWED_TRANSITIONS[current].includes(nextStatus)) {
    return NextResponse.json({ error: `Cannot move from "${current}" to "${nextStatus}".` }, { status: 409 });
  }

  const user = await getUser();
  const priorTimeline = Array.isArray(ticket.timeline) ? ticket.timeline : [];
  const timelineEvent = { at: new Date().toISOString(), type: 'status_changed', from: current, to: nextStatus, by: user?.id ?? null };

  const { error } = await admin
    .from('service_requests')
    .update({
      status: nextStatus,
      resolution_notes: resolutionNotes ?? ticket.resolution_notes,
      timeline: [...priorTimeline, timelineEvent] as unknown as Json,
    } as never)
    .eq('id', params.ticketId);

  if (error) {
    log.warn('service_request_status_update_failed', { ticketId: params.ticketId, error: error.message });
    return NextResponse.json({ error: 'Could not update the status.' }, { status: 500 });
  }

  await audit(admin, {
    action: 'service_request.status_changed',
    actorProfileId: user?.id ?? null,
    hostAccountId: access.property.host_account_id,
    propertyId: params.id,
    targetType: 'service_request',
    targetId: params.ticketId,
    metadata: { from: current, to: nextStatus } as unknown as DbJson,
  });

  return NextResponse.json({ ok: true, status: nextStatus });
}
