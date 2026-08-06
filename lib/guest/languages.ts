// Guest + host language support (Guest UX pass).
//
// One canonical list drives three things:
//   1. the Globe picker in the guest portal,
//   2. the RESPONSE LANGUAGE overlay handed to the concierge model, and
//   3. the target language used when translating a guest escalation into the
//      host's own language.
//
// Codes are BCP-47 primary subtags (plus a couple of script/region variants that
// are genuinely distinct languages to a reader). `label` is English — used in
// prompts, host-facing UI, and logs. `nativeLabel` is what the guest sees, so a
// guest who does not read English can still find their language in the list.
//
// Pure data + pure lookups: safe to import from server routes and client
// components alike, and directly testable.

export interface PortalLanguage {
  /** Stored value. Stable; never invent a new one on the client. */
  code: string;
  /** English name — what the model is told to reply in. */
  label: string;
  /** Endonym — what the guest reads in the picker. */
  nativeLabel: string;
}

/**
 * Ordered roughly by global short-term-rental guest volume, then alphabetically.
 * `auto` is not in this list: it is the absence of a choice, handled separately,
 * and means "reply in whatever language the guest wrote in".
 */
export const PORTAL_LANGUAGES: PortalLanguage[] = [
  { code: 'en', label: 'English', nativeLabel: 'English' },
  { code: 'es', label: 'Spanish', nativeLabel: 'Español' },
  { code: 'fr', label: 'French', nativeLabel: 'Français' },
  { code: 'de', label: 'German', nativeLabel: 'Deutsch' },
  { code: 'it', label: 'Italian', nativeLabel: 'Italiano' },
  { code: 'pt', label: 'Portuguese', nativeLabel: 'Português' },
  { code: 'pt-BR', label: 'Brazilian Portuguese', nativeLabel: 'Português (Brasil)' },
  { code: 'nl', label: 'Dutch', nativeLabel: 'Nederlands' },
  { code: 'pl', label: 'Polish', nativeLabel: 'Polski' },
  { code: 'sv', label: 'Swedish', nativeLabel: 'Svenska' },
  { code: 'no', label: 'Norwegian', nativeLabel: 'Norsk' },
  { code: 'da', label: 'Danish', nativeLabel: 'Dansk' },
  { code: 'fi', label: 'Finnish', nativeLabel: 'Suomi' },
  { code: 'is', label: 'Icelandic', nativeLabel: 'Íslenska' },
  { code: 'cs', label: 'Czech', nativeLabel: 'Čeština' },
  { code: 'sk', label: 'Slovak', nativeLabel: 'Slovenčina' },
  { code: 'hu', label: 'Hungarian', nativeLabel: 'Magyar' },
  { code: 'ro', label: 'Romanian', nativeLabel: 'Română' },
  { code: 'bg', label: 'Bulgarian', nativeLabel: 'Български' },
  { code: 'el', label: 'Greek', nativeLabel: 'Ελληνικά' },
  { code: 'tr', label: 'Turkish', nativeLabel: 'Türkçe' },
  { code: 'ru', label: 'Russian', nativeLabel: 'Русский' },
  { code: 'uk', label: 'Ukrainian', nativeLabel: 'Українська' },
  { code: 'he', label: 'Hebrew', nativeLabel: 'עברית' },
  { code: 'ar', label: 'Arabic', nativeLabel: 'العربية' },
  { code: 'fa', label: 'Persian', nativeLabel: 'فارسی' },
  { code: 'hi', label: 'Hindi', nativeLabel: 'हिन्दी' },
  { code: 'bn', label: 'Bengali', nativeLabel: 'বাংলা' },
  { code: 'ur', label: 'Urdu', nativeLabel: 'اردو' },
  { code: 'ta', label: 'Tamil', nativeLabel: 'தமிழ்' },
  { code: 'th', label: 'Thai', nativeLabel: 'ไทย' },
  { code: 'vi', label: 'Vietnamese', nativeLabel: 'Tiếng Việt' },
  { code: 'id', label: 'Indonesian', nativeLabel: 'Bahasa Indonesia' },
  { code: 'ms', label: 'Malay', nativeLabel: 'Bahasa Melayu' },
  { code: 'tl', label: 'Filipino', nativeLabel: 'Filipino' },
  { code: 'zh-Hans', label: 'Simplified Chinese', nativeLabel: '简体中文' },
  { code: 'zh-Hant', label: 'Traditional Chinese', nativeLabel: '繁體中文' },
  { code: 'ja', label: 'Japanese', nativeLabel: '日本語' },
  { code: 'ko', label: 'Korean', nativeLabel: '한국어' },
  { code: 'sw', label: 'Swahili', nativeLabel: 'Kiswahili' },
  { code: 'af', label: 'Afrikaans', nativeLabel: 'Afrikaans' },
];

/** Sentinel meaning "match whatever language the guest writes in". */
export const AUTO_LANGUAGE = 'auto';

/** Fallback used when nothing is configured anywhere. */
export const DEFAULT_HOST_LANGUAGE = 'en';

const BY_CODE = new Map(PORTAL_LANGUAGES.map((l) => [l.code.toLowerCase(), l]));

/**
 * Resolves any stored/submitted value onto a real language.
 *
 * Accepts an exact code, a case-insensitive code, or a bare primary subtag for a
 * regional variant the picker doesn't list (`pt-PT` -> `pt`, `en-GB` -> `en`), so
 * a browser-provided `navigator.language` can be used as a first guess without
 * the caller having to normalise it. Returns null for `auto`, unknown values,
 * and non-strings — callers decide what "no language" means for them.
 */
export function resolveLanguage(value: unknown): PortalLanguage | null {
  if (typeof value !== 'string') return null;
  const raw = value.trim();
  if (!raw || raw.toLowerCase() === AUTO_LANGUAGE) return null;
  const exact = BY_CODE.get(raw.toLowerCase());
  if (exact) return exact;
  const primary = raw.split('-')[0]?.toLowerCase();
  if (!primary) return null;
  return BY_CODE.get(primary) ?? null;
}

export function isPortalLanguage(value: unknown): boolean {
  return resolveLanguage(value) !== null;
}

/** English name for prompts. Falls back to English rather than throwing. */
export function languageLabel(value: unknown): string {
  return resolveLanguage(value)?.label ?? 'English';
}

/** Endonym for guest-facing UI. */
export function languageNativeLabel(value: unknown): string {
  return resolveLanguage(value)?.nativeLabel ?? 'English';
}

/**
 * True when a translation step is actually worth running. Same language (or
 * either side unknown) means the text is already readable to the recipient.
 */
export function needsTranslation(from: unknown, to: unknown): boolean {
  const a = resolveLanguage(from);
  const b = resolveLanguage(to);
  if (!a || !b) return false;
  return a.code !== b.code;
}

/** Filters the picker list by a guest-typed search string (code, English, or endonym). */
export function searchLanguages(query: string): PortalLanguage[] {
  const q = query.trim().toLowerCase();
  if (!q) return PORTAL_LANGUAGES;
  return PORTAL_LANGUAGES.filter(
    (l) =>
      l.code.toLowerCase().includes(q) ||
      l.label.toLowerCase().includes(q) ||
      l.nativeLabel.toLowerCase().includes(q),
  );
}
