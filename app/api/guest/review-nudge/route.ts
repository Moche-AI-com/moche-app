import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/admin';
import { getGuestSession } from '@/lib/guest/session';
import { getEntitlements, isGuestAiEnabled } from '@/lib/billing/entitlements';
import { checkRateLimit } from '@/lib/rate-limit';
import { safeReviewUrl } from '@/lib/guest/review-nudge-policy';
import { readReviewNudgePilot, type ReviewNudgePilot } from '@/lib/guest/review-nudge-rollout';
import { log } from '@/lib/log';
import { GET as legacyGET, POST as legacyPOST } from './legacy';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
type LiveContext = { admin: ReturnType<typeof createAdminClient>; session: NonNullable<Awaited<ReturnType<typeof getGuestSession>>>; pilot: ReviewNudgePilot };
type Context = { error: NextResponse } | { legacy: true } | LiveContext;
const schema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('impression'), automatic: z.boolean() }).strict(),
  z.object({ action: z.literal('response'), rating: z.number().int().min(1).max(5), helpfulness: z.enum(['yes', 'somewhat', 'not_yet']).optional(), comment: z.string().trim().max(800).optional() }).strict(),
  z.object({ action: z.literal('dismiss') }).strict(),
  z.object({ action: z.literal('click') }).strict(),
]);
function reply(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { 'Cache-Control': 'private, no-store' } });
}
async function context(): Promise<Context> {
  const session = await getGuestSession();
  if (!session) return { error: reply({ error: 'Session expired.' }, 401) };
  const admin = createAdminClient();
  const rollout = await admin.from('app_settings').select('value').eq('key', `review_nudge_v2:${session.propertyId}`).maybeSingle();
  if (rollout.error) throw new Error('rollout_read_failed');
  const pilot = readReviewNudgePilot(rollout.data?.value, process.env.REVIEW_NUDGE_V2_ENABLED);
  if (!pilot.enabled) return { legacy: true };
  const property = await admin.from('properties').select('host_account_id, status, deleted_at').eq('id', session.propertyId).maybeSingle();
  if (property.error) throw new Error('property_read_failed');
  if (!property.data || property.data.deleted_at || property.data.status !== 'live') return { error: reply({ eligible: false }, 404) };
  const ent = await getEntitlements(admin, property.data.host_account_id);
  const permittedDemo = !ent.reviewNudge && pilot.allowDemo && await isGuestAiEnabled(admin, property.data.host_account_id);
  if (!ent.reviewNudge && !permittedDemo) return { error: reply({ eligible: false }, 404) };
  return { admin, session, pilot };
}
async function invoke(ctx: LiveContext, action: string, automatic = false, rating: number | null = null, helpfulness: string | null = null, comment: string | null = null) {
  const result = await (ctx.admin as any).rpc('guest_review_nudge_v2', { p_session_id: ctx.session.sessionId, p_action: action, p_automatic: automatic, p_rating: rating, p_helpfulness: helpfulness, p_comment: comment });
  if (result.error || !result.data) throw new Error('review_nudge_rpc_failed');
  return result.data as { eligible?: boolean; automatic?: boolean; shouldPrompt?: boolean; allowed?: boolean; ok?: boolean; reviewUrl?: string | null };
}
export async function GET() {
  try {
    const ctx = await context();
    if ('error' in ctx) return ctx.error;
    if ('legacy' in ctx) {
      const response = await legacyGET();
      return reply({ ...await response.json(), flowVersion: 'legacy' }, response.status);
    }
    const data = await invoke(ctx, 'status');
    const reviewUrl = safeReviewUrl(data.reviewUrl);
    return reply({ ...data, flowVersion: 'v2', reviewUrl, stayKey: ctx.session.stayId, demoReview: ctx.pilot.demoReview && reviewUrl === 'https://www.moche-ai.com/review-demo' });
  } catch {
    log.warn('guest_review_nudge_read_failed');
    return reply({ eligible: false, error: 'Feedback is temporarily unavailable.' }, 503);
  }
}
export async function POST(req: Request) {
  try {
    const ctx = await context();
    if ('error' in ctx) return ctx.error;
    if ('legacy' in ctx) return await legacyPOST(req);
    const origin = req.headers.get('origin');
    if ((origin && origin !== new URL(req.url).origin) || req.headers.get('sec-fetch-site') === 'cross-site') return reply({ error: 'Request not allowed.' }, 403);
    if (!req.headers.get('content-type')?.toLowerCase().startsWith('application/json')) return reply({ error: 'JSON required.' }, 415);
    const raw = await req.text();
    if (raw.length > 4096) return reply({ error: 'Feedback is too long.' }, 413);
    let value: unknown;
    try { value = JSON.parse(raw); } catch { return reply({ error: 'Invalid feedback.' }, 400); }
    const parsed = schema.safeParse(value);
    if (!parsed.success) return reply({ error: 'Invalid feedback.' }, 400);
    const rate = await checkRateLimit(ctx.admin, { key: `review_nudge:${ctx.session.sessionId}`, action: 'guest.review_nudge', limit: 12, windowSeconds: 3600 });
    if (!rate.allowed) return reply({ error: 'Please wait before trying again.' }, 429);
    const d = parsed.data;
    const result = d.action === 'response'
      ? await invoke(ctx, d.action, false, d.rating, d.helpfulness ?? null, d.comment || null)
      : await invoke(ctx, d.action, d.action === 'impression' && d.automatic);
    if (result.eligible === false) return reply({ error: 'Feedback is not enabled.' }, 404);
    return reply(result);
  } catch {
    log.warn('guest_review_nudge_write_failed');
    return reply({ error: 'Could not save. Your feedback is still here; please try again.' }, 503);
  }
}
