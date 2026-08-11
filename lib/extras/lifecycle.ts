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
    { to: 'declined', actors: ['host'] },
    { to: 'canceled', actors: ['guest', 'host'] },
  ],
  needs_details: [
    { to: 'requested', actors: ['guest'] },
    { to: 'accepted', actors: ['host'] },
    { to: 'declined', actors: ['host'] },
    { to: 'canceled', actors: ['guest', 'host'] },
  ],
  accepted: [
    { to: 'payment_pending', actors: ['host'] },
    { to: 'scheduled', actors: ['host'] },
    { to: 'canceled', actors: ['host'] },
  ],
  payment_pending: [
    { to: 'scheduled', actors: ['host'] },
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
