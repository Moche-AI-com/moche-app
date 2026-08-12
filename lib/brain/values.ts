import 'server-only';

// Read side of the brain_values envelope, and the only place completeness gets
// its inputs from.
//
// Before this file existed, computeCompleteness() had no callers: the 65% ship
// threshold and the hard-block list were fully specified, tested, and connected
// to nothing. This is the bridge from stored values to the number the host sees
// and the publish gate reads.

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/database.types';
import {
  REGISTRY_FIELDS,
  computeCompleteness,
  deriveStatus,
  type Completeness,
  type FieldStatus,
  type RegistryField,
} from '@/lib/brain/completeness';

type Admin = SupabaseClient<Database>;

export interface ActiveValue {
  fieldId: string;
  /** Null for secrets: the ref is held, the plaintext is not. */
  value: unknown;
  hasSecretRef: boolean;
  source: string;
  confidence: number;
  verifiedAt: string | null;
  ttlExpiresAt: string | null;
}

const REGISTRY_BY_ID: ReadonlyMap<string, RegistryField> = new Map(
  REGISTRY_FIELDS.map((f) => [f.field_id, f]),
);

/**
 * A value that has passed its TTL is not a value. `wifi_password` carries
 * ttl_days 180 precisely so a stale credential stops counting toward
 * completeness instead of quietly propping up a green score.
 */
function isLive(row: { ttl_expires_at: string | null }, now: Date): boolean {
  if (!row.ttl_expires_at) return true;
  const t = new Date(row.ttl_expires_at).getTime();
  return !Number.isFinite(t) || t > now.getTime();
}

export async function loadActiveValues(
  admin: Admin,
  propertyId: string,
): Promise<ActiveValue[]> {
  const { data, error } = await admin
    .from('brain_values')
    // `value` is included because hosts need to see what they stored.
    // `secret_ref_or_ciphertext` is deliberately reduced to a boolean below and
    // never returned: no caller of this function has a reason to hold a Vault
    // reference, and a ref that never leaves the database cannot leak from a
    // server component's serialized props.
    .select('field_id, value, secret_ref_or_ciphertext, source, confidence, verified_at, ttl_expires_at')
    .eq('property_id', propertyId)
    .eq('status', 'active');
  if (error) throw error;

  const now = new Date();
  return (data ?? [])
    .filter((r) => isLive(r, now))
    .map((r) => ({
      fieldId: r.field_id,
      value: r.value,
      hasSecretRef: r.secret_ref_or_ciphertext !== null,
      source: String(r.source),
      confidence: Number(r.confidence ?? 0),
      verifiedAt: r.verified_at,
      ttlExpiresAt: r.ttl_expires_at,
    }));
}

export async function loadApplicablePredicates(
  admin: Admin,
  propertyId: string,
): Promise<string[]> {
  const { data, error } = await admin
    .from('property_applicability')
    .select('predicate, applies')
    .eq('property_id', propertyId);
  if (error) throw error;
  // `applies = false` is a positive assertion of absence and must not be
  // returned: it means the same thing to the scorer as never having been asked,
  // but storing it lets the UI show the host they already answered.
  return (data ?? []).filter((r) => r.applies).map((r) => r.predicate);
}

/**
 * Field statuses derived from stored values.
 *
 * `partial` comes from the registry's own requires_on_failure contract: a value
 * with no fallback procedure behind it is half-credited, per Amendment 001-A.3.
 */
export function deriveStatuses(values: readonly ActiveValue[]): Record<string, FieldStatus> {
  const present = new Set(values.map((v) => v.fieldId));
  const statuses: Record<string, FieldStatus> = {};
  for (const field of REGISTRY_FIELDS) {
    const fallbackId = field.on_failure_field;
    statuses[field.field_id] = deriveStatus(
      field,
      present.has(field.field_id),
      fallbackId ? present.has(fallbackId) : false,
    );
  }
  return statuses;
}

export interface PropertyCompleteness extends Completeness {
  /** Predicates the host has asserted. Drives which fields are even scored. */
  applicable: string[];
  /** Field ids with a live stored value, for the host-facing detail view. */
  satisfiedFieldIds: string[];
}

export async function loadCompleteness(
  admin: Admin,
  propertyId: string,
): Promise<PropertyCompleteness> {
  const [values, applicable] = await Promise.all([
    loadActiveValues(admin, propertyId),
    loadApplicablePredicates(admin, propertyId),
  ]);
  const statuses = deriveStatuses(values);
  const result = computeCompleteness({ statuses, applicable });
  return {
    ...result,
    applicable,
    satisfiedFieldIds: Object.entries(statuses)
      .filter(([, s]) => s === 'satisfied')
      .map(([id]) => id),
  };
}

export function registryField(fieldId: string): RegistryField | null {
  return REGISTRY_BY_ID.get(fieldId) ?? null;
}
