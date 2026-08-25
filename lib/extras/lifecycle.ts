export const EXTRAS_FULFILLMENT_STATUSES = [
  'requested',
  'needs_details',
  'accepted',
  'payment_pending',
  'scheduled',
  'fulfilled',
  'declined',
  'canceled',
  'expired',
  'refunded',
] as const;

export type ExtrasFulfillmentStatus = typeof EXTRAS_FULFILLMENT_STATUSES[number];
export type ExtrasLifecycleActor = 'guest' | 'host';

export const TERMINAL_EXTRAS_STATUSES: readonly ExtrasFulfillmentStatus[] = [
  'fulfilled',
  'declined',
  'canceled',
  'expired',
  'refunded',
];

type Transition = {
  to: ExtrasFulfillmentStatus;
  actors: readonly ExtrasLifecycleActor[];
};

/**
 * Request-only lifecycle. `payment_pending` records only that the host is
 * waiting for a payment arranged outside Moche; it never starts a collection.
 */
export const EXTRAS_TRANSITIONS: Record<ExtrasFulfillmentStatus, readonly Transition[]> = {
  requested: [
    { to: 'needs_details', actors: ['host'] },
    { to: 'accepted', actors: ['host'] },
    // Hosts can complete or cancel straight from the queue's health dropdown —
    // real-world fulfillment doesn't always pause for the ceremony states.
    { to: 'fulfilled', actors: ['host'] },
    { to: 'declined', actors: ['host'] },
    { to: 'canceled', actors: ['guest', 'host'] },
  ],
  needs_details: [
    { to: 'requested', actors: ['guest'] },
    { to: 'accepted', actors: ['host'] },
    { to: 'fulfilled', actors: ['host'] },
    { to: 'declined', actors: ['host'] },
    { to: 'canceled', actors: ['guest', 'host'] },
  ],
  accepted: [
    { to: 'payment_pending', actors: ['host'] },
    { to: 'scheduled', actors: ['host'] },
    { to: 'fulfilled', actors: ['host'] },
    { to: 'canceled', actors: ['host'] },
  ],
  payment_pending: [
    { to: 'scheduled', actors: ['host'] },
    { to: 'fulfilled', actors: ['host'] },
    { to: 'canceled', actors: ['host'] },
    { to: 'refunded', actors: ['host'] },
  ],
  scheduled: [
    { to: 'fulfilled', actors: ['host'] },
    { to: 'canceled', actors: ['host'] },
  ],
  fulfilled: [],
  declined: [],
  canceled: [],
  expired: [],
  refunded: [],
};

export function canTransition(
  from: ExtrasFulfillmentStatus,
  to: ExtrasFulfillmentStatus,
  actor: ExtrasLifecycleActor,
): boolean {
  return EXTRAS_TRANSITIONS[from].some(
    (transition) => transition.to === to && transition.actors.includes(actor),
  );
}

export function nextStatesFor(
  status: ExtrasFulfillmentStatus,
  actor: ExtrasLifecycleActor,
): ExtrasFulfillmentStatus[] {
  return EXTRAS_TRANSITIONS[status]
    .filter((transition) => transition.actors.includes(actor))
    .map((transition) => transition.to);
}

export function isTerminalExtrasStatus(status: ExtrasFulfillmentStatus): boolean {
  return TERMINAL_EXTRAS_STATUSES.includes(status);
}

export const EXTRAS_STATUS_LABEL: Record<ExtrasFulfillmentStatus, string> = {
  requested: 'Requested',
  needs_details: 'Needs details',
  accepted: 'Accepted',
  payment_pending: 'Waiting on payment arranged outside Moche',
  scheduled: 'Scheduled',
  fulfilled: 'Fulfilled',
  declined: 'Declined',
  canceled: 'Canceled',
  expired: 'Expired',
  refunded: 'Refunded',
};

// Host-facing health statuses for the queue dropdown — the same shape as the
// Escalations status menu, so managing a request feels identical to handling a
// question. The granular fulfillment lifecycle still runs underneath; these are
// the four states a host actually tracks.
export type ExtrasHealthStatus = 'requested' | 'in_progress' | 'completed' | 'cancelled';

export const EXTRAS_HEALTH_LABEL: Record<ExtrasHealthStatus, string> = {
  requested: 'Requested',
  in_progress: 'In progress',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

export function extrasHealthFor(status: ExtrasFulfillmentStatus): ExtrasHealthStatus {
  if (status === 'fulfilled') return 'completed';
  if (status === 'declined' || status === 'canceled' || status === 'expired' || status === 'refunded') return 'cancelled';
  if (status === 'requested' || status === 'needs_details') return 'requested';
  return 'in_progress';
}

// The fulfillment status a health selection lands on. In progress = accepted;
// the finer-grained schedule/estimate actions stay on the row's Details panel.
// 'requested' is the starting state, never a target — it maps to null.
export function fulfillmentForHealth(health: ExtrasHealthStatus): ExtrasFulfillmentStatus | null {
  switch (health) {
    case 'in_progress': return 'accepted';
    case 'completed': return 'fulfilled';
    case 'cancelled': return 'canceled';
    default: return null;
  }
}

// Guest-facing labels for the portal's "Your requests" view — guests see
// outcomes in their own words, never the internal state machine names.
export const EXTRAS_GUEST_STATUS_LABEL: Record<ExtrasFulfillmentStatus, string> = {
  requested: 'Requested',
  needs_details: 'The host has a question for you',
  accepted: 'Confirmed',
  payment_pending: 'Confirmed — arrange payment with your host',
  scheduled: 'Scheduled',
  fulfilled: 'Completed',
  declined: 'Declined',
  canceled: 'Cancelled',
  expired: 'Expired',
  refunded: 'Refunded',
};

export function legacyStatusForFulfillment(
  status: ExtrasFulfillmentStatus,
): 'requested' | 'confirmed' | 'fulfilled' | 'declined' | 'cancelled' {
  switch (status) {
    case 'accepted':
    case 'payment_pending':
    case 'scheduled':
      return 'confirmed';
    case 'fulfilled':
      return 'fulfilled';
    case 'declined':
      return 'declined';
    case 'canceled':
    case 'expired':
    case 'refunded':
      return 'cancelled';
    default:
      return 'requested';
  }
}
