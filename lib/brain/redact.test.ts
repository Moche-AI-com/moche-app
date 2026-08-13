import { describe, expect, it } from 'vitest';
import {
  redactCredentials,
  redactBlocks,
  REDACTION_PLACEHOLDER,
} from './redact';

// The positive cases below are paraphrases of the shapes real host copy takes.
// No production credential appears in this file.

describe('redactCredentials - credentials are removed', () => {
  const leaks: Array<[string, string]> = [
    ['The WiFi password is hunter2 and the router is in the hall closet.', 'hunter2'],
    ['Wi-Fi password: Sunset2024!', 'Sunset2024!'],
    ['wifi pass = beach-house-88', 'beach-house-88'],
    ['The door code is 4821.', '4821'],
    ['Front door keypad code: 90210#', '90210#'],
    ['Gate PIN is 5567', '5567'],
    ['The lock combination is 12-24-36', '12-24-36'],
    ['Network password "GuestNet2024"', 'GuestNet2024'],
    ['password for the wifi is chowder99', 'chowder99'],
    ['code to the gate: 7781', '7781'],
    ['Alarm code is set to 3344', '3344'],
    ['Password: Tr0ubador', 'Tr0ubador'],
    ['passcode 445566', '445566'],
    ['Garage keypad is 8899', '8899'],
  ];

  for (const [input, secret] of leaks) {
    it(`removes the value from: ${input.slice(0, 44)}`, () => {
      const out = redactCredentials(input);
      expect(out.text).not.toContain(secret);
      expect(out.text).toContain(REDACTION_PLACEHOLDER);
      expect(out.redactions.length).toBeGreaterThan(0);
    });
  }

  it('keeps the surrounding prose so the rest of the answer survives', () => {
    const out = redactCredentials('The WiFi password is hunter2 and the router is in the hall closet.');
    expect(out.text).toContain('the router is in the hall closet');
    expect(out.text.toLowerCase()).toContain('wifi password');
  });

  it('redacts every occurrence, not just the first', () => {
    const out = redactCredentials('Door code is 4821. If that fails the gate code is 9911.');
    expect(out.text).not.toContain('4821');
    expect(out.text).not.toContain('9911');
  });
});

describe('redactCredentials - prose is preserved', () => {
  const safe = [
    'The dress code is casual.',
    'Our area code is 617 if you need to call a taxi.',
    'Check-in is at 4pm and checkout is at 11am.',
    'The WiFi password is on the arrival card in the kitchen.',
    'The door code is posted inside the welcome book.',
    'Please follow the code of conduct in the house manual.',
    'The password is case-sensitive.',
    'The wifi network name is BeachHouse_Guest.',
    'The zip code is 02114.',
    'Trash goes out Tuesday night.',
  ];

  for (const input of safe) {
    it(`leaves untouched: ${input.slice(0, 44)}`, () => {
      const out = redactCredentials(input);
      expect(out.text).toBe(input);
      expect(out.redactions).toEqual([]);
    });
  }
});

describe('redactCredentials - properties', () => {
  it('is idempotent', () => {
    const once = redactCredentials('The wifi password is hunter2').text;
    const twice = redactCredentials(once).text;
    expect(twice).toBe(once);
  });

  it('handles empty and whitespace input without throwing', () => {
    expect(redactCredentials('').text).toBe('');
    expect(redactCredentials('   ').text).toBe('   ');
  });

  it('never reports the secret value in the redactions list', () => {
    const out = redactCredentials('The wifi password is hunter2');
    expect(out.redactions.join(' ')).not.toContain('hunter2');
  });

  it('is not confused by repeated calls sharing module-level regexes', () => {
    // A /g RegExp with a stale lastIndex silently skips matches on the second
    // call. This asserts the reset actually happens.
    const first = redactCredentials('The wifi password is aaa111');
    const second = redactCredentials('The wifi password is bbb222');
    expect(first.text).not.toContain('aaa111');
    expect(second.text).not.toContain('bbb222');
  });
});

describe('redactBlocks', () => {
  it('redacts across blocks and reports a single deduped label set', () => {
    const out = redactBlocks([
      'The wifi password is hunter2',
      'Checkout is at 11am',
      'The door code is 4821',
    ]);
    expect(out.blocks[0]).not.toContain('hunter2');
    expect(out.blocks[1]).toBe('Checkout is at 11am');
    expect(out.blocks[2]).not.toContain('4821');
    expect(new Set(out.redactions).size).toBe(out.redactions.length);
  });

  it('reports no redactions for clean input', () => {
    const out = redactBlocks(['Checkout is at 11am', 'Parking is on the street']);
    expect(out.redactions).toEqual([]);
  });
});

// --- Regression: repairing text mangled by the pre-fix lib/ai/redaction.ts ---
//
// `redactCredentials` also runs on ANSWER-CACHE READS, which is the only thing that
// can retroactively clean rows written while lib/ai/redaction.ts was broken. Rules
// 1-3 cannot: the token after the noun is now a `[redacted]` marker, and the prose
// guard correctly refuses to re-redact a bracketed token, so the real credential
// sitting after it survived every pass.
describe('redactCredentials — post-marker leak repair', () => {
  it('removes a credential left stranded after a [redacted] marker', () => {
    const mangled = 'The WiFi: [redacted] network name is CapeHouse-Guest and the password: [redacted] is Dennis2026!';
    const out = redactCredentials(mangled);
    expect(out.text).not.toContain('Dennis2026');
    // The non-secret network name is still answerable.
    expect(out.text).toContain('CapeHouse-Guest');
    expect(out.redactions).toContain('post_marker_leak');
  });

  it('removes a credential stranded after the module\'s own placeholder', () => {
    const out = redactCredentials(`door code: ${REDACTION_PLACEHOLDER} 4821`);
    expect(out.text).not.toContain('4821');
  });

  it('leaves clean text untouched and stays idempotent', () => {
    const once = redactCredentials('The WiFi password is Dennis2026!').text;
    expect(once).not.toContain('Dennis2026');
    expect(redactCredentials(once).text).toBe(once);
  });

  it('does not fire on prose following a marker', () => {
    const out = redactCredentials(`door code: ${REDACTION_PLACEHOLDER} and the key is inside`);
    expect(out.redactions).not.toContain('post_marker_leak');
  });
});
