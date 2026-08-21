import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/admin';
import { guestSessionCookieOptions } from '@/lib/guest/session';
import { createStaySessionFromLink } from '@/lib/guest/stay-session';
import { checkRateLimit } from '@/lib/rate-limit';
import { hashContact, hashSessionToken, verifyVisitCode } from '@/lib/crypto';
import { DEFAULT_GRACE_PERIOD_HOURS } from '@/lib/constants';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const schema = z.object({
  code: z.string().regex(/^\d{4}$/),
  phone: z.string().trim().min(7).max(40).optional(),
});

const LINK_COLUMNS = 'id, property_id, stay_id, kind, expires_at, consumed_at, max_redemptions, redemption_count, revoked_at';
const GENERIC_FAIL = { error: 'That code does not match an active guest for this stay.' };

function clientIp(req: Request) {
  return req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? req.headers.get('x-real-ip') ?? '0.0.0.0';
}

function linkUsable(link: any) {
  const now = Date.now();
  if (!link || link.revoked_at) return false;
  if (link.expires_at && new Date(link.expires_at).getTime() <= now) return false;
  if (link.consumed_at && (link.redemption_count ?? 0) >= (link.max_redemptions ?? 1)) return false;
  return true;
}

async function graceHours(admin: ReturnType<typeof createAdminClient>, propertyId: string) {
  const { data } = await admin
    .from('property_settings')
    .select('grace_period_hours')
    .eq('property_id', propertyId)
    .maybeSingle();
  const value = (data as { grace_period_hours?: number } | null)?.grace_period_hours;
  return typeof value === 'number' && value >= 0 && value <= 168 ? value : DEFAULT_GRACE_PERIOD_HOURS;
}

export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ip = clientIp(req);
  const admin = createAdminClient();
  const db = admin as any;

  const rate = await checkRateLimit(admin, {
    key: `guest_stay_code:${ip}`,
    action: 'guest.stay_code',
    limit: 30,
    windowSeconds: 3600,
  });
  if (!rate.allowed) return NextResponse.json(GENERIC_FAIL, { status: 429 });

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json(GENERIC_FAIL, { status: 400 });

  const { data: property } = await admin
    .from('properties')
    .select('id, slug')
    .eq('slug', slug)
    .maybeSingle();
  if (!property) return NextResponse.json(GENERIC_FAIL, { status: 400 });

  const now = new Date();
  const { data: candidates } = await db
    .from('stay_guests')
    .select('id, property_id, stay_id, guest_identity_id, display_name, phone_hash, pin_hash, pin_expires_at, pin_revoked_at, notification_consent')
    .eq('property_id', property.id)
    .is('pin_revoked_at', null)
    .gt('pin_expires_at', now.toISOString())
    .limit(50);

  const match = (candidates ?? []).find((guest: any) => verifyVisitCode(parsed.data.code, guest.id, guest.pin_hash));
  if (!match) return NextResponse.json(GENERIC_FAIL, { status: 400 });

  const registered = Boolean(match.guest_identity_id && match.display_name);
  if (registered && match.phone_hash && !parsed.data.phone) {
    return NextResponse.json({ ok: true, requiresPhoneConfirm: true });
  }
  if (registered && match.phone_hash) {
    const phoneHash = hashContact(parsed.data.phone!.trim());
    if (phoneHash !== match.phone_hash) return NextResponse.json(GENERIC_FAIL, { status: 400 });
  }

  const { data: stay } = await db
    .from('stays')
    .select('id, check_out, status')
    .eq('id', match.stay_id)
    .eq('property_id', property.id)
    .maybeSingle();
  if (!stay || !['upcoming', 'active'].includes(stay.status)) {
    return NextResponse.json(GENERIC_FAIL, { status: 400 });
  }

  const { data: links } = await db
    .from('guest_access_links')
    .select(LINK_COLUMNS)
    .eq('property_id', property.id)
    .eq('stay_id', match.stay_id)
    .eq('kind', 'stay')
    .is('revoked_at', null)
    .limit(10);
  const link = (links ?? []).find(linkUsable);
  if (!link) return NextResponse.json(GENERIC_FAIL, { status: 400 });

  const expiresAt = new Date(new Date(stay.check_out).getTime() + (await graceHours(admin, property.id)) * 60 * 60 * 1000);
  const created = await createStaySessionFromLink(admin, { propertyId: property.id, link, req, ip, expiresAt });
  if (!created) return NextResponse.json(GENERIC_FAIL, { status: 400 });

  await db
    .from('guest_access_sessions')
    .update({
      stay_guest_id: match.id,
      guest_identity_id: match.guest_identity_id,
      guest_contact: parsed.data.phone?.trim() ?? null,
      guest_contact_type: parsed.data.phone ? 'phone' : null,
      notification_consent: match.notification_consent === true,
      registered_at: registered ? now.toISOString() : null,
    })
    .eq('session_token_hash', hashSessionToken(created.sessionToken));

  await db
    .from('stay_guests')
    .update({ pin_first_used_at: match.pin_first_used_at ?? now.toISOString(), pin_attempt_count: 0 })
    .eq('id', match.id);

  (await cookies()).set({ ...guestSessionCookieOptions(expiresAt), value: created.sessionToken });
  return NextResponse.json({ ok: true, registered, guestName: match.display_name ?? null });
}
