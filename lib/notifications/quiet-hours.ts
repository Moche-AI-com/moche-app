// #195 PR 4: quiet hours for non-urgent reminders. Pure, no I/O.
//
// Returns when a held reminder may go out (the next quiet-end in the property's
// time zone), or null when it may go out now. Unknown or invalid time zones
// return null: holding a guest-waiting reminder indefinitely is worse than an
// evening text. Minute precision; on a DST-change night the resume time can be
// off by the DST shift, which is acceptable for a reminder.

export const QUIET_START_HOUR = 21;
export const QUIET_END_HOUR = 8;

export function quietHoursResumeAt(
  timezone: string | null | undefined,
  now: Date,
  startHour: number = QUIET_START_HOUR,
  endHour: number = QUIET_END_HOUR,
): Date | null {
  if (!timezone) return null;
  let hour: number;
  let minute: number;
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(now);
    hour = Number(parts.find((p) => p.type === 'hour')?.value);
    minute = Number(parts.find((p) => p.type === 'minute')?.value);
  } catch {
    return null;
  }
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null;
  const inQuiet = startHour > endHour
    ? hour >= startHour || hour < endHour
    : hour >= startHour && hour < endHour;
  if (!inQuiet) return null;
  const minutesNow = hour * 60 + minute;
  const endMinutes = endHour * 60;
  const wait = endMinutes > minutesNow ? endMinutes - minutesNow : 24 * 60 - minutesNow + endMinutes;
  const resume = new Date(now.getTime() + wait * 60_000);
  resume.setUTCSeconds(0, 0);
  return resume;
}
