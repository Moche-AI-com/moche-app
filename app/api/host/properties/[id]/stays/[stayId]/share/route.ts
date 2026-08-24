import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/admin';
import { getUser, requirePropertyAccess } from '@/lib/auth/guards';
import { hashContact } from '@/lib/crypto';
import { checkRateLimit } from '@/lib/rate-limit';
import { sendGuestPortalShare } from '@/lib/notify';
import { publicEnv } from '@/lib/env';
import { audit } from '@/lib/audit';
import { log } from '@/lib/log';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const postSchema = z.object({
  channel: z.enum(['sms', 'email']),
  destination: z.string().trim().min(5).max(320),
});

// Share a stay's guest portal with its guests: Moche-AI sends the portal link
// and the stay's one access code by SMS (Twilio) or email (Resend) on the
// host's behalf. The code is read back from the Vault envelope minted with the
// stay's link — it is never stored plaintext. Every attempt is logged to
// stay_share_invites (hash + last4 only) and audit_logs.
export async function POST(req: Request, { params }: { params: Promise<{ id: string; stayId: string }> }) {
  const { id, stayId } = await params;
  const access = await requirePropertyAccess(id);
  if (!access.isOwner && !access.can.replyGuests) {
    return NextResponse.json({ error: 'You do not have permission to share this stay.' }, { status: 403 });
  }

  const admin = createAdminClient();
  const db = admin as any;

  const rate = await checkRateLimit(admin, {
    key: `stay_share:${id}`,
    action: 'stay.share',
    limit: 30,
    windowSeconds: 3600,
  });
  if (!rate.allowed) {
    return NextResponse.json({ error: 'Too many shares. Please wait before sending more.' }, { status: 429 });
  }

  const parsed = postSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Enter a valid phone number or email address.' }, { status: 400 });
  }
  const { channel, destination } = parsed.data;
  if (channel === 'email' && !destination.includes('@')) {
    return NextResponse.json({ error: 'Enter a valid email address.' }, { status: 400 });
  }
  if (channel === 'sms') {
    const digits = destination.replace(/\D/g, '');
    if (digits.length < 7 || digits.length > 15) {
      return NextResponse.json({ error: 'Enter a valid phone number.' }, { status: 400 });
    }
  }

  const { data: stay } = await db
    .from('stays')
    .select('id, status, deleted_at')
    .eq('id', stayId)
    .eq('property_id', id)
    .maybeSingle();
  if (!stay || stay.deleted_at || !['upcoming', 'active'].includes(stay.status)) {
    return NextResponse.json({ error: 'Stay not found or no longer active.' }, { status: 404 });
  }

  // The stay's one access code lives on its latest coded, unrevoked link.
  const { data: link } = await db
    .from('guest_access_links')
    .select('id, code_secret_ref')
    .eq('property_id', id)
    .eq('stay_id', stayId)
    .eq('kind', 'stay')
    .not('code_hash', 'is', null)
    .is('code_revoked_at', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  let code: string | null = null;
  const ref = (link?.code_secret_ref as string | null) ?? null;
  if (link && ref && ref.startsWith('vault:')) {
    const { data: decrypted } = await db.rpc('portal_code_read', { p_secret_id: ref.slice('vault:'.length) });
    if (typeof decrypted === 'string' && decrypted) code = decrypted;
  }
  if (!link || !code) {
    return NextResponse.json(
      { error: 'This stay has no active access code to share. Regenerate one from the access panel first.' },
      { status: 400 },
    );
  }

  const property = access.property as any;
  const portalUrl = `${publicEnv.appUrl.replace(/\/$/, '')}/g/${property.slug}`;
  const sent = await sendGuestPortalShare({
    channel,
    contact: destination,
    propertyName: property.display_name,
    portalUrl,
    code,
  });

  const { contactHash, last4 } = hashContact(destination);
  const user = await getUser();
  const { error: logError } = await db.from('stay_share_invites').insert({
    property_id: id,
    stay_id: stayId,
    channel,
    destination_hash: contactHash,
    destination_last4: last4,
    status: sent ? 'sent' : 'failed',
    error: sent ? null : 'provider_send_failed',
    sent_by: user?.id ?? null,
  });
  if (logError) log.warn('stay_share_invite_log_failed', { propertyId: id, stayId, error: logError.message });

  await audit(admin, {
    action: sent ? 'stay.share_sent' : 'stay.share_failed',
    actorProfileId: user?.id ?? null,
    hostAccountId: property.host_account_id,
    propertyId: id,
    targetType: 'stay',
    targetId: stayId,
  });

  if (!sent) {
    return NextResponse.json(
      {
        error:
          channel === 'sms'
            ? 'The text could not be sent — SMS may not be configured yet. Try email instead.'
            : 'The email could not be sent. Check the address and try again.',
      },
      { status: 502 },
    );
  }
  return NextResponse.json({ ok: true });
}

// Recent share attempts for the stay (newest first). Destinations are masked.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string; stayId: string }> }) {
  const { id, stayId } = await params;
  const access = await requirePropertyAccess(id);
  if (!access.isOwner && !access.can.replyGuests) {
    return NextResponse.json({ error: 'You do not have permission to view this stay.' }, { status: 403 });
  }
  const admin = createAdminClient();
  const { data, error } = await (admin as any)
    .from('stay_share_invites')
    .select('id, channel, destination_last4, status, created_at')
    .eq('property_id', id)
    .eq('stay_id', stayId)
    .order('created_at', { ascending: false })
    .limit(10);
  if (error) return NextResponse.json({ error: 'Could not load share history.' }, { status: 500 });
  const invites = (data ?? []).map((row: any) => ({
    id: row.id as string,
    channel: row.channel as 'sms' | 'email',
    destinationLast4: (row.destination_last4 ?? null) as string | null,
    status: row.status as 'queued' | 'sent' | 'failed',
    createdAt: row.created_at as string,
  }));
  return NextResponse.json({ invites });
}
