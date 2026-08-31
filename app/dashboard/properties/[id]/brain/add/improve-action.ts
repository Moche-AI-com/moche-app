'use server';

// "Improve with AI" for the Add-knowledge Write tab (Manage Brain redesign, slice 3).
//
// Propose-only: returns a rewritten draft, never saves. The host reviews the rewrite
// and the normal saveBrainItemAction path files it — the human stays the reviewer, so
// the no-unreviewed-AI-content boundary holds exactly as with Enhance answers.
//
// Credential rule (redesign D3): a draft containing a Wi-Fi password or door code is
// rewritten into where guests FIND it, never the secret itself — and a rewrite that
// introduces a credential-shaped string the draft did not contain is discarded.

import { requirePropertyAccess } from '@/lib/auth/guards';
import { createAdminClient } from '@/lib/supabase/admin';
import { routedCompletion } from '@/lib/router/modelRouter';
import { looksLikeCredentialValue } from '@/lib/brain/redact';
import { logAiUsage } from '@/lib/ai/usage';
import { log } from '@/lib/log';

export interface ImproveDraftState {
  error?: string;
  ok?: boolean;
  improved?: string;
}

const SYSTEM_PROMPT = [
  "You rewrite a short-term-rental host's rough note into a clear, guest-facing answer for the property's AI concierge.",
  'Rules:',
  '- Keep every fact from the draft; never invent details. If the draft is ambiguous, keep the ambiguity.',
  '- Plain, warm, concise language. Short sentences. No markdown, no headings, no bullet points unless the draft is a list.',
  '- If the draft contains a Wi-Fi password, door code, or any other credential, do NOT repeat the secret. Rewrite it as where guests can find it (for example: "the password is on the framed card in the kitchen").',
  '- Return only the rewritten text, nothing else.',
].join('\n');

export async function improveBrainDraftAction(
  _prev: ImproveDraftState,
  formData: FormData,
): Promise<ImproveDraftState> {
  const propertyId = String(formData.get('propertyId') ?? '');
  const access = await requirePropertyAccess(propertyId);
  if (!access.can.editBrain) return { error: 'You do not have permission to edit this property Brain.' };

  const title = String(formData.get('title') ?? '').slice(0, 200).trim();
  const body = String(formData.get('body') ?? '').slice(0, 20000);
  const sectionLabel = String(formData.get('sectionLabel') ?? '').slice(0, 120).trim();
  if (body.trim().length < 10) {
    return { error: 'Write at least a sentence or two first, then improve it.' };
  }

  const started = Date.now();
  try {
    const result = await routedCompletion(
      [
        { role: 'system', content: SYSTEM_PROMPT },
        {
          role: 'user',
          content: `Section: ${sectionLabel || 'General'}\nTitle: ${title || '(untitled)'}\nDraft:\n${body}`,
        },
      ],
      { temperature: 0.3, maxTokens: 900 },
      { task: 'brain_ops' },
    );
    const improved = result.text.trim();
    if (!improved) return { error: 'The model returned nothing usable — your draft is unchanged.' };
    if (looksLikeCredentialValue(improved) && !looksLikeCredentialValue(body)) {
      return {
        error:
          'The rewrite looked like it contained a credential, so it was discarded. Your draft is unchanged.',
      };
    }
    // Fire-and-forget telemetry; never blocks the response.
    void logAiUsage(createAdminClient(), {
      propertyId,
      kind: 'other',
      model: result.model,
      promptTokens: result.usage?.promptTokens ?? 0,
      completionTokens: result.usage?.completionTokens ?? 0,
      latencyMs: Date.now() - started,
      source: 'brain_improve_draft',
    });
    return { ok: true, improved };
  } catch (e) {
    log.warn('brain_improve_failed', { error: String(e) });
    return { error: 'Improvement is unavailable right now — your draft is unchanged.' };
  }
}
