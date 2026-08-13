// Structural guards for the rebuilt Property Brain page.
//
// These assert the §9 non-goals of the Brain rebuild directly against the source, in the
// same style as test/dashboard-cards.test.ts and test/escalation-inbox-routes.test.ts.
// They exist because each non-goal is a thing that was true, got removed, and would be
// easy to reintroduce by accident — a click handler on a Coverage Map node, a second
// completeness number, a "Next questions" list, a Local Recs link back in the sidebar.
//
// They are deliberately structural rather than behavioural: the failure mode being
// guarded is "someone adds it back", which a render test would not catch unless it
// happened to assert the absence.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const BRAIN_DIR = join(process.cwd(), 'app/dashboard/properties/[id]/brain');

/**
 * Comments are stripped before matching. Each of these files documents what was removed
 * and why, and that prose names the very things being asserted absent — so matching the
 * raw source would fail on the explanation rather than on the code.
 */
function read(f: string): string {
  return readFileSync(join(BRAIN_DIR, f), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('//'))
    .join('\n');
}

const page = read('page.tsx');
const coverageMap = read('CoverageMap.tsx');
const completeness = read('CompletenessPanel.tsx');
const manager = read('BrainManager.tsx');

describe('Brain page structure', () => {
  it('renders exactly one knowledge manager and no card or graph surface', () => {
    expect(page).not.toContain('BrainCards');
    expect(page).not.toContain('BrainGraph');
    expect(page).toContain('<BrainManager');
    // One occurrence: a second manager would mean a filtered duplicate list again.
    expect(page.match(/<BrainManager/g)).toHaveLength(1);
  });

  it('has no card filter, so no item can be hidden from the list by a query param', () => {
    expect(page).not.toContain('searchParams.card');
    expect(page).not.toContain('card-filter-banner');
    expect(page).not.toContain('BRAIN_CARDS');
  });

  it('puts the Coverage Map above the two-column shell', () => {
    const mapAt = page.indexOf('<CoverageMap');
    const shellAt = page.indexOf('className="brain-shell"');
    expect(mapAt).toBeGreaterThan(-1);
    expect(shellAt).toBeGreaterThan(-1);
    expect(mapAt).toBeLessThan(shellAt);
  });

  it('does not link out to Local Recommendations from the Brain sidebar', () => {
    expect(page).not.toContain('Manage local recommendations');
    expect(page).not.toContain('/recommendations');
    expect(page).not.toContain('/nearby');
  });

  it('shows only one completeness number, the one the publish gate reads', () => {
    // health.categories drove a second sidebar card also labelled "Coverage".
    expect(page).not.toContain('health.categories');
    expect(page).not.toContain('computeCardHealth');
  });
});

describe('Coverage Map is hover-only', () => {
  it('registers hover handlers and no click, key, or navigation handler', () => {
    expect(coverageMap).toContain('onMouseEnter');
    expect(coverageMap).toContain('onMouseLeave');
    expect(coverageMap).not.toContain('onClick={() => setHover');
    // The only onClick permitted is the section expand/collapse toggle.
    const clicks = coverageMap.match(/onClick=/g) ?? [];
    expect(clicks).toHaveLength(1);
    expect(coverageMap).toContain('onClick={() => setOpen(');
  });

  it('gives nodes no interactive affordance', () => {
    expect(coverageMap).not.toContain('href');
    expect(coverageMap).not.toContain('tabIndex');
    expect(coverageMap).not.toContain('role="button"');
    expect(coverageMap).not.toContain('useRouter');
    expect(coverageMap).not.toContain('next/link');
  });

  it('is expanded on open so it is informative rather than a header', () => {
    expect(coverageMap).toContain('useState(true)');
  });

  it('surfaces not-applicable topics as N/A instead of dropping them silently', () => {
    expect(coverageMap).toContain('notApplicableDomains');
    expect(coverageMap).toContain('notApplicableCount');
    expect(coverageMap).toContain('N/A');
  });
});

describe('Brain consistency', () => {
  it('has no "Next questions" list anywhere on the page', () => {
    for (const src of [page, completeness, manager]) {
      expect(src).not.toContain('Next questions');
    }
  });

  it('offers Enhance Brain in its place', () => {
    expect(page).toContain('EnhanceBrainPanel');
  });

  it('groups the manager by canonical sections, not by the storage enum', () => {
    expect(manager).not.toContain('BRAIN_CATEGORY_LABELS');
    expect(manager).toContain('BrainManagerSection');
    expect(page).toContain('BRAIN_SECTIONS');
    expect(page).toContain('resolveSection');
  });

  it('edits knowledge in place rather than in one form at the top of the page', () => {
    expect(manager).toContain('brain-item is-editing');
    expect(manager).toContain('inline');
  });
});
