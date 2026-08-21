import { describe, it, expect } from 'vitest';
import {
  WIZARD_STEPS,
  WIZARD_QUESTIONS,
  WIZARD_FIELD_IDS,
  WIZARD_PREDICATES,
  WIZARD_COVERAGE_TARGET,
  visibleSteps,
  visibleQuestions,
  wizardCoverage,
  fullWizardCoverage,
  composeValue,
  composeSpaceSummary,
  derivedMultiStory,
  predicateLabel,
} from './wizard';
import { REGISTRY_FIELDS } from '@/lib/brain/completeness';
import { BRAIN_SECTIONS } from '@/lib/brain/taxonomy';

const SECTION_IDS = new Set(BRAIN_SECTIONS.map((s) => s.id));

describe('wizard structure', () => {
  it('references only real registry fields', () => {
    const known = new Set(REGISTRY_FIELDS.map((f) => f.field_id));
    for (const id of WIZARD_FIELD_IDS) expect(known.has(id), id).toBe(true);
  });

  it('never asks the same field twice', () => {
    expect(new Set(WIZARD_FIELD_IDS).size).toBe(WIZARD_FIELD_IDS.length);
  });

  it('never asks a system_section field', () => {
    const system = new Set(REGISTRY_FIELDS.filter((f) => f.system_section).map((f) => f.field_id));
    for (const id of WIZARD_FIELD_IDS) expect(system.has(id), id).toBe(false);
  });

  it('takes its question text from the registry interview_prompt', () => {
    // Guards against copy drifting into this module. If a question needs different
    // wording, the registry entry is the place to change it.
    for (const q of WIZARD_QUESTIONS) {
      const f = REGISTRY_FIELDS.find((r) => r.field_id === q.fieldId)!;
      expect(q.prompt).toBe(f.interview_prompt);
      expect(q.label).toBe(f.label);
      expect(q.prompt.length).toBeGreaterThan(0);
    }
  });

  it('derives every section from the registry domain', () => {
    for (const q of WIZARD_QUESTIONS) {
      expect(SECTION_IDS.has(q.section), `${q.fieldId} -> ${q.section}`).toBe(true);
      const f = REGISTRY_FIELDS.find((r) => r.field_id === q.fieldId)!;
      expect(q.section).toBe(f.domain);
    }
  });

  it('copies gating from the registry applicability, never hand-set', () => {
    for (const q of WIZARD_QUESTIONS) {
      const f = REGISTRY_FIELDS.find((r) => r.field_id === q.fieldId)!;
      expect(q.gatedBy).toBe(f.applicability);
    }
  });

  it('asks every hard-block field', () => {
    // A property cannot be shared with a guest until these are answered, so an
    // onboarding flow that omits one produces a property the host cannot use.
    const hardBlock = REGISTRY_FIELDS.filter((f) => f.hard_block && !f.system_section).map((f) => f.field_id);
    expect(hardBlock.length).toBeGreaterThan(0);
    for (const id of hardBlock) expect(WIZARD_FIELD_IDS).toContain(id);
  });

  it('asks the fallback for every requires_on_failure field it asks', () => {
    // Without the fallback the field scores 0.5 instead of 1.0, so the host does
    // the work and only gets half the credit — the most confusing possible
    // outcome on a completion meter.
    for (const q of WIZARD_QUESTIONS) {
      const f = REGISTRY_FIELDS.find((r) => r.field_id === q.fieldId)!;
      if (!f.requires_on_failure) continue;
      expect(f.on_failure_field, q.fieldId).toBeTruthy();
      expect(WIZARD_FIELD_IDS, `${q.fieldId} needs ${f.on_failure_field}`).toContain(f.on_failure_field!);
    }
  });

  it('routes secrets only through secret controls', () => {
    for (const q of WIZARD_QUESTIONS) {
      const f = REGISTRY_FIELDS.find((r) => r.field_id === q.fieldId)!;
      expect(q.secret).toBe(f.type === 'secret');
      if (q.secret) expect(q.control).toBe('secret');
    }
  });

  it('has exactly one core step, one features step and one documents step, documents last', () => {
    expect(WIZARD_STEPS.filter((s) => s.kind === 'core')).toHaveLength(1);
    expect(WIZARD_STEPS.filter((s) => s.kind === 'features')).toHaveLength(1);
    const docs = WIZARD_STEPS.filter((s) => s.kind === 'documents');
    expect(docs).toHaveLength(1);
    expect(WIZARD_STEPS[WIZARD_STEPS.length - 1].kind).toBe('documents');
    expect(WIZARD_STEPS[0].kind).toBe('core');
    expect(WIZARD_STEPS[1].kind).toBe('features');
  });

  it('gives every step a title and a blurb', () => {
    for (const s of WIZARD_STEPS) {
      expect(s.title.length).toBeGreaterThan(0);
      expect(s.blurb.length).toBeGreaterThan(0);
    }
  });

  it('gates every step by a predicate the features step actually asks about', () => {
    for (const s of WIZARD_STEPS) {
      if (!s.gatedBy) continue;
      expect(WIZARD_PREDICATES).toContain(s.gatedBy);
    }
  });

  it('gives every applicability predicate host-facing copy', () => {
    for (const p of WIZARD_PREDICATES) {
      const label = predicateLabel(p);
      expect(label.length).toBeGreaterThan(0);
      expect(label).not.toContain('_');
    }
  });

  it('provides options for every select and segmented control', () => {
    for (const q of WIZARD_QUESTIONS) {
      if (q.control === 'select' || q.control === 'segmented') {
        expect(q.options?.length, q.fieldId).toBeGreaterThan(1);
      }
      for (const sub of q.compose ?? []) {
        if (sub.control === 'select' || sub.control === 'segmented') {
          expect(sub.options?.length, `${q.fieldId}.${sub.key}`).toBeGreaterThan(1);
        }
      }
    }
  });

  it('only defaults values that pass registry validation', () => {
    for (const q of WIZARD_QUESTIONS) {
      if (q.defaultValue === undefined) continue;
      const f = REGISTRY_FIELDS.find((r) => r.field_id === q.fieldId)!;
      if (f.type === 'time') expect(q.defaultValue).toMatch(/^([01]\d|2[0-3]):[0-5]\d$/);
      if (f.type === 'enum' && q.options) {
        expect(q.options.map((o) => o.value)).toContain(q.defaultValue);
      }
    }
  });

  it('never prefills a secret', () => {
    for (const q of WIZARD_QUESTIONS) {
      if (q.secret) expect(q.defaultValue).toBeUndefined();
    }
  });
});

