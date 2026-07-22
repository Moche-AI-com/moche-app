import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/database.types';
import { log } from '@/lib/log';

type Client = SupabaseClient<Database>;

// GDPR Art. 20 (portability) + Art. 17 (erasure) tooling.
//
// EXPORT is read-only and safe: it assembles a JSON bundle of the host's own data
// using the AUTHENTICATED user client, so RLS naturally scopes it to what they may
// see. It NEVER includes payment card data (Stripe holds that) — only subscription
// metadata (plan/status/period).
//
// ERASURE preserves records required for legal/tax retention: subscriptions,
// legal_acceptances, and audit_logs are intentionally NOT deleted. The auth user is
// NOT deleted either (that would cascade-delete legal_acceptances); instead the
// profile PII is anonymized and the account is soft-deleted. Guest/property personal
// data is removed (properties cascade to their children per the KG/D1E migrations).

export interface ExportBundle {
  exportedAt: string;
  subjectUserId: string;
  account: unknown;
  profile: unknown;
  subscription: unknown;
  properties: unknown[];
  propertySettings: unknown[];
  brainItems: unknown[];
  recommendations: unknown[];
  propertyContacts: unknown[];
  knowledgeNodes: unknown[];
  legalAcceptances: unknown[];
  notes: string[];
}

// Build a portable JSON export of the signed-in host's data. Uses the user client
// so every read is RLS-scoped to the caller.
export async function buildExportBundle(
  client: Client,
  opts: { userId: string; hostAccountId: string },
): Promise<ExportBundle> {
  const notes: string[] = [
    'This export excludes payment card data, which is held solely by our payment processor (Stripe).',
    'Guest contact details are stored only as irreversible hashes and are represented as such here.',
  ];

  const [profile, account, subscription] = await Promise.all([
    client.from('profiles').select('*').eq('id', opts.userId).maybeSingle(),
    client.from('host_accounts').select('*').eq('id', opts.hostAccountId).maybeSingle(),
    client
      .from('subscriptions')
      .select('plan, status, current_period_end, trial_end, cancel_at_period_end, created_at, updated_at')
      .eq('host_account_id', opts.hostAccountId)
      .maybeSingle(),
  ]);

  const { data: properties } = await client
    .from('properties')
    .select('*')
    .eq('host_account_id', opts.hostAccountId);
  const propertyIds = (properties ?? []).map((p) => p.id);

  const inProps = <T,>(q: T) => q; // readability helper for the .in() calls below
  const [settings, brain, recs, contacts, nodes] = await Promise.all([
    propertyIds.length
      ? client.from('property_settings').select('*').in('property_id', propertyIds)
      : Promise.resolve({ data: [] as unknown[] }),
    propertyIds.length
      ? client.from('brain_items').select('*').in('property_id', propertyIds)
      : Promise.resolve({ data: [] as unknown[] }),
    propertyIds.length
      ? client.from('recommendations').select('*').in('property_id', propertyIds)
      : Promise.resolve({ data: [] as unknown[] }),
    propertyIds.length
      ? client.from('property_contacts').select('*').in('property_id', propertyIds)
      : Promise.resolve({ data: [] as unknown[] }),
    propertyIds.length
      ? client
          .from('property_knowledge_nodes')
          .select('id, property_id, node_type, title, content, created_at')
          .in('property_id', propertyIds)
      : Promise.resolve({ data: [] as unknown[] }),
  ]);
  void inProps;

  // Include the subject's own acceptance history (resilient if the table is absent).
  let acceptances: unknown[] = [];
  try {
    const { data } = await client
      .from('legal_acceptances')
      .select('document_slug, document_version, accepted_at, context')
      .eq('user_id', opts.userId);
    acceptances = data ?? [];
  } catch {
    notes.push('Legal acceptance history was unavailable at export time.');
  }

  return {
    exportedAt: new Date().toISOString(),
    subjectUserId: opts.userId,
    account: account.data ?? null,
    profile: profile.data ?? null,
    subscription: subscription.data ?? null,
    properties: properties ?? [],
    propertySettings: settings.data ?? [],
    brainItems: brain.data ?? [],
    recommendations: recs.data ?? [],
    propertyContacts: contacts.data ?? [],
    knowledgeNodes: nodes.data ?? [],
    legalAcceptances: acceptances,
    notes,
  };
}

