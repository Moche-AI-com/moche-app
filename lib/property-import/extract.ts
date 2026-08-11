import type { FetchedPage } from '@/lib/ingest/firecrawl';

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
    const fallback = key === 'property_details' ? page.text.replace(/\s+/g, ' ').slice(0, 1400) : '';
    const text = (sentences.join('\n\n') || fallback).slice(0, 4000).trim();
    return {
      ...GROUPS[key],
      title: `${GROUPS[key].label} from ${provider}`.slice(0, 200),
      text,
      detected: text.length > 0,
    };
  });
  return { provider, sourceUrl: page.sourceUrl, listingTitle, reviewGroups };
}
