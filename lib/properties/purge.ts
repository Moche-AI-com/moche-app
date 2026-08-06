import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/database.types';
import { createAdminClient, hasServiceRole } from '@/lib/supabase/admin';
import { log } from '@/lib/log';

type Client = SupabaseClient<Database>;

/**
 * Re-exported so server callers can pull the purge routine and its confirmation
 * gate from one place. The definitions live in `./delete-confirmation` because
 * the confirmation dialog is a client component and cannot import this module.
 */
export { DELETE_CONFIRMATION_WORD, isDeleteConfirmed } from './delete-confirmation';


/** The storage bucket holding host-uploaded property documents. */
const DOCUMENTS_BUCKET = 'property-documents';

/**
 * Supabase caps a single storage `remove()` call, and a property with a long
 * document history can exceed it. Chunked so a large purge still completes
 * instead of silently dropping the tail of the list.
 */
const STORAGE_REMOVE_BATCH = 100;

/**
 * Tables wiped by a permanent delete, in dependency-safe order.
 *
 * ## Why an explicit list instead of `delete from properties`
 *
 * Every one of these tables cascades from `properties.id`, so a single row
 * delete would clear them all — and that is exactly what we must NOT do. A
 * permanent delete keeps the host's *reports*: the archived service reports,
 * completed extras, and past stays they may need for a contractor dispute, an
 * owner statement, or their taxes. Those three tables cascade too, so deleting
 * the property row would take them with it.
 *
 * So the property row survives as a stripped tombstone (see `TOMBSTONE_FIELDS`)
 * and we delete the operational data explicitly. The cost is that this list has
 * to be maintained when a table is added; `purge.test.ts` asserts it against the
 * live foreign-key set so a newly added table fails the suite instead of
 * silently surviving a purge.
 *
 * ## Order
 *
 * Children before parents. Most of these also cascade from each other
 * (messages from conversations, document_chunks from documents), so the order is
 * belt-and-braces rather than strictly required — but a partial failure part-way
 * through should leave orphans, not foreign-key errors that abort the rest.
 */
const PURGED_TABLES = [
  // Guest conversation surface.
  'message_feedback',
  'messages',
  'conversations',
  'answer_cache',
  // Guest access and identity.
  'guest_access_sessions',
  'guest_access_links',
  'guest_verifications',
  'guest_identities',
  'guest_extras',
  // Knowledge base and everything derived from it.
  'document_chunks',
  'documents',
  'property_knowledge_nodes',
  'property_brain_versions',
  'proposed_updates',
  'brain_items',
  'ingestion_jobs',
  // Local recommendations.
  'recommendations',
  'nearby_places',
  // Operational state that is not a report.
  'escalations',
  'notifications',
  'property_contacts',
  'property_members',
  'property_settings',
] as const satisfies readonly (keyof Database['public']['Tables'])[];

/**
 * Tables a permanent delete deliberately LEAVES ALONE.
 *
 * `service_requests`, `extras_orders`, and `stays` are the three sources Reports
 * is built from — retaining them is the whole reason this is a scoped purge
 * rather than a row delete.
 *
 * `audit_logs`, `ai_usage`, and `product_feedback` reference the property with
 * `on delete set null` and are not ours to erase: the audit trail must outlive
 * the thing it describes (otherwise "who deleted this property" is the one
 * record the delete destroys), metered usage backs invoices that must not be
 * retroactively rewritten, and product feedback was never really about the
 * property.
 *
 * Exported so the test suite can assert that PURGED_TABLES ∪ RETAINED_TABLES
 * covers every table that references `properties`.
 */
export const RETAINED_TABLES = [
  'service_requests',
  'extras_orders',
  'stays',
  'audit_logs',
  'ai_usage',
  'product_feedback',
] as const satisfies readonly (keyof Database['public']['Tables'])[];

export { PURGED_TABLES };

export interface PurgeResult {
  /** True when the property was stripped to a tombstone and its data removed. */
  purged: boolean;
  /** Number of stored files removed from the documents bucket. */
  filesRemoved: number;
  /**
   * Non-fatal problems encountered along the way — a table that refused to
   * delete, or orphaned storage objects. Surfaced so they can be logged rather
   * than swallowed: a purge that left data behind is something we want to know
   * about even though it must not block the host.
   */
  warnings: string[];
}