export interface DeletionSummary {
  hostAccountId: string;
  properties: number;
  retained: string[];
}

// STEP 1 (request): mark the intent and return a summary of what confirmation will
// erase vs. retain. Non-destructive. Sets profiles.deletion_requested_at (existing
// column) so the request is visible/auditable.
export async function requestDeletion(
  client: Client,
  opts: { userId: string; hostAccountId: string },
): Promise<DeletionSummary> {
  await client
    .from('profiles')
    .update({ deletion_requested_at: new Date().toISOString() })
    .eq('id', opts.userId);

  const { count } = await client
    .from('properties')
    .select('id', { count: 'exact', head: true })
    .eq('host_account_id', opts.hostAccountId);

  return {
    hostAccountId: opts.hostAccountId,
    properties: count ?? 0,
    retained: [
      'Billing records (subscriptions / invoices) — required for tax & accounting law',
      'Legal acceptance records (legal_acceptances) — proof of consent',
      'Audit logs (audit_logs) — security & compliance',
    ],
  };
}

// STEP 2 (confirm): erase personal + property data for the account. Uses the
// SERVICE-ROLE admin client. Preserves billing/legal/audit records. Best-effort +
// logged: a failure on one table does not abort the rest. Deletes children first,
// then properties; anonymizes the profile; soft-deletes the account.
export async function confirmDeletion(
  admin: Client,
  opts: { userId: string; hostAccountId: string },
): Promise<{ ok: boolean; errors: string[] }> {
  const errors: string[] = [];
  const run = async (label: string, fn: () => PromiseLike<{ error: { message: string } | null }>) => {
    try {
      const { error } = await fn();
      if (error) {
        errors.push(`${label}: ${error.message}`);
        log.warn('data_deletion_step_failed', { step: label, error: error.message });
      }
    } catch (e) {
      errors.push(`${label}: ${String(e)}`);
      log.warn('data_deletion_step_threw', { step: label, error: String(e) });
    }
  };

  const { data: props } = await admin
    .from('properties')
    .select('id')
    .eq('host_account_id', opts.hostAccountId);
  const propertyIds = (props ?? []).map((p) => p.id);

  if (propertyIds.length) {
    // Guest-side + brain personal data scoped to the account's properties. Many of
    // these also cascade from properties, but we delete explicitly to be certain.
    await run('stays', () => admin.from('stays').delete().in('property_id', propertyIds));
    await run('guest_identities', () => admin.from('guest_identities').delete().in('property_id', propertyIds));
    await run('property_contacts', () => admin.from('property_contacts').delete().in('property_id', propertyIds));
    await run('recommendations', () => admin.from('recommendations').delete().in('property_id', propertyIds));
    await run('brain_items', () => admin.from('brain_items').delete().in('property_id', propertyIds));
    await run('property_knowledge_nodes', () => admin.from('property_knowledge_nodes').delete().in('property_id', propertyIds));
    // Properties last — remaining children (chunks, conversations, messages, etc.)
    // cascade on delete per the schema.
    await run('properties', () => admin.from('properties').delete().in('id', propertyIds));
  }

  // Anonymize the profile PII in place. We do NOT delete the auth user, because
  // legal_acceptances references auth.users ON DELETE CASCADE and must be retained.
  await run('profile_anonymize', () =>
    admin
      .from('profiles')
      .update({ full_name: null, phone: null, avatar_url: null })
      .eq('id', opts.userId),
  );

  // Soft-delete the account (preserves the subscriptions FK + billing history).
  await run('account_soft_delete', () =>
    admin
      .from('host_accounts')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', opts.hostAccountId),
  );

  return { ok: errors.length === 0, errors };
}
