// Structured field extraction from a public listing page (directive §1).
//
// WHY THIS IS DELIBERATELY NOT AN LLM CALL
// Listing text is attacker-controlled input. `extract.ts` already documents the
// posture: listing content is never treated as commands. Handing a scraped page
// to a model and asking it to "fill in the fields" reverses that — the page gets
// to influence what lands in the Brain, and a Brain fact is what the guest
// concierge grounds its answers on. Every extractor below is a regex over the
// page's own words, so the worst case is a wrong value the host sees and
// rejects, not an instruction the pipeline follows.
//
// WHAT GETS EXTRACTED
// The registry already answers this. Fourteen fields in field_registry.json
// carry a non-null `scrape_hint` — the generator's own statement of "this is
// findable on a listing page". That set, plus the address columns on
// `properties`, is the extraction target. Nothing else is guessed at.
//
// EVERY TARGET IS AN EXISTING PROPOSABLE PATH
// `fieldPath` on each result resolves through `proposableField()`, so extraction
// cannot invent a write target. A field with no proposable path cannot be
// produced by this module at all.

import { brainSection, sectionLabel } from '@/lib/brain/taxonomy';
import { REGISTRY_FIELDS } from '@/lib/brain/completeness';

export interface ExtractedField {
  /** Stable key for the review UI and the accept API. */
  key: string;
  /** Host-facing label. */
  label: string;
  /** Canonical Brain section this belongs to (registry domain id). */
  section: string;
  sectionLabel: string;
  /** Proposable field path — always resolvable by proposableField(). */
  fieldPath: string;
  /** Normalized value, ready for normalizeProposedValue(). */
  value: string | number | { title: string; text: string; category: string; visibility: 'guest' };
  /** Human-readable rendering of `value` for the review list. */
  display: string;
  /** 0..1. How much the extractor trusts this specific value. */
  confidence: number;
  /** The sentence or fragment the value came from, capped. Provenance the host can check. */
  evidence: string;
}

/** Parsed numeric facts about the space, before they are composed into a field. */
export interface SpaceCounts {
  bedrooms: number | null;
  bathrooms: number | null;
  beds: number | null;
  guests: number | null;
  floors: number | null;
  squareFeet: number | null;
}

export interface ExtractedLocation {
  city: string | null;
  region: string | null;
  country: string | null;
}

const EVIDENCE_MAX = 180;

function flatten(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

/**
 * Evidence is confined to the sentence the value came from.
 *
 * A fixed character window around the match reads across sentence boundaries,
 * which had two bad consequences: quotes that pulled in unrelated adjacent text,
 * and - because listing text is attacker-controlled - a way for a sentence like
 * "IGNORE ALL PREVIOUS INSTRUCTIONS..." to ride along inside the provenance of a
 * legitimate field and be rendered back to the host. Sentence-bounding keeps the
 * quote honest and keeps unrelated page text out of the stored artifact.
 */
function evidenceFrom(text: string, match: string): string {
  const flat = flatten(text);
  const needle = match.toLowerCase().trim().replace(/[.\s]+$/, '').slice(0, 40);
  const at = needle.length > 0 ? flat.toLowerCase().indexOf(needle) : -1;
  if (at < 0) return flatten(match).replace(/^[^A-Za-z0-9]+/, '').slice(0, EVIDENCE_MAX);
  const sentenceStart = Math.max(
    flat.lastIndexOf('. ', at) + 2,
    flat.lastIndexOf('! ', at) + 2,
    flat.lastIndexOf('? ', at) + 2,
    0,
  );
  const afterMatch = at + needle.length;
  const period = flat.indexOf('. ', afterMatch);
  const sentenceEnd = period < 0 ? flat.length : period + 1;
  return flat.slice(sentenceStart, Math.min(sentenceEnd, sentenceStart + EVIDENCE_MAX)).trim();
}

function firstMatch(text: string, pattern: RegExp): RegExpMatchArray | null {
  const re = new RegExp(pattern.source, pattern.flags.includes('i') ? pattern.flags : `${pattern.flags}i`);
  return text.match(re);
}

// ---------------------------------------------------------------------------
// Numbers
// ---------------------------------------------------------------------------

const WORD_NUMBERS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, studio: 0,
};

