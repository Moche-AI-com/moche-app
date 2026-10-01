import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

// Trigger.dev bundles everything under trigger/ and runs it outside Next.js,
// where `server-only` throws and production secrets are absent. Tasks must stay
// clocks that call app routes, so they may only import npm packages and other
// files inside trigger/.

const ROOT = path.resolve(process.cwd(), 'trigger');
const IMPORT_RE = /(?:import|export)\s[^'"]*?from\s*['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)|^\s*import\s*['"]([^'"]+)['"]/gm;

function taskFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return taskFiles(full);
    return /\.(ts|tsx|js|mjs)$/.test(name) && !/\.(test|spec)\./.test(name) ? [full] : [];
  });
}

describe('Trigger.dev tasks stay clock-only', () => {
  const files = taskFiles(ROOT);

  it('finds the task files', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it.each(files.map((f) => [path.relative(ROOT, f), f]))('%s imports no app code', (_name, file) => {
    const src = readFileSync(file, 'utf8');
    for (const match of src.matchAll(IMPORT_RE)) {
      const spec = (match[1] ?? match[2] ?? match[3]) as string;
      expect(spec.startsWith('@/'), `${spec} is app code`).toBe(false);
      expect(spec === 'server-only', 'server-only throws outside Next.js').toBe(false);
      if (spec.startsWith('.')) {
        const resolved = path.resolve(path.dirname(file), spec);
        expect(resolved.startsWith(ROOT + path.sep), `${spec} reaches outside trigger/`).toBe(true);
      }
    }
  });
});
