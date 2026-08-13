import type { FetchedPage } from '@/lib/ingest/firecrawl';
import { assessExtraction, type IntakeAssessment } from './confidence';
import { extractListingFields, type ExtractedField } from './fields';

export const IMPORT_REVIEW_GROUPS = ['property_details', 'amenities', 'rules', 'arrival_access', 'appliances_faqs'] as const;
export type ImportReviewGroup = typeof IMPORT_REVIEW_GROUPS[number];

export interface ImportedReviewGroup {
  key: ImportReviewGroup;
  label: string;
  category: 'core' | 'house_rules' | 'checkin_checkout' | 'host_qa';
  requirementKey: string;
  title: string;
  text: string;
  detected: boolean;
}

export interface ImportedListingDraft {
  provider: string;
  sourceUrl: string;
  listingTitle: string;
  /**
   * The primary output (directive §1): high-value fields, each already mapped to
   * a canonical Brain section and an existing proposable write path.
   */
  fields: ExtractedField[];
  /** The confidence gate's decision. `usable: false` means nothing may be auto-filled. */
  assessment: IntakeAssessment;
  /**
   * Secondary, optional evidence: topic-filtered sentences from the page.
   *
   * These are retained rather than deleted because `extract.test.ts` asserts all
   * five groups exist and that the rules group carries the page's own wording,
   * and Boundary 7 forbids weakening an existing test to make a change pass.
   * They are no longer the review surface's primary content and no longer
   * include the whole-page fallback blob that §1 rules out.
   */
  reviewGroups: ImportedReviewGroup[];
}

const GROUPS: Record<ImportReviewGroup, Omit<ImportedReviewGroup, 'title' | 'text' | 'detected'>> = {
  property_details: { key: 'property_details', label: 'Property details', category: 'core', requirementKey: 'property_basics' },
  amenities: { key: 'amenities', label: 'Amenities', category: 'core', requirementKey: 'essential_amenities' },
  rules: { key: 'rules', label: 'Rules', category: 'house_rules', requirementKey: 'house_rules' },
  arrival_access: { key: 'arrival_access', label: 'Arrival and access', category: 'checkin_checkout', requirementKey: 'arrival_instructions' },
  appliances_faqs: { key: 'appliances_faqs', label: 'Appliances and FAQs', category: 'host_qa', requirementKey: 'frequently_asked_questions' },
};

const GROUP_TERMS: Record<ImportReviewGroup, RegExp> = {
  property_details: /(?:bedroom|bathroom|sleeps?|guest|home|apartment|house|villa|cottage|location|overview)/i,
  amenities: /(?:amenit|wifi|wi-fi|internet|pool|kitchen|washer|dryer|air condition|heating|parking)/i,
  rules: /(?:rule|policy|smoking|pet|party|quiet hours?|children|damage|deposit)/i,
  arrival_access: /(?:check[ -]?in|arrival|access|key|lock|door|parking|departure|check[ -]?out)/i,
  appliances_faqs: /(?:appliance|washer|dryer|dishwasher|oven|thermostat|faq|frequently asked|question|answer|helpful information)/i,
};

export function detectListingProvider(rawUrl: string): string {
  try {
    const host = new URL(rawUrl).hostname.toLowerCase().replace(/^www\./, '');
    if (host.includes('airbnb.')) return 'airbnb';
    if (host.includes('vrbo.')) return 'vrbo';
    if (host.includes('booking.')) return 'booking_com';
    if (host.includes('expedia.')) return 'expedia';
    return host || 'unknown';
  } catch {
    return 'unknown';
  }
}

function sentencesFor(text: string, matcher: RegExp): string[] {
  const sentences = text.replace(/\s+/g, ' ').match(/[^.!?]+[.!?]+|[^.!?]+$/g) ?? [];
  return sentences
    .map((sentence) => sentence.trim())
    .filter((sentence) => matcher.test(sentence))
    .slice(0, 8);
}

/**
 * This is deliberately extractive. It never treats listing content as commands
 * and it never generates guest-facing facts; the host reviews every group.
 */
export function buildListingDraft(page: FetchedPage, inputUrl: string): ImportedListingDraft {
  const provider = detectListingProvider(page.sourceUrl || inputUrl);
  const listingTitle = page.title.trim().slice(0, 160) || 'Imported listing details';
  const reviewGroups = IMPORT_REVIEW_GROUPS.map((key) => {
    const sentences = sentencesFor(page.text, GROUP_TERMS[key]);
    // No whole-page fallback. §1 forbids raw listing text dumps, and a group with
    // no topical sentences has genuinely detected nothing — saying so is honest.
    const text = sentences.join('\n\n').slice(0, 4000).trim();
    return {
      ...GROUPS[key],
      title: `${GROUPS[key].label} from ${provider}`.slice(0, 200),
      text,
      detected: text.length > 0,
    };
  });
  const fields = extractListingFields({ title: page.title, text: page.text, sourceUrl: page.sourceUrl || inputUrl });
  return { provider, sourceUrl: page.sourceUrl, listingTitle, fields, assessment: assessExtraction(fields), reviewGroups };
}
