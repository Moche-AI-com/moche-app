import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/admin';
import { getUser, requirePropertyAccess } from '@/lib/auth/guards';
import { PARTY_INVITE_DEFAULT_MAX_JOINS } from '@/lib/guest/party-invite';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const NO_STORE = { 'Cache-Control': 'no-store' };
const schema = z.object({
  enabled: z.boolean().optional(),
  maxJoins: z.number().int().min(1).max(30).optional(),
}).refine((d) => d.enabled !== undefined || d.maxJoins !== undefined, { message: 'Nothing to update.' });

// Property-wide guest invite settings: whether guests can create 'Invite your
// group' links, and the default spots per new link (the booked guest count is
// used instead when it is higher). Owner, or a member with property-edit
// permission. Applies to new links; existing links keep their own cap.
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const access = await requirePropertyAccess(id);
  if (!access.isOwner && !access.can.editProperty) {
    return NextResponse.json({ error: 'Only the property owner can change invite settings.' }, { status: 403, headers: NO_STORE });
  }

  let payload: unknown;
  try { payload = await req.json(); } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400, headers: NO_STORE });
  }
  const parsed = schema.safeParse(payload);
  if (!parsed.success) return NextResponse.json({ error: 'Spots must be a whole number from 1 to 30.' }, { status: 400, headers: NO_STORE });

  const patch: Record<string, unknown> = {};
  if (parsed.data.enabled !== undefined) patch.guest_share_enabled = parsed.data.enabled;
  if (parsed.data.maxJoins !== undefined) patch.guest_share_max_joins = parsed.data.maxJoins;

  const db = createAdminClient() as any;
  const cols = 'guest_share_enabled, guest_share_max_joins';
  const { data: updated, error } = await db.from('property_settings').update(patch).eq('property_id', id).select(cols);
  if (error) return NextResponse.json({ error: 'Could not save invite settings.' }, { status: 503, headers: NO_STORE });
  let row = Array.isArray(updated) ? updated[0] : null;
  if (!row) {
    const inserted = await db.from('property_settings').insert({ property_id: id, ...patch }).select(cols).single();
    if (inserted.error) return NextResponse.json({ error: 'Could not save invite settings.' }, { status: 503, headers: NO_STORE });
    row = inserted.data;
  }

  const user = await getUser();
  await db.from('audit_logs').insert({
    host_account_id: access.property.host_account_id,
    property_id: id,
    actor_profile_id: user?.id ?? null,
    actor_type: 'host',
    action: 'property.party_invite_settings_updated',
    target_type: 'property',
    target_id: id,
    metadata: patch,
  });

  return NextResponse.json({
    settings: {
      enabled: row.guest_share_enabled !== false,
      maxJoins: row.guest_share_max_joins ?? PARTY_INVITE_DEFAULT_MAX_JOINS,
    },
  }, { headers: NO_STORE });
}
