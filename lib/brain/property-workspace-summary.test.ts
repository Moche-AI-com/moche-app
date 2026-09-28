import { describe, expect, it } from 'vitest';
import { computeCompleteness, REGISTRY_FIELDS } from './completeness';
import { propertyWorkspaceSummary } from './property-workspace-summary';

const ids = REGISTRY_FIELDS.map((field) => field.field_id);
const applicable = [...new Set(REGISTRY_FIELDS.map((field) => field.applicability))];

describe('property workspace guest-ready summary', () => {
  it('uses the canonical score without rounding or a second formula', () => {
    const completeness = computeCompleteness({
      statuses: Object.fromEntries(ids.map((id) => [id, 'partial' as const])),
      applicable,
    });
    const summary = propertyWorkspaceSummary(completeness);
    expect(summary.pct).toBe(completeness.pct);
    expect(summary.checklistComplete).toBe(completeness.canPublish);
  });

  it('explains both blockers on an empty property', () => {
    const summary = propertyWorkspaceSummary(computeCompleteness());
    expect(summary.pct).toBe(0);
    expect(summary.checklistDetail).toMatch(/Reach .* guest-ready/);
    expect(summary.checklistDetail).toMatch(/must-have/);
  });

  it('does not claim a high score alone completes the checklist', () => {
    const statuses = Object.fromEntries(ids.map((id) => [id, 'satisfied' as const]));
    delete statuses.nearest_grocery;
    const completeness = computeCompleteness({ statuses, applicable });
    const summary = propertyWorkspaceSummary(completeness);
    expect(summary.pct).toBe(completeness.pct);
    expect(summary.checklistComplete).toBe(false);
    expect(summary.checklistDetail).toContain('1 must-have question');
  });

  it('reports a completed checklist only when the canonical gate clears', () => {
    const completeness = computeCompleteness({
      statuses: Object.fromEntries(ids.map((id) => [id, 'satisfied' as const])),
      applicable,
    });
    const summary = propertyWorkspaceSummary(completeness);
    expect(summary.pct).toBe(100);
    expect(summary.checklistComplete).toBe(true);
    expect(summary.checklistDetail).toBe('Brain checklist complete');
  });
});
