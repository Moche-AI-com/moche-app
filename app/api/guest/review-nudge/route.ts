import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/admin';
import { getGuestSession } from '@/lib/guest/session';
import { checkRateLimit } from '@/lib/rate-limit';
import { capture } from '@/lib/posthog-server';
import { log } from '@/lib/log';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const LEGACY_TERMINAL_PAGES = ['guest_portal_review_nudge', 'guest_portal_review_nudge_dismiss', 'guest_portal_review_nudge_click'];
const TERMINAL_ACTIONS = ['guest.review_nudge.response', 'guest.review_nudge.dismissed', 'guest.review_nudge.clicked'];
const feedbackSchema = z.object({ action: z.enum(['impression', 'response', 'dismiss', 'click']), mood: z.enum(['great', 'okay', 'needs_attention']).optional(), category: z.enum(['hard_to_find', 'unhelpful_answer', 'technical_problem', 'other']).optional(), comment: z.string().trim().max(800).optional() }).strict();

function safeReviewUrl(value: unknown): string | null { if (typeof value !== 'string' || !value.trim()) return null; try { const url = new URL(value.trim()); return url.protocol === 'https:' ? url.toString() : null; } catch { return null; } }
function ratingForMood(mood: 'great' | 'okay' | 'needs_attention' | undefined) { if (mood === 'great') return 5; if (mood === 'okay') return 3; if (mood === 'needs_attention') return 2; return null; }

async function relatedSessionIds(admin: ReturnType<typeof createAdminClient>, session: NonNullable<Awaited<ReturnType<typeof getGuestSession>>>) {
  const { data: current } = await (admin as any).from('guest_access_sessions').select('guest_identity_id').eq('id', session.sessionId).maybeSingle();
  if (!current?.guest_identity_id) return [session.sessionId];
  const { data: rows } = await (admin as any).from('guest_access_sessions').select('id').eq('property_id', session.propertyId).eq('stay_id', session.stayId).eq('guest_identity_id', current.guest_identity_id);
  const ids = (rows ?? []).map((row: { id: string }) => row.id);
  return ids.length > 0 ? ids : [session.sessionId];
}

export async function GET() {
  const session = await getGuestSession();
  if (!session) return NextResponse.json({ eligible: false }, { status: 401 });
  const admin = createAdminClient();
  const sessionIds = await relatedSessionIds(admin, session);
  const { data: settings } = await admin.from('property_settings').select('review_nudge_enabled, review_nudge_auto, review_url, confidence_threshold').eq('property_id', session.propertyId).maybeSingle();
  const reviewUrl = safeReviewUrl(settings?.review_url);
  if (settings?.review_nudge_enabled !== true || !reviewUrl) return NextResponse.json({ eligible: false });
  const [{ data: priorFeedback }, { data: priorEvent }] = await Promise.all([
    (admin as any).from('product_feedback').select('id').eq('source', 'guest').eq('property_id', session.propertyId).in('guest_session_id', sessionIds).in('page', LEGACY_TERMINAL_PAGES).limit(1),
    (admin as any).from('audit_logs').select('id').eq('property_id', session.propertyId).eq('target_type', 'guest_session').in('target_id', sessionIds).in('action', TERMINAL_ACTIONS).limit(1),
  ]);
  if (priorFeedback?.length || priorEvent?.length) return NextResponse.json({ eligible: false });
  const automatic = settings.review_nudge_auto === true;
  if (!automatic) return NextResponse.json({ eligible: true, automatic: false, shouldPrompt: false, reviewUrl });
  const [{ data: conversations }, { data: extraSuccess }, { data: resolvedService }, { data: activeEscalation }, { data: activeService }] = await Promise.all([
    (admin as any).from('conversations').select('id').eq('property_id', session.propertyId).eq('stay_id', session.stayId).eq('channel', 'ai_concierge').in('guest_session_id', sessionIds),
    (admin as any).from('extras_orders').select('id').eq('property_id', session.propertyId).eq('stay_id', session.stayId).in('guest_session_id', sessionIds).in('fulfillment_status', ['accepted', 'scheduled', 'fulfilled']).limit(1),
    (admin as any).from('service_requests').select('id').eq('property_id', session.propertyId).eq('stay_id', session.stayId).in('status', ['resolved', 'closed']).limit(1),
    (admin as any).from('escalations').select('id').eq('property_id', session.propertyId).eq('stay_id', session.stayId).in('status', ['open', 'answered']).limit(1),
    (admin as any).from('service_requests').select('id').eq('property_id', session.propertyId).eq('stay_id', session.stayId).in('status', ['new', 'acknowledged', 'in_progress', 'waiting_on_guest']).limit(1),
  ]);
  const conversationIds = (conversations ?? []).map((row: { id: string }) => row.id);
  let helpfulAnswer = false;
  if (conversationIds.length > 0) { const { data } = await (admin as any).from('messages').select('id').eq('property_id', session.propertyId).eq('role', 'assistant').in('conversation_id', conversationIds).gte('confidence', Number(settings.confidence_threshold ?? 0.55)).limit(1); helpfulAnswer = Boolean(data?.length); }
  const hasSuccessfulMoment = helpfulAnswer || Boolean(extraSuccess?.length) || Boolean(resolvedService?.length);
  const hasActiveProblem = Boolean(activeEscalation?.length) || Boolean(activeService?.length);
  return NextResponse.json({ eligible: true, automatic: true, shouldPrompt: hasSuccessfulMoment && !hasActiveProblem, reviewUrl });
}

