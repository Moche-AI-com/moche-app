// Autopilot gating (§10). Four independent conditions, evaluated as an AND, none of
// which may substitute for another:
//
//   1. Launch floor — suggest-mode only for a minimum window after launch.
//   2. Per-property hard block — the top-5 fields plus the maintenance/emergency
//      contact must be present. A high completeness percentage does NOT clear this.
//   3. Completeness threshold — the registry's ship threshold (§0 single gate).
//   4. Golden eval suite — §7.0 passing. Completeness alone never unlocks autopilot.
//
// The reason this is one function returning every blocker rather than a chain of early
// returns: a partial gate ("we're only failing one thing") is exactly how stacked gating
// erodes. Callers get the full list and cannot accidentally check just the cheap one.

import { COMPLETENESS_SHIP_THRESHOLD, HARD_BLOCK_FIELD_IDS } from './completeness';

/** Minimum suggest-mode window per §10, measured from the launch date. */
export const SUGGEST_MODE_FLOOR_DAYS = 14;

export type AutopilotBlocker =
  | 'suggest_mode_floor'
  | 'hard_block_fields_outstanding'
  | 'below_completeness_threshold'
  | 'golden_suite_not_passing'
  | 'wave_gate_not_cleared'
  | 'operator_disabled';

export interface AutopilotInput {
  /** Registry field ids currently satisfied for this property. */
  satisfiedFieldIds: readonly string[];
  /** Field ids the property has marked not applicable; they leave the hard-block set. */
  inapplicableFieldIds?: readonly string[];
  completenessPct: number;
  /** §7.0 suite result for the shipped registry version. */
  goldenSuitePassing: boolean;
  /** Provider-directive wave gate. Independent of the per-property gate. */
  waveGateCleared: boolean;
  /** Operator kill switch. Default is off, so autopilot is opt-in forever. */
  operatorEnabled: boolean;
  launchedAt: Date;
  now?: Date;
}

export interface AutopilotDecision {
  allowed: boolean;
  /** 'suggest' until every gate clears. There is no third mode. */
  mode: 'suggest' | 'autopilot';
  blockers: AutopilotBlocker[];
  missingHardBlockFieldIds: string[];
  suggestModeFloorEndsAt: string;
}

export function evaluateAutopilot(input: AutopilotInput): AutopilotDecision {
  const now = input.now ?? new Date();
  const satisfied = new Set(input.satisfiedFieldIds);
  const inapplicable = new Set(input.inapplicableFieldIds ?? []);

  const missingHardBlockFieldIds = HARD_BLOCK_FIELD_IDS.filter(
    (id) => !inapplicable.has(id) && !satisfied.has(id),
  );

  const floorEnds = new Date(input.launchedAt);
  floorEnds.setUTCDate(floorEnds.getUTCDate() + SUGGEST_MODE_FLOOR_DAYS);

  const blockers: AutopilotBlocker[] = [];
  if (!input.operatorEnabled) blockers.push('operator_disabled');
  if (now < floorEnds) blockers.push('suggest_mode_floor');
  if (missingHardBlockFieldIds.length > 0) blockers.push('hard_block_fields_outstanding');
  if (input.completenessPct < COMPLETENESS_SHIP_THRESHOLD) blockers.push('below_completeness_threshold');
  if (!input.goldenSuitePassing) blockers.push('golden_suite_not_passing');
  if (!input.waveGateCleared) blockers.push('wave_gate_not_cleared');

  return {
    allowed: blockers.length === 0,
    mode: blockers.length === 0 ? 'autopilot' : 'suggest',
    blockers,
    missingHardBlockFieldIds,
    suggestModeFloorEndsAt: floorEnds.toISOString(),
  };
}

/**
 * Cross-property playbook sharing (§10). Allowed only once autopilot is live for the
 * source property, and only for non-secret operational content. Access codes and
 * property-specific secrets never inherit, regardless of portfolio settings.
 */
export function canShareAcrossPortfolio(args: {
  autopilotLive: boolean;
  sensitivityTier: string;
  propertySpecific: boolean;
}): boolean {
  if (!args.autopilotLive) return false;
  // Only the two non-secret tiers in field_registry.json. stay_scoped_secret and
  // host_only never cross a property boundary.
  if (args.sensitivityTier !== 'public_guest' && args.sensitivityTier !== 'guest_after_verification') return false;
  return !args.propertySpecific;
}
