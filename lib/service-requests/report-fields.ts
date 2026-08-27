// Shared vocabulary + builders for the service-report surfaces: the printable
// sheet, the Edit Report dialog, and the Email/Text compose view all read these
// so a field can never be editable in one place and missing in another.

// service_type enum (supabase/schema.sql): 'information' exists in the DB for
// historical rows but is excluded from the editor — new reports are triaged
// into one of the five working types.
export const SERVICE_TYPE_OPTIONS = [
  { value: 'maintenance', label: 'Maintenance' },
  { value: 'cleaning', label: 'Cleaning' },
  { value: 'safety', label: 'Safety' },
  { value: 'emergency', label: 'Emergency' },
  { value: 'other', label: 'Other' },
] as const;

// urgency_level enum (supabase/schema.sql).
export const URGENCY_OPTIONS = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
  { value: 'critical', label: 'Critical' },
] as const;

// One-per-line text <-> string[] for the list fields (likely causes, suggested
// parts, safety flags). Stored jsonb may also be a plain string for very old
// rows; toLines covers both, mirroring toList() on the report page.
export function toLines(value: unknown): string {
  if (Array.isArray(value)) return value.filter((v): v is string => typeof v === 'string' && v.trim() !== '').join('\n');
  if (typeof value === 'string') return value;
  return '';
}

export function fromLines(text: string): string[] {
  return text.split('\n').map((l) => l.trim()).filter(Boolean);
}

// The copy the Email / Text compose view opens with. The subject reuses the
// ticket's (edited) headline; the host can edit before sending.
export interface PrefillInput {
  propertyName: string;
  serviceType: string;
  summary: string | null;
}

export function emailSubjectPrefill(input: PrefillInput): string {
  const type = input.serviceType.replace(/_/g, ' ');
  const headline = (input.summary ?? '').trim();
  return headline
    ? `Service report — ${type} at ${input.propertyName}: ${headline}`.slice(0, 200)
    : `Service report — ${type} at ${input.propertyName}`;
}

export function smsMessagePrefill(input: PrefillInput): string {
  const headline = (input.summary ?? '').trim() || `${input.serviceType.replace(/_/g, ' ')} request`;
  return `Moche-AI service report — ${input.propertyName}: ${headline}. Full report follows up through the contact on file. Reply STOP to opt out.`;
}
