/**
 * The capability contract for invitations and property membership.
 *
 * These keys deliberately match the persisted `property_members` columns. Keeping
 * the server validator, defaults, UI labels, and invitation email on this one
 * contract prevents a new checkbox from becoming an unreviewed permission grant.
 */
export const CAPABILITY_KEYS = [
  'can_edit_brain',
  'can_reply_guests',
  'can_receive_escalations',
  'can_resolve_maintenance',
  'can_view_analytics',
] as const;

export type CapabilityKey = (typeof CAPABILITY_KEYS)[number];
export type CapabilitySet = Record<CapabilityKey, boolean>;

export const CAPABILITIES: ReadonlyArray<{ key: CapabilityKey; label: string }> = [
  { key: 'can_edit_brain', label: 'Edit the Brain' },
  { key: 'can_reply_guests', label: 'Reply to guests' },
  { key: 'can_receive_escalations', label: 'Receive escalations' },
  { key: 'can_resolve_maintenance', label: 'Resolve maintenance' },
  { key: 'can_view_analytics', label: 'View analytics' },
];

export const INVITABLE_ROLE_IDS = [
  'co_host',
  'property_manager',
  'support',
  'maintenance',
  'cleaner',
  'viewer',
] as const;

export type InvitableRole = (typeof INVITABLE_ROLE_IDS)[number];

export const MEMBER_ROLES = [
  {
    id: 'co_host',
    label: 'Co-host',
    description: 'Help run the guest experience across the properties you choose.',
  },
  {
    id: 'property_manager',
    label: 'Property manager',
    description: 'Coordinate day-to-day property operations without account analytics by default.',
  },
  {
    id: 'support',
    label: 'Support',
    description: 'Answer guest questions and receive escalations that need a response.',
  },
  {
    id: 'maintenance',
    label: 'Maintenance',
    description: 'Resolve maintenance work without access to guest conversations or the Brain.',
  },
  {
    id: 'cleaner',
    label: 'Cleaner',
    description: 'Manage cleaning and maintenance follow-up for the properties you choose.',
  },
  {
    id: 'viewer',
    label: 'Viewer',
    description: 'See the selected properties with no actions enabled by default.',
  },
] as const;

export const ALL_CAPABILITIES: CapabilitySet = {
  can_edit_brain: true,
  can_reply_guests: true,
  can_receive_escalations: true,
  can_resolve_maintenance: true,
  can_view_analytics: true,
};

/**
 * These presets only make invitation setup quicker; owners can always narrow or
 * expand each action. Property managers begin without analytics because that
 * exposes account-level performance information rather than operating context.
 */
export const DEFAULT_CAPABILITIES_FOR_ROLE: Record<InvitableRole, CapabilitySet> = {
  co_host: { ...ALL_CAPABILITIES },
  property_manager: {
    can_edit_brain: true,
    can_reply_guests: true,
    can_receive_escalations: true,
    can_resolve_maintenance: true,
    can_view_analytics: false,
  },
  support: {
    can_edit_brain: false,
    can_reply_guests: true,
    can_receive_escalations: true,
    can_resolve_maintenance: false,
    can_view_analytics: false,
  },
  maintenance: {
    can_edit_brain: false,
    can_reply_guests: false,
    can_receive_escalations: false,
    can_resolve_maintenance: true,
    can_view_analytics: false,
  },
  cleaner: {
    can_edit_brain: false,
    can_reply_guests: false,
    can_receive_escalations: false,
    can_resolve_maintenance: true,
    can_view_analytics: false,
  },
  viewer: {
    can_edit_brain: false,
    can_reply_guests: false,
    can_receive_escalations: false,
    can_resolve_maintenance: false,
    can_view_analytics: false,
  },
};

export function isInvitableRole(value: unknown): value is InvitableRole {
  return typeof value === 'string' && INVITABLE_ROLE_IDS.includes(value as InvitableRole);
}

export function isAllActions(set: CapabilitySet): boolean {
  return CAPABILITY_KEYS.every((key) => set[key]);
}

export function withAllActions(): CapabilitySet {
  return { ...ALL_CAPABILITIES };
}

/**
 * Final server-side normalization before a member row or invitation is written.
 * Unknown keys are rejected rather than ignored, and only the literal boolean
 * true (plus conventional form true values) enables an action. This fails closed
 * for crafted form posts such as `{ can_view_analytics: "yes" }`.
 */
export function normalizeCapabilities(role: unknown, submitted: unknown): CapabilitySet {
  if (!isInvitableRole(role)) throw new Error('Unknown invitable role');
  if (submitted === null || typeof submitted !== 'object' || Array.isArray(submitted)) {
    return { ...DEFAULT_CAPABILITIES_FOR_ROLE[role] };
  }

  const record = submitted as Record<string, unknown>;
  for (const key of Object.keys(record)) {
    if (!(CAPABILITY_KEYS as readonly string[]).includes(key)) {
      throw new Error(`Unknown member capability: ${key}`);
    }
  }

  return CAPABILITY_KEYS.reduce<CapabilitySet>(
    (normalized, key) => {
      const value = record[key];
      normalized[key] = value === true || value === 'true' || value === 'on' || value === 1;
      return normalized;
    },
    {
      can_edit_brain: false,
      can_reply_guests: false,
      can_receive_escalations: false,
      can_resolve_maintenance: false,
      can_view_analytics: false,
    },
  );
}
