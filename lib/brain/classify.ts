import 'server-only';
import { routedCompletion } from '@/lib/router/modelRouter';
import { Constants } from '@/lib/database.types';
import { log } from '@/lib/log';

export type BrainCategory = (typeof Constants.public.Enums.brain_category)[number];

const CATEGORIES = Constants.public.Enums.brain_category as readonly BrainCategory[];

// Human-readable guidance so the model routes consistently. Kept terse to hold the
// classification prompt small and cheap.
export const CATEGORY_HINTS: Record<BrainCategory, string> = {
  core: 'essential property facts (wifi password, address, general how-tos)',
  appliances: 'how to use appliances/devices (TV, oven, thermostat, washer, coffee maker)',
  house_rules: 'rules & policies (quiet hours, pets, smoking, parties, max guests)',
  checkin_checkout: 'arrival/departure logistics (check-in time, key/lockbox, checkout steps)',
  local_recommendations: 'nearby places to eat, drink, see, or do',
  emergency: 'safety, emergencies, medical, fire, urgent contacts',
  documents: 'references to uploaded documents or manuals',
  product_urls: 'links to products or online resources',
  host_qa: 'a general host-answered question that fits no other bucket',
  internal_notes: 'host-only operational notes not meant for guests',
  transportation: 'parking, transit, rideshare, directions, getting around',
};

export interface Classification {
  category: BrainCategory;
  // A normalized, reusable title phrased as a general fact (not tied to one guest).
  title: string;
}

const ALLOWED = new Set<string>(CATEGORIES);

// Classifies a host's escalation answer into a Brain category and a normalized,
// reusable title so future retrieval is routed and labeled correctly. Falls back to a
// safe default ('host_qa' + the raw question) on any error — classification is an
// enhancement, never a hard dependency of the answer flow.
export async function classifyBrainAnswer(input: {
  question: string;
  answer: string;
}): Promise<Classification> {
  const rawTitle = input.question.trim().slice(0, 200) || input.answer.trim().slice(0, 200);
  const fallback: Classification = { category: 'host_qa', title: rawTitle };

  try {
    const catList = CATEGORIES.map((c) => `- ${c}: ${CATEGORY_HINTS[c]}`).join('\n');
    const result = await routedCompletion(
      [
        {
          role: 'system',
          content:
            'You normalize a host\'s answer to a guest question into a reusable knowledge-base entry for a short-term-rental property. ' +
            'Return STRICT JSON only, no prose, no markdown, matching: {"category": <one of the allowed categories>, "title": <a short general-purpose question or topic label, max 90 chars, phrased so it helps ANY future guest, not tied to this one guest>}.\n\n' +
            `Allowed categories:\n${catList}`,
        },
        {
          role: 'user',
          content:
            `GUEST QUESTION:\n${input.question.trim().slice(0, 1000)}\n\n` +
            `HOST ANSWER:\n${input.answer.trim().slice(0, 2000)}\n\n` +
            'Classify and normalize. JSON only.',
        },
      ],
      { temperature: 0, maxTokens: 200 },
      { task: 'classification' },
    );

    const text = result.text.trim();
    // Tolerate a fenced block or leading prose by extracting the first JSON object.
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return fallback;
    const parsed = JSON.parse(match[0]) as { category?: unknown; title?: unknown };

    const category = typeof parsed.category === 'string' && ALLOWED.has(parsed.category)
      ? (parsed.category as BrainCategory)
      : 'host_qa';
    const title = typeof parsed.title === 'string' && parsed.title.trim()
      ? parsed.title.trim().slice(0, 200)
      : rawTitle;

    return { category, title };
  } catch (e) {
    log.warn('brain_classify_failed', { error: String(e) });
    return fallback;
  }
}
