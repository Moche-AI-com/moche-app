/**
 * Tone and restricted-topic resolution for the guest concierge (P4-06, P4-07, P4-08).
 *
 * Everything here is pure so the rules that decide what reaches the model can be
 * tested without a database or an LLM. Two ideas carry the whole module:
 *
 * 1. **The tone control is an ID, never prose.** `property_settings.concierge_tone`
 *    stores one of five preset IDs; the prompt fragment is looked up from code.
 *    An unrecognised value can therefore never reach the model.
 *
 * 2. **A legacy freeform tone stays in force until its host says otherwise.**
 *    Two properties in production had hand-written tone prose, one of them a
 *    deliberate personality ("surfer dude") the host clearly cared about.
 *    Silently swapping that for a preset would change the voice of a live
 *    concierge without asking, so a pending legacy note keeps working exactly as
 *    it did and the host is asked to decide. This is P4-07's "do not silently
 *    reinterpret" requirement, enforced at read time rather than at migration
 *    time - which also means it cannot be defeated by a migration running twice.
 */
import {
  DEFAULT_RESTRICTED_TOPIC_KEYS,
  DEFAULT_TONE_PRESET_ID,
  RESTRICTED_TOPIC_OPTIONS,
  TONE_PRESETS,
  type RestrictedTopicKey,
  type TonePreset,
  type TonePresetId,
} from '@/lib/constants';

const PRESETS_BY_ID = new Map<string, TonePreset>(TONE_PRESETS.map((p) => [p.id, p]));
const TOPICS_BY_KEY = new Map(RESTRICTED_TOPIC_OPTIONS.map((o) => [o.key, o]));

export function isTonePresetId(value: unknown): boolean {
  return typeof value === 'string' && PRESETS_BY_ID.has(value);
}

/** The preset a stored value refers to, falling back to the default. */
export function tonePresetFor(value: string | null | undefined): TonePreset {
  const found = value ? PRESETS_BY_ID.get(value) : undefined;
  return found ?? PRESETS_BY_ID.get(DEFAULT_TONE_PRESET_ID)!;
}

export interface ToneSettings {
  /** Preset ID from `property_settings.concierge_tone`. */
  conciergeTone?: string | null;
  /** Pre-preset freeform prose preserved by the migration. */
  legacyToneNote?: string | null;
  /** Set once the host has decided what to do with the legacy note. */
  legacyToneAckAt?: string | null;
}

/**
 * True while a host still has an un-answered decision about their old freeform
 * tone. Drives the settings-page prompt, and gates which text reaches the model.
 */
export function hasPendingLegacyTone(s: ToneSettings): boolean {
  return Boolean(s.legacyToneNote && s.legacyToneNote.trim().length > 0 && !s.legacyToneAckAt);
}

/**
 * The tone text handed to the concierge.
 *
 * A pending legacy note wins, so the voice of a live concierge does not change
 * underneath a host who has not been asked yet. Once acknowledged, the preset
 * fragment takes over and the stored prose stops influencing the model.
 */
export function resolveTonePrompt(s: ToneSettings): string {
  if (hasPendingLegacyTone(s)) return s.legacyToneNote!.trim();
  return tonePresetFor(s.conciergeTone).promptFragment;
}

/**
 * Best guess at which preset an old freeform tone was reaching for, used only to
 * pre-select the dropdown in the confirmation prompt. It is a suggestion shown
 * to a human, never an automatic decision - which is why a low-signal note is
 * allowed to fall through to the default rather than being forced into a bucket.
 */
