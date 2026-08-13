// Forward-compatibility shim for the `brain_items.section` column.
//
// supabase-migrations-BRAIN-SECTIONS.sql adds the column, but the agent cannot apply
// migrations (Boundary 1) — they land only when the GitHub Actions pipeline runs after
// review. That leaves a window where this code is deployed and the column is not there
// yet, so the unified Brain manager has to work on both sides of that boundary.
//
// Why a probe rather than just reading the category map: several sections share one
// storage bucket (connectivity, access_security, space_details, and parking all store as
// `core`), so section -> category -> section is lossy. A host who files a Wi-Fi note
// under Connectivity would see it reappear under Space details. Grouping by section is
// only honest once the column can actually hold the section, so we detect that and fall
// back to storage-category grouping until then.
//
// Delete this file and inline `section` once the migration is applied in production.

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/database.types';

type Client = SupabaseClient<Database>;

let cached: boolean | null = null;

/**
 * True when `brain_items.section` exists. Read-only: a `select ... limit 1` that is
 * expected to fail with 42703 before the migration lands. Result is memoised for the
 * lifetime of the server process — the column never disappears once added, and a failed
 * probe is re-checked on the next cold start, which is when a migration would have run.
 */
export async function brainSectionColumnExists(client: Client): Promise<boolean> {
  if (cached !== null) return cached;
  // `section` is not in the generated types until the migration is applied and types are
  // regenerated, so the select list has to be passed untyped.
  const table = client.from('brain_items') as unknown as {
    select: (cols: string) => { limit: (n: number) => Promise<{ error: unknown }> };
  };
  const { error } = await table.select('section').limit(1);
  cached = !error;
  return cached;
}

/** Test seam. Never called in application code. */
export function __resetBrainSectionColumnCache() {
  cached = null;
}
