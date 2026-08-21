import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createAdminClient, hasServiceRole } from '@/lib/supabase/admin';
import { checkRateLimit } from '@/lib/rate-limit';
import { sendEarlyAccessThanks } from '@/lib/mail/early-access';
import { log } from '@/lib/log';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Public, unauthenticated pre-launch early-access list. Hardened against spam/abuse:
//   - per-IP rate limit (Supabase-backed fixed window)
//   - strict input validation with length caps
//   - service-role insert (table has no public INSERT policy)
// Always returns a generic ok so it can't be used to probe state.
const WAITLIST_MAX_PER_IP_PER_HOUR = 5;

const schema = z.object({
  email: z.string().trim().toLowerCase().email().max(200),
  name: z.string().trim().max(200).optional().nullable(),
  phone: z.string().trim().max(40).optional().nullable(),
  desired_plan: z.string().trim().max(40).optional().nullable(),
  property_count: z.string().trim().max(40).optional().nullable(),
  property_locations: z.string().trim().max(300).optional().nullable(),
  features_wanted: z.array(z.string().trim().max(80)).max(20).optional().nullable(),
  notes: z.string().trim().max(2000).optional().nullable(),
  user_id: z.string().uuid().optional().nullable(),
  source: z.string().trim().max(40).optional().nullable(),
  // legacy landing fields, still accepted so the old landing form never breaks
  properties: z.string().trim().max(120).optional().nullable(),
  pain_point: z.string().trim().max(2000).optional().nullable(),
});

function clientIp(req: Request): string {
  const xff = req.headers.get('x-forwarded-for');
  if (xff) return xff.split(',')[0].trim();
  return req.headers.get('x-real-ip') ?? '0.0.0.0';
}

export async function POST(req: NextRequest) {
  try {
    let payload: unknown = {};
    try {
      payload = await req.json();
    } catch {
      return NextResponse.json({ ok: false, error: 'Invalid request' }, { status: 400 });
    }

    const parsed = schema.safeParse(payload ?? {});
    if (!parsed.success) {
      return NextResponse.json({ ok: false, error: 'Invalid email' }, { status: 400 });
    }

    if (!hasServiceRole()) {
      log.error('waitlist_no_service_role', {});
      // Acknowledge gracefully without exposing config state.
      return NextResponse.json({ ok: true });
    }

    const admin = createAdminClient();

    // Per-IP rate limit to prevent automated signup floods.
    const ipLimit = await checkRateLimit(admin, {
      key: clientIp(req),
      limit: WAITLIST_MAX_PER_IP_PER_HOUR,
      windowSeconds: 60 * 60,
      action: 'waitlist.signup',
    });
    if (!ipLimit.allowed) {
      log.warn('waitlist_rate_ip', {});
      return NextResponse.json({ ok: true }); // generic — no abuse signal
    }

    const d = parsed.data;
    // early_access_signups is a pre-launch marketing table not present in the
    // generated DB types. Cast narrowly for this untyped insert; validation above
    // guarantees shape.
    const { error } = await (admin.from('early_access_signups' as never) as any).insert({
      email: d.email,
      name: d.name || null,
      phone: d.phone || null,
      desired_plan: d.desired_plan || null,
      property_count: d.property_count || d.properties || null,
      property_locations: d.property_locations || null,
      features_wanted: d.features_wanted ?? [],
      notes: d.notes || d.pain_point || null,
      user_id: d.user_id || null,
      source: d.source || 'landing',
    });
    if (error) {
      // Table may not exist yet — still acknowledge the submission gracefully.
      log.error('early_access_insert_failed', { error: error.message });
    } else {
      // Fire-and-forget: a confirmation email failure must never lose a signup.
      void sendEarlyAccessThanks({ email: d.email, name: d.name ?? null }).catch((e) => {
        log.warn('early_access_thanks_failed', { error: String(e) });
      });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    log.error('waitlist_unexpected', { error: err instanceof Error ? err.message : String(err) });
    return NextResponse.json({ ok: false, error: 'Server error' }, { status: 500 });
  }
}

// Prevent GET requests
export async function GET() {
  return NextResponse.json({ error: 'Method not allowed' }, { status: 405 });
}
