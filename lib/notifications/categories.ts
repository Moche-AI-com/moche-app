import type { Database } from '@/lib/database.types';

export type NotificationKind = Database['public']['Enums']['notification_kind'];

export type NotificationCategoryKey =
  | 'host_messages'
  | 'escalations'
  | 'service'
  | 'extras'
  | 'review_nudges'
  | 'property_brain'
  | 'billing'
  | 'system';

export interface NotificationCategory {
  key: NotificationCategoryKey;
  label: string;
  /** One plain-language line shown under the switch in Profile → Notifications. */
  description: string;
  /**
   * Always-on paths cannot be unsubscribed — enforced in the server action, not
   * just the UI. Host messages are the direct guest→host line; billing is
   * required account correspondence; system carries sign-in / lockout alerts.
   */
  alwaysOn: boolean;
  /** notification_kind values that roll up into this category. */
  kinds: readonly NotificationKind[];
}

/**
 * Single source of truth for the notification information architecture: bell
 * icons, history labels, preference switches, and notify() fan-out gating all
 * read from here. Array order is the order hosts see in Profile → Notifications.
 */
export const NOTIFICATION_CATEGORIES: readonly NotificationCategory[] = [
  {
    key: 'host_messages',
    label: 'Host messages',
    description:
      'A guest writes to you directly in Host Chat. This is the direct line to your guests, so it is always on.',
    alwaysOn: true,
    kinds: ['host_message'],
  },
  {
    key: 'escalations',
    label: 'Escalations',
    description: 'The AI could not answer, or a handled question reopened — a guest is waiting on a person.',
    alwaysOn: false,
    kinds: ['escalation'],
  },
  {
    key: 'service',
    label: 'Service requests',
    description: 'Maintenance, cleaning, and safety reports from the guest service interview.',
    alwaysOn: false,
    kinds: ['maintenance'],
  },
  {
    key: 'extras',
    label: 'Extra requests',
    description: 'A guest asked for a paid extra or add-on — a revenue signal worth acting on quickly.',
    alwaysOn: false,
    kinds: ['extras'],
  },
  {
    key: 'review_nudges',
    label: 'Review nudges',
    description: 'Post-checkout review prompts and review-flow updates.',
    alwaysOn: false,
    kinds: ['review_nudge'],
  },
  {
    key: 'property_brain',
    label: 'Property knowledge',
    description: 'Listing imports and knowledge-ingestion failures that need a look.',
    alwaysOn: false,
    kinds: ['ingestion_failure'],
  },
  {
    key: 'billing',
    label: 'Billing and plan',
    description: 'Payments, invoices, and trial or subscription changes. Required account correspondence, always on.',
    alwaysOn: true,
    kinds: ['billing'],
  },
  {
    key: 'system',
    label: 'System and security',
    description: 'Sign-in alerts, visit-code lockouts, and platform notices. Always on so your account stays protected.',
    alwaysOn: true,
    kinds: ['system'],
  },
];

// Exhaustive on purpose: adding a notification_kind enum value without mapping
// it here is a compile error, and test/notification-preferences.test.ts asserts
// exact parity with the database enum at runtime.
export const CATEGORY_FOR_KIND: Record<NotificationKind, NotificationCategoryKey> = {
  host_message: 'host_messages',
  escalation: 'escalations',
  maintenance: 'service',
  extras: 'extras',
  review_nudge: 'review_nudges',
  ingestion_failure: 'property_brain',
  billing: 'billing',
  system: 'system',
};

export function categoryForKind(kind: NotificationKind | string): NotificationCategory | null {
  const key = (CATEGORY_FOR_KIND as Record<string, NotificationCategoryKey>)[kind];
  return NOTIFICATION_CATEGORIES.find((c) => c.key === key) ?? null;
}

/** Human label for a raw notification_kind, for badges on the history page. */
export function labelForKind(kind: NotificationKind | string): string {
  return categoryForKind(kind)?.label ?? kind;
}

export interface NotificationPreferenceRow {
  category: string;
  enabled: boolean;
}

/**
 * Kinds this viewer has unsubscribed from. Pure read-time filtering: rows stay
 * in the account's notification table untouched, the viewer simply stops being
 * shown them. Always-on categories can never end up in the result, even if a
 * stored row says otherwise. `null` (read failed) fails open: show everything.
 */
export function hiddenKindsForPrefs(
  prefs: readonly NotificationPreferenceRow[] | null,
): ReadonlySet<NotificationKind> {
  const hidden = new Set<NotificationKind>();
  if (!prefs) return hidden;
  const disabled = new Set(prefs.filter((p) => !p.enabled).map((p) => p.category));
  if (disabled.size === 0) return hidden;
  for (const category of NOTIFICATION_CATEGORIES) {
    if (category.alwaysOn || !disabled.has(category.key)) continue;
    for (const kind of category.kinds) hidden.add(kind);
  }
  return hidden;
}
