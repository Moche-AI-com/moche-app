import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requirePropertyAccess, getUser } from '@/lib/auth/guards';
import { createAdminClient } from '@/lib/supabase/admin';
import { audit } from '@/lib/audit';
import { log } from '@/lib/log';
import type { Json as DbJson } from '@/lib/database.types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// The Edit Report dialog works on the whole report, not just the shared copy:
// type/urgency and the context fields are patched alongside the edited
// headline/details. Enum values mirror the Postgres enums in
// supabase/schema.sql (service_type, urgency_level).
const PatchSchema = z.object({
  serviceType: z.enum(['maintenance', 'cleaning', 'safety', 'emergency', 'information', 'other']),
  urgency: z.enum(['low', 'medium', 'high', 'critical']),
  editedSummary: z.string().max(200).nullable(),
  editedDetails: z.string().max(4000).nullable(),
  locationNote: z.string().max(300).nullable(),
  accessInstructions: z.string().max(1000).nullable(),
  guestAvailability: z.string().max(300).nullable(),
  resolutionNotes: z.string().max(1000).nullable(),
  likelyCauses: z.array(z.string().trim().min(1).max(300)).max(40),
  suggestedParts: z.array(z.string().trim().min(1).max(300)).max(40),
  safetyFlags: z.array(z.string().trim().min(1).max(300)).max(40),
});

// Host-editable share copy + context for a service request (Service tab →
// Edit report). The guest's original intake (summary / description) is never
// overwritten — outbound (emailed / texted) and printable reports prefer the
// edited copy, and every edit is timeline- and audit-logged. Saving empty
// strings clears the edited copy and reverts outbound reports to the guest's
// wording.
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string; ticketId: string }> }) {
  const { id, ticketId } = await params;
  const access = await requirePropertyAccess(id);
  if (!access.can.resolveMaintenance) {
    return NextResponse.json({ error: 'You do not have permission to manage service requests for this property.' }, { status: 403 });
  }

  const parsed = PatchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  const d = parsed.data;
  const blank = (v: string | null) => (v && v.trim() ? v.trim() : null);

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
      service_type: d.serviceType,
      urgency: d.urgency,
      edited_summary: blank(d.editedSummary),
      edited_details: blank(d.editedDetails),
      location_note: blank(d.locationNote),
      access_instructions: blank(d.accessInstructions),
      guest_availability: blank(d.guestAvailability),
      resolution_notes: blank(d.resolutionNotes),
      likely_causes: d.likelyCauses,
      suggested_parts: d.suggestedParts,
      safety_flags: d.safetyFlags,
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

  return NextResponse.json({ ok: true, editedSummary: blank(d.editedSummary), editedDetails: blank(d.editedDetails) });
}
