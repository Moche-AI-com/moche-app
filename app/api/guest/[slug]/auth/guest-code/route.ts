import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/admin';
import { guestSessionCookieOptions } from '@/lib/guest/session';
import { createStaySessionFromLink } from '@/lib/guest/stay-session';
import { checkRateLimit } from '@/lib/rate-limit';
import { hashSessionToken, verifyVisitCode } from '@/lib/crypto';
import { DEFAULT_GRACE_PERIOD_HOURS } from '@/lib/constants';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const schema = z.object({
  code: z.string().regex(/^\d{4}$/),
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

// Party-code entry (party access redesign 2026-08-28). The shared 4-digit code
// proves the visitor belongs to the PARTY — nothing more. Every device that
// presents a valid code gets its own fresh, unregistered session, then
// identifies itself (name, optional phone) in the "Who's joining?" step. Each
// member of the party ends up with their own concierge thread, host-chat
// thread, and extras identity instead of inheriting whoever registered first.
//
// The old requiresPhoneConfirm gate is gone: it pinned a second device to the
// first registrant's phone number — exactly the collision this redesign
// removes. A returning guest on a new device reconnects to their existing
// identity in the register route via the phone contact hash, not at code entry.
//
// Same-browser repeat visits never hit this route at all: page.tsx resolves
// the existing session cookie and skips straight past code entry.
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
    .select('id, property_id, stay_id, pin_hash, pin_expires_at, pin_revoked_at, pin_first_used_at')
    .eq('property_id', property.id)
    .is('pin_revoked_at', null)
    .gt('pin_expires_at', now.toISOString())
    .limit(50);

  const match = (candidates ?? []).find((guest: any) => verifyVisitCode(parsed.data.code, guest.id, guest.pin_hash));
  if (!match) return NextResponse.json(GENERIC_FAIL, { status: 400 });

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

  // The new session belongs to this device only. It is deliberately NOT stamped
  // with the matched party pass's identity or registered_at — the register
  // route attaches the caller's own identity when they complete "Who's joining?".
  await db
    .from('guest_access_sessions')
    .update({ stay_guest_id: match.id })
    .eq('session_token_hash', hashSessionToken(created.sessionToken));

  await db
    .from('stay_guests')
    .update({ pin_first_used_at: match.pin_first_used_at ?? now.toISOString(), pin_attempt_count: 0 })
    .eq('id', match.id);

  (await cookies()).set({ ...guestSessionCookieOptions(expiresAt), value: created.sessionToken });
  return NextResponse.json({ ok: true, registered: false, guestName: null });
}
