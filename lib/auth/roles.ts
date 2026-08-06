import type { Database } from '@/lib/database.types';
import {
  DEFAULT_CAPABILITIES_FOR_ROLE,
  isInvitableRole,
  type CapabilitySet,
} from '@/lib/auth/member-capabilities';

export type MemberRole = Database['public']['Enums']['member_role'];

export const MEMBER_ROLES: readonly MemberRole[] = [
  'owner',
  'co_host',
  'property_manager',
  'support',
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

function propertyCapabilities(capabilities: CapabilitySet): RoleCapabilities {
  return {
    editBrain: capabilities.can_edit_brain,
    replyGuests: capabilities.can_reply_guests,
    receiveEscalations: capabilities.can_receive_escalations,
    resolveMaintenance: capabilities.can_resolve_maintenance,
    viewAnalytics: capabilities.can_view_analytics,
    editProperty: false,
    manageBilling: false,
    manageCoHosts: false,
  };
}

// Default capability booleans for a property_members row given a preset role.
// Pure function -- used to pre-fill the insert/update payload when an owner
// assigns a role; the underlying boolean columns remain the source of truth
// read by getPropertyAccess, so per-member overrides after assignment still work.
export function defaultCapabilitiesForRole(role: MemberRole): RoleCapabilities {
  if (role === 'owner') {
    return {
      editBrain: true,
      replyGuests: true,
      receiveEscalations: true,
      resolveMaintenance: true,
      viewAnalytics: true,
      editProperty: true,
      manageBilling: true,
      manageCoHosts: true,
    };
  }
  return propertyCapabilities(DEFAULT_CAPABILITIES_FOR_ROLE[role]);
}

export function isValidMemberRole(value: unknown): value is MemberRole {
  return value === 'owner' || isInvitableRole(value);
}