export async function POST(req: Request) {
  const session = await getGuestSession();
  if (!session) return NextResponse.json({ error: 'Session expired.' }, { status: 401 });
  const parsed = feedbackSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success || (parsed.data.action === 'response' && !parsed.data.mood)) return NextResponse.json({ error: 'Invalid feedback.' }, { status: 400 });
  const admin = createAdminClient();
  const rate = await checkRateLimit(admin, { key: `review_nudge:${session.sessionId}`, action: 'guest.review_nudge', limit: 12, windowSeconds: 3600 });
  if (!rate.allowed) return NextResponse.json({ error: 'Too many requests.' }, { status: 429 });
  const [{ data: property }, { data: settings }] = await Promise.all([
    admin.from('properties').select('host_account_id').eq('id', session.propertyId).maybeSingle(),
    admin.from('property_settings').select('review_nudge_enabled, review_url').eq('property_id', session.propertyId).maybeSingle(),
  ]);
  if (!property || settings?.review_nudge_enabled !== true || !safeReviewUrl(settings.review_url)) return NextResponse.json({ error: 'Review feedback is not enabled.' }, { status: 404 });
  const { action, mood, category, comment } = parsed.data;
  const eventName = action === 'impression' ? 'review_nudge_impression' : action === 'dismiss' ? 'review_nudge_dismissed' : action === 'click' ? 'review_nudge_review_clicked' : 'review_nudge_response';
  const auditAction = action === 'impression' ? 'guest.review_nudge.impression' : action === 'dismiss' ? 'guest.review_nudge.dismissed' : action === 'click' ? 'guest.review_nudge.clicked' : 'guest.review_nudge.response';
  if (action === 'response') {
    const detail = [mood ? `Mood: ${mood}` : '', category ? `Category: ${category}` : '', comment ?? ''].filter(Boolean).join(' — ') || null;
    const { data: existing } = await admin.from('product_feedback').select('id').eq('source', 'guest').eq('property_id', session.propertyId).eq('guest_session_id', session.sessionId).eq('page', 'guest_portal_review_nudge').limit(1).maybeSingle();
    const write = existing ? admin.from('product_feedback').update({ rating: ratingForMood(mood), comment: detail } as never).eq('id', existing.id) : admin.from('product_feedback').insert({ source: 'guest', rating: ratingForMood(mood), comment: detail, property_id: session.propertyId, guest_session_id: session.sessionId, page: 'guest_portal_review_nudge' } as never);
    const { error } = await write;
    if (error) { log.warn('guest_review_nudge_feedback_failed', { propertyId: session.propertyId }); return NextResponse.json({ error: 'Could not save feedback.' }, { status: 500 }); }
  }
  if (action !== 'impression') await admin.from('audit_logs').insert({ host_account_id: property.host_account_id, property_id: session.propertyId, actor_type: 'guest', action: auditAction, target_type: 'guest_session', target_id: session.sessionId, metadata: { stay_id: session.stayId, mood: mood ?? null, category: category ?? null } } as never);
  try { await capture(eventName, session.sessionId, { property_id: session.propertyId, stay_id: session.stayId, mood: mood ?? null, category: category ?? null }); } catch { /* Analytics never blocks the flow. */ }
  return NextResponse.json({ ok: true });
}
