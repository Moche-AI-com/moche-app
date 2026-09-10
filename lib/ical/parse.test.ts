import { describe, expect, it } from 'vitest';
import { isCurrentOrFuture, isReservationEvent, parseIcs } from './parse';

const FEED = [
  'BEGIN:VCALENDAR',
  'VERSION:2.0',
  'PRODID:-//Airbnb//EN',
  'BEGIN:VEVENT',
  'DTSTAMP:20260901T000000Z',
  'UID:reservation-1@airbnb.com',
  'DTSTART;VALUE=DATE:20260915',
  'DTEND;VALUE=DATE:20260918',
  'SUMMARY:Reserved',
  'STATUS:CONFIRMED',
  'END:VEVENT',
  'BEGIN:VEVENT',
  'UID:block-1@airbnb.com',
  'DTSTART;VALUE=DATE:20260920',
  'DTEND;VALUE=DATE:20260921',
  'SUMMARY:Not available',
  'END:VEVENT',
  'BEGIN:VEVENT',
  'UID:cancelled-1@airbnb.com',
  'DTSTART;VALUE=DATE:20261001',
  'DTEND;VALUE=DATE:20261003',
  'SUMMARY:Reserved',
  'STATUS:CANCELLED',
  'END:VEVENT',
  'BEGIN:VEVENT',
  'UID:folded-1@vrbo.com',
  'DTSTART:20261010T150000Z',
  'DTEND:20261012T110000Z',
  'SUMMARY:Booking - Jane Doe - family reunion',
  ' at the lake house',
  'END:VEVENT',
  'END:VCALENDAR',
].join('\r\n');

describe('parseIcs', () => {
  it('parses events with uid, summary, status and ISO dates', () => {
    const events = parseIcs(FEED);
    expect(events).toHaveLength(4);
    const first = events[0];
    expect(first.uid).toBe('reservation-1@airbnb.com');
    expect(first.summary).toBe('Reserved');
    expect(first.startDate).toBe('2026-09-15');
    expect(first.endDate).toBe('2026-09-18');
  });

  it('unfolds continuation lines into the parent value', () => {
    const folded = parseIcs(FEED).find((event) => event.uid === 'folded-1@vrbo.com');
    expect(folded?.summary).toBe('Booking - Jane Doe - family reunion at the lake house');
  });

  it('normalizes DATE-TIME values to dates', () => {
    const folded = parseIcs(FEED).find((event) => event.uid === 'folded-1@vrbo.com');
    expect(folded?.startDate).toBe('2026-10-10');
    expect(folded?.endDate).toBe('2026-10-12');
  });

  it('returns nothing for non-calendar text', () => {
    expect(parseIcs('hello world')).toEqual([]);
  });
});

describe('isReservationEvent', () => {
  it('keeps real reservations and drops blocks and cancellations', () => {
    const events = parseIcs(FEED);
    const byUid = new Map(events.map((event) => [event.uid, event]));
    expect(isReservationEvent(byUid.get('reservation-1@airbnb.com')!)).toBe(true);
    expect(isReservationEvent(byUid.get('folded-1@vrbo.com')!)).toBe(true);
    expect(isReservationEvent(byUid.get('block-1@airbnb.com')!)).toBe(false);
    expect(isReservationEvent(byUid.get('cancelled-1@airbnb.com')!)).toBe(false);
  });
});

describe('isCurrentOrFuture', () => {
  it('keeps stays whose checkout day is today or later', () => {
    const events = parseIcs(FEED);
    const reservation = events.find((event) => event.uid === 'reservation-1@airbnb.com')!;
    expect(isCurrentOrFuture(reservation, '2026-09-09')).toBe(true);
    expect(isCurrentOrFuture(reservation, '2026-09-18')).toBe(true);
    expect(isCurrentOrFuture(reservation, '2026-09-19')).toBe(false);
  });
});
