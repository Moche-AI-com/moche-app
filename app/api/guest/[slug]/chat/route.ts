import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getGuestSession } from '@/lib/guest/session';
import { guestChatSchema } from '@/lib/validation';
import { answerGuestQuestion } from '@/lib/guest/concierge';
import { isGuestAiEnabled } from '@/lib/billing/entitlements';
import { maybeCreateServiceRequest } from '@/lib/guest/maintenance';
import { notify } from '@/lib/notify';
import { signEscalationLinkToken } from '@/lib/crypto';
import { publicEnv } from '@/lib/env';
import { capture } from '@/lib/posthog-server';
import type { ChatMessage } from '@/lib/ai';
import { log } from '@/lib/log';
import { resolveLanguage, DEFAULT_HOST_LANGUAGE } from '@/lib/guest/languages';
import { translateForHost, notificationBody } from '@/lib/guest/translate';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
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

  // Guest UX pass — the guest's own language choice from the portal Globe picker.
  // It OVERRIDES the host's configured response language: a host setting a default
  // is expressing a preference, but a guest actively picking their language is
  // stating a need. Unknown values resolve to null and fall through to the host
  // setting, so a malformed client can never break the reply.
  const guestLanguage = resolveLanguage(parsed.data.language);

  // Confirm the slug matches the session's property (defense in depth).
  const { data: property } = await admin
    .from('properties').select('id, display_name, slug, host_account_id').eq('id', session.propertyId).maybeSingle();
  if (!property || property.slug !== (await params).slug) {
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
    .select('concierge_tone, ai_temperature, confidence_threshold, concierge_name, system_prompt_override, response_length, restricted_topics, restricted_topic_keys, language, host_language, legacy_tone_note, legacy_tone_ack_at')
    .eq('property_id', session.propertyId)
    .maybeSingle();

  // Per-guest concierge thread (party access redesign 2026-08-28). The
  // conversation is scoped to THIS session — stay + channel=ai_concierge +
  // guest_session_id — so every member of the party gets a private Q&A history
  // on their own device and the host sees named per-guest threads. Legacy
  // stay-wide conversations (guest_session_id NULL) never match and are left
  // untouched for reporting.
  const { data: sessionRow } = await (admin as any)
    .from('guest_access_sessions')
    .select('guest_identity_id')
    .eq('id', session.sessionId)
    .maybeSingle();
  const guestIdentityId = (sessionRow?.guest_identity_id as string | null | undefined) ?? null;

  let conversationId: string;
  const { data: existing } = await (admin as any)
    .from('conversations')
    .select('id')
    .eq('stay_id', session.stayId)
    .eq('property_id', session.propertyId)
    .eq('channel', 'ai_concierge')
    .eq('guest_session_id', session.sessionId)
    .maybeSingle();
  if (existing) {
    conversationId = (existing as { id: string }).id;
  } else {
    const now = new Date().toISOString();
    const { data: conv, error } = await (admin as any).from('conversations')
      .insert({
        property_id: session.propertyId,
        stay_id: session.stayId,
        channel: 'ai_concierge',
        guest_session_id: session.sessionId,
        guest_identity_id: guestIdentityId,
        title: `Concierge — ${session.guestDisplayName}`,
        last_message_at: now,
      })
      .select('id').single();
    if (error || !conv) return NextResponse.json({ error: 'Could not start the conversation.' }, { status: 500 });
    conversationId = (conv as { id: string }).id;
  }

  // Load RECENT history for context.
  //
  // This must be ordered DESCENDING and reversed. Ordering ascending with a LIMIT
  // returns the OLDEST 12 rows, which means the "recent history" window freezes on
  // the opening turns of the stay and never advances. The concierge then re-reads
  // the same early exchange as its most recent context on every single turn, so
  // whatever was asked first (in production: the Wi-Fi question) got restated on top
  // of every later answer — including unrelated ones like "is early check-in
  // possible" and "como estas" — and those polluted answers were then cached.
  const { data: prior } = await admin
    .from('messages').select('role, content, created_at').eq('conversation_id', conversationId)
    .order('created_at', { ascending: false }).limit(12);
  const history: ChatMessage[] = (prior ?? [])
    .slice()
    .reverse()
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

  // Persist the guest's language on the stay so any surface that later needs to know
  // what the guest reads (host replies, notifications, a second device) does not have
  // to trust a client-supplied value. Best-effort: never block the reply.
  if (guestLanguage) {
    void admin.from('stays').update({ guest_language: guestLanguage.code } as never).eq('id', session.stayId);
  }

  // Escalate on low confidence, or when the concierge explicitly declared it cannot
  // answer from the property knowledge (the no-guessing contract). Either way the
  // host gets a real, answerable question rather than the guest getting a guess.
  if (answer.shouldEscalate) {
    // The host reads escalations in THEIR language. The guest's original wording is
    // always preserved above the translation — a mistranslated door code or street
    // name must never be the only copy the host sees.
    const hostLanguage = settings?.host_language ?? DEFAULT_HOST_LANGUAGE;
    // `unknownNote` is the model's own English restatement of what the host needs to
    // answer, which is a far better prompt for the host than the raw guest turn.
    const asked = answer.unknownNote ? `${question}\n\n(Concierge could not answer: ${answer.unknownNote})` : question;
    const translated = await translateForHost(asked, guestLanguage?.code ?? null, hostLanguage);

    const { data: esc } = await admin.from('escalations').insert({
      property_id: session.propertyId,
      stay_id: session.stayId,
      conversation_id: conversationId,
      question: translated.text,
      status: 'open',
      guest_session_id: session.sessionId,
      guest_identity_id: guestIdentityId,
    } as never).select('id').single();
    const escId = (esc as { id: string } | null)?.id;

    const { data: prop } = await admin.from('properties').select('host_account_id').eq('id', session.propertyId).maybeSingle();
    if (prop) {
      // 15-minute signed magic link scoped to THIS escalation so the host can answer
      // straight from the SMS/email without a full dashboard login. Token never logged.
      const answerUrl = escId ? `${publicEnv.appUrl}/answer/${signEscalationLinkToken(escId)}` : undefined;
      await notify(admin, {
        hostAccountId: (prop as { host_account_id: string }).host_account_id,
        kind: 'escalation',
        title: 'A guest question needs your input',
        body: notificationBody(translated, question),
        propertyId: session.propertyId,
        // Deep-link straight to the answer form (in-app + email fan-out use this).
        link: escId ? `/dashboard/escalations/${escId}` : '/dashboard/escalations',
        // One-tap answer magic link (email + gated SMS fan-out).
        actionUrl: answerUrl,
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
    suggestions: answer.suggestions,
    places: answer.places,
  });
}
