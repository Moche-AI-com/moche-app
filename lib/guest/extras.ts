// Guest-facing Extras (backlog P5-05, P5-06).
//
// Copy discipline: these are "Extras" or "Enhancements" to a guest, never
// "upsells". That word does not appear in any guest-visible string, and it must
// not be reintroduced here.
//
// Everything in this module is pure so the ordering rule and the quantity
// advisory can be tested directly; the portal component only renders.

export interface ExtraCategory {
  /** Stored value in guest_extras.category. Stable, never shown to a guest. */
  id: string;
  /** Guest-facing label. */
  label: string;
  /** One-line hint shown under the label on the category tile. */
  hint: string;
}

// A fixed set keeps the guest tiles predictable and keeps hosts from inventing
// forty one-item categories. Anything unrecognised or unset falls back to `more`.
export const EXTRAS_CATEGORIES: ExtraCategory[] = [
  { id: 'arrival', label: 'Arrival & departure', hint: 'Early check-in, late checkout, luggage' },
  { id: 'comfort', label: 'Comfort', hint: 'Extra linens, mid-stay clean, essentials' },
  { id: 'food', label: 'Food & drink', hint: 'Welcome baskets, breakfast, local treats' },
  { id: 'experiences', label: 'Experiences', hint: 'Tours, tastings, and things to book' },
  { id: 'transport', label: 'Getting around', hint: 'Airport pickup, parking, rentals' },
  { id: 'more', label: 'More', hint: 'Everything else your host offers' },
];

export const DEFAULT_EXTRA_CATEGORY = 'more';

const CATEGORY_IDS = new Set(EXTRAS_CATEGORIES.map((c) => c.id));

export function isExtraCategory(value: unknown): value is string {
  return typeof value === 'string' && CATEGORY_IDS.has(value);
}

/** Maps any stored value (including null or a stale key) onto a real category. */
export function normalizeExtraCategory(value: unknown): string {
  return isExtraCategory(value) ? value : DEFAULT_EXTRA_CATEGORY;
}

export function extraCategory(id: string): ExtraCategory {
  return EXTRAS_CATEGORIES.find((c) => c.id === id) ?? EXTRAS_CATEGORIES[EXTRAS_CATEGORIES.length - 1];
}

// --- Quantity -------------------------------------------------------------

/** Ceiling on any single request. Advisory, not a reservation. */
export const MAX_EXTRA_QUANTITY = 10;
export const DEFAULT_EXTRA_QUANTITY = 1;

/**
 * Clamps a guest-entered quantity against the host's optional per-item ceiling.
 * Non-numeric, zero, and negative input all collapse to 1 rather than erroring:
 * a stepper cannot produce them, and rejecting them would be a dead end.
 */
export function clampExtraQuantity(input: unknown, maxQuantity?: number | null): number {
  const ceiling = typeof maxQuantity === 'number' && maxQuantity > 0
    ? Math.min(Math.floor(maxQuantity), MAX_EXTRA_QUANTITY)
    : MAX_EXTRA_QUANTITY;
  const n = typeof input === 'number' ? input : Number(input);
  if (!Number.isFinite(n)) return DEFAULT_EXTRA_QUANTITY;
  return Math.min(Math.max(Math.floor(n), DEFAULT_EXTRA_QUANTITY), ceiling);
}

export function extraQuantityCeiling(maxQuantity?: number | null): number {
  return clampExtraQuantity(MAX_EXTRA_QUANTITY, maxQuantity);
}

/**
 * The advisory line shown next to the stepper. Requesting an extra is a message
 * to the host, not a booking, and the guest is told so in plain words. No tax,
 * fee, or total line is ever produced here — the host confirms the price.
 */
export function quantityAdvisory(quantity: number): string {
  return quantity > 1
    ? 'Your host confirms availability and the final price before anything is charged.'
    : 'This sends a request to your host. Nothing is charged now.';
}

// --- Ordering (P5-06) -----------------------------------------------------

export interface SortableExtra {
  id: string;
  title: string;
  category?: string | null;
  is_favorite?: boolean | null;
}

/**
 * The fixed guest-facing order: `is_favorite DESC, category ASC, name ASC`.
 *
 * Applied in the app rather than left to the database alone, because the guest
 * fetch can be served from more than one place (portal render, future concierge
 * suggestions) and the order a guest sees should not depend on which query ran.
 * Ties fall through to id so the order is total and stable across renders.
 */
export function sortExtras<T extends SortableExtra>(extras: readonly T[]): T[] {
  return [...extras].sort((a, b) => {
    const favA = a.is_favorite ? 1 : 0;
    const favB = b.is_favorite ? 1 : 0;
    if (favA !== favB) return favB - favA;

    const catCmp = normalizeExtraCategory(a.category).localeCompare(normalizeExtraCategory(b.category), 'en');
    if (catCmp !== 0) return catCmp;

    const nameCmp = a.title.localeCompare(b.title, 'en', { sensitivity: 'base' });
    if (nameCmp !== 0) return nameCmp;

    return a.id.localeCompare(b.id);
  });
}

export interface ExtrasGroup<T> {
  category: ExtraCategory;
  items: T[];
}

/**
 * Groups extras into category tiles. Categories with no items are omitted, and
 * groups appear in the same order the sorted list produced, so a favourite item
 * pulls its category to the front of the tile list.
 */
export function groupExtrasByCategory<T extends SortableExtra>(extras: readonly T[]): ExtrasGroup<T>[] {
  const sorted = sortExtras(extras);
  const groups: ExtrasGroup<T>[] = [];
  const index = new Map<string, ExtrasGroup<T>>();

  for (const item of sorted) {
    const id = normalizeExtraCategory(item.category);
    let group = index.get(id);
    if (!group) {
      group = { category: extraCategory(id), items: [] };
      index.set(id, group);
      groups.push(group);
    }
    group.items.push(item);
  }

  return groups;
}
