import { NextResponse } from 'next/server';
import QRCode from 'qrcode';
import { createAdminClient } from '@/lib/supabase/admin';
import { requirePropertyAccess, getUser } from '@/lib/auth/guards';
import { linkMintSchema } from '@/lib/validation';
import { generateSessionToken, hashSessionToken, generateVisitCode, hashVisitCode } from '@/lib/crypto';
import { publicEnv } from '@/lib/env';
import {
  DEFAULT_GRACE_PERIOD_HOURS,
  PROPERTY_LINK_TTL_DAYS,
  STAY_LINK_DEFAULT_MAX_REDEMPTIONS,
  PROPERTY_LINK_DEFAULT_MAX_REDEMPTIONS,
  VISIT_CODE_GRACE_PERIOD_HOURS,
} from '@/lib/constants';
import { audit } from '@/lib/audit';
import { log } from '@/lib/log';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function appBaseUrl(req: Request): string {
  if (publicEnv.appUrl && !publicEnv.appUrl.includes('localhost')) return publicEnv.appUrl.replace(/\/$/, '');
  try {
    return new URL(req.url).origin;
  } catch {
    return publicEnv.appUrl.replace(/\/$/, '');
  }
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const access = await requirePropertyAccess((await params).id);
  if (!access.isOwner && !access.can.replyGuests) {
    return NextResponse.json({ error: 'You do not have permission to mint links.' }, { status: 403 });
  }
  const { property } = access;

  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  }
  const parsed = linkMintSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid request.' }, { status: 400 });
  }
  const { kind, stayId, requireOtp, maxRedemptions } = parsed.data;

  const admin = createAdminClient();
  const user = await getUser();

  let linkStayId: string | null = null;
  let expiresAt: string | null = null;
  let stayCheckOut: string | null = null;
  let maxRedempt: number;

  if (kind === 'stay') {
    if (!stayId) return NextResponse.json({ error: 'A stay is required for a stay link.' }, { status: 400 });
    const { data: stay } = await admin
      .from('stays').select('id, check_out, deleted_at').eq('id', stayId).eq('property_id', property.id).maybeSingle();
    if (!stay || stay.deleted_at) return NextResponse.json({ error: 'Stay not found.' }, { status: 404 });
    linkStayId = stay.id;
    stayCheckOut = stay.check_out;
    expiresAt = new Date(new Date(stay.check_out).getTime() + DEFAULT_GRACE_PERIOD_HOURS * 60 * 60 * 1000).toISOString();
    maxRedempt = maxRedemptions ?? STAY_LINK_DEFAULT_MAX_REDEMPTIONS;
  } else {
    // Reusable property QR: no stay, long-lived, OTP by default (posted in the home).
    expiresAt = new Date(Date.now() + PROPERTY_LINK_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString();
    maxRedempt = maxRedemptions ?? PROPERTY_LINK_DEFAULT_MAX_REDEMPTIONS;
  }

  const token = generateSessionToken();
  const tokenHash = hashSessionToken(token);
  // Property links default to requiring OTP; stay links default to no OTP (host vouches).
  const effectiveRequireOtp = requireOtp ?? kind === 'property';

  const { data: link, error } = await admin.from('guest_access_links').insert({
    property_id: property.id,
    stay_id: linkStayId,
    token_hash: tokenHash,
    kind,
    expires_at: expiresAt,
    max_redemptions: maxRedempt,
    require_otp: effectiveRequireOtp,
    created_by: user?.id ?? null,
  } as never).select('id').single();

  if (error || !link) {
    log.warn('guest_link_mint_failed', { propertyId: property.id, error: error?.message });
    return NextResponse.json({ error: 'Could not create the link.' }, { status: 500 });
  }

  const url = `${appBaseUrl(req)}/stay/${property.slug}?k=${token}`;
  const qrDataUrl = await QRCode.toDataURL(url, { width: 512, margin: 1 });
  const linkId = (link as { id: string }).id;

  // Stay links get a mandatory 4-digit code as a second factor — the link/token
  // alone is never sufficient (WS-1). Property links keep OTP-only gating.
  let code: string | null = null;
  if (kind === 'stay' && stayCheckOut) {
    code = generateVisitCode();
    // Code fails closed at checkout + grace — independent of the link's own
    // (longer, DEFAULT_GRACE_PERIOD_HOURS) expiry, which still governs the link/URL itself.
    const codeExpiresAt = new Date(new Date(stayCheckOut).getTime() + VISIT_CODE_GRACE_PERIOD_HOURS * 60 * 60 * 1000).toISOString();
    const { error: codeError } = await admin
      .from('guest_access_links')
      .update({ code_hash: hashVisitCode(code, linkId), code_expires_at: codeExpiresAt } as never)
      .eq('id', linkId);
    if (codeError) {
      log.warn('guest_link_code_mint_failed', { propertyId: property.id, linkId, error: codeError.message });
      return NextResponse.json({ error: 'Could not create the access code.' }, { status: 500 });
    }
    await audit(admin, {
      action: 'guest_link.code_issued',
      actorProfileId: user?.id ?? null,
      hostAccountId: property.host_account_id,
      propertyId: property.id,
      targetType: 'guest_access_link',
      targetId: linkId,
    });
  }

  // RAW token + code returned exactly once. Never stored raw, never logged.
  return NextResponse.json({ token, code, url, qrDataUrl, linkId });
}
