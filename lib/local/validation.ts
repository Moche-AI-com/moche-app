import { z } from 'zod';

export function validCoordinates(lat: unknown, lng: unknown): boolean {
  return typeof lat === 'number' && Number.isFinite(lat) && Math.abs(lat) <= 90
    && typeof lng === 'number' && Number.isFinite(lng) && Math.abs(lng) <= 180;
}

export function safeWebsite(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value.trim());
    return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password ? url.href : null;
  } catch { return null; }
}

export function safePhone(value: string | null | undefined): string | null {
  const phone = value?.replace(/[\s().-]/g, '') ?? '';
  return /^\+?\d{7,15}$/.test(phone) ? `tel:${phone}` : null;
}

const optionalText = (max: number) => z.string().trim().max(max).nullish().transform((v) => v || null);
const coordinate = (max: number) => z.preprocess(
  (value) => value == null || value === '' ? null : typeof value === 'string' ? Number(value) : value,
  z.number().finite().min(-max).max(max).nullable(),
);
const tags = z.preprocess(
  (value) => typeof value === 'string' ? value.split(',').map((t) => t.trim().toLowerCase()).filter(Boolean) : value ?? [],
  z.array(z.string().trim().min(1).max(40)).max(12),
).transform((value) => Array.from(new Set(value)));

/** Only independently authored fields. Mapbox Search Box payloads cannot be saved. */
export const localPlaceSchema = z.object({
  name: z.string().trim().min(1, 'Enter a place name.').max(160),
  category: z.string().trim().min(1).max(80).default('attraction'),
  address: optionalText(500),
  website: optionalText(1000).refine((v) => !v || safeWebsite(v) !== null, 'Use an http or https website without credentials.'),
  phone: optionalText(40).refine((v) => !v || safePhone(v) !== null, 'Enter a valid phone number.'),
  lat: coordinate(90),
  lng: coordinate(180),
  hostNote: optionalText(500),
  tags,
  intentTags: tags,
  isFavorite: z.preprocess((v) => v === 'true' || v === true, z.boolean()),
  status: z.enum(['suggested', 'approved', 'hidden']).default('approved'),
}).strict().refine((v) => (v.lat === null) === (v.lng === null), {
  message: 'Enter both latitude and longitude, or leave both blank.', path: ['lat'],
});

export type LocalPlaceInput = z.infer<typeof localPlaceSchema>;
