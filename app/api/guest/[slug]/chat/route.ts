import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getGuestSession } from '@/lib/guest/session';
import { guestChatSchema } from '@/lib/validation';
import { answerGuestQuestion } from '@/lib/guest/concierge';
import { notify } from '@/lib/notify';
import { capture } from '@/lib/posthog-server';
import type { ChatMessage } from '@/lib/ai';
import { log } from '@/lib/log';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request, { params }: { params: { slug: string } }) {
  const session = await getGuestSession();
  if (!session) return NextResponse.json({ error: 'Your session has expired. Please verify again.' }, { status: 401 });

  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  }
  const parsed = guestChatSchema.safeParse(payload);
  if (!parsed.success) return NextResponse.json({ error: 'Enter a message.' }, { status: 400 });
  const question = parsed.data.message;

  const admin = createAdminClient();

  // Confirm the slug matches the session's property (defense in depth).
  const { data: property } = await admin
    .from('properties').select('id, display_name, slug').eq('id', session.propertyId).maybeSingle();
  if (!property || property.slug !== params.slug) {
    return NextResponse.json({ error: 'Session mismatch.' }, { status: 403 });
  }

  // Get-or-create the conversation for this stay.
  let conversationId: string;
  const { data: existing } = await admin
    .from('conversations').select('id').eq('stay_id', session.stayId).eq('property_id', session.propertyId).maybeSingle();
  if (existing) {
    conversationId = existing.id;
  } else {
    const { data: conv, error } = await admin.from('conversations')
      .insert({ property_id: session.propertyId, stay_id: session.stayId } as never)
      .select('id').single();
    if (error || !conv) return NextResponse.json({ error: 'Could not start the conversation.' }, { status: 500 });
    conversationId = (conv as { id: string }).id;
  }

  // Load recent history for context.
  const { data: prior } = await admin
    .from('messages').select('role, content').eq('conversation_id', conversationId)
    .order('created_at', { ascending: true }).limit(12);
  const history: ChatMessage[] = (prior ?? [])
    .filter((m) => m.role === 'guest' || m.role === 'assistant')
    .map((m) => ({ role: m.role === 'guest' ? 'user' : 'assistant', content: m.content }));

  // Persist the guest message.
  await admin.from('messages').insert({
    conversation_id: conversationId, property_id: session.propertyId, role: 'guest', content: question,
  } as never);

  // Generate the grounded answer (retrieval isolated in DB by property_id + guest_only).
  const started = Date.now();
  const answer = await answerGuestQuestion(admin, {
    propertyId: session.propertyId,
    propertyName: property.display_name,
    question,
    history,
  });
  const latencyMs = Date.now() - started;

  // Persist the assistant message with intent, sources, confidence.
  await admin.from('messages').insert({
    conversation_id: conversationId,
    property_id: session.propertyId,
    role: 'assistant',
    content: answer.text,
    intent: answer.intent,
    confidence: answer.confidence,
    sources: answer.sources as never,
    model: answer.model,
    latency_ms: latencyMs,
  } as never);

  // Escalate on low confidence: create an open escalation and notify the host.
  if (answer.shouldEscalate) {
    const { data: esc } = await admin.from('escalations').insert({
      property_id: session.propertyId,
      stay_id: session.stayId,
      conversation_id: conversationId,
      question,
      status: 'open',
    } as never).select('id').single();

    const { data: prop } = await admin.from('properties').select('host_account_id').eq('id', session.propertyId).maybeSingle();
    if (prop) {
      await notify(admin, {
        hostAccountId: (prop as { host_account_id: string }).host_account_id,
        kind: 'escalation',
        title: 'A guest question needs your input',
        body: question.slice(0, 200),
        propertyId: session.propertyId,
        link: `/dashboard/escalations`,
      });
    }
    log.info('guest_escalation_created', { escalationId: (esc as { id: string } | null)?.id, confidence: answer.confidence });
    // Server-safe analytics: property-scoped id only, no guest PII.
    await capture('escalation_created', session.propertyId, { property_id: session.propertyId });
  }

  return NextResponse.json({
    ok: true,
    answer: answer.text,
    confidence: Number(answer.confidence.toFixed(2)),
    escalated: answer.shouldEscalate,
    isEmergency: answer.isEmergency,
  });
}