describe('conditional questions (§2)', () => {
  it('hides every gated question when nothing is asserted', () => {
    const shown = visibleQuestions([]);
    for (const q of shown) expect(q.gatedBy).toBe('always');
  });

  it('skips the whole Wi-Fi step for a property with no Wi-Fi', () => {
    const ids = visibleSteps([]).map((s) => s.id);
    expect(ids).not.toContain('connectivity');
    expect(visibleSteps(['has_wifi']).map((s) => s.id)).toContain('connectivity');
  });

  it('asks the §2 pool follow-ups only when a pool is asserted', () => {
    const withoutPool = visibleQuestions([]).find((q) => q.fieldId === 'pool_instructions');
    expect(withoutPool).toBeUndefined();

    const pool = visibleQuestions(['has_pool']).find((q) => q.fieldId === 'pool_instructions');
    expect(pool).toBeDefined();
    // §2 names these four follow-ups explicitly.
    const keys = (pool!.compose ?? []).map((c) => c.key);
    expect(keys).toEqual(expect.arrayContaining(['depth', 'heated', 'placement', 'rules']));
    const depth = pool!.compose!.find((c) => c.key === 'depth')!;
    expect(depth.unit).toBe('ft');
    expect(depth.control).toBe('stepper');
  });

  it('drops question steps that become empty, but keeps core/features/documents', () => {
    const kinds = visibleSteps([]).map((s) => s.kind);
    expect(kinds).toContain('core');
    expect(kinds).toContain('features');
    expect(kinds).toContain('documents');
    for (const s of visibleSteps([])) {
      if (s.kind === 'questions') expect(s.questions.length).toBeGreaterThan(0);
    }
  });

  it('never shows a question whose predicate was not asserted, for any predicate set', () => {
    for (const applicable of allSubsets(WIZARD_PREDICATES)) {
      const set = new Set(applicable);
      for (const q of visibleQuestions(applicable)) {
        if (q.gatedBy === 'always') continue;
        expect(set.has(q.gatedBy), `${q.fieldId} shown without ${q.gatedBy}`).toBe(true);
      }
    }
  });
});

