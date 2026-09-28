import { COMPLETENESS_SHIP_THRESHOLD, type Completeness } from './completeness';

/** Display-only summary. Never recalculate the registry percentage or replace the publish action's gates. */
export function propertyWorkspaceSummary(
  completeness: Pick<Completeness, 'pct' | 'canPublish' | 'hardBlocksOutstanding'>,
) {
  const missing = completeness.hardBlocksOutstanding.length;
  const nextSteps: string[] = [];
  if (completeness.pct < COMPLETENESS_SHIP_THRESHOLD) {
    nextSteps.push(`Reach ${COMPLETENESS_SHIP_THRESHOLD}% guest-ready`);
  }
  if (missing > 0) {
    nextSteps.push(`Answer ${missing} must-have ${missing === 1 ? 'question' : 'questions'}`);
  }
  return {
    pct: completeness.pct,
    checklistComplete: completeness.canPublish,
    checklistDetail: completeness.canPublish
      ? 'Brain checklist complete'
      : nextSteps.join(' and ') || 'Review the Brain checklist',
  };
}
