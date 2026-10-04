import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/database.types';
import { redactCredentials } from '@/lib/brain/redact';
import { WIFI_CONTEXT } from './wifi-instructions';

type Admin = SupabaseClient<Database>;
// Deliberately not registry-driven: adding a host/system/secret field must not
// silently expand guest access. Wi-Fi has its own instruction-only reader.
const FIELDS: Record<string, { label: string; topic: RegExp }> = {};
const groups: [RegExp, Record<string, string>][] = [
  [/\b(check[ -]?in|arrival)\b/i, { checkin_time: 'Check-in time', checkin_flexibility: 'Check-in flexibility' }],
  [/\b(check[ -]?out|departure|leav(?:e|ing))\b/i, { checkout_time: 'Checkout time', checkout_checklist: 'Checkout checklist', late_checkout_policy: 'Late checkout policy' }],
  [/\b(park(?:ing)?|garage|driveway)\b/i, { parking: 'Parking', parking_cost: 'Parking cost', parking_overflow_fallback: 'Overflow parking' }],
  [/\b(quiet|noise)\b/i, { quiet_hours: 'Quiet hours' }],
  [/\b(trash|recycl(?:e|ing)|rubbish|garbage)\b/i, { trash_schedule: 'Trash schedule' }],
  [/\b(pet|pets|dog|cat)\b/i, { pet_policy: 'Pet policy', pet_fee: 'Pet fee' }],
  [/\b(smok(?:e|ing)|vaping)\b/i, { smoking_policy: 'Smoking policy' }],
  [/\b(guest|occupancy|people|visitor)\b/i, { max_occupancy: 'Maximum occupancy', extra_guest_policy: 'Extra guest policy', age_child_policy: 'Children and age policy' }],
  [/\b(pool|swim(?:ming)?)\b/i, { pool_instructions: 'Pool instructions' }],
  [/\b(hot tub|spa)\b/i, { hot_tub_instructions: 'Hot tub instructions' }],
  [/\b(laundry|washer|dryer)\b/i, { laundry_access: 'Laundry access' }],
  [/\b(climate|thermostat|heating|air conditioning)\b/i, { climate_control: 'Climate control' }],
  [/\b(bed|beds|sleep(?:ing)?)\b/i, { bed_configuration: 'Bed configuration' }],
  [/\b(elevator|stairs|floor)\b/i, { elevator_stairs: 'Elevator and stairs', floor_number: 'Floor number' }],
  [/\b(camera|cameras|security)\b/i, { security_camera_disclosure: 'Security camera disclosure' }],
];
for (const [topic, fields] of groups) for (const [id, label] of Object.entries(fields)) FIELDS[id] = { label, topic };

export function isApprovedGuestValue(row: {
  property_id: string; source: string; status: string; audience: string; sensitivity_tier: string;
  verified_at: string | null; verified_by: string | null; ttl_expires_at: string | null; superseded_by?: string | null;
}, propertyId: string, now = Date.now()): boolean {
  const verified = Date.parse(row.verified_at ?? '');
  return row.property_id === propertyId && row.status === 'active' && row.source === 'host_verified'
    && !row.superseded_by && !!row.verified_by && Number.isFinite(verified) && verified <= now
    && ['guest_public', 'guest_prearrival', 'guest_instay'].includes(row.audience)
    && ['public_guest', 'guest_after_verification'].includes(row.sensitivity_tier)
    && (!row.ttl_expires_at || Date.parse(row.ttl_expires_at) > now);
}