function toCount(raw: string | undefined): number | null {
  if (!raw) return null;
  const cleaned = raw.trim().toLowerCase().replace(/,/g, '');
  if (cleaned in WORD_NUMBERS) return WORD_NUMBERS[cleaned];
  const n = Number.parseFloat(cleaned);
  return Number.isFinite(n) ? n : null;
}

/**
 * Count parsing is bounded on both ends. A listing claiming 400 bedrooms is a
 * parse error (usually a phone number or a price caught by a loose pattern), and
 * silently accepting it would put a nonsense fact in front of the host with a
 * confidence score attached.
 */
function plausible(value: number | null, max: number): number | null {
  if (value === null) return null;
  return value >= 0 && value <= max ? value : null;
}

export function extractSpaceCounts(text: string): SpaceCounts {
  const flat = flatten(text);
  const bedroomMatch = firstMatch(flat, /(\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\s*(?:bed\s?rooms?|bedrooms?|BR\b)/)
    ?? (/(^|\W)studio(\W|$)/i.test(flat) ? (['studio', 'studio'] as unknown as RegExpMatchArray) : null);
  const bathroomMatch = firstMatch(flat, /(\d+(?:\.\d)?|one|two|three|four|five|six|seven|eight)\s*(?:(?:full|half|shared|private)\s+)?bath(?:room)?s?\b/);
  const bedMatch = firstMatch(flat, /(\d+|one|two|three|four|five|six|seven|eight|nine|ten)\s*beds?\b(?!\s*room)/);
  const guestMatch = firstMatch(flat, /(?:sleeps?|accommodates|up to)\s*(\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)|(\d+)\s*guests?\b/);
  const floorMatch = firstMatch(flat, /(\d+|one|two|three|four)\s*(?:stor(?:ey|y|ies)|floors?|levels?)\b/);
  const sqftMatch = firstMatch(flat, /([\d,]{3,7})\s*(?:sq\.?\s*(?:ft|feet)|square\s*(?:ft|feet))/);

  return {
    bedrooms: plausible(toCount(bedroomMatch?.[1]), 30),
    bathrooms: plausible(toCount(bathroomMatch?.[1]), 30),
    beds: plausible(toCount(bedMatch?.[1]), 60),
    guests: plausible(toCount(guestMatch?.[1] ?? guestMatch?.[2]), 60),
    floors: plausible(toCount(floorMatch?.[1]), 10),
    squareFeet: plausible(toCount(sqftMatch?.[1]), 60000),
  };
}

// ---------------------------------------------------------------------------
// Times
// ---------------------------------------------------------------------------

/** "4:00 PM" / "4 pm" / "16:00" / "after 3PM" -> "16:00". Null when unparseable. */
export function normalizeTime(raw: string): string | null {
  // The optional trailing period matters: a sentence-final "before 10 am." is
  // captured with its punctuation attached, and rejecting it would silently drop
  // the most common way a listing states its checkout time.
  const m = raw.trim().match(/^(\d{1,2})(?::(\d{2}))?\s*([ap])\.?m\.?$|^(\d{1,2})(?::(\d{2}))?\.?$/i);
  if (!m) return null;
  let hour = Number.parseInt(m[1] ?? m[4], 10);
  const rawMinute = m[2] ?? m[5];
  const minute = rawMinute ? Number.parseInt(rawMinute, 10) : 0;
  const suffix = m[3] ? `${m[3].toLowerCase()}m` : undefined;
  if (!Number.isFinite(hour) || hour > 24 || minute > 59) return null;
  if (suffix === 'pm' && hour < 12) hour += 12;
  if (suffix === 'am' && hour === 12) hour = 0;
  if (!suffix && hour > 23) return null;
  if (hour === 24) hour = 0;
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

const TIME_TOKEN = String.raw`(\d{1,2}(?::\d{2})?\s*(?:[ap]\.?m\.?)?)`;

function timeField(text: string, kind: 'checkin' | 'checkout'): { value: string; evidence: string } | null {
  const flat = flatten(text);
  const label = kind === 'checkin' ? String.raw`check[\s-]?in` : String.raw`check[\s-]?out|checkout|departure`;
  const pattern = new RegExp(String.raw`(?:${label})[^.\n]{0,30}?(?:after|before|by|from|at|:)\s*${TIME_TOKEN}`, 'i');
  const match = flat.match(pattern);
  if (!match?.[1]) return null;
  const value = normalizeTime(match[1]);
  return value ? { value, evidence: evidenceFrom(flat, match[0]) } : null;
}

// ---------------------------------------------------------------------------
// Location
// ---------------------------------------------------------------------------

/**
 * Street address is intentionally NOT extracted. No mainstream listing page
 * publishes one before booking, so any regex that produced a street line would
 * be producing a guess — and it would be written to `properties.address_line1`,
 * which the guest portal shows as fact. City / region / country are what listing
 * pages actually state, and they are all the concierge needs for local context.
 */
export function extractLocation(text: string, title: string): ExtractedLocation {
  const flat = flatten(`${title}. ${text}`);
  // No period is allowed inside a component. Permitting one let
  // "..., United States. Sleeps 8 guests" parse as a country of
  // "United States. Sleeps" - the match ran straight through the sentence
  // boundary and produced a value no host would recognize.
  const PART = String.raw`[A-Z][A-Za-z'\-]*(?: [A-Z][A-Za-z'\-]*){0,3}`;
  const inMatch = flat.match(new RegExp(String.raw`\b(?:in|near)\s+(${PART}),\s*(${PART})(?:,\s*(${PART}))?`));
  if (!inMatch) return { city: null, region: null, country: null };
  const clean = (v: string | undefined) => (v ? v.trim().replace(/\s+/g, ' ').slice(0, 120) : null);
  return { city: clean(inMatch[1]), region: clean(inMatch[2]), country: clean(inMatch[3]) };
}

// ---------------------------------------------------------------------------
// Amenity + policy signals -> registry fields with scrape hints
// ---------------------------------------------------------------------------

interface SignalSpec {
  /** Registry field_id. Must exist and must carry a scrape_hint. */
  fieldId: string;
  /** Sentence-level matcher. */
  match: RegExp;
  /** Turns the matched fragment into the stored value. */
  value: (fragment: string) => string;
  confidence: number;
}

const SIGNALS: SignalSpec[] = [
  {
    fieldId: 'parking',
    match: /\b(free parking|paid parking|street parking|parking on premises|driveway|garage|no parking)\b[^.]{0,80}/i,
    value: (f) => flatten(f),
    confidence: 0.75,
  },
  {
    fieldId: 'laundry_access',
    match: /\b(washer|dryer|laundromat|in-unit laundry|laundry)\b[^.]{0,60}/i,
    value: (f) => flatten(f),
    confidence: 0.7,
  },
  {
    fieldId: 'pool_instructions',
    match: /\b(private pool|shared pool|heated pool|pool)\b[^.]{0,60}/i,
    value: (f) => flatten(f),
    confidence: 0.6,
  },
  {
    fieldId: 'hot_tub_instructions',
    match: /\b(hot tub|jacuzzi|spa tub)\b[^.]{0,60}/i,
    value: (f) => flatten(f),
    confidence: 0.65,
  },
  {
    fieldId: 'climate_control',
    match: /\b(central air|air conditioning|AC unit|window AC|heating|heat pump|fireplace)\b[^.]{0,60}/i,
    value: (f) => flatten(f),
    confidence: 0.6,
  },
  {
    fieldId: 'appliance_list',
    match: /\b(dishwasher|microwave|oven|stove|refrigerator|coffee maker|grill)\b[^.]{0,80}/i,
    value: (f) => flatten(f),
    confidence: 0.55,
  },
  {
    fieldId: 'wifi_speed_tier',
    match: /\b(?:fast wifi|wifi)[^.]{0,30}?(\d{2,4})\s*mbps/i,
    value: (f) => flatten(f),
    confidence: 0.7,
  },
  {
    fieldId: 'pet_policy',
    match: /\b(pets? (?:are )?(?:allowed|welcome|not allowed|prohibited)|no pets|pet[- ]friendly|service animals)\b[^.]{0,60}/i,
    value: (f) => flatten(f),
    confidence: 0.8,
  },
  {
    fieldId: 'smoking_policy',
    match: /\b(no smoking|smoking (?:is )?(?:not )?(?:allowed|permitted)|smoke[- ]free)\b[^.]{0,50}/i,
    value: (f) => flatten(f),
    confidence: 0.8,
  },
  {
    fieldId: 'quiet_hours',
    match: /\bquiet hours?\b[^.]{0,60}/i,
    value: (f) => flatten(f),
    confidence: 0.8,
  },
  {
    fieldId: 'age_child_policy',
    match: /\b(?:suitable for (?:children|infants)|children (?:are )?(?:welcome|not )|not suitable for (?:children|infants)|infants)\b[^.]{0,60}/i,
    value: (f) => flatten(f),
    confidence: 0.7,
  },
  {
    fieldId: 'security_camera_disclosure',
    match: /\b(security cameras?|exterior camera|doorbell camera|no cameras)\b[^.]{0,70}/i,
    value: (f) => flatten(f),
    confidence: 0.75,
  },
  {
    fieldId: 'elevator_stairs',
    match: /\b(elevator|no elevator|stairs|step[- ]free|ground floor entry)\b[^.]{0,60}/i,
    value: (f) => flatten(f),
    confidence: 0.55,
  },
  {
    fieldId: 'transit_options',
    match: /\b(?:bus stop|subway|metro station|train station|ferry|light rail|airport is)\b[^.]{0,70}/i,
    value: (f) => flatten(f),
    confidence: 0.6,
  },
  {
    fieldId: 'nearest_grocery',
    match: /\b(?:grocery|supermarket|market)\b[^.]{0,70}/i,
    value: (f) => flatten(f),
    confidence: 0.5,
  },
];

const REGISTRY_BY_ID = new Map(REGISTRY_FIELDS.map((f) => [f.field_id, f]));

/**
 * Guards the SIGNALS table against drift. A signal naming a field the registry
 * dropped would otherwise produce an unwritable path at runtime; here it just
 * fails to be offered, and the unit test asserts the table stays complete.
 */
export function signalFieldIds(): string[] {
  return SIGNALS.map((s) => s.fieldId);
}

function registryField(fieldId: string) {
  const reg = REGISTRY_BY_ID.get(fieldId);
  if (!reg || reg.system_section || reg.type === 'secret') return null;
  return reg;
}

function pushRegistryField(
  out: ExtractedField[],
  fieldId: string,
  value: string | number,
  confidence: number,
  evidence: string,
): void {
  const reg = registryField(fieldId);
  if (!reg) return;
  const section = brainSection(reg.domain);
  if (!section) return;
  // Stored as a string even for `number` fields: normalizeProposedValue only
  // accepts strings for non-brain_item paths and does the numeric parse itself,
  // so handing it a raw number is rejected as "not text".
  const text = String(value);
  out.push({
    key: fieldId,
    label: reg.label,
    section: reg.domain,
    sectionLabel: sectionLabel(reg.domain),
    fieldPath: `brain_value.${fieldId}`,
    value: text,
    display: text,
    confidence,
    evidence: evidence.slice(0, EVIDENCE_MAX),
  });
}

// ---------------------------------------------------------------------------
// Composition
// ---------------------------------------------------------------------------

function spaceSummaryText(counts: SpaceCounts): string {
  const parts: string[] = [];
  if (counts.bedrooms !== null) parts.push(counts.bedrooms === 0 ? 'Studio' : `${counts.bedrooms} bedroom${counts.bedrooms === 1 ? '' : 's'}`);
  if (counts.beds !== null) parts.push(`${counts.beds} bed${counts.beds === 1 ? '' : 's'}`);
  if (counts.bathrooms !== null) parts.push(`${counts.bathrooms} bathroom${counts.bathrooms === 1 ? '' : 's'}`);
  if (counts.floors !== null) parts.push(`${counts.floors} floor${counts.floors === 1 ? '' : 's'}`);
  if (counts.squareFeet !== null) parts.push(`${counts.squareFeet.toLocaleString('en-US')} sq ft`);
  return parts.join(' · ');
}

/** True when at least two independent space numbers parsed — one alone is usually a coincidence. */
function spaceCountsUsable(counts: SpaceCounts): boolean {
  return [counts.bedrooms, counts.bathrooms, counts.beds, counts.floors, counts.squareFeet]
    .filter((v) => v !== null).length >= 2;
}

export interface ExtractionInput {
  title: string;
  text: string;
  sourceUrl: string;
}

/**
 * The whole of §1's "extract only high-value structured fields, map each to the
 * correct section/field". Returns one entry per field it is willing to stand
 * behind; produces nothing at all for a page it could not read.
 */
export function extractListingFields(input: ExtractionInput): ExtractedField[] {
  const out: ExtractedField[] = [];
  const flat = flatten(input.text);
  if (flat.length === 0) return out;

  // Space details — one composed entry, not five separate half-facts.
  const counts = extractSpaceCounts(flat);
  if (spaceCountsUsable(counts)) {
    const summary = spaceSummaryText(counts);
    out.push({
      key: 'space_summary',
      label: 'Space details',
      section: 'space_details',
      sectionLabel: sectionLabel('space_details'),
      fieldPath: 'brain.space_summary',
      value: { title: 'Space details', text: `${summary}. Read from the listing page — confirm before guests rely on it.`, category: 'core', visibility: 'guest' },
      display: summary,
      confidence: 0.7,
      evidence: evidenceFrom(flat, summary.split(' · ')[0] ?? summary),
    });
  }
  if (counts.guests !== null && counts.guests > 0) {
    pushRegistryField(out, 'max_occupancy', counts.guests, 0.75, evidenceFrom(flat, `${counts.guests} guest`));
  }
  if (counts.floors !== null && counts.floors > 0) {
    pushRegistryField(out, 'floor_number', String(counts.floors), 0.5, evidenceFrom(flat, `${counts.floors} floor`));
  }

  // Location -> the address columns on `properties` (Property Overview per §1).
  const location = extractLocation(flat, input.title);
  const locationTargets: Array<[keyof ExtractedLocation, string, string]> = [
    ['city', 'properties.city', 'City'],
    ['region', 'properties.region', 'State / region'],
    ['country', 'properties.country', 'Country'],
  ];
  for (const [key, path, label] of locationTargets) {
    const value = location[key];
    if (!value) continue;
    out.push({
      key: `location_${key}`,
      label,
      section: 'space_details',
      sectionLabel: sectionLabel('space_details'),
      fieldPath: path,
      value,
      display: value,
      confidence: 0.6,
      evidence: evidenceFrom(flat, value),
    });
  }

  // Times.
  const checkin = timeField(flat, 'checkin');
  if (checkin) pushRegistryField(out, 'checkin_time', checkin.value, 0.8, checkin.evidence);
  const checkout = timeField(flat, 'checkout');
  if (checkout) pushRegistryField(out, 'checkout_time', checkout.value, 0.8, checkout.evidence);

  // Minimum stay is the one numeric policy listings state plainly.
  const minStay = flat.match(/(\d+)[\s-]*night\s*minimum|minimum\s*(?:stay|of)?\s*(?:is\s*)?(\d+)\s*nights?/i);
  const minNights = plausible(toCount(minStay?.[1] ?? minStay?.[2]), 365);
  if (minNights !== null && minNights > 0) {
    pushRegistryField(out, 'minimum_stay', minNights, 0.7, evidenceFrom(flat, minStay?.[0] ?? String(minNights)));
  }

  // Amenity + policy signals.
  for (const signal of SIGNALS) {
    if (out.some((field) => field.key === signal.fieldId)) continue;
    const match = flat.match(signal.match);
    if (!match) continue;
    const value = signal.value(match[0]).slice(0, 400);
    if (value.length < 3) continue;
    pushRegistryField(out, signal.fieldId, value, signal.confidence, evidenceFrom(flat, match[0]));
  }

  return out;
}
