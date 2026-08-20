import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/admin';
import { guestSessionCookieOptions } from '@/lib/guest/session';
import { createStaySessionFromLink } from '@/lib/guest/stay-session';
import { hashSessionToken, verifyVisitCode } from '@/lib/crypto';
import { checkRateLimit } from '@/lib/rate-limit';
import { log } from '@/lib/log';
import {
  VISIT_CODE_MAX_ATTEMPTS,
  VISIT_CODE_CONFIRM_MAX_PER_IP_PER_HOUR,
  VISIT_CODE_GRACE_PERIOD_HOURS,
} from '@/lib/constants';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Portal code entry (portal v2). Validates the 4-digit access code server-side
// and establishes the verified guest session.
//
// Two entry shapes:
//   - token present (stay/shared link): the code is checked against that link,
//     mirroring auth/code/confirm (per-link attempt caps included).
//   - token absent (bare property QR): the code is checked against the
//     property's currently-coded links, and the session binds to the property's
//     active stay. Per-IP rate limiting bounds guessing; per-link counters only
//     apply on the token path where the target link is identified.
//
// The failure payload is identical for bad code, expired link, and unknown
// property — no enumeration signal.
const GENERIC_FAIL = { error: 'The code entered is incorrect. Please try again.' };

const bodySchema = z.object({
  code: z.string().trim().regex(/^\d{4}$/),
  token: z.string().trim().min(1).max(200).optional(),
});

function clientIp(req: Request): string {
  const xff = req.headers.get('x-forwarded-for');
  if (xff) return xff.split(',')[0].trim();
  return req.headers.get('x-real-ip') ?? '0.0.0.0';
}

// Same column set as auth/code/confirm so createStaySessionFromLink receives
// the exact shape it already handles.
const LINK_COLUMNS =
  'id, property_id, stay_id, kind, expires_at, consumed_at, max_redemptions, redemption_count, revoked_at, code_hash, code_expires_at, code_revoked_at, code_first_used_at, code_attempt_count';

type LinkRow = {
  id: string;
  property_id: string;
  stay_id: string | null;
  kind: string;
  expires_at: string | null;
  revoked_at: string | null;
  code_hash: string | null;
  code_expires_at: string | null;
  code_revoked_at: string | null;
  code_first_used_at: string | null;
  code_attempt_count: number;
};

function linkUsable(link: LinkRow): link is LinkRow & { code_hash: string } {
  if (!link.code_hash) return false;
  if (link.revoked_at || link.code_revoked_at) return false;
  if (link.expires_at && new Date(link.expires_at) < new Date()) return false;
  if (link.code_expires_at && new Date(link.code_expires_at) < new Date()) return false;
  if (link.code_attempt_count >= VISIT_CODE_MAX_ATTEMPTS) return false;
  return true;
}

export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ip = clientIp(req);
  const admin = createAdminClient();

  const rl = await checkRateLimit(admin, {
    key: `guest_portal_code:${ip}`,
    limit: VISIT_CODE_CONFIRM_MAX_PER_IP_PER_HOUR,
    windowSeconds: 3600,
    action: 'guest.portal_code',
  });
  if (!rl.allowed) return NextResponse.json(GENERIC_FAIL, { status: 429 });

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json(GENERIC_FAIL, { status: 400 });
  const { code, token } = parsed.data;

  const { data: property } = await admin
    .from('properties')
    .select('id, slug, status')
    .eq('slug', slug)
    .is('deleted_at', null)
    .maybeSingle();
  if (!property || property.status !== 'live') return NextResponse.json(GENERIC_FAIL, { status: 400 });

  let candidates: LinkRow[] = [];
  if (token) {
    const { data: link } = await admin
      .from('guest_access_links')
      .select(LINK_COLUMNS)
      .eq('token_hash', hashSessionToken(token))
      .eq('property_id', property.id)
      .maybeSingle();
    if (link) candidates = [link as LinkRow];
  } else {
    const { data: links } = await admin
      .from('guest_access_links')
      .select(LINK_COLUMNS)
      .eq('property_id', property.id)
      .not('code_hash', 'is', null)
      .is('revoked_at', null)
      .is('code_revoked_at', null)
      .order('created_at', { ascending: false })
      .limit(10);
    candidates = (links ?? []) as LinkRow[];
  }

  const match = candidates.find((l) => linkUsable(l) && verifyVisitCode(code, l.id, l.code_hash));

  if (!match) {
    if (token && candidates[0] && candidates[0].code_hash) {
      const link = candidates[0];
      const nextAttempts = link.code_attempt_count + 1;
      const update: Record<string, unknown> = { code_attempt_count: nextAttempts };
      if (nextAttempts >= VISIT_CODE_MAX_ATTEMPTS) update.code_revoked_at = new Date().toISOString();
      await admin.from('guest_access_links').update(update).eq('id', link.id);
    }
    return NextResponse.json(GENERIC_FAIL, { status: 400 });
  }

  // Resolve the stay this session binds to: the link's stay, or the property's
  // current active stay for property-wide QR codes.
  let stayId = match.stay_id;
  if (!stayId) {
    const { data: activeStay } = await admin
      .from('stays')
      .select('id')
      .eq('property_id', property.id)
      .eq('status', 'active')
      .is('deleted_at', null)
      .order('check_in', { ascending: false })
      .limit(1)
      .maybeSingle();
    stayId = activeStay?.id ?? null;
  }
  if (!stayId) {
    return NextResponse.json(
      { error: 'There is no active reservation for this code. Please contact your host.' },
      { status: 400 },
    );
  }

  const { data: stay } = await admin
    .from('stays')
    .select('id, check_out, guest_identity_id')
    .eq('id', stayId)
    .maybeSingle();
  if (!stay) return NextResponse.json(GENERIC_FAIL, { status: 400 });

  const expiresAt = new Date(new Date(stay.check_out).getTime() + VISIT_CODE_GRACE_PERIOD_HOURS * 60 * 60 * 1000);
  const created = await createStaySessionFromLink(admin, {
    propertyId: property.id,
    // Property links carry stay_id NULL; the session requires a stay, so pass
    // the resolved stay. Cast matches the route-local link row shape.
    link: { ...match, stay_id: stay.id } as never,
    req,
    ip,
    expiresAt,
  });
  if (!created) return NextResponse.json(GENERIC_FAIL, { status: 500 });

  if (!match.code_first_used_at) {
    await admin
      .from('guest_access_links')
      .update({ code_first_used_at: new Date().toISOString() })
      .eq('id', match.id);
  }

  // Set the opaque httpOnly session cookie. Only the token hash is stored server-side.
  (await cookies()).set({ ...guestSessionCookieOptions(created.expiresAt), value: created.sessionToken });

  // A returning guest (identity already registered for this stay) skips
  // registration and lands on the main menu.
  let registered = false;
  let guestName: string | null = null;
  if (stay.guest_identity_id) {
    const { data: identity } = await admin
      .from('guest_identities')
      .select('*')
      .eq('id', stay.guest_identity_id)
      .maybeSingle();
    const firstName = (identity as Record<string, unknown> | null)?.first_name;
    if (typeof firstName === 'string' && firstName.length > 0) {
      registered = true;
      guestName = firstName;
    }
  }

  log.info('guest_portal_code_verified', { propertyId: property.id, stayId: stay.id });
  return NextResponse.json({ ok: true, registered, guestName });
}
