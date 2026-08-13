// The listing-intake confidence gate (directive §1).
//
// THE FAILURE THIS REPLACES
// The previous pipeline always succeeded. A blocked page, a cookie wall, or a
// login redirect still produced five "review groups", created a draft property
// named after whatever the <title> happened to be, and asked the host to review
// content that contained no property facts at all. The host's only signal that
// nothing had been learned was that the boxes looked odd.
//
// THE RULE
// A link is usable only when the extractor produced fields that actually
// identify a property. Volume is not evidence: fifteen weak amenity matches off
// a marketing page is a worse import than one confident check-in time. So the
// gate has two independent conditions and requires both — a weighted score
// above threshold AND at least one anchor field (what/where the property is).
//
// When the gate fails, NOTHING is written: no property row, no Brain entry, no
// proposal. The host is told plainly and offered the three manual paths.

import type { ExtractedField } from './fields';

/**
 * A link must clear this to auto-fill anything. Set from the shape of the
 * scoring function rather than tuned against a corpus: a page yielding only the
 * cheap amenity signals lands near 0.2, a page with space counts plus a location
 * plus one time lands near 0.6.
 */
export const LISTING_CONFIDENCE_THRESHOLD = 0.4;

/**
 * Fields that answer "what is this property" or "where is it". Without at least
 * one of these, whatever else matched is describing something that may not even
 * be a rental listing.
 */
const ANCHOR_KEYS = new Set(['space_summary', 'location_city', 'max_occupancy', 'checkin_time', 'checkout_time']);

/** Anchors are worth more than corroborating detail, and detail saturates. */
const ANCHOR_WEIGHT = 1;
const DETAIL_WEIGHT = 0.35;
const SATURATION = 4.5;

export type IntakeVerdict = 'usable' | 'no_fields' | 'low_confidence';

export interface IntakeAssessment {
  verdict: IntakeVerdict;
  usable: boolean;
  /** 0..1, rounded to three places so it is stable in a stored artifact. */
  confidence: number;
  anchors: number;
  fieldCount: number;
  /** One sentence for the job's stage_detail / error_message. Never leaks page text. */
  reason: string;
}

export function assessExtraction(fields: ExtractedField[]): IntakeAssessment {
  const anchors = fields.filter((f) => ANCHOR_KEYS.has(f.key));
  const details = fields.filter((f) => !ANCHOR_KEYS.has(f.key));

  // Each field contributes its own confidence, scaled by whether it is an anchor
  // or corroboration, then the total is squashed so a long tail of weak matches
  // cannot substitute for a real anchor.
  const raw = anchors.reduce((sum, f) => sum + f.confidence * ANCHOR_WEIGHT, 0)
    + details.reduce((sum, f) => sum + f.confidence * DETAIL_WEIGHT, 0);
  const confidence = Math.round(Math.min(1, raw / SATURATION) * 1000) / 1000;

  if (fields.length === 0) {
    return { verdict: 'no_fields', usable: false, confidence: 0, anchors: 0, fieldCount: 0, reason: NO_FIELDS_REASON };
  }
  if (anchors.length === 0 || confidence < LISTING_CONFIDENCE_THRESHOLD) {
    return { verdict: 'low_confidence', usable: false, confidence, anchors: anchors.length, fieldCount: fields.length, reason: LOW_CONFIDENCE_REASON };
  }
  return {
    verdict: 'usable',
    usable: true,
    confidence,
    anchors: anchors.length,
    fieldCount: fields.length,
    reason: `Found ${fields.length} detail${fields.length === 1 ? '' : 's'} to review.`,
  };
}

/**
 * The exact sentence the directive specifies. Kept as a constant so the API,
 * the job record, and the two UI surfaces cannot drift into three paraphrases.
 */
export const LISTING_THIN_HEADLINE = "We couldn't pull enough useful property details from this link.";

const NO_FIELDS_REASON = `${LISTING_THIN_HEADLINE} Nothing readable came back from that page.`;
const LOW_CONFIDENCE_REASON = `${LISTING_THIN_HEADLINE} What came back was too vague to trust.`;

/** The three next steps offered whenever the gate fails. */
export const LISTING_THIN_NEXT_STEPS = [
  { key: 'manual', label: 'Continue manual setup', detail: 'Answer a short set of questions. Takes a few minutes and covers what guests ask most.' },
  { key: 'document', label: 'Upload a document', detail: 'A welcome book, house manual, or PDF. We read it and file the details for your review.' },
  { key: 'paste', label: 'Paste the details', detail: 'Copy the text from your listing and paste it in. Nothing is saved until you approve it.' },
] as const;

export type ListingThinNextStep = typeof LISTING_THIN_NEXT_STEPS[number]['key'];

/** `error_reason` written to property_import_jobs for a gated import. */
export function jobErrorReason(verdict: IntakeVerdict): string {
  return verdict === 'no_fields' ? 'no_usable_fields' : 'low_confidence';
}
