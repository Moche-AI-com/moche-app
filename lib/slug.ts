import { randomBytes } from 'node:crypto';

// URL-safe slug from a display name, with a short random suffix for uniqueness.
export function slugify(input: string): string {
  const base = input
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  return base || 'property';
}

export function slugWithSuffix(input: string): string {
  const suffix = randomBytes(3).toString('hex'); // 6 hex chars
  return `${slugify(input)}-${suffix}`;
}
