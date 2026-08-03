import type { Database } from '@/lib/database.types';

export type MemberRole = Database['public']['Enums']['member_role'];

export const MEMBER_ROLES: readonly MemberRole[] = [
  'owner',
  'co_host',
  'property_manager',
  'maintenance',
  'cleaner',
  'viewer',
];

export interface RoleCapabilities {
  editBrain: boolean;
  replyGuests: boolean;
  receiveEscalations: boolean;
  resolveMaintenance: boolean;
  viewAnalytics: boolean;
  editProperty: boolean;
  manageBilling: boolean;
  manageCoHosts: boolean;
}

// Property-level roles only. `owner` is handled separately by getPropertyAccess
// (implicit all-true) and never stored as a property_members row -- included
// here only so callers can look up a label/description for it if needed.
const PRESETS: Record<MemberRole, RoleCapabilities> = {
  owner: {
    editBrain: true,
    replyGuests: true,
    receiveEscalations: true,
    resolveMaintenance: true,
    viewAnalytics: true,
    editProperty: true,
    manageBilling: true,
    manageCoHosts: true,
  },
  co_host: {
    editBrain: true,
    replyGuests: true,
    receiveEscalations: true,
    resolveMaintenance: true,
    viewAnalytics: true,
    editProperty: false,
    manageBilling: false,
    manageCoHosts: false,
  },
  property_manager: {
    editBrain: true,
    replyGuests: true,
    receiveEscalations: true,
    resolveMaintenance: true,
    viewAnalytics: true,
    editProperty: false,
    manageBilling: false,
    manageCoHosts: false,
  },
  maintenance: {
    editBrain: false,
    replyGuests: false,
    receiveEscalations: false,
    resolveMaintenance: true,
    viewAnalytics: false,
    editProperty: false,
    manageBilling: false,
    manageCoHosts: false,
  },
  cleaner: {
    editBrain: false,
    replyGuests: false,
    receiveEscalations: false,
    resolveMaintenance: true,
    viewAnalytics: false,
    editProperty: false,
    manageBilling: false,
    manageCoHosts: false,
  },
  viewer: {
    editBrain: false,
    replyGuests: false,
    receiveEscalations: false,
    resolveMaintenance: false,
    viewAnalytics: true,
    editProperty: false,
    manageBilling: false,
    manageCoHosts: false,
  },
};

// Default capability booleans for a property_members row given a preset role.
// Pure function -- used to pre-fill the insert/update payload when an owner
// assigns a role; the underlying boolean columns remain the source of truth
// read by getPropertyAccess, so per-member overrides after assignment still work.
export function defaultCapabilitiesForRole(role: MemberRole): RoleCapabilities {
  return PRESETS[role];
}

export function isValidMemberRole(value: unknown): value is MemberRole {
  return typeof value === 'string' && (MEMBER_ROLES as readonly string[]).includes(value);
}
