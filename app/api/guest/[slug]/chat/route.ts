import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getGuestSession } from '@/lib/guest/session';
import { guestChatSchema } from '@/lib/validation';
import { answerGuestQuestion, type ConciergeAnswer } from '@/lib/guest/concierge';
import { isGuestAiEnabled } from '@/lib/billing/entitlements';
import { maybeCreateServiceRequest } from '@/lib/guest/maintenance';
import { notify } from '@/lib/notify';
import { signEscalationLinkToken } from '@/lib/crypto';
import { publicEnv } from '@/lib/env';
import { capture } from '@/lib/posthog-server';
import type { ChatMessage } from '@/lib/ai';
import { fallbackClassifyIntent } from '@/lib/ai/fallback';
import { redactCredentials } from '@/lib/brain/redact';
import { log } from '@/lib/log';
import { resolveLanguage, DEFAULT_HOST_LANGUAGE } from '@/lib/guest/languages';
import { translateForHost, notificationBody } from '@/lib/guest/translate';
import { behavioralEscalation } from '@/lib/guest/behavioral-triggers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const UNAVAILABLE_ANSWER = 'I cannot confirm an answer right now. Please contact your host directly. If this is an emergency, contact local emergency services immediately.';

export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const session = await getGuestSession();
  if (!session) return NextResponse.json({ error: 'Your session has expired. Please verify again.' }, { status: 401 });
  let payload: unknown;
  try { payload = await req.json(); } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  }
  const parsed = guestChatSchema.safeParse(payload);
  if (!parsed.success) return NextResponse.json({ error: 'Enter a message.' }, { status: 400 });
  const question = parsed.data.message;
  const admin = createAdminClient();
  const guestLanguage = resolveLanguage(parsed.data.language);
  const { data: property } = await admin.from('properties')
    .select('id, display_name, slug, host_account_id').eq('id', session.propertyId).maybeSingle();
  if (!property || property.slug !== (await params).slug) {
    return NextResponse.json({ error: 'Session mismatch.' }, { status: 403 });
  }
  const aiEnabled = await isGuestAiEnabled(admin, property.host_account_id);
  if (!aiEnabled) {
    return NextResponse.json({
      ok: true, answer: 'The concierge is temporarily unavailable for this property. Please contact your host directly — and for any emergency, contact local emergency services first.',
      confidence: 0, escalated: false, isEmergency: false, serviceRequestCreated: false, unavailable: true,
    });
  }
  const { data: settings } = await admin.from('property_settings')
    .select('concierge_tone, ai_temperature, confidence_threshold, concierge_name, system_prompt_override, response_length, restricted_topics, restricted_topic_keys, language, host_language, legacy_tone_note, legacy_tone_ack_at')
    .eq('property_id', session.propertyId).maybeSingle();
  const { data: sessionRow } = await (admin as any).from('guest_access_sessions')
    .select('guest_identity_id').eq('id', session.sessionId).maybeSingle();
  const guestIdentityId = (sessionRow?.guest_identity_id as string | null | undefined) ?? null;

  let conversationId: string;
  const { data: existing } = await (admin as any).from('conversations')
    .select('id').eq('stay_id', session.stayId).eq('property_id', session.propertyId)
    .eq('channel', 'ai_concierge').eq('guest_session_id', session.sessionId).maybeSingle();
  if (existing) {
    conversationId = (existing as { id: string }).id;
  } else {
    const { data: conv, error } = await (admin as any).from('conversations')
      .insert({ property_id: session.propertyId, stay_id: session.stayId, channel: 'ai_concierge',
        guest_session_id: session.sessionId, guest_identity_id: guestIdentityId,
        title: `Concierge — ${session.guestDisplayName}`, last_message_at: new Date().toISOString() })
      .select('id').single();
    if (error || !conv) return NextResponse.json({ error: 'Could not start the conversation.' }, { status: 500 });
    conversationId = (conv as { id: string }).id;
  }

  const { data: prior } = await admin.from('messages').select('role, content, created_at')
    .eq('conversation_id', conversationId).order('created_at', { ascending: false }).limit(12);
  const history: ChatMessage[] = (prior ?? []).slice().reverse()
    .filter((m) => m.role === 'guest' || m.role === 'assistant')
    .map((m) => ({ role: m.role === 'guest' ? 'user' : 'assistant', content: m.content }));
  const behavioral = behavioralEscalation(question, history);
  const guestWrite = await admin.from('messages').insert({
    conversation_id: conversationId, property_id: session.propertyId, role: 'guest', content: question,
  } as never);
  if (guestWrite.error) {
    log.warn('guest_ai_message_write_failed', { propertyId: session.propertyId, code: 'guest_write' });
    return NextResponse.json({ error: 'Your message could not be saved. Please retry.' }, { status: 503 });
  }

  const started = Date.now();
  let answer: ConciergeAnswer;
  try {
    answer = await answerGuestQuestion(admin, {
      propertyId: session.propertyId, propertyName: property.display_name, question, history,
      aiTemperature: typeof settings?.ai_temperature === 'number' ? settings.ai_temperature : undefined,
      confidenceThreshold: typeof settings?.confidence_threshold === 'number' ? settings.confidence_threshold : undefined,
      concierge: {
        conciergeName: settings?.concierge_name ?? undefined,
        tone: settings?.concierge_tone ?? undefined,
        legacyToneNote: settings?.legacy_tone_note ?? undefined,
        legacyToneAckAt: settings?.legacy_tone_ack_at ?? undefined,
        responseLength: settings?.response_length ?? undefined,
        restrictedTopics: settings?.restricted_topics ?? undefined,
        restrictedTopicKeys: settings?.restricted_topic_keys ?? undefined,
        language: guestLanguage?.code ?? settings?.language ?? undefined,
        systemPromptOverride: settings?.system_prompt_override ?? undefined,
      },
      source: 'guest_chat',
    });
  } catch {
    log.warn('guest_ai_unavailable', { propertyId: session.propertyId, code: 'provider_or_retrieval' });
    const emergency = /\b(fire|smoke|gas leak|carbon monoxide|break[- ]?in|intruder|burglar|bleeding|unconscious|heart attack|can'?t breathe|emergency|ambulance|assault)\b/i.test(question);
    answer = {
      text: UNAVAILABLE_ANSWER, confidence: 0, intent: fallbackClassifyIntent(question),
      model: 'error', sources: [], shouldEscalate: true, isEmergency: emergency,
      suggestions: [], places: [],
      unknownNote: 'AI retrieval or its provider was unavailable; please answer the guest directly.',
    };
  }
  const latencyMs = Date.now() - started;
  if (guestLanguage) {
    void admin.from('stays').update({ guest_language: guestLanguage.code } as never).eq('id', session.stayId);
  }

  let escalationConfirmed = false;
  if (answer.shouldEscalate || behavioral.escalate) {
    const hostLanguage = settings?.host_language ?? DEFAULT_HOST_LANGUAGE;
    const asked = answer.unknownNote ? `${question}\n\n(Concierge could not answer: ${answer.unknownNote})` : question;
    const triggerNote = behavioral.trigger === 'human_request' ? 'Guest asked to reach a human.'
      : behavioral.trigger === 'repeat_question' ? 'Guest has asked this question more than once.' : null;
    const askedWithTrigger = triggerNote ? `${asked}\n\n(${triggerNote})` : asked;
    const translated = await translateForHost(askedWithTrigger, guestLanguage?.code ?? null, hostLanguage);
    const { data: esc, error: escError } = await admin.from('escalations').insert({
      property_id: session.propertyId, stay_id: session.stayId, conversation_id: conversationId,
      question: translated.text, status: 'open', guest_session_id: session.sessionId,
      guest_identity_id: guestIdentityId,
    } as never).select('id').single();
    const escId = (esc as { id: string } | null)?.id;
    if (escError || !escId) {
      log.warn('guest_escalation_persist_failed', { propertyId: session.propertyId, code: 'write_failed' });
      answer = { ...answer, text: UNAVAILABLE_ANSWER, confidence: 0, model: 'error', suggestions: [], places: [] };
    } else {
      escalationConfirmed = true;
      const { data: prop } = await admin.from('properties').select('host_account_id')
        .eq('id', session.propertyId).maybeSingle();
      if (prop) {
        const answerUrl = `${publicEnv.appUrl}/answer/${signEscalationLinkToken(escId)}`;
        try {
          await notify(admin, {
            hostAccountId: (prop as { host_account_id: string }).host_account_id, kind: 'escalation',
            title: 'A guest question needs your input', body: notificationBody(translated, question),
            propertyId: session.propertyId, link: `/dashboard/escalations/${escId}`, actionUrl: answerUrl,
          });
        } catch {
          log.warn('guest_escalation_notify_failed', { propertyId: session.propertyId, code: 'delivery_unavailable' });
        }
      }
      log.info('guest_escalation_created', { escalationId: escId, confidence: answer.confidence,
        trigger: behavioral.trigger ?? 'low_confidence' });
      try { await capture('escalation_created', session.propertyId, { property_id: session.propertyId }); } catch {
        log.warn('guest_escalation_analytics_failed', { propertyId: session.propertyId });
      }
    }
  }

  const maintenance = await maybeCreateServiceRequest(admin, {
    propertyId: session.propertyId, stayId: session.stayId, conversationId, question, answer,
  });
  const finalAnswer = redactCredentials(maintenance.guestLine ? `${answer.text}\n\n${maintenance.guestLine}` : answer.text).text;
  const assistantWrite = await (admin as any).from('messages').insert({
    conversation_id: conversationId, property_id: session.propertyId, role: 'assistant',
    content: finalAnswer, intent: answer.intent, confidence: answer.confidence,
    sources: answer.sources, model: answer.model, latency_ms: latencyMs, guest_replay_safe: true,
  });
  if (assistantWrite.error) {
    log.warn('guest_ai_message_write_failed', { propertyId: session.propertyId, code: 'assistant_write' });
    return NextResponse.json({ error: 'The answer could not be saved. Check your conversation before retrying.' }, { status: 503 });
  }
  if (maintenance.created) {
    await capture('service_request_created', session.propertyId, {
      property_id: session.propertyId, service_type: answer.intent, urgency: maintenance.urgency,
    });
  }
  return NextResponse.json({
    ok: true, answer: finalAnswer, confidence: Number(answer.confidence.toFixed(2)),
    escalated: escalationConfirmed, isEmergency: answer.isEmergency,
    serviceRequestCreated: maintenance.created, suggestions: answer.suggestions, places: answer.places,
    unavailable: answer.model === 'error',
  });
}
