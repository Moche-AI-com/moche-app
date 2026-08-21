import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/admin';
import { requirePropertyAccess } from '@/lib/auth/guards';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const patchSchema = z.object({
  memberId: z.string().uuid(),
  canSendAnnouncements: z.boolean(),
  canPublishGuestAnswers: z.boolean(),
});

function canManage(access: Awaited<ReturnType<typeof requirePropertyAccess>>) {
  return access.isOwner || access.can.editProperty;
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const propertyId = (await params).id;
  const access = await requirePropertyAccess(propertyId);
  if (!canManage(access)) {
    return NextResponse.json({ error: 'You do not have permission to manage chat access.' }, { status: 403 });
  }

  const admin = createAdminClient();
  const db = admin as any;
  const { data: members, error } = await db
    .from('property_members')
    .select('id, profile_id, role, can_reply_guests, can_receive_escalations, can_send_announcements, can_publish_guest_answers')
    .eq('property_id', propertyId)
    .order('created_at', { ascending: true });
  if (error) return NextResponse.json({ error: 'Could not load team members.' }, { status: 500 });

  const profileIds = [...new Set((members ?? []).map((member: any) => member.profile_id).filter(Boolean))];
  const { data: profiles } = profileIds.length
    ? await db.from('profiles').select('id, email, full_name').in('id', profileIds)
    : { data: [] };
  const profileById = new Map(((profiles ?? []) as any[]).map((profile) => [profile.id, profile]));

  return NextResponse.json({
    members: (members ?? []).map((member: any) => ({
      id: member.id,
      role: member.role,
      name: profileById.get(member.profile_id)?.full_name || profileById.get(member.profile_id)?.email || 'Team member',
      email: profileById.get(member.profile_id)?.email ?? null,
      canReplyGuests: member.can_reply_guests === true,
      canReceiveEscalations: member.can_receive_escalations === true,
      canSendAnnouncements: member.can_send_announcements === true,
      canPublishGuestAnswers: member.can_publish_guest_answers === true,
    })),
  });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const propertyId = (await params).id;
  const access = await requirePropertyAccess(propertyId);
  if (!canManage(access)) {
    return NextResponse.json({ error: 'You do not have permission to manage chat access.' }, { status: 403 });
  }

  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid permission update.' }, { status: 400 });

  const admin = createAdminClient();
  const { error } = await (admin as any)
    .from('property_members')
    .update({
      can_send_announcements: parsed.data.canSendAnnouncements,
      can_publish_guest_answers: parsed.data.canPublishGuestAnswers,
    })
    .eq('id', parsed.data.memberId)
    .eq('property_id', propertyId);

  if (error) return NextResponse.json({ error: 'Could not update chat permissions.' }, { status: 500 });
  return NextResponse.json({ ok: true });
}
