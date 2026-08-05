import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/admin';
import { getPropertyAccess } from '@/lib/auth/guards';
import { answerGuestQuestion } from '@/lib/guest/concierge';
import type { ChatMessage } from '@/lib/ai';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Host-only "chat as a guest" preview. The host is already authenticated and must
// have access to the property (getPropertyAccess enforces ownership/co-host). This
// path reuses the exact guest concierge logic but is strictly read-only:
//   - no guest_access_sessions / stays / conversations / messages are created
//   - no escalations are raised, no host notifications sent
//   - retrieval is scoped in the DB to this property's guest-visible chunks only
// so a host previews precisely what a verified guest would see.
const previewSchema = z.object({
  message: z.string().trim().min(1).max(2000),
  history: z
    .array(z.object({ role: z.enum(['user', 'assistant']), content: z.string().max(4000) }))
    .max(12)
    .optional(),
});

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const access = await getPropertyAccess(params.id);
  if (!access) return NextResponse.json({ error: 'Not authorized for this property.' }, { status: 403 });

  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  }
  const parsed = previewSchema.safeParse(payload);
  if (!parsed.success) return NextResponse.json({ error: 'Enter a message.' }, { status: 400 });

  const admin = createAdminClient();
  const history: ChatMessage[] = (parsed.data.history ?? []).map((m) => ({ role: m.role, content: m.content }));

  // Use the host's full concierge config so the preview matches production exactly.
  const { data: settings } = await admin
    .from('property_settings')
    .select('concierge_tone, ai_temperature, confidence_threshold, concierge_name, system_prompt_override, response_length, restricted_topics, restricted_topic_keys, language, legacy_tone_note, legacy_tone_ack_at')
    .eq('property_id', params.id)
    .maybeSingle();

  const answer = await answerGuestQuestion(admin, {
    propertyId: params.id,
    propertyName: access.property.display_name,
    question: parsed.data.message,
    history,
    aiTemperature: typeof settings?.ai_temperature === 'number' ? settings.ai_temperature : undefined,
    confidenceThreshold: settings?.confidence_threshold ?? undefined,
    concierge: {
      conciergeName: settings?.concierge_name ?? undefined,
      tone: settings?.concierge_tone ?? undefined,
      legacyToneNote: settings?.legacy_tone_note ?? undefined,
      legacyToneAckAt: settings?.legacy_tone_ack_at ?? undefined,
      responseLength: settings?.response_length ?? undefined,
      restrictedTopics: settings?.restricted_topics ?? undefined,
      restrictedTopicKeys: settings?.restricted_topic_keys ?? undefined,
      language: settings?.language ?? undefined,
      systemPromptOverride: settings?.system_prompt_override ?? undefined,
    },
    source: 'host_preview',
  });

  return NextResponse.json({
    ok: true,
    answer: answer.text,
    confidence: Number(answer.confidence.toFixed(2)),
    escalated: answer.shouldEscalate,
    isEmergency: answer.isEmergency,
    suggestions: answer.suggestions,
  });
}
