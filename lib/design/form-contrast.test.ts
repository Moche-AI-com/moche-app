import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

// Guard the mobile form-control contract in the source stylesheet. This catches
// the easy regression where a raw modal input skips the class-level .input CSS
// and falls back to a light mobile UA colour on a dark surface.
const css = readFileSync(path.join(process.cwd(), 'app/globals.css'), 'utf8');

describe('mobile form-control contrast contract', () => {
  it('declares a matching UA color scheme for both app themes', () => {
    expect(css).toMatch(/\[data-theme='light'\],\s*:root\s*\{[^}]*color-scheme:\s*light;/s);
    expect(css).toMatch(/\[data-theme='dark'\]\s*\{[^}]*color-scheme:\s*dark;/s);
  });

  it('sets text fill, caret, and background at the baseline element level', () => {
    expect(css).toMatch(/input,\s*textarea,\s*select\s*\{[^}]*-webkit-text-fill-color:\s*var\(--text\);/s);
    expect(css).toMatch(/input,\s*textarea,\s*select\s*\{[^}]*caret-color:\s*var\(--teal\);/s);
    expect(css).toMatch(/input:not\(\[type='checkbox'\]\)[\s\S]*background-color:\s*var\(--bg-2\);/);
  });

  it('keeps placeholder text and autofill readable in both themes', () => {
    expect(css).toMatch(/::placeholder\s*\{\s*color:\s*var\(--text-faint\);\s*opacity:\s*1;/s);
    expect(css).toMatch(/input:-webkit-autofill\s*\{[^}]*-webkit-text-fill-color:\s*var\(--text\);/s);
    expect(css).toMatch(/input:-webkit-autofill\s*\{[^}]*box-shadow:\s*0 0 0 1000px var\(--bg-2\) inset;/s);
  });
});
