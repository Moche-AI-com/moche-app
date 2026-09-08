/** E.164 only; formatting may be removed, a missing country code is never guessed. */
export function normalizeSmsPhone(raw: string): string | null {
  const text = raw.trim();
  if (!/^\+[\d\s().-]+$/.test(text)) return null;
  const value = text.replace(/[\s().-]/g, '');
  return /^\+[1-9]\d{7,14}$/.test(value) ? value : null;
}
