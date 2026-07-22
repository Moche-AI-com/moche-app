import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getGuestSession } from '@/lib/guest/session';
import { guestChatSchema } from '@/lib/validation';
import { answerGuestQuestion } from '@/lib/guest/concierge';
import { isGuestAiEnabled } from '@/lib/billing/entitlements';
import { maybeCreateServiceRequest } from '@/lib/guest/maintenance';
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
    .from('properties').select('id, display_name, slug, host_account_id').eq('id', session.propertyId).maybeSingle();
  if (!property || property.slug !== params.slug) {
    return NextResponse.json({ error: 'Session mismatch.' }, { status: 403 });
  }

  // Part 4 — gate guest AI on the host account's billing status. If the account is
  // not in the guest-AI-enabled set (trialing/active/past_due), respond gracefully
  // WITHOUT calling the model, embedding, or creating a conversation/escalation.
  const aiEnabled = await isGuestAiEnabled(admin, property.host_account_id);
  if (!aiEnabled) {
    return NextResponse.json({
      ok: true,
      answer:
        "The concierge is temporarily unavailable for this property. Please contact your host directly — and for any emergency, contact local emergency services first.",
      confidence: 0,
      escalated: false,
      isEmergency: false,
      serviceRequestCreated: false,
      unavailable: true,
    });
  }

  // Host-configurable concierge behavior (tone, creativity, escalation threshold,
  // plus the premium persona/overrides). All layered on the server-side master prompt.
  const { data: settings } = await admin
    .from('property_settings')
    .select('concierge_tone, ai_temperature, confidence_threshold, concierge_name, system_prompt_override, response_length, restricted_topics, language')
    .eq('property_id', session.propertyId)
    .maybeSingle();

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
    aiTemperature: typeof settings?.ai_temperature === 'number' ? settings.ai_temperature : undefined,
    confidenceThreshold: typeof settings?.confidence_threshold === 'number' ? settings.confidence_threshold : undefined,
    concierge: {
      conciergeName: settings?.concierge_name ?? undefined,
      tone: settings?.concierge_tone ?? undefined,
      responseLength: settings?.response_length ?? undefined,
      restrictedTopics: settings?.restricted_topics ?? undefined,
      language: settings?.language ?? undefined,
      systemPromptOverride: settings?.system_prompt_override ?? undefined,
    },
    source: 'guest_chat',
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
    const escId = (esc as { id: string } | null)?.id;

    const { data: prop } = await admin.from('properties').select('host_account_id').eq('id', session.propertyId).maybeSingle();
    if (prop) {
      await notify(admin, {
        hostAccountId: (prop as { host_account_id: string }).host_account_id,
        kind: 'escalation',
        title: 'A guest question needs your input',
        body: question.slice(0, 200),
        propertyId: session.propertyId,
        // Deep-link straight to the answer form (in-app + email fan-out use this).
        link: escId ? `/dashboard/escalations/${escId}` : '/dashboard/escalations',
      });
    }
    log.info('guest_escalation_created', { escalationId: (esc as { id: string } | null)?.id, confidence: answer.confidence });
    // Server-safe analytics: property-scoped id only, no guest PII.
    await capture('escalation_created', session.propertyId, { property_id: session.propertyId });
  }

  // D2 — Intelligence powers actions: if the question is a maintenance / cleaning /
  // safety / emergency need, open a service request and notify the host. This does
  // not replace the answer — the guest still gets the concierge reply, plus a short
  // confirmation line. De-dupe + verified-session guarantees live in the helper.
  const maintenance = await maybeCreateServiceRequest(admin, {
    propertyId: session.propertyId,
    stayId: session.stayId,
    conversationId,
    question,
    answer,
  });
  if (maintenance.created) {
    await capture('service_request_created', session.propertyId, {
      property_id: session.propertyId,
      service_type: answer.intent,
      urgency: maintenance.urgency,
    });
  }

  const finalAnswer = maintenance.guestLine
    ? `${answer.text}\n\n${maintenance.guestLine}`
    : answer.text;

  return NextResponse.json({
    ok: true,
    answer: finalAnswer,
    confidence: Number(answer.confidence.toFixed(2)),
    escalated: answer.shouldEscalate,
    isEmergency: answer.isEmergency,
    serviceRequestCreated: maintenance.created,
  });
}
