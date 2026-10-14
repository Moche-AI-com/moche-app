import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Next.js 16 passes `searchParams` to pages as a Promise. Reading it
// synchronously returns undefined, which silently resets the property
// dropdown to "All properties". Every page that renders the property
// filter must await searchParams before reading ?property=.
const PAGES = [
  'app/dashboard/page.tsx',
  'app/dashboard/escalations/page.tsx',
  'app/dashboard/service-requests/page.tsx',
  'app/dashboard/extras/page.tsx',
];

describe('property filter pages await searchParams', () => {
  for (const page of PAGES) {
    it(page, () => {
      const src = readFileSync(join(process.cwd(), page), 'utf8');
      expect(src).toMatch(/await searchParams/);
      expect(src).not.toMatch(/searchParams\??\.(property|view|status)/);
    });
  }
});
