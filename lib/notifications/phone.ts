/**
 * Normalizes a phone number to E.164.
 * - International input must start with + (spaces, dots, dashes, parentheses are removed).
 * - US/NANP convenience: a bare 10-digit number (or 11 digits with a leading 1) is treated as +1,
 *   so hosts and guests don't have to type +1. Only valid geographic NANP numbers qualify:
 *   area code and exchange start with 2-9, and N11 / N00 service codes (411, 911, 500, 800, ...)
 *   are excluded because they are not ordinary mobile numbers. Those, and every non-US number,
 *   still require an explicit +country code. No other country code is ever guessed.
 */
const NANP_NATIONAL = /^[2-9]\d{2}[2-9]\d{6}$/;

export function normalizeSmsPhone(raw: string): string | null {
  const text = raw.trim();
  if (/^\+[\d\s().-]+$/.test(text)) {
    const value = text.replace(/[\s().-]/g, '');
    return /^\+[1-9]\d{7,14}$/.test(value) ? value : null;
  }
  if (!/^[\d\s().-]+$/.test(text)) return null;
  const digits = text.replace(/[\s().-]/g, '');
  const national = digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits;
  if (!NANP_NATIONAL.test(national)) return null;
  const area = national.slice(0, 3);
  if (area.endsWith('11') || area.endsWith('00')) return null;
  return `+1${national}`;
}
