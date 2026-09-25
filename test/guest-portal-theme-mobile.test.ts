import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const css = readFileSync(join(process.cwd(), 'app/g/[slug]/portal-ux.css'), 'utf8');
const layout = readFileSync(join(process.cwd(), 'app/g/[slug]/layout.tsx'), 'utf8');

describe('guest portal theme and mobile dialog guardrails', () => {
  it('loads overrides for all portal pages without changing host dashboard styles', () => {
    expect(layout).toContain("import './portal-ux.css'");
    expect(css).toContain('.gp-v2 input');
    expect(css).toContain('var(--gp-text)');
    expect(css).toContain('-webkit-text-fill-color: var(--gp-text)');
    expect(css).toContain('caret-color: var(--gp-primary)');
  });
  it('keeps the modal centered and scrollable within a dynamic mobile viewport', () => {
    expect(css).toContain('@media (max-width: 519px)');
    expect(css).toContain('.gp-v2 .gp-modal-backdrop');
    expect(css).toContain('align-items: center');
    expect(css).toContain('overflow-y: auto');
    expect(css).toContain('100dvh');
    expect(css).toContain('.gp-v2 .gp-modal-body { min-height: 0;');
  });
});
