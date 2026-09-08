import { describe, expect, it } from 'vitest';
import { REGISTRY_FIELDS, computeCompleteness } from './completeness';
import { registryProposableField, normalizeProposedValue } from './proposals';

describe('Wi-Fi onboarding collects guidance, not credentials', () => {
  it('keeps legacy password rows secret but never asks for or scores a password', () => {
    const legacy = REGISTRY_FIELDS.find((f) => f.field_id === 'wifi_password')!;
    expect(legacy.sensitivity_tier).toBe('stay_scoped_secret');
    expect(legacy.type).toBe('secret');
    expect(legacy.gap_weight).toBe(0);
    expect(legacy.hard_block).toBe(false);
    expect(computeCompleteness({ applicable: ['has_wifi'] }).gaps.map((g) => g.fieldId)).not.toContain('wifi_password');
  });
  it('asks where guests can find the password and how to connect', () => {
    const fields = REGISTRY_FIELDS.filter((f) => ['wifi_password_location', 'wifi_connection_instructions'].includes(f.field_id));
    expect(fields).toHaveLength(2);
    for (const f of fields) {
      expect(f.type).toBe('text');
      expect(f.sensitivity_tier).toBe('public_guest');
      expect(f.interview_prompt).toMatch(/never|do not/i);
      expect(registryProposableField(f.field_id)?.kind).toBe('brain_value');
    }
  });
  it('validates location and instructions again when a host approves an edited proposal', () => {
    const location = registryProposableField('wifi_password_location')!;
    const instructions = registryProposableField('wifi_connection_instructions')!;
    expect(normalizeProposedValue(location, 'Secret987!').ok).toBe(false);
    expect(normalizeProposedValue(instructions, 'Use password: Secret987!').ok).toBe(false);
    expect(normalizeProposedValue(location, 'On the welcome card in the study.').ok).toBe(true);
  });
  it('does not let an unlabelled password be approved as connection instructions', () => {
    expect(normalizeProposedValue(registryProposableField('wifi_connection_instructions')!, 'Secret987!').ok).toBe(false);
  });
});