const TONE_SIGNALS: readonly { id: TonePresetId; patterns: readonly RegExp[] }[] = [
  { id: 'luxury_concierge', patterns: [/\bluxur\w*/i, /\bupscale\b/i, /\brefined\b/i, /\bdiscreet\w*/i, /\bpremium\b/i, /\bhigh end\b/i, /\bwhite glove\b/i, /\bexclusive\b/i, /\belegant\w*/i] },
  { id: 'family_friendly', patterns: [/\bfamil(y|ies|ial)\b/i, /\bkids?\b/i, /\bchildren\b/i, /\bparents?\b/i, /\btoddlers?\b/i] },
  { id: 'casual', patterns: [/\bcasual\w*/i, /\bfun\b/i, /\bplayful\w*/i, /\brelaxed\b/i, /\bsurfer?\b/i, /\bchill\w*/i, /\blaid back\b/i, /\bquirky\b/i, /\bhumou?r\w*/i, /\bemoji\w*/i, /\bvibe\w*/i, /\bpersonality\b/i] },
  { id: 'professional', patterns: [/\bprofessional\w*/i, /\bpolished\b/i, /\bformal\b/i, /\bbusiness\b/i, /\bcorporate\b/i, /\bcourteous\b/i, /\bprecise\b/i, /\befficient\b/i] },
  { id: 'friendly', patterns: [/\bfriendly\b/i, /\bwarm\w*/i, /\bwelcoming\b/i, /\bupbeat\b/i, /\bcheerful\b/i, /\bkind\b/i] },
];

export function suggestTonePreset(note: string | null | undefined): TonePresetId {
  // Old values arrive in two shapes: sentences a host typed, and slug-like
  // values such as the real production "warm_professional". Treating separators
  // as spaces lets one set of word-boundary patterns read both, instead of
  // silently missing every underscored value.
  const text = note?.replace(/[_\-/|.]+/g, ' ').trim();
  if (!text) return DEFAULT_TONE_PRESET_ID;

  // Score every preset and take the strongest, so a note mentioning several
  // qualities lands on the one it mentions most rather than on whichever pattern
  // happens to be checked first. Ties resolve by TONE_SIGNALS order, which runs
  // most-specific first: "luxury and friendly" is a luxury brief, not a
  // friendly one, because almost every tone note says something warm.
  let best: TonePresetId = DEFAULT_TONE_PRESET_ID;
  let bestScore = 0;
  for (const signal of TONE_SIGNALS) {
    const score = signal.patterns.reduce((n, re) => n + (re.test(text) ? 1 : 0), 0);
    if (score > bestScore) {
      bestScore = score;
      best = signal.id;
    }
  }
  return best;
}

/**
 * Keep only recognised topic keys, de-duplicated and in the canonical order of
 * RESTRICTED_TOPIC_OPTIONS so the stored array and the rendered prompt are stable
 * no matter what order the checkboxes were submitted in.
 */
export function normalizeRestrictedTopicKeys(input: unknown): RestrictedTopicKey[] {
  if (!Array.isArray(input)) return [];
  const wanted = new Set(input.filter((k): k is string => typeof k === 'string'));
  return RESTRICTED_TOPIC_OPTIONS.filter((o) => wanted.has(o.key)).map((o) => o.key);
}

/**
 * Topic keys for a settings row. A row predating the column (null) gets the
 * defaults, matching what a brand-new property gets, so no property is ever
 * unprotected because of when it was created. An explicit empty array is
 * respected - a host who unchecks everything meant it.
 */
export function resolveRestrictedTopicKeys(stored: unknown): RestrictedTopicKey[] {
  if (stored === null || stored === undefined) return [...DEFAULT_RESTRICTED_TOPIC_KEYS];
  return normalizeRestrictedTopicKeys(stored);
}

/**
 * The single RESTRICTED TOPICS clause for the prompt: preset phrases first, then
 * whatever the host typed in "other". Returns null when there is nothing to say,
 * so the caller can omit the line entirely rather than emitting an empty rule.
 */
export function buildRestrictedTopicsClause(
  keys: unknown,
  custom?: string | null,
): string | null {
  const phrases = resolveRestrictedTopicKeys(keys)
    .map((k) => TOPICS_BY_KEY.get(k)?.phrase)
    .filter((p): p is string => Boolean(p));

  const extra = custom?.trim();
  if (extra) phrases.push(extra);
  if (phrases.length === 0) return null;

  return phrases.join('; ');
}

/** Host-facing labels for the current selection, for summaries and audit metadata. */
export function restrictedTopicLabels(keys: unknown): string[] {
  return resolveRestrictedTopicKeys(keys)
    .map((k) => TOPICS_BY_KEY.get(k)?.label)
    .filter((l): l is string => Boolean(l));
}
