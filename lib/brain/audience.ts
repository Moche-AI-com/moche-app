// Audience gating for a single fact (directive §3, §7.3).
//
// The permitted-audience sets come from field_registry.json's audience_matrix, which is
// generated from the directive — never hand-edited here. This module is the one place
// that answers "may this audience see a fact at this sensitivity tier", so a new caller
// cannot invent a looser rule.

import registry from '@/field_registry.json';

export type SensitivityTier = 'public_guest' | 'guest_after_verification' | 'stay_scoped_secret' | 'host_only';

export type AudienceTier =
  | 'system_internal'
  | 'host_private'
  | 'staff_ops'
  | 'guest_instay'
  | 'guest_prearrival'
  | 'guest_public';

const MATRIX = registry.audience_matrix as Record<string, readonly string[]>;

/** Widest-last. Used for display ordering only, never for authorization. */
export const AUDIENCE_TIERS = registry.audience_tiers as readonly AudienceTier[];

export function audiencePermits(tier: SensitivityTier, audience: AudienceTier): boolean {
  const permitted = MATRIX[tier];
  // An unknown tier is a registry/code mismatch. Deny rather than default open.
  if (!permitted) return false;
  return permitted.includes(audience);
}

/**
 * True when the fact is a stay-scoped secret and therefore additionally requires a live
 * access window, on top of the audience check. Audience and access window are separate
 * gates and neither substitutes for the other (§0 reconciliation table).
 */
export function requiresAccessWindow(tier: SensitivityTier): boolean {
  return tier === 'stay_scoped_secret';
}