function safeText(value: unknown, max = 2400): string | null {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const text = String(value).trim();
  return text && text.length <= max && !redactCredentials(text).redactions.length
    && !/\[(?:redacted|stored securely)/i.test(text) ? text : null;
}

export async function loadApprovedContext(admin: Admin, propertyId: string) {
  // Include retired/expired rows to prevent a legacy note from resurrecting a
  // withdrawn value. Never read secret_ref_or_ciphertext, even for allowlisted IDs.
  const [values, features] = await Promise.all([
    admin.from('brain_values')
      .select('field_id, property_id, value, source, status, audience, sensitivity_tier, verified_at, verified_by, ttl_expires_at, superseded_by')
      .eq('property_id', propertyId).in('field_id', Object.keys(FIELDS)).limit(500),
    admin.from('property_features')
      .select('id, property_id, label, location, notes, guest_access, archived_at, created_by, created_via')
      .eq('property_id', propertyId).limit(500),
  ]);
  if (values.error || features.error || values.data?.length === 500 || features.data?.length === 500) {
    throw new Error('approved_context_unavailable');
  }
  const rows = (values.data ?? []).filter((r) => r.property_id === propertyId && FIELDS[r.field_id]);
  const topics = [...new Set(rows.map((r) => FIELDS[r.field_id].topic))];
  const answerTopics: RegExp[] = [];
  const facts: string[] = [];
  for (const id of Object.keys(FIELDS)) {
    const current = rows.filter((r) => r.field_id === id && isApprovedGuestValue(r, propertyId));
    // Multiple active verified values are an unresolved conflict, not permission
    // to choose whichever Postgres happens to return first.
    if (current.length !== 1) continue;
    const text = safeText(current[0].value);
    if (text) {
      facts.push(`${FIELDS[id].label}: ${text}`);
      answerTopics.push(FIELDS[id].topic);
    }
  }
  const activeFeatures = (features.data ?? []).filter((f) => f.property_id === propertyId
    && f.archived_at === null && !!f.created_by && f.created_via === 'host'
    && ['yes', 'supervised', 'no'].includes(f.guest_access));
  for (const f of activeFeatures) {
    const label = safeText(f.label, 80);
    if (!label) continue;
    const access = f.guest_access === 'yes' ? 'guests may use it'
      : f.guest_access === 'supervised' ? 'only with host approval or supervision' : 'not for guest use';
    facts.push(`${label}: ${access}.${f.guest_access === 'no' ? '' : [
      safeText(f.location, 240), safeText(f.notes, 2000),
    ].filter(Boolean).map((s) => ` ${s}`).join('')}`);
  }
  return {
    text: facts.join('\n'),
    overrides: (text: string) => topics.some((topic) => topic.test(text))
      || (features.data ?? []).some((f) => f.property_id === propertyId && f.label.trim()
        && text.toLowerCase().includes(f.label.toLowerCase())),
    answersTopic: (text: string) => answerTopics.some((topic) => topic.test(text))
      || activeFeatures.some((f) => safeText(f.label, 80) && text.toLowerCase().includes(f.label.toLowerCase())),
    // A linked source cannot restore access to an archived/private/supervised
    // feature. Its current structured restriction is sufficient guest context.
    accessibleFeatureIds: new Set(activeFeatures.filter((f) => f.guest_access === 'yes').map((f) => f.id)),
  };
}

type Source = Pick<Database['public']['Tables']['brain_items']['Row'],
  'id' | 'property_id' | 'title' | 'body' | 'category' | 'visibility' | 'status' | 'deleted_at' | 'created_by' | 'source_type' | 'feature_id'>;
export function isCurrentGuestChunk(source: Source | undefined, propertyId: string, content: string): boolean {
  if (!source || source.property_id !== propertyId || source.visibility !== 'guest'
    || source.status !== 'ready' || source.deleted_at !== null || !source.created_by
    || source.category === 'internal_notes'
    || !['manual_entry', 'host_qa', 'document', 'url', 'clone'].includes(source.source_type)) return false;
  const full = `${source.title}\n\n${source.body ?? ''}`;
  if (WIFI_CONTEXT.test(full) || WIFI_CONTEXT.test(content)) return false;
  const normalized = (s: string) => redactCredentials(s).text.replace(/\s+/g, ' ').trim();
  // Match current host-approved text, not just its ID. Old embeddings can survive
  // failed reindexing, editing and title changes.
  return content.trim().split(/\s+/).length > 1 && normalized(full).includes(normalized(content));
}
