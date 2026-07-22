import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/database.types';
import { CURRENT_VERSIONS, CLICKWRAP_SLUGS, type LegalSlug } from '@/lib/legal/registry';
import { log } from '@/lib/log';

type Client = SupabaseClient<Database>;
export type AcceptanceContext = 'signup' | 'checkout' | 'dpa' | 'reacceptance';

export interface AcceptanceInput {
  userId: string;
  hostAccountId?: string | null;
  slugs?: LegalSlug[]; // defaults to the clickwrap set (terms + privacy)
  context: AcceptanceContext;
  ip?: string | null;
  userAgent?: string | null;
}

// Records a clickwrap acceptance row per document at its CURRENT version. Best-effort:
// a failure here must never block signup/checkout, so all errors are swallowed +
// logged. The rows are the durable, queryable proof of consent (who, what version,
// when, from where). Requires a client with insert rights (service-role at signup,
// since the user is not yet an authenticated session; user client at checkout).
export async function recordAcceptances(client: Client, input: AcceptanceInput): Promise<void> {
  const slugs = input.slugs ?? CLICKWRAP_SLUGS;
  const rows = slugs.map((slug) => ({
    user_id: input.userId,
    host_account_id: input.hostAccountId ?? null,
    document_slug: slug,
    document_version: CURRENT_VERSIONS[slug],
    context: input.context,
    ip: input.ip ?? null,
    user_agent: input.userAgent ? input.userAgent.slice(0, 1000) : null,
  }));
  try {
    const { error } = await client.from('legal_acceptances').insert(rows as never);
    if (error) log.warn('legal_acceptance_insert_failed', { context: input.context, error: error.message });
  } catch (e) {
    // Table may not exist yet (migration not applied) — do not break the user flow.
    log.warn('legal_acceptance_insert_threw', { context: input.context, error: String(e) });
  }
}

// Returns the clickwrap slugs whose CURRENT version the user has NOT yet accepted.
// Empty array => fully up to date. Resilient: if the acceptances table is missing
// (pre-migration) any error is treated as "cannot determine" => no forced re-accept,
// so the gate never hard-blocks login before the migration is applied.
export async function outstandingReacceptances(client: Client, userId: string): Promise<LegalSlug[]> {
  try {
    const { data, error } = await client
      .from('legal_acceptances')
      .select('document_slug, document_version, accepted_at')
      .eq('user_id', userId)
      .order('accepted_at', { ascending: false });
    if (error) {
      log.warn('legal_reacceptance_query_failed', { error: error.message });
      return [];
    }
    // Latest accepted version per slug (rows are already newest-first).
    const latest = new Map<string, string>();
    for (const r of data ?? []) {
      if (!latest.has(r.document_slug)) latest.set(r.document_slug, r.document_version);
    }
    return CLICKWRAP_SLUGS.filter((slug) => latest.get(slug) !== CURRENT_VERSIONS[slug]);
  } catch (e) {
    log.warn('legal_reacceptance_query_threw', { error: String(e) });
    return [];
  }
}
