// Minimal RFC 5545 VEVENT reader for booking-calendar feeds (Airbnb, Vrbo).
// Dependency-free and pure so it is unit-testable without network access.
// Supports folded lines, UID/SUMMARY/STATUS, and DTSTART/DTEND in both DATE
// (20260915) and DATE-TIME (20260915T150000Z) forms.

export interface IcalEvent {
  uid: string;
  summary: string;
  status: string;
  /** ISO dates (YYYY-MM-DD). DTEND is exclusive per RFC — i.e. checkout day. */
  startDate: string;
  endDate: string;
}

function unfold(text: string): string[] {
  const raw = text.replace(/\r\n?/g, '\n').split('\n');
  const lines: string[] = [];
  for (const line of raw) {
    if ((line.startsWith(' ') || line.startsWith('\t')) && lines.length > 0) {
      // A continuation line: append minus the single fold character.
      lines[lines.length - 1] += line.slice(1);
    } else {
      lines.push(line);
    }
  }
  return lines;
}

function parseDateValue(value: string): string | null {
  const date = value.match(/^(\d{4})(\d{2})(\d{2})/);
  if (!date) return null;
  return `${date[1]}-${date[2]}-${date[3]}`;
}

function unescape(text: string): string {
  return text.replace(/\\n/gi, ' ').replace(/\\([,;\\])/g, '$1').trim();
}

export function parseIcs(text: string): IcalEvent[] {
  const events: IcalEvent[] = [];
  let current: { uid?: string; summary?: string; status?: string; start?: string; end?: string } | null = null;
  for (const line of unfold(text)) {
    if (line === 'BEGIN:VEVENT') { current = {}; continue; }
    if (line === 'END:VEVENT') {
      if (current?.uid && current.start && current.end) {
        events.push({
          uid: current.uid,
          summary: unescape(current.summary ?? ''),
          status: (current.status ?? 'CONFIRMED').toUpperCase(),
          startDate: current.start,
          endDate: current.end,
        });
      }
      current = null;
      continue;
    }
    if (!current) continue;
    const colon = line.indexOf(':');
    if (colon < 0) continue;
    const name = line.slice(0, colon).split(';')[0].toUpperCase();
    const value = line.slice(colon + 1);
    if (name === 'UID') current.uid = value.trim();
    else if (name === 'SUMMARY') current.summary = value;
    else if (name === 'STATUS') current.status = value.trim();
    else if (name === 'DTSTART') { const d = parseDateValue(value.trim()); if (d) current.start = d; }
    else if (name === 'DTEND') { const d = parseDateValue(value.trim()); if (d) current.end = d; }
  }
  return events;
}

// Platforms export genuine reservations alongside owner blocks ("Not available",
// "Closed"). Only real reservations become stays.
const NON_RESERVATION = /not available|blocked|unavailable|closed|owner hold|maintenance block/i;

export function isReservationEvent(event: IcalEvent): boolean {
  if (event.status === 'CANCELLED') return false;
  return !NON_RESERVATION.test(event.summary);
}

/** The reservation's checkout day must be today or later to be worth a stay. */
export function isCurrentOrFuture(event: IcalEvent, todayIso: string): boolean {
  return event.endDate >= todayIso;
}
