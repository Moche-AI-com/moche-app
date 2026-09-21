import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/admin';
import { getGuestSession } from '@/lib/guest/session';
import { checkRateLimit } from '@/lib/rate-limit';
import { log } from '@/lib/log';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const TERMINAL_PAGES = [
  'guest_portal_review_nudge',
  'guest_portal_review_nudge_dismiss',
  'guest_portal_review_nudge_click',
];

const feedbackSchema = z.object({
  action: z.enum(['positive', 'negative', 'dismiss', 'click']),
  category: z.enum(['hard_to_find', 'unhelpful_answer', 'technical_problem', 'other']).optional(),
  comment: z.string().trim().max(800).optional(),
}).strict();

function safeReviewUrl(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  try {
    const url = new URL(value.trim());
    return url.protocol === 'https:' ? url.toString() : null;
  } catch {
    return null;
  }
}

export async function GET() {
  const session = await getGuestSession();
  if (!session) return NextResponse.json({ eligible: false }, { status: 401 });

  const admin = createAdminClient();
  const [{ data: settings }, { data: prior }] = await Promise.all([
    admin
      .from('property_settings')
      .select('review_nudge_enabled, review_url')
      .eq('property_id', session.propertyId)
      .maybeSingle(),
    admin
      .from('product_feedback')
      .select('id')
      .eq('source', 'guest')
      .eq('property_id', session.propertyId)
      .eq('guest_session_id', session.sessionId)
      .in('page', TERMINAL_PAGES)
      .limit(1),
  ]);

  const reviewUrl = safeReviewUrl(settings?.review_url);
  return NextResponse.json({
    eligible: settings?.review_nudge_enabled === true && !!reviewUrl && !prior?.length,
    reviewUrl,
  });
}

export async function POST(req: Request) {
  const session = await getGuestSession();
  if (!session) return NextResponse.json({ error: 'Session expired.' }, { status: 401 });

  const parsed = feedbackSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid feedback.' }, { status: 400 });

  const admin = createAdminClient();
  const rate = await checkRateLimit(admin, {
    key: `review_nudge:${session.sessionId}`,
    action: 'guest.review_nudge',
    limit: 8,
    windowSeconds: 60 * 60,
  });
  if (!rate.allowed) return NextResponse.json({ error: 'Too many requests.' }, { status: 429 });

  const { data: settings } = await admin
    .from('property_settings')
    .select('review_nudge_enabled, review_url')
    .eq('property_id', session.propertyId)
    .maybeSingle();
  if (settings?.review_nudge_enabled !== true || !safeReviewUrl(settings.review_url)) {
    return NextResponse.json({ error: 'Review feedback is not enabled.' }, { status: 404 });
  }

  const { action, category, comment } = parsed.data;
  const page = action === 'dismiss'
    ? 'guest_portal_review_nudge_dismiss'
    : action === 'click'
      ? 'guest_portal_review_nudge_click'
      : 'guest_portal_review_nudge';
  const rating = action === 'positive' || action === 'click' ? 5 : action === 'negative' ? 2 : null;
  const detail = [category ? `Category: ${category}` : '', comment ?? ''].filter(Boolean).join(' — ') || null;

  const { error } = await admin.from('product_feedback').insert({
    source: 'guest',
    rating,
    comment: detail,
    property_id: session.propertyId,
    guest_session_id: session.sessionId,
    page,
  } as never);

  if (error) {
    log.warn('guest_review_nudge_feedback_failed', { propertyId: session.propertyId });
    return NextResponse.json({ error: 'Could not save feedback.' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