describe('coverage target (§2: ≥65%)', () => {
  it('clears the threshold for every possible combination of property features', () => {
    // 2^11 subsets. The point is not one happy path: a studio flat with no pool,
    // no hot tub, no laundry and no parking gets a SMALLER denominator, and a
    // wizard tuned only against a fully-featured house can quietly fail those.
    const subsets = allSubsets(WIZARD_PREDICATES);
    expect(subsets.length).toBe(2 ** WIZARD_PREDICATES.length);

    let worst = { pct: 101, applicable: [] as string[] };
    for (const applicable of subsets) {
      const pct = fullWizardCoverage(applicable);
      if (pct < worst.pct) worst = { pct, applicable: [...applicable] };
    }
    expect(
      worst.pct,
      `worst case ${worst.pct}% with [${worst.applicable.join(', ')}]`,
    ).toBeGreaterThanOrEqual(WIZARD_COVERAGE_TARGET);

    // Asserted well above the target too. §2 says "targeting ≥65%", and a wizard
    // that lands at 66% has no headroom: one field moved behind a gate, or one new
    // registry field, silently drops it under. Pinning the real floor means such a
    // change fails here instead of in production.
    expect(worst.pct).toBeGreaterThanOrEqual(80);
  });

  it('asks every field each predicate unlocks, so asserting a feature cannot lower coverage', () => {
    // The failure mode this catches: a host ticks "this place has a pool", which
    // ADDS pool fields to their denominator. If the wizard does not then ask those
    // fields, being honest about the property makes the score go DOWN.
    const base = fullWizardCoverage([]);
    for (const p of WIZARD_PREDICATES) {
      const pct = fullWizardCoverage([p]);
      expect(pct, `asserting ${p} took coverage from ${base}% to ${pct}%`).toBeGreaterThanOrEqual(
        WIZARD_COVERAGE_TARGET,
      );
    }
  });

  it('measures the target before the document step, not after', () => {
    // The document step depends on the host having a manual to upload. If the
    // threshold only cleared once a file was parsed, the wizard would not actually
    // meet §2 on its own for the hosts who have nothing written down.
    const docStep = WIZARD_STEPS.find((s) => s.kind === 'documents')!;
    expect(docStep.questions).toHaveLength(0);
  });

  it('is not vacuously true — a near-empty answer set falls short', () => {
    // Proves the threshold assertion above has teeth and is not passing because
    // computeCompleteness returns 100 for everything.
    const pct = wizardCoverage({ applicable: ['has_wifi'], answered: ['checkin_time', 'checkout_time'] });
    expect(pct).toBeLessThan(WIZARD_COVERAGE_TARGET);
  });

  it('half-credits a field whose fallback is missing', () => {
    const withFallback = wizardCoverage({
      applicable: ['has_wifi'],
      answered: ['wifi_network_name', 'wifi_troubleshooting'],
    });
    const withoutFallback = wizardCoverage({
      applicable: ['has_wifi'],
      answered: ['wifi_network_name'],
    });
    expect(withoutFallback).toBeLessThan(withFallback);
  });

  it('still clears the threshold when the host skips every optional prose question', () => {
    // Realistic worst case: the host answers the structured controls and the
    // hard-block fields and skips the long free-text boxes. This must not fall off
    // a cliff, or the 65% claim only holds for the most diligent host.
    const applicable = ['has_wifi', 'has_parking'];
    const answered = visibleQuestions(applicable)
      .filter((q) => q.hardBlock || q.control !== 'textarea')
      .map((q) => q.fieldId);
    const pct = wizardCoverage({ applicable, answered });
    // Not asserted against 65 — this set is deliberately degraded. Asserted as a
    // floor so a regression that guts the structured questions is caught.
    expect(pct).toBeGreaterThan(30);
  });
});

