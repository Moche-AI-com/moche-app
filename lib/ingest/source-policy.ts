import type { Database } from '@/lib/database.types';
import type { StandardizeResult } from './standardize';

/** Category comes only from the validated host form, never from fetched text. */
export function knowledgeSourcePolicy(category: Database['public']['Enums']['brain_category']) {
  if (category === 'local_recommendations' || category === 'transportation') {
    return { kind: 'local_source', profile: 'local_source_v1' } as const;
  }
  return { kind: 'manual_site', profile: 'manual_site_v1' } as const;
}

export function knowledgeReviewMessage(result: StandardizeResult): string {
  if (result.truncated) {
    return 'The source was saved, but this review draft includes only the first 20,000 characters. Split long instructions into smaller entries before approving.';
  }
  return result.standardized
    ? 'Your organized details are ready for you to review.'
    : 'Your original details are ready for review without AI cleanup. Check the operating steps and warnings before approving.';
}