/**
 * Permanently erases a property's data while preserving its reports.
 *
 * This replaced a soft delete that only set `deleted_at`. That was the wrong
 * contract for an action labelled "delete for good": the property vanished from
 * the dashboard while every guest conversation, street address, door code, and
 * uploaded document stayed in the database indefinitely.
 *
 * What happens, in order:
 *
 *   1. The property row is stripped to a tombstone and marked deleted. This runs
 *      FIRST so the host's next page load already shows it gone, even if a later
 *      step fails. Identifying and location fields are nulled here — the address
 *      and branding are the data a host most reasonably expects to be erased —
 *      while `display_name` is kept so their retained reports still say which
 *      property they belong to instead of "Property".
 *   2. Every operational table is deleted (see `PURGED_TABLES`).
 *   3. Document blobs are removed from storage, which Postgres cascade cannot
 *      reach. Paths are collected BEFORE step 2, because afterwards the rows
 *      holding them are gone and the blobs would be unreachable forever.
 *
 * Storage is cleaned last on purpose. If storage removal fails we have leaked
 * bytes, which a sweeper can fix; if we had destroyed the files first and the
 * database work then failed, the host would be left with a live property whose
 * documents 404. Leaking is the better failure.
 *
 * Runs through the service-role client where available: the purge touches
 * guest-side tables that a host's RLS role has no delete policy on, so a
 * host-scoped client would fail partway through. Callers MUST authorise the host
 * before calling — this function performs no permission checks of its own.
 */
export async function purgeProperty(client: Client, propertyId: string): Promise<PurgeResult> {
  const db = hasServiceRole() ? createAdminClient() : client;
  const warnings: string[] = [];

  // Collected first: after the document rows are deleted the storage paths are
  // unrecoverable.
  const storagePaths = await collectDocumentPaths(db, propertyId, warnings);

  const tombstoned = await writeTombstone(db, propertyId);
  if (!tombstoned) {
    log.error('property_purge_failed', { propertyId, stage: 'tombstone' });
    return { purged: false, filesRemoved: 0, warnings };
  }

  for (const table of PURGED_TABLES) {
    // `from(table)` is typed against the generated Database type, so a table
    // name that no longer exists is a compile error rather than a silent no-op.
    const { error } = await db.from(table).delete().eq('property_id', propertyId);
    if (error) warnings.push(`could not purge ${table}: ${error.message}`);
  }

  const filesRemoved = await removeStorageObjects(db, storagePaths, warnings);

  log.info('property_purged', { propertyId, filesRemoved, warnings: warnings.length });
  return { purged: true, filesRemoved, warnings };
}

/**
 * Strips the property row of everything but what Reports needs to label a
 * retained record, and marks it deleted so no dashboard query returns it.
 */
async function writeTombstone(db: Client, propertyId: string): Promise<boolean> {
  const now = new Date().toISOString();
  const { error } = await db
    .from('properties')
    .update({
      status: 'archived',
      deleted_at: now,
      purged_at: now,
      archived_at: null,
      // Location, contact surface, and branding are erased. `display_name` and
      // `slug` stay: the name labels retained reports, and the slug is a unique
      // key we cannot null without risking a collision on a future property.
      address_line1: null,
      address_line2: null,
      city: null,
      region: null,
      postal_code: null,
      country: null,
      lat: null,
      lng: null,
      cover_image_url: null,
      logo_url: null,
      published_at: null,
      updated_at: now,
    })
    .eq('id', propertyId);

  if (error) {
    log.error('property_tombstone_failed', { propertyId, error: error.message });
    return false;
  }
  return true;
}

/**
 * Reads every document storage path for a property, including soft-deleted
 * rows. A document the host soft-deleted earlier still has its bytes sitting in
 * the bucket, and a permanent delete that left those behind would not be
 * permanent.
 */
async function collectDocumentPaths(db: Client, propertyId: string, warnings: string[]): Promise<string[]> {
  const { data, error } = await db.from('documents').select('storage_path').eq('property_id', propertyId);

  if (error) {
    // Not fatal. Losing the file list means we leak blobs, which is far better
    // than refusing to erase the host's database records over it.
    warnings.push(`could not list documents for storage cleanup: ${error.message}`);
    return [];
  }

  return (data ?? [])
    .map((row) => row.storage_path)
    .filter((path): path is string => typeof path === 'string' && path.length > 0);
}

/** Removes storage objects in bounded batches, tolerating partial failure. */
async function removeStorageObjects(db: Client, paths: string[], warnings: string[]): Promise<number> {
  if (paths.length === 0) return 0;

  let removed = 0;
  for (let i = 0; i < paths.length; i += STORAGE_REMOVE_BATCH) {
    const batch = paths.slice(i, i + STORAGE_REMOVE_BATCH);
    const { data, error } = await db.storage.from(DOCUMENTS_BUCKET).remove(batch);
    if (error) {
      warnings.push(`storage cleanup failed for ${batch.length} file(s): ${error.message}`);
      continue;
    }
    removed += data?.length ?? batch.length;
  }
  return removed;
}
