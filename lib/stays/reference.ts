// Alphabet excludes visually ambiguous characters (no 0/O, 1/I/L) so a
// reference read over the phone transcribes cleanly.
const STAY_REFERENCE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

/**
 * Human-quotable stay reference: 'STY-' + 6 random chars, unique across all
 * stays via the stays_stay_reference_key index. Displayable and filterable —
 * unlike the 4-digit visit code, which stays hash-only. Shared by the manual
 * stay action and the iCal importer.
 */
export function generateStayReference(): string {
  const bytes = new Uint8Array(6);
  globalThis.crypto.getRandomValues(bytes);
  let ref = 'STY-';
  for (const b of bytes) ref += STAY_REFERENCE_ALPHABET[b % STAY_REFERENCE_ALPHABET.length];
  return ref;
}
