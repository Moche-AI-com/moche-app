import { describe, it, expect } from 'vitest';
import { extractCandidates, type LegacyNote } from './legacy-migration';
import { REGISTRY_FIELDS } from './completeness';
import { isRegistryProposable, BRAIN_VALUE_PREFIX } from './proposals';

function note(title: string, body: string, id = 'n1'): LegacyNote {
  return { id, title, body };
}

function byField(notes: LegacyNote[]) {
  return new Map(extractCandidates(notes).map((c) => [c.fieldId, c]));
}

describe('extractCandidates — real corpus strings', () => {
  it('reads a checkout time out of a host sentence', () => {
    const got = byField([
      note(
        'What time is check-out?',
        'Check out is 11 am of your checkout date, this is so we give our cleaners enough time.',
      ),
    ]);
    expect(got.get('checkout_time')?.value).toBe('11:00');
  });

  it('normalises an afternoon check-in to 24-hour time', () => {
    const got = byField([note('Check-in', 'Check-in is any time after 4:00 PM.')]);
    expect(got.get('checkin_time')?.value).toBe('16:00');
  });

  it('handles the "Checking in anytime after 11:00 am" phrasing', () => {
    const got = byField([note('Check-in/out', 'Checking in anytime after 11:00 am')]);
    expect(got.get('checkin_time')?.value).toBe('11:00');
  });

  it('refuses a bare morning hour as a check-in time', () => {
    // "after 4" almost certainly means 16:00, but a wrong check-in time locks a
    // guest out, so ambiguity is dropped rather than guessed.
    const got = byField([note('Check-in', 'Check in is after 4')]);
    expect(got.has('checkin_time')).toBe(false);
  });

  it('captures a network name without the password beside it', () => {
    const got = byField([
      note("What's the WiFi password?", 'The WiFi network is CapeHouse-Guest and the password is Dennis2026!'),
    ]);
    const wifi = got.get('wifi_network_name');
    expect(wifi?.value).toBe('CapeHouse-Guest');
    expect(wifi?.value).not.toContain('Dennis2026');
  });

  it('captures the network from "Wifi Name = X / Pass Word = Y" notes', () => {
    const got = byField([note('WiFI', 'Wifi Name = John Mundia\r\nPass Word = Johnnell2026')]);
    expect(got.get('wifi_network_name')?.value).toBe('John Mundia');
  });

  it('proposes nothing from a note that is only a bare credential', () => {
    // "Capehouse40 / Is the password" names no network and states no policy. The
    // right outcome is silence: the password itself must be entered through the
    // secret path, and there is nothing else here to propose.
    const got = byField([note('WiFi', 'Capehouse40\r\nIs the password')]);
    expect(got.get('wifi_network_name')).toBeUndefined();
  });
});

describe('extractCandidates — safety invariants', () => {
  it('never proposes a secret-typed field', () => {
    // The whole corpus at once, including every credential-shaped note.
    const notes: LegacyNote[] = [
      note('WiFi', 'The WiFi network is CapeHouse-Guest and the password is Dennis2026!', 'a'),
      note('Entry', 'The door code is 4821. Keypad on the front door.', 'b'),
      note('WiFI', 'Wifi Name = John Mundia\r\nPass Word = Johnnell2026', 'c'),
    ];
    const secretIds = new Set(
      REGISTRY_FIELDS.filter((f) => f.type === 'secret').map((f) => f.field_id),
    );
    expect(secretIds.size).toBeGreaterThan(0);
    for (const c of extractCandidates(notes)) {
      expect(secretIds.has(c.fieldId), `${c.fieldId} is a secret`).toBe(false);
    }
  });

  it('never emits a value containing a captured credential', () => {
    const notes = [
      note('WiFi', 'The WiFi network is CapeHouse-Guest and the password is Dennis2026!', 'a'),
      note('Entry', 'Door code 4821, then turn the handle.', 'b'),
    ];
    for (const c of extractCandidates(notes)) {
      expect(c.value).not.toContain('Dennis2026');
      expect(c.value).not.toContain('4821');
    }
  });

  it('only targets fields the registry considers proposable', () => {
    const notes = [note('Everything', 'Check out is 11 am. No smoking. Quiet hours are 10pm to 8am. Sleeps 8.')];
    for (const c of extractCandidates(notes)) {
      const field = REGISTRY_FIELDS.find((f) => f.field_id === c.fieldId);
      expect(field, c.fieldId).toBeDefined();
      expect(isRegistryProposable(field!), c.fieldId).toBe(true);
      expect(c.fieldPath).toBe(`${BRAIN_VALUE_PREFIX}${c.fieldId}`);
    }
  });

  it('keeps confidence below certainty so the host still decides', () => {
    const notes = [note('Rules', 'No smoking. Quiet hours are 10pm to 8am.')];
    const got = extractCandidates(notes);
    expect(got.length).toBeGreaterThan(0);
    for (const c of got) {
      expect(c.confidence).toBeGreaterThan(0);
      expect(c.confidence).toBeLessThan(1);
    }
  });

  it('proposes each field at most once across many notes', () => {
    const notes = [
      note('A', 'Check out is 11 am', 'a'),
      note('B', 'Check-out is 10:00 am', 'b'),
      note('C', 'checkout time is 11am', 'c'),
    ];
    const got = extractCandidates(notes);
    expect(got.filter((c) => c.fieldId === 'checkout_time').length).toBe(1);
  });

  it('records which note each proposal came from', () => {
    const got = byField([note('Rules', 'No pets allowed in the house.', 'note-42')]);
    expect(got.get('pet_policy')?.sourceItemId).toBe('note-42');
  });

  it('finds nothing in notes that say nothing', () => {
    expect(extractCandidates([note('TEST', 'TESTER'), note('TESTTINGG', 'YES TO IT ALL')])).toEqual([]);
  });

  it('caps proposed values so a whole pasted listing cannot become one answer', () => {
    const got = extractCandidates([note('Listing', `Trash pickup ${'x'.repeat(5000)}`)]);
    for (const c of got) expect(c.value.length).toBeLessThanOrEqual(400);
  });
});
