import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { AA_LARGE, AA_NON_TEXT, AA_NORMAL, contrastRatio, flatten, ratio } from './contrast';

/**
 * Palette contrast audit (backlog P6-03).
 *
 * Reads the real tokens out of app/globals.css rather than duplicating hex values
 * here, so editing the palette either keeps it accessible or fails this test. The
 * chat surface is included explicitly because that is the surface P6-03 names, but
 * the whole dashboard palette is covered since chat inherits it.
 */

const css = readFileSync(path.join(process.cwd(), 'app/globals.css'), 'utf8');

function tokens(selector: string): Record<string, string> {
  // Match the selector only where it opens a block. The selector text also appears
  // inside the file's header comment, and indexOf would happily return that.
  const needle = `${selector} {`;
  const start = css.indexOf(needle);
  if (start < 0) throw new Error(`Selector not found in globals.css: ${selector}`);
  const open = css.indexOf('{', start + selector.length);
  const close = css.indexOf('\n}', open);
  const block = css.slice(open + 1, close);
  const out: Record<string, string> = {};
  for (const line of block.split('\n')) {
    const m = line.match(/^\s*(--[a-z0-9-]+)\s*:\s*([^;]+);/i);
    if (m && !m[2].includes('gradient')) out[m[1]] = m[2].trim();
  }
  return out;
}

const light = tokens("[data-theme='light'], :root");
const dark = tokens("[data-theme='dark']");

const THEMES: Array<[string, Record<string, string>]> = [
  ['light', light],
  ['dark', dark],
];

describe('palette tokens parse', () => {
  it('finds both theme blocks with the tokens the audit needs', () => {
    for (const [name, t] of THEMES) {
      for (const key of ['--bg', '--surface', '--surface-2', '--text', '--text-muted', '--text-faint', '--teal', '--iris', '--coral', '--border', '--border-strong']) {
        expect(t[key], `${name} ${key}`).toBeTruthy();
      }
    }
  });
});

describe.each(THEMES)('%s theme: body text meets WCAG AA', (name, t) => {
  const backdrops = ['--bg', '--bg-2', '--surface', '--surface-2'];

  it.each(backdrops)(`--text on %s`, (bg) => {
    expect(ratio(t['--text'], t[bg])).toBeGreaterThanOrEqual(AA_NORMAL);
  });

  it.each(backdrops)(`--text-muted on %s`, (bg) => {
    expect(ratio(t['--text-muted'], t[bg])).toBeGreaterThanOrEqual(AA_NORMAL);
  });

  // --text-faint is used for timestamps and helper lines. Those are still text a
  // host has to read, so they are held to AA normal as well, not the large-text
  // exemption.
  it.each(backdrops)(`--text-faint on %s`, (bg) => {
    expect(ratio(t['--text-faint'], t[bg])).toBeGreaterThanOrEqual(AA_NORMAL);
  });
});

describe.each(THEMES)('%s theme: accent text meets WCAG AA', (name, t) => {
  // Accents are used for links, badge text, and the chat sender label.
  const accents = ['--teal', '--iris', '--coral'];
  const backdrops = ['--bg', '--surface', '--surface-2'];

  it.each(accents.flatMap((a) => backdrops.map((b) => [a, b] as const)))(
    '%s on %s',
    (accent, bg) => {
      expect(ratio(t[accent], t[bg])).toBeGreaterThanOrEqual(AA_NORMAL);
    },
  );
});

describe.each(THEMES)('%s theme: buttons and focus ring', (name, t) => {
  it('primary button label reads against its own fill', () => {
    expect(ratio(t['--btn-primary-fg'], t['--btn-primary-bg'])).toBeGreaterThanOrEqual(AA_NORMAL);
    expect(ratio(t['--btn-primary-fg'], t['--btn-primary-bg-hover'])).toBeGreaterThanOrEqual(AA_NORMAL);
  });

  it('coral button label reads against the coral fill', () => {
    expect(ratio(t['--btn-coral-fg'], t['--coral'])).toBeGreaterThanOrEqual(AA_NORMAL);
  });

  it('the focus ring is visible against every surface it can land on (1.4.11)', () => {
    for (const bg of ['--bg', '--surface', '--surface-2']) {
      expect(ratio(t['--teal'], t[bg]), `${name} ring on ${bg}`).toBeGreaterThanOrEqual(AA_NON_TEXT);
    }
  });
});

describe.each(THEMES)('%s theme: structural boundaries (WCAG 1.4.11)', (name, t) => {
  it('the strong border is discernible against the page and card surfaces', () => {
    for (const bg of ['--bg', '--surface']) {
      const flat = flatten(t['--border-strong'], t[bg]);
      expect(contrastRatio(flat, t[bg]), `${name} --border-strong on ${bg}`).toBeGreaterThanOrEqual(1.3);
    }
  });

  it('a card surface is distinguishable from the page behind it', () => {
    expect(contrastRatio(t['--surface'], t['--bg'])).toBeGreaterThanOrEqual(1.05);
  });
});

describe('chat surfaces specifically (P6-03)', () => {
  // The chat transcript renders host and AI turns on --surface / --surface-2 with
  // --text for the body and --text-faint for the timestamp; the sender label uses
  // --teal. All three are asserted above per theme, so this test pins the pairing
  // that is easiest to break: a message bubble on the bubble behind it.
  it.each(THEMES)('%s: adjacent bubble surfaces are distinguishable', (name, t) => {
    expect(contrastRatio(t['--surface-2'], t['--surface'])).toBeGreaterThanOrEqual(1.03);
  });

  it.each(THEMES)('%s: the large display heading clears AA large at minimum', (name, t) => {
    expect(ratio(t['--text'], t['--surface'])).toBeGreaterThanOrEqual(AA_LARGE);
  });
});
