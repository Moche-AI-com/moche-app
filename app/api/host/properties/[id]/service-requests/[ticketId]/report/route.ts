import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requirePropertyAccess, getUser } from '@/lib/auth/guards';
import { createAdminClient } from '@/lib/supabase/admin';
import { audit } from '@/lib/audit';
import { log } from '@/lib/log';
import type { Json as DbJson } from '@/lib/database.types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const PatchSchema = z.object({
  editedSummary: z.string().max(200).nullable(),
  editedDetails: z.string().max(4000).nullable(),
});

// Host-editable share copy for a service request (Service tab → Edit report).
// The guest's original intake (summary / description) is never overwritten —
// outbound (emailed / texted) and printable reports prefer the edited copy,
// and every edit is timeline- and audit-logged. Saving empty strings clears
// the edited copy and reverts outbound reports to the guest's wording.
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string; ticketId: string }> }) {
  const { id, ticketId } = await params;
  const access = await requirePropertyAccess(id);
  if (!access.can.resolveMaintenance) {
    return NextResponse.json({ error: 'You do not have permission to manage service requests for this property.' }, { status: 403 });
  }

  const parsed = PatchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  const editedSummary = parsed.data.editedSummary?.trim() ? parsed.data.editedSummary.trim() : null;
  const editedDetails = parsed.data.editedDetails?.trim() ? parsed.data.editedDetails.trim() : null;

  const admin = createAdminClient();
  const { data: ticket } = await admin
    .from('service_requests')
    .select('id, property_id, timeline')
    .eq('id', ticketId)
    .eq('property_id', id)
    .maybeSingle();
  if (!ticket) return NextResponse.json({ error: 'Service request not found.' }, { status: 404 });

  const user = await getUser();
  const priorTimeline = Array.isArray(ticket.timeline) ? ticket.timeline : [];
  const timelineEvent = { at: new Date().toISOString(), type: 'report_edited', by: user?.id ?? null };

  // edited_* columns land in database.types.ts on the next `supabase gen
  // types` run; until then the payload opts out (same convention as the
  // stay_share_invites route).
  const { error } = await admin
    .from('service_requests')
    .update({
      edited_summary: editedSummary,
      edited_details: editedDetails,
      edited_at: new Date().toISOString(),
      edited_by: user?.id ?? null,
      timeline: [...priorTimeline, timelineEvent] as unknown as DbJson,
    } as never)
    .eq('id', ticketId);

  if (error) {
    log.warn('service_request_report_edit_failed', { ticketId, error: error.message });
    return NextResponse.json({ error: 'Could not save the edited report.' }, { status: 500 });
  }

  await audit(admin, {
    action: 'service_request.report_edited',
    actorProfileId: user?.id ?? null,
    hostAccountId: access.property.host_account_id,
    propertyId: id,
    targetType: 'service_request',
    targetId: ticketId,
  });

  return NextResponse.json({ ok: true, editedSummary, editedDetails });
}
