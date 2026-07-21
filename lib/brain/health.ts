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
// Card-based builder health (Part B)
//
// The dashboard presents the Brain as 8 cards. Each card maps to one or more
// brain_item categories plus, for some cards, adjacent tables (address,
// recommendations, contacts, settings). Per-card completeness is a weighted
// checklist; the overall Brain Health Score is a weighted average across cards,
// with guest-critical cards (Core, Safety, Rules) weighted higher.
// ---------------------------------------------------------------------------

export type CardKey =
  | 'home'
  | 'core'
  | 'appliances'
  | 'local'
  | 'safety'
  | 'transportation'
  | 'rules'
  | 'escalation';

export interface BrainCardDef {
  key: CardKey;
  title: string;
  icon: string; // emoji shown on the card
  blurb: string;
  categories: BrainCategory[]; // brain_item categories this card surfaces
  primaryCategory: BrainCategory; // pre-selected category when adding from this card
  critical: boolean; // guest-critical cards weigh more and gate "ready"
  weight: number; // contribution to the overall score
}

// Card catalogue. Order is the display order in the grid.
export const BRAIN_CARDS: BrainCardDef[] = [
  { key: 'core', title: 'Core Information', icon: '🧠', blurb: 'WiFi, essentials, check-in & check-out', categories: ['core', 'checkin_checkout'], primaryCategory: 'checkin_checkout', critical: true, weight: 20 },
  { key: 'safety', title: 'Safety & Emergency', icon: '🚨', blurb: 'Emergency info and on-call contacts', categories: ['emergency'], primaryCategory: 'emergency', critical: true, weight: 18 },
  { key: 'rules', title: 'Rules & Policies', icon: '📜', blurb: 'House rules and guest policies', categories: ['house_rules'], primaryCategory: 'house_rules', critical: true, weight: 12 },
  { key: 'home', title: 'Home Information', icon: '🏠', blurb: 'Address and the basics about the home', categories: ['core'], primaryCategory: 'core', critical: false, weight: 12 },
  { key: 'appliances', title: 'Home Appliances', icon: '🍞', blurb: 'How to use appliances and devices', categories: ['appliances'], primaryCategory: 'appliances', critical: false, weight: 10 },
  { key: 'local', title: 'Local Favorites', icon: '📍', blurb: 'Restaurants, attractions & recommendations', categories: ['local_recommendations'], primaryCategory: 'local_recommendations', critical: false, weight: 10 },
  { key: 'escalation', title: 'Escalation Rules', icon: '📞', blurb: 'When and who the concierge escalates to', categories: [], primaryCategory: 'internal_notes', critical: false, weight: 10 },
  { key: 'transportation', title: 'Transportation', icon: '🚗', blurb: 'Getting around, parking & transit', categories: ['transportation'], primaryCategory: 'transportation', critical: false, weight: 8 },
];

export interface ChecklistItem {
  label: string;
  done: boolean;
  required: boolean; // required items gate "recommended complete"
}

export interface CardHealth {
  key: CardKey;
  title: string;
  icon: string;
  blurb: string;
  weight: number;
  critical: boolean;
  primaryCategory: BrainCategory;
  categories: BrainCategory[];
  pct: number; // 0-100 completeness
  checklist: ChecklistItem[];
  complete: boolean; // every checklist item satisfied
  recommendedComplete: boolean; // every required checklist item satisfied
}

export interface CardBrainHealth {
  score: number; // 0-100 weighted across cards
  label: 'Needs work' | 'Good' | 'Excellent';
  cards: CardHealth[];
  criticalComplete: boolean; // all critical cards recommended-complete
}

// Signals sourced from tables adjacent to brain_items. Computed in the page loader.
export interface CardHealthContext {
  hasAddress: boolean;
  recommendationCount: number;
  emergencyContactCount: number;
  primaryContactCount: number;
  hasSettings: boolean;
  confidenceThresholdSet: boolean;
}

// Count non-deleted brain items per category that are actually retrievable
// (status='ready'). Failed/processing items don't count toward "ready".
function readyCounts(items: BrainItem[]): Map<BrainCategory, number> {
  const m = new Map<BrainCategory, number>();
  for (const it of items) {
    if (it.deleted_at) continue;
    if (it.status !== 'ready') continue;
    m.set(it.category, (m.get(it.category) ?? 0) + 1);
  }
  return m;
}

function checklistFor(key: CardKey, ready: Map<BrainCategory, number>, ctx: CardHealthContext): ChecklistItem[] {
  const has = (c: BrainCategory) => (ready.get(c) ?? 0) > 0;
  switch (key) {
    case 'core':
      return [
        { label: 'Core essentials added (WiFi, parking)', done: has('core'), required: true },
        { label: 'Check-in / check-out details added', done: has('checkin_checkout'), required: true },
      ];
    case 'safety':
      return [
        { label: 'Emergency info added', done: has('emergency'), required: true },
        { label: 'At least one emergency contact', done: ctx.emergencyContactCount > 0, required: true },
      ];
    case 'rules':
      return [
        { label: 'House rules added', done: has('house_rules'), required: true },
      ];
    case 'home':
      return [
        { label: 'Property address set', done: ctx.hasAddress, required: true },
        { label: 'Home basics added', done: has('core'), required: true },
      ];
    case 'appliances':
      return [
        { label: 'Appliance guidance added', done: has('appliances'), required: true },
      ];
    case 'local':
      return [
        { label: 'At least one local recommendation', done: ctx.recommendationCount > 0 || has('local_recommendations'), required: true },
        { label: 'Three or more favorites', done: ctx.recommendationCount >= 3, required: false },
      ];
    case 'transportation':
      return [
        { label: 'Transportation info added', done: has('transportation'), required: true },
      ];
    case 'escalation':
      return [
        { label: 'Concierge settings configured', done: ctx.hasSettings && ctx.confidenceThresholdSet, required: true },
        { label: 'Primary contact for escalations', done: ctx.primaryContactCount > 0, required: true },
      ];
  }
}

export function computeCardHealth(items: BrainItem[], ctx: CardHealthContext): CardBrainHealth {
  const ready = readyCounts(items);

  const cards: CardHealth[] = BRAIN_CARDS.map((def) => {
    const checklist = checklistFor(def.key, ready, ctx);
    const doneCount = checklist.filter((c) => c.done).length;
    const pct = checklist.length === 0 ? 0 : Math.round((doneCount / checklist.length) * 100);
    const complete = checklist.every((c) => c.done);
    const recommendedComplete = checklist.filter((c) => c.required).every((c) => c.done);
    return {
      key: def.key,
      title: def.title,
      icon: def.icon,
      blurb: def.blurb,
      weight: def.weight,
      critical: def.critical,
      primaryCategory: def.primaryCategory,
      categories: def.categories,
      pct,
      checklist,
      complete,
      recommendedComplete,
    };
  });

  const totalWeight = cards.reduce((a, c) => a + c.weight, 0);
  const weighted = cards.reduce((a, c) => a + c.pct * c.weight, 0);
  const score = totalWeight === 0 ? 0 : Math.round(weighted / totalWeight);
  const label: CardBrainHealth['label'] = score >= 80 ? 'Excellent' : score >= 50 ? 'Good' : 'Needs work';
  const criticalComplete = cards.filter((c) => c.critical).every((c) => c.recommendedComplete);

  return { score, label, cards, criticalComplete };
}
