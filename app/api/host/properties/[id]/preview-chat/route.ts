import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireSession, getPropertyAccess } from '@/lib/auth/guards';
import { createAdminClient } from '@/lib/supabase/admin';
import { answerGuestQuestion } from '@/lib/guest/concierge';
import { resolveLanguage } from '@/lib/guest/languages';
import { checkRateLimit } from '@/lib/rate-limit';
import type { ChatMessage } from '@/lib/ai';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Host preview of the guest concierge (Property page → Preview Guest Portal).
// Runs the REAL answer pipeline against the property's live Brain so the host
// can judge answer quality — but nothing is persisted: no conversation or
// message rows, no escalation, no service request, no analytics capture, and
// (via persist: false) no AI-usage rows and no answer-cache writes, so a host's
// test question is never replayed to a real guest. Low-confidence answers come
// back flagged so the host sees the hand-off UX; the client routes those to the
// sandboxed host-chat preview instead of creating anything.

const bodySchema = z.object({
  message: z.string().trim().min(1).max(2000),
  language: z.string().max(35).optional(),
  // Multi-turn preview: the client holds the thread and resends the recent tail.
  history: z
    .array(z.object({ role: z.enum(['user', 'assistant']), content: z.string().max(4000) }))
    .max(12)
    .optional(),
});

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  await requireSession();
  const { id } = await params;
  const access = await getPropertyAccess(id);
  if (!access) return NextResponse.json({ error: 'Not found.' }, { status: 404 });

  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(payload);
  if (!parsed.success) return NextResponse.json({ error: 'Enter a message.' }, { status: 400 });

  const admin = createAdminClient();

  // The preview calls the real model + embeddings, which cost money. Cap it like
  // any other AI surface — operational rate-limit bookkeeping only, never guest data.
  const rate = await checkRateLimit(admin, {
    key: `preview-chat:${id}`,
    limit: 60,
    windowSeconds: 3600,
    action: 'host.preview_chat',
  });
  if (!rate.allowed) {
    return NextResponse.json({ error: 'Preview is rate-limited for now — try again in a bit.' }, { status: 429 });
  }

  // Same configuration assembly as the guest chat route: the host previews what
  // guests actually get — tone, thresholds, restricted topics, persona, language.
  const { data: settings } = await admin
    .from('property_settings')
    .select('concierge_tone, ai_temperature, confidence_threshold, concierge_name, system_prompt_override, response_length, restricted_topics, restricted_topic_keys, language, host_language, legacy_tone_note, legacy_tone_ack_at')
    .eq('property_id', id)
    .maybeSingle();

  const guestLanguage = resolveLanguage(parsed.data.language);
  const history: ChatMessage[] = (parsed.data.history ?? []).map((m) => ({ role: m.role, content: m.content }));

  const answer = await answerGuestQuestion(admin, {
    propertyId: id,
    propertyName: access.property.display_name,
    question: parsed.data.message,
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
    source: 'host_preview',
    persist: false,
  });

  return NextResponse.json({
    ok: true,
    answer: answer.text,
    confidence: Number(answer.confidence.toFixed(2)),
    escalated: answer.shouldEscalate,
    isEmergency: answer.isEmergency,
    suggestions: answer.suggestions,
    places: answer.places,
  });
}
