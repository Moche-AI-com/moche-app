// Structural guards for the rebuilt Property Brain page.
//
// These assert the §9 non-goals of the Brain rebuild directly against the source, in the
// same style as test/dashboard-cards.test.ts and test/escalation-inbox-routes.test.ts.
// They exist because each non-goal is a thing that was true, got removed, and would be
// easy to reintroduce by accident — a second editing surface, a second completeness
// number, a "Next questions" list, a Local Recs link back in the sidebar.
//
// 2026-08-28 amendment: the Coverage Map is no longer hover-only — the owner directive
// made it spin and navigate. The guard below changed accordingly: what is still
// forbidden is the graph becoming an EDITING surface (no save/delete actions, no
// links, no router). Navigation via the shared goto event is now required instead.
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

// The global stylesheet, comments stripped for the same reason as above: the Brain
// section header records that the retired classes were deleted, and that prose must
// not trip the guard that keeps them deleted.
const globals = readFileSync(join(process.cwd(), 'app/globals.css'), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '');

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

  it('puts the Coverage Map above the knowledge manager', () => {
    // 2026-08-31 layout pass: the editor+sidebar shell is gone; the page is one
    // column, so the invariant that matters is that the orientation map still
    // precedes the doing surface.
    const mapAt = page.indexOf('<CoverageMap');
    const managerAt = page.indexOf('<BrainManager');
    expect(mapAt).toBeGreaterThan(-1);
    expect(managerAt).toBeGreaterThan(-1);
    expect(mapAt).toBeLessThan(managerAt);
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

  it('links to the Spaces & features surface instead of embedding the panel', () => {
    // Retired 2026-08-31 (redesign consolidation): the Features panel lives on
    // /brain/spaces now. What must never come back is a second embedded instance here —
    // two competing feature lists on one page is worse than either alone.
    expect(page).not.toContain('<FeaturesPanel');
    expect(page).toContain('/brain/spaces');
  });

  it('links to the unified Add-knowledge page instead of a sidebar import widget', () => {
    // Retired 2026-08-31 (redesign consolidation): /brain/add is the single intake for
    // writing, files, URLs, and paste, calling the same ingest routes directly.
    expect(page).not.toContain('IngestPanel');
    expect(page).toContain('/brain/add');
  });

  it('retires the sidebar shell: one column, support cards in the grid', () => {
    // 2026-08-31 layout pass: the editor+sidebar split is retired. The page never
    // references the old shell classes, and the support cards live in the scoped
    // grid from the layout module.
    expect(page).not.toContain('brain-shell');
    expect(page).not.toContain('brain-sidebar');
    expect(page).toContain('brain-layout.module.css');
  });

  it('keeps the retired shell rules out of the global stylesheet', () => {
    // Deleted from app/globals.css in the same cleanup: the two-column shell and
    // the legacy health-hero row (verified unreferenced repo-wide before removal).
    // The page's layout primitives live in brain-layout.module.css instead.
    expect(globals).not.toContain('.brain-shell');
    expect(globals).not.toContain('.brain-sidebar');
    expect(globals).not.toContain('.brain-health-hero-row');
  });
});

describe('Coverage Map navigates but never edits', () => {
  it('registers hover handlers for the read-out', () => {
    expect(coverageMap).toContain('onMouseEnter');
    expect(coverageMap).toContain('onMouseLeave');
  });

  it('navigates via the shared goto event and nothing else', () => {
    expect(coverageMap).toContain('BRAIN_GOTO_EVENT');
    // Navigation is the only side effect permitted: no save/delete action may be
    // reachable from the graph — those live behind the manager's forms, with their
    // guardrails. No links, no router: the map never leaves the page.
    expect(coverageMap).not.toContain('saveBrainItemAction');
    expect(coverageMap).not.toContain('deleteBrainItemAction');
    expect(coverageMap).not.toContain('useRouter');
    expect(coverageMap).not.toContain('next/link');
    expect(coverageMap).not.toContain('href');
  });

  it('keeps hubs keyboard-accessible', () => {
    expect(coverageMap).toContain('role="button"');
    expect(coverageMap).toContain('tabIndex={0}');
    expect(coverageMap).toContain('onKeyDown');
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

  it('files knowledge under features as well as sections', () => {
    expect(manager).toContain('featureSectionId');
    expect(manager).toContain('Spaces & features');
  });
});
