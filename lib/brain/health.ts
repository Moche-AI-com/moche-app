import type { Database } from '@/lib/database.types';
import {
  BRAIN_HEALTH_WEIGHTS,
  CORE_REQUIRED_CATEGORIES,
  BRAIN_CATEGORY_LABELS,
} from '@/lib/constants';
import type { BrainCategory } from '@/lib/constants';

type BrainItem = Pick<Database['public']['Tables']['brain_items']['Row'], 'category' | 'status' | 'deleted_at' | 'visibility'>;

export interface CategoryHealth {
  category: BrainCategory;
  label: string;
  count: number;
  weight: number;
  present: boolean;
  required: boolean;
}

export interface BrainHealth {
  score: number; // 0-100
  categories: CategoryHealth[];
  gaps: CategoryHealth[]; // categories with no content
  coreComplete: boolean; // all CORE_REQUIRED_CATEGORIES present
  canGoLive: boolean;
  totalItems: number;
}

// Pure scoring function — deterministic, unit-testable.
// Score = sum(weight for each category that has at least one ready, non-deleted item) / total weight.
export function computeBrainHealth(items: BrainItem[]): BrainHealth {
  const counts = new Map<BrainCategory, number>();
  for (const item of items) {
    if (item.deleted_at) continue;
    if (item.status === 'failed') continue;
    counts.set(item.category, (counts.get(item.category) ?? 0) + 1);
  }

  const totalWeight = Object.values(BRAIN_HEALTH_WEIGHTS).reduce((a, b) => a + b, 0);
  const categories: CategoryHealth[] = (Object.keys(BRAIN_HEALTH_WEIGHTS) as BrainCategory[]).map((cat) => {
    const count = counts.get(cat) ?? 0;
    return {
      category: cat,
      label: BRAIN_CATEGORY_LABELS[cat],
      count,
      weight: BRAIN_HEALTH_WEIGHTS[cat],
      present: count > 0,
      required: CORE_REQUIRED_CATEGORIES.includes(cat),
    };
  });

  const earned = categories.filter((c) => c.present).reduce((sum, c) => sum + c.weight, 0);
  const score = Math.round((earned / totalWeight) * 100);

  const coreComplete = CORE_REQUIRED_CATEGORIES.every((cat) => (counts.get(cat) ?? 0) > 0);
  const gaps = categories.filter((c) => !c.present);
  const totalItems = items.filter((i) => !i.deleted_at).length;

  return { score, categories, gaps, coreComplete, canGoLive: coreComplete, totalItems };
}

// Proactive gap prompts shown after onboarding sessions.
export function gapPrompts(health: BrainHealth): string[] {
  return health.gaps
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 3)
    .map((g) => `Guests often ask about ${g.label.toLowerCase()} — do you have information to add?`);
}

// ---------------------------------------------------------------------------
// The card-based builder health model (CardKey, BRAIN_CARDS, computeCardHealth,
// checklistFor, readyCounts) was removed with the Brain page rebuild.
//
// It scored the Brain as 8 weighted cards, which was the second of three
// completeness numbers on one page — alongside computeBrainHealth's category
// coverage and the registry completeness score the publish gate actually reads.
// Only the publish gate's number has consequences, so the cards were removed
// rather than reconciled. Their sole consumers (BrainCards.tsx, BrainGraph.tsx)
// were deleted in the same change; no test referenced them.
// ---------------------------------------------------------------------------
