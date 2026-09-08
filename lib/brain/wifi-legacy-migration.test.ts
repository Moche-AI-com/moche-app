import { describe, expect, it } from 'vitest';
import { extractCandidates } from './legacy-migration';

describe('conservative Wi-Fi note migration', () => {
  it('proposes host location and connection instructions, never the old credential', () => {
    const result = extractCandidates([
      { id: 'location', title: 'Wi-Fi password location', body: 'On the welcome card in the study.' },
      { id: 'steps', title: 'Wi-Fi connection instructions', body: 'Choose Guest and use the password on that card.' },
      { id: 'secret', title: 'Wi-Fi password', body: 'Secret987!' },
    ]);
    expect(result.find((r) => r.fieldId === 'wifi_password_location')).toMatchObject({
      value: 'On the welcome card in the study.', sourceItemId: 'location',
      fieldPath: 'brain_value.wifi_password_location',
    });
    expect(result.find((r) => r.fieldId === 'wifi_connection_instructions')?.sourceItemId).toBe('steps');
    expect(JSON.stringify(result)).not.toContain('Secret987!');
    expect(result.every((r) => r.confidence < 1)).toBe(true);
  });
  it('does not pick one of conflicting locations', () => {
    const result = extractCandidates([
      { id: 'a', title: 'Wi-Fi password location', body: 'On the study card.' },
      { id: 'b', title: 'Wi-Fi password location', body: 'Inside the desk drawer.' },
    ]);
    expect(result.find((r) => r.fieldId === 'wifi_password_location')).toBeUndefined();
  });
});
