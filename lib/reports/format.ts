// Display formatting for Reports grids (#81). Dependency-free and pure so
// topic pages format server-side — grid rows cross the server→client boundary
// as plain strings, never as Date objects.

const DATE_OPTIONS: Intl.DateTimeFormatOptions = { year: 'numeric', month: 'short', day: 'numeric' };

/** "Aug 26, 2026" in the property's own timezone; '—' for missing/invalid input. */
export function fmtDateInTz(value: string | null | undefined, timeZone?: string | null): string {
  if (!value) return '\u2014';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '\u2014';
  try {
    return new Intl.DateTimeFormat('en-US', { ...DATE_OPTIONS, timeZone: timeZone ?? undefined }).format(date);
  } catch {
    // An unrecognized stored timezone must not break the report.
    return new Intl.DateTimeFormat('en-US', DATE_OPTIONS).format(date);
  }
}

/** Whole nights between two timestamps, never negative. */
export function nightsBetween(checkIn: string, checkOut: string): number {
  return Math.max(0, Math.round((new Date(checkOut).getTime() - new Date(checkIn).getTime()) / 86_400_000));
}

/** "$120.00" from stored cents; '—' when nothing was quoted. Used by the Extras topic (PR 3). */
export function fmtMoneyFromCents(cents: number | null | undefined, currency: string | null | undefined): string {
  if (cents === null || cents === undefined) return '\u2014';
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: (currency ?? 'usd').toUpperCase(),
    }).format(cents / 100);
  } catch {
    return `$${(cents / 100).toFixed(2)}`;
  }
}

/**
 * "Phone ••••1234" — reports only ever render the last four of a guest
 * contact. Full numbers exist nowhere in the database (hash + last4 by
 * design); keep it that way here. Used by the Guest Directory (PR 2).
 */
export function contactLast4Line(contactType: string | null | undefined, last4: string | null | undefined): string {
  if (!last4) return '\u2014';
  return `${contactType === 'email' ? 'Email' : 'Phone'} \u2022\u2022\u2022\u2022${last4}`;
}