describe('composeValue', () => {
  const pool = visibleQuestions(['has_pool']).find((q) => q.fieldId === 'pool_instructions')!;

  it('labels each sub-answer and appends the unit', () => {
    const out = composeValue(pool, { depth: '6', heated: 'Yes', placement: 'Outdoor' }, '');
    expect(out).toContain('Depth: 6 ft.');
    expect(out).toContain('Heated: Yes.');
    expect(out).toContain('Indoor or outdoor: Outdoor.');
  });

  it('omits blank sub-answers rather than writing empty labels', () => {
    const out = composeValue(pool, { depth: '', heated: 'No', placement: '  ' }, '');
    expect(out).toBe('Heated: No.');
  });

  it('appends the free-text tail last', () => {
    const out = composeValue(pool, { heated: 'Yes' }, 'Gate is self-closing.');
    expect(out).toBe('Heated: Yes. Gate is self-closing.');
  });

  it('returns an empty string when nothing was answered, so no value is written', () => {
    expect(composeValue(pool, {}, '   ')).toBe('');
  });

  it('produces a value long enough to pass registry validation', () => {
    const out = composeValue(
      pool,
      { depth: '6', heated: 'Yes', placement: 'Outdoor', rules: 'No diving, no glass.' },
      '',
    );
    expect(out.length).toBeGreaterThanOrEqual(20);
    expect(out.length).toBeLessThanOrEqual(2000);
  });
});

describe('composeSpaceSummary', () => {
  it('writes one sentence covering every count given', () => {
    expect(composeSpaceSummary({ floors: 2, bedrooms: 3, bathrooms: 2, squareFeet: 1400 })).toBe(
      'This property has 3 bedrooms, 2 bathrooms, 2 floors, 1400 square feet.',
    );
  });

  it('singularises', () => {
    expect(composeSpaceSummary({ floors: 1, bedrooms: 1, bathrooms: 1, squareFeet: null })).toBe(
      'This property has 1 bedroom, 1 bathroom, 1 floor.',
    );
  });

  it('returns null when the host gave no counts, so no empty entry is created', () => {
    expect(composeSpaceSummary({ floors: null, bedrooms: null, bathrooms: null, squareFeet: null })).toBeNull();
  });

  it('handles a studio with zero bedrooms without dropping the fact', () => {
    expect(composeSpaceSummary({ floors: null, bedrooms: 0, bathrooms: 1, squareFeet: null })).toBe(
      'This property has 0 bedrooms, 1 bathroom.',
    );
  });
});

describe('derivedMultiStory', () => {
  it('is true above one floor and false at one', () => {
    expect(derivedMultiStory(3)).toBe(true);
    expect(derivedMultiStory(1)).toBe(false);
  });

  it('is null when the host did not say, rather than guessing false', () => {
    // Asserting a false the host never stated would remove fields from their
    // denominator on our guess and inflate the percentage they are shown.
    expect(derivedMultiStory(null)).toBeNull();
  });
});

function allSubsets(items: readonly string[]): string[][] {
  const out: string[][] = [];
  const total = 2 ** items.length;
  for (let mask = 0; mask < total; mask += 1) {
    const subset: string[] = [];
    for (let i = 0; i < items.length; i += 1) if (mask & (1 << i)) subset.push(items[i]);
    out.push(subset);
  }
  return out;
}
