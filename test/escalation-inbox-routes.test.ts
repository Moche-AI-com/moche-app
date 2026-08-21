import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const root = new URL('../', import.meta.url);
const read = (path: string) => readFileSync(new URL(path, root), 'utf8');

describe('escalation inbox route capability gates', () => {
  it('filters the portfolio view to properties that can receive escalations', () => {
    const page = read('app/dashboard/escalations/page.tsx');
    expect(page).toContain('getPropertyAccess');
    expect(page).toContain('access.can.receiveEscalations');
  });

  it('redirects the legacy property escalations route into Guest Chat', () => {
    const page = read('app/dashboard/properties/[id]/escalations/page.tsx');
    expect(page).toContain('redirect(`/dashboard/properties/${propertyId}/guest-chat`)');
  });
});
