import { describe, expect, it } from 'vitest';
import { hasExactModelManualEvidence } from '@/app/dashboard/properties/[id]/appliances/discover-manual-action';

describe('exact-model manual evidence', () => {
  const good = { model: 'WFW5605MW', title: 'WFW5605MW Washer User Guide',
    text: 'WFW5605MW washer operation. Press Start after selecting a cycle.',
    url: 'https://manufacturer.example/manuals/WFW5605MW' };
  it('accepts a specific model manual candidate', () => { expect(hasExactModelManualEvidence(good)).toBe(true); });
  it('rejects a support homepage or unrelated model', () => {
    expect(hasExactModelManualEvidence({ ...good, title: 'Support', text: 'General help', url: 'https://manufacturer.example/support' })).toBe(false);
    expect(hasExactModelManualEvidence({ ...good, model: 'WFW9999ZZ' })).toBe(false);
    expect(hasExactModelManualEvidence({ ...good, url: 'http://manufacturer.example/manuals/WFW5605MW' })).toBe(false);
  });
});
