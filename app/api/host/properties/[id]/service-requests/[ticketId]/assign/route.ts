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
  contactId: z.string().uuid().nullable().optional(),
  profileId: z.string().uuid().nullable().optional(),
});

// Assigns a service request to an external property contact (contactId — the
// vendor/cleaner whose details fill the follow-up line on outbound share
// messages) and/or to an internal teammate (profileId — the account owner or
// a property member). Each key is optional; null unassigns that side. At
// least one key must be present.
export async function POST(req: Request, { params }: { params: Promise<{ id: string; ticketId: string }> }) {
  const { id, ticketId } = await params;
  const access = await requirePropertyAccess(id);
  if (!access.can.resolveMaintenance) {
    return NextResponse.json({ error: 'You do not have permission to manage service requests for this property.' }, { status: 403 });
  }

  const json = await req.json().catch(() => null);
  const parsed = BodySchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  const { contactId, profileId } = parsed.data;
  if (contactId === undefined && profileId === undefined) {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  }

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
  const events: Record<string, unknown>[] = [];
  // assigned_profile_id lands in database.types.ts on the next `supabase gen
  // types` run; until then the payload opts out (same convention as the
  // stay_share_invites route).
  const update: Record<string, unknown> = {};

  if (contactId !== undefined) {
    if (contactId) {
      const { data: contact } = await admin
        .from('property_contacts')
        .select('id, property_id')
        .eq('id', contactId)
        .eq('property_id', id)
        .maybeSingle();
      if (!contact) return NextResponse.json({ error: 'Contact not found for this property.' }, { status: 404 });
    }
    update.assigned_contact_id = contactId;
    events.push({ at: new Date().toISOString(), type: 'assigned', contactId, by: user?.id ?? null });
  }

  if (profileId !== undefined) {
    if (profileId) {
      // The assignee must be the account owner or a member of this property —
      // never an arbitrary profile id supplied by the client.
      const { data: account } = await admin
        .from('host_accounts')
        .select('owner_id')
        .eq('id', access.property.host_account_id)
        .maybeSingle();
      const isOwnerProfile = account?.owner_id === profileId;
      if (!isOwnerProfile) {
        const { data: member } = await admin
          .from('property_members')
          .select('profile_id')
          .eq('property_id', id)
          .eq('profile_id', profileId)
          .maybeSingle();
        if (!member) return NextResponse.json({ error: 'Team member not found for this property.' }, { status: 404 });
      }
    }
    update.assigned_profile_id = profileId;
    events.push({ at: new Date().toISOString(), type: 'assigned_user', profileId, by: user?.id ?? null });
  }

  const { error } = await admin
    .from('service_requests')
    .update({
      ...update,
      timeline: [...priorTimeline, ...events] as unknown as DbJson,
    } as never)
    .eq('id', ticketId);

  if (error) {
    log.warn('service_request_assign_failed', { ticketId, error: error.message });
    return NextResponse.json({ error: 'Could not assign this request.' }, { status: 500 });
  }

  await audit(admin, {
    action: profileId !== undefined ? 'service_request.assigned_user' : 'service_request.assigned',
    actorProfileId: user?.id ?? null,
    hostAccountId: access.property.host_account_id,
    propertyId: id,
    targetType: 'service_request',
    targetId: ticketId,
    metadata: { contactId: contactId ?? null, profileId: profileId ?? null } as unknown as DbJson,
  });

  return NextResponse.json({ ok: true, contactId: contactId ?? null, profileId: profileId ?? null });
}
