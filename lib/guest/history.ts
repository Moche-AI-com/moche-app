// Guest chat history sectioning (Guest UX pass).
//
// Chat history used to live inside the chat box: every past turn stacked above
// the live conversation, so a guest on day four scrolled through three days of
// their own messages to reach today's. History now moves out to its own view
// behind the Moche.AI pill, which only works if it is navigable — a flat list of
// 200 bubbles is no better than the scroll it replaced.
//
// So history is cut into SECTIONS, each with a generated title. Titles are
// derived from the guest's own first question in that section, deterministically
// and without a model call: the history view must open instantly and cost
// nothing, and a heading is not worth an inference.
//
// Pure functions over plain message rows so the sectioning rules are directly
// testable and the portal component only renders.

export interface HistoryMessage {
  role: 'guest' | 'assistant' | 'host';
  content: string;
  created_at: string;
}

export interface HistorySection {
  /** Stable key for React and for scroll targeting. */
  id: string;
  /** Generated heading, e.g. "Where to eat nearby". */
  title: string;
  /** ISO timestamp of the first message in the section. */
  startedAt: string;
  messages: HistoryMessage[];
}

/**
 * A gap this long between turns means the guest walked away and came back with a
 * new intent. Forty-five minutes is long enough to survive a slow host reply or
 * a guest reading a recommendation, and short enough that "breakfast" and
 * "dinner plans" don't collapse into one section.
 */
export const SECTION_GAP_MS = 45 * 60 * 1000;

/** Filler stripped from the front of a question before it becomes a heading. */
const LEADING_FILLER =
  /^(hi|hey|hello|please|pls|could you|can you|would you|i(?:'| a)?m wondering|i was wondering|do you know|i need to know|quick question|sorry|excuse me|just|so)\b[\s,]*/i;

const QUESTION_WORD = /^(what|where|when|why|who|how|which|is|are|can|could|do|does|did|should|will|would)\b/i;

/** Words that are never a useful heading on their own. */
const TOO_GENERIC = /^(help|hello|hi|hey|thanks|thank you|ok|okay|yes|no)$/i;

const MAX_TITLE_CHARS = 42;

/**
 * Turns a guest message into a short heading.
 *
 * Deterministic and local: strips filler and trailing punctuation, capitalises,
 * and truncates on a word boundary. Returns null when the message is too generic
 * to describe a section, so the caller can fall back to a dated heading rather
 * than showing a section called "Hi".
 */
export function deriveSectionTitle(message: string): string | null {
  let s = (message ?? '').replace(/\s+/g, ' ').trim();
  if (!s) return null;

  s = s.replace(LEADING_FILLER, '').trim();
  // Keep only the first sentence — a heading describes the ask, not the context.
  s = s.split(/(?<=[.!?])\s/)[0]?.trim() ?? s;
  s = s.replace(/[?.!,;:]+$/, '').trim();
  if (!s || TOO_GENERIC.test(s)) return null;

  if (s.length > MAX_TITLE_CHARS) {
    const cut = s.slice(0, MAX_TITLE_CHARS);
    const lastSpace = cut.lastIndexOf(' ');
    s = (lastSpace > 16 ? cut.slice(0, lastSpace) : cut).trim() + '…';
  }

  // Sentence case: uppercase the first letter, leave the rest (proper nouns,
  // "WiFi", acronyms) exactly as the guest typed it.
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Human date heading used when no question in the section is descriptive enough. */
export function fallbackTitle(iso: string, locale?: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'Earlier conversation';
  return d.toLocaleDateString(locale, { weekday: 'long', month: 'short', day: 'numeric' });
}

/**
 * Groups a flat, chronological message list into titled sections.
 *
 * A new section starts on a long quiet gap or on a new calendar day, because
 * both are how a guest actually remembers a conversation ("that thing I asked
 * yesterday"). Messages arriving out of order are tolerated: only the gap
 * between consecutive entries is considered, so a bad timestamp splits one
 * section instead of corrupting the whole list.
 */
export function sectionizeHistory(messages: readonly HistoryMessage[], locale?: string): HistorySection[] {
  const sections: HistorySection[] = [];
  let current: HistoryMessage[] = [];
  let prevTime: number | null = null;
  let prevDay: string | null = null;

  const flush = () => {
    if (current.length === 0) return;
    const startedAt = current[0].created_at;
    const firstGuest = current.find((m) => m.role === 'guest');
    const title =
      (firstGuest ? deriveSectionTitle(firstGuest.content) : null) ?? fallbackTitle(startedAt, locale);
    sections.push({ id: `${startedAt}-${sections.length}`, title, startedAt, messages: current });
    current = [];
  };

  for (const m of messages) {
    const t = new Date(m.created_at).getTime();
    const day = Number.isNaN(t) ? null : new Date(t).toDateString();
    const gapped = prevTime !== null && !Number.isNaN(t) && t - prevTime > SECTION_GAP_MS;
    const newDay = prevDay !== null && day !== null && day !== prevDay;

    if (current.length > 0 && (gapped || newDay)) flush();

    current.push(m);
    if (!Number.isNaN(t)) {
      prevTime = t;
      prevDay = day;
    }
  }
  flush();

  return sections;
}

/** One-line preview for a collapsed section row. */
export function sectionPreview(section: HistorySection, maxChars = 90): string {
  const last = section.messages[section.messages.length - 1];
  if (!last) return '';
  const who = last.role === 'guest' ? 'You' : last.role === 'host' ? 'Your host' : 'Concierge';
  const body = last.content.replace(/\s+/g, ' ').trim();
  const text = `${who}: ${body}`;
  return text.length > maxChars ? `${text.slice(0, maxChars - 1).trimEnd()}…` : text;
}
