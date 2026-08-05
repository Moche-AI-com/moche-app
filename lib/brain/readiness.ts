// Launch readiness for a single property (backlog P2-09).
//
// DELIBERATELY NOT A SECOND SCORING ENGINE.
//
// The backlog is explicit that readiness must not become a duplicate of Brain
// Health, and there was a real risk of exactly that: two functions, two weight
// tables, two numbers on the same screen disagreeing about whether a property is
// ready. So this module *composes* the existing computeCardHealth() result
// rather than recomputing anything from brain_items. It adds precisely one thing
// health cannot know about — whether AI-proposed changes are still sitting
// unreviewed — and derives both the number and the checklist from a single
// `items` array, so the score and the list of what's missing cannot drift apart:
// the score IS the weighted sum of that list.

import type { CardBrainHealth } from '@/lib/brain/health';

export interface ReadinessItem {
  key: string;
  label: string;
  /** Contribution to the score. Health cards keep their own weights. */
  weight: number;
  done: boolean;
  /** True items block "ready to share"; false items are polish. */
  required: boolean;
  /** Optional deep link so the checklist is actionable, not just a verdict. */
  href?: string;
}

export interface Readiness {
  score: number; // 0-100
  label: 'Needs work' | 'Almost there' | 'Ready to share';
  items: ReadinessItem[];
  /** Everything not done, required first. Rendered as the checklist. */
  missing: ReadinessItem[];
  pendingReviews: number;
  /** Every required item satisfied. */
  ready: boolean;
}

/**
 * Weight of the "review the AI's suggestions" item.
 *
 * Sized to matter without dominating: the nine health cards total 100, so an
 * unreviewed queue costs roughly a tenth of the score. Enough that the number
 * visibly moves when a host clears the queue, not enough that a single stale
 * suggestion makes an otherwise complete property look broken.
 */
export const REVIEW_ITEM_WEIGHT = 12;

export interface ReadinessInput {
  health: CardBrainHealth;
  /** Count of proposed_updates rows still in 'pending' for this property. */
  pendingReviews: number;
  propertyId: string;
  /** Whether the property has been published. Polish, not a blocker. */
  published?: boolean;
}

export function computeReadiness(input: ReadinessInput): Readiness {
  const { health, pendingReviews, propertyId } = input;

  const items: ReadinessItem[] = health.cards.map((card) => ({
    key: `card:${card.key}`,
    label: card.title,
    weight: card.weight,
    // A card counts as done at the same threshold health itself uses for
    // "recommendedComplete", so the two views never contradict each other.
    done: card.recommendedComplete,
    required: card.critical,
    href: `/dashboard/properties/${propertyId}/brain`,
  }));

  items.push({
    key: 'review:pending',
    label:
      pendingReviews === 0
        ? 'AI suggestions reviewed'
        : `Review ${pendingReviews} AI suggestion${pendingReviews === 1 ? '' : 's'}`,
    weight: REVIEW_ITEM_WEIGHT,
    done: pendingReviews === 0,
    // Required: unreviewed AI output is the exact risk this queue exists to
    // remove. A property is not ready to face guests while a hallucination
    // might still be one tap from going live.
    required: true,
    href: '/dashboard/updates',
  });

  if (input.published === false) {
    items.push({
      key: 'published',
      label: 'Publish the guide',
      weight: 8,
      done: false,
      required: false,
      href: `/dashboard/properties/${propertyId}`,
    });
  }

  // Partial credit for partially-complete cards would mean the score and the
  // binary checklist disagree, which is the drift the backlog warns about. So
  // the score is the plain weighted fraction of the same done/not-done items the
  // host sees listed.
  const totalWeight = items.reduce((a, i) => a + i.weight, 0);
  const doneWeight = items.reduce((a, i) => a + (i.done ? i.weight : 0), 0);
  const score = totalWeight === 0 ? 0 : Math.round((doneWeight / totalWeight) * 100);

  const missing = items
    .filter((i) => !i.done)
    .sort((a, b) => (a.required === b.required ? b.weight - a.weight : a.required ? -1 : 1));

  const ready = items.filter((i) => i.required).every((i) => i.done);
  const label: Readiness['label'] = ready ? 'Ready to share' : score >= 70 ? 'Almost there' : 'Needs work';

  return { score, label, items, missing, pendingReviews, ready };
}
