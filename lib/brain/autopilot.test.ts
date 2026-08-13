import { describe, it, expect } from 'vitest';
import { evaluateAutopilot, canShareAcrossPortfolio, SUGGEST_MODE_FLOOR_DAYS } from './autopilot';
import { HARD_BLOCK_FIELD_IDS, COMPLETENESS_SHIP_THRESHOLD } from './completeness';

const LAUNCH = new Date('2026-06-01T00:00:00.000Z');
const AFTER_FLOOR = new Date('2026-07-01T00:00:00.000Z');

function clean(overrides: Partial<Parameters<typeof evaluateAutopilot>[0]> = {}) {
  return evaluateAutopilot({
    satisfiedFieldIds: [...HARD_BLOCK_FIELD_IDS],
    completenessPct: COMPLETENESS_SHIP_THRESHOLD,
    goldenSuitePassing: true,
    waveGateCleared: true,
    operatorEnabled: true,
    launchedAt: LAUNCH,
    now: AFTER_FLOOR,
    ...overrides,
  });
}

describe('evaluateAutopilot', () => {
  it('allows autopilot only when every gate clears', () => {
    const out = clean();
    expect(out).toMatchObject({ allowed: true, mode: 'autopilot', blockers: [] });
  });

  it('defaults to suggest mode with the operator switch off', () => {
    expect(clean({ operatorEnabled: false })).toMatchObject({
      allowed: false,
      mode: 'suggest',
      blockers: ['operator_disabled'],
    });
  });

  it('holds suggest mode for the launch floor even with everything else green', () => {
    const out = clean({ now: new Date('2026-06-10T00:00:00.000Z') });
    expect(out.allowed).toBe(false);
    expect(out.blockers).toContain('suggest_mode_floor');
    expect(out.suggestModeFloorEndsAt).toBe('2026-06-15T00:00:00.000Z');
    expect(SUGGEST_MODE_FLOOR_DAYS).toBe(14);
  });

  it('does not let a high completeness percentage clear the hard block', () => {
    const out = clean({ satisfiedFieldIds: [], completenessPct: 100 });
    expect(out.allowed).toBe(false);
    expect(out.blockers).toContain('hard_block_fields_outstanding');
    expect(out.blockers).not.toContain('below_completeness_threshold');
    expect(out.missingHardBlockFieldIds).toEqual([...HARD_BLOCK_FIELD_IDS]);
  });

  it('does not let a cleared hard block substitute for the completeness threshold', () => {
    const out = clean({ completenessPct: COMPLETENESS_SHIP_THRESHOLD - 1 });
    expect(out.blockers).toEqual(['below_completeness_threshold']);
  });

  it('does not let completeness substitute for the golden suite', () => {
    const out = clean({ completenessPct: 100, goldenSuitePassing: false });
    expect(out.allowed).toBe(false);
    expect(out.blockers).toEqual(['golden_suite_not_passing']);
  });

  it('keeps the provider wave gate independent of the per-property gate', () => {
    expect(clean({ waveGateCleared: false }).blockers).toEqual(['wave_gate_not_cleared']);
  });

  it('reports every failing gate at once rather than the first', () => {
    const out = clean({
      operatorEnabled: false,
      satisfiedFieldIds: [],
      completenessPct: 0,
      goldenSuitePassing: false,
      waveGateCleared: false,
      now: LAUNCH,
    });
    expect(out.blockers.sort()).toEqual(
      [
        'below_completeness_threshold',
        'golden_suite_not_passing',
        'hard_block_fields_outstanding',
        'operator_disabled',
        'suggest_mode_floor',
        'wave_gate_not_cleared',
      ].sort(),
    );
  });

  it('lets a not-applicable field leave the hard-block set', () => {
    const [first, ...rest] = HARD_BLOCK_FIELD_IDS;
    const out = clean({ satisfiedFieldIds: rest, inapplicableFieldIds: [first] });
    expect(out.missingHardBlockFieldIds).toEqual([]);
    expect(out.allowed).toBe(true);
  });
});

describe('canShareAcrossPortfolio', () => {
  it('shares non-secret, non-property-specific playbooks once autopilot is live', () => {
    expect(
      canShareAcrossPortfolio({ autopilotLive: true, sensitivityTier: 'public_guest', propertySpecific: false }),
    ).toBe(true);
  });

  it('never shares before autopilot is live', () => {
    expect(
      canShareAcrossPortfolio({ autopilotLive: false, sensitivityTier: 'public_guest', propertySpecific: false }),
    ).toBe(false);
  });

  it('never shares a secret tier, regardless of portfolio settings', () => {
    for (const tier of ['stay_scoped_secret', 'host_only']) {
      expect(
        canShareAcrossPortfolio({ autopilotLive: true, sensitivityTier: tier, propertySpecific: false }),
        tier,
      ).toBe(false);
    }
  });

  it('never shares property-specific content', () => {
    expect(
      canShareAcrossPortfolio({ autopilotLive: true, sensitivityTier: 'public_guest', propertySpecific: true }),
    ).toBe(false);
  });
});
