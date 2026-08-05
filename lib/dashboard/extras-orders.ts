// Pure logic for the Extras order queue. Kept out of the React components and
// out of the API route so the state machine has exactly one definition that both
// sides import, and so it is unit testable without a DOM or a database.
//
// NOTE ON VOCABULARY: guest-facing copy never says "upsell". These are Extras
// (host-facing: "Extras", the catalog items) and orders (a guest asked for one).

import type { Database } from '@/lib/database.types';

export type ExtrasOrderStatus = Database['public']['Enums']['extras_order_status'];

/** Host-facing labels. Guests never see these strings. */
export const EXTRAS_ORDER_STATUS_LABEL: Record<ExtrasOrderStatus, string> = {
  requested: 'Requested',
  confirmed: 'Confirmed',
  fulfilled: 'Fulfilled',
  declined: 'Declined',
  cancelled: 'Cancelled',
};

/**
 * Terminal statuses. These are the ones the database's GENERATED
 * `lifecycle_status` column maps to 'archived'. Duplicated here on purpose so
 * the UI can reason about it without a round trip, and asserted against the
 * real column in the test file so the two can never silently diverge.
 */
export const ARCHIVED_EXTRAS_ORDER_STATUSES: readonly ExtrasOrderStatus[] = [
  'fulfilled',
  'declined',
  'cancelled',
];

export function isArchivedExtrasOrderStatus(status: ExtrasOrderStatus): boolean {
  return ARCHIVED_EXTRAS_ORDER_STATUSES.includes(status);
}

/**
 * Allowed transitions.
 *
 * Deliberately forgiving in one direction and strict in the other: a host can
 * always walk an order forward or kill it, and can reopen a mistakenly closed
 * order back to 'confirmed', but 'declined' cannot jump straight to 'fulfilled'
 * (that would leave no record that it was ever refused). 'cancelled' is
 * genuinely final: an order the guest called off should be re-requested by the
 * guest, not resurrected by the host.
 */
export const EXTRAS_ORDER_TRANSITIONS: Record<ExtrasOrderStatus, readonly ExtrasOrderStatus[]> = {
  requested: ['confirmed', 'fulfilled', 'declined', 'cancelled'],
  confirmed: ['fulfilled', 'declined', 'cancelled'],
  fulfilled: ['confirmed'], // undo a premature "done"
  declined: ['requested'], // undo a mis-tap, back to the queue
  cancelled: [],
};

export function canTransitionExtrasOrder(from: ExtrasOrderStatus, to: ExtrasOrderStatus): boolean {
  if (from === to) return true; // idempotent no-op, e.g. a double-tap
  return EXTRAS_ORDER_TRANSITIONS[from].includes(to);
}

/**
 * The one or two buttons worth showing on a queue row, in priority order.
 * Returning this from shared logic keeps the component dumb and means the
 * button set can be asserted in a test instead of eyeballed in a browser.
 */
export function primaryExtrasOrderActions(
  status: ExtrasOrderStatus,
): Array<{ to: ExtrasOrderStatus; label: string; tone: 'primary' | 'ghost' | 'danger' }> {
  switch (status) {
    case 'requested':
      return [
        { to: 'confirmed', label: 'Confirm', tone: 'primary' },
        { to: 'declined', label: 'Decline', tone: 'danger' },
      ];
    case 'confirmed':
      return [
        { to: 'fulfilled', label: 'Mark fulfilled', tone: 'primary' },
        { to: 'declined', label: 'Decline', tone: 'danger' },
      ];
    case 'fulfilled':
      return [{ to: 'confirmed', label: 'Reopen', tone: 'ghost' }];
    case 'declined':
      return [{ to: 'requested', label: 'Undo', tone: 'ghost' }];
    case 'cancelled':
      return [];
  }
}

/**
 * Total quantity requested per catalog item, for the "requested 12 times"
 * counters in the catalog manager. Orders with a null extra_id (catalog item
 * since deleted) are grouped under the empty string so the caller can choose to
 * ignore them rather than crashing on an undefined key.
 */
export function tallyByExtra(
  orders: Array<{ extra_id: string | null; quantity: number }>,
): Map<string, number> {
  const out = new Map<string, number>();
  for (const o of orders) {
    const key = o.extra_id ?? '';
    out.set(key, (out.get(key) ?? 0) + o.quantity);
  }
  return out;
}
