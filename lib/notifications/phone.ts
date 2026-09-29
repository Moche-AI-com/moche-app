/**
 * Normalizes a phone number to E.164.
 * - International input must start with + (formatting such as spaces, dots, dashes, parentheses is removed).
 * - US/NANP convenience: a bare 10-digit number (or 11 digits with a leading 1) is treated as +1,
 *   but only when the area code and exchange are valid NANP (first digit 2-9), so hosts and guests
 *   don't have to type +1. Anything else without a + is rejected; no other country code is guessed.
 */
export function normalizeSmsPhone(raw: string): string | null {
  const text = raw.trim();
  if (/^\+[\d\s().-]+$/.test(text)) {
    const value = text.replace(/[\s().-]/g, '');
    return /^\+[1-9]\d{7,14}$/.test(value) ? value : null;
  }
  if (!/^[\d\s().-]+$/.test(text)) return null;
  const digits = text.replace(/[\s().-]/g, '');
  const national = digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits;
  return /^[2-9]\d{2}[2-9]\d{6}$/.test(national) ? `+1${national}` : null;
}
