import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, Json } from '@/lib/database.types';
import { DEFAULT_MODULES } from '@/lib/constants';
import { fetchUrlContent, isSsrfError } from '@/lib/ingest/firecrawl';
import { slugWithSuffix } from '@/lib/slug';
import { IMPORT_ATTESTATION_TEXT } from './attestation';
import { buildListingDraft, detectListingProvider, type ImportedListingDraft } from './extract';
import { jobErrorReason } from './confidence';

type Client = SupabaseClient<Database>;
type ImportJobStatus = Database['public']['Enums']['property_import_job_status'];

export async function createImportJob(client: Client, input: {
  hostAccountId: string;
  createdBy: string;
  sourceUrl: string;
}) {
  const now = new Date().toISOString();
  return client.from('property_import_jobs').insert({
    host_account_id: input.hostAccountId,
    created_by: input.createdBy,
    source_url: input.sourceUrl,
    // The caller only reaches this function after the host checked the box, so the
    // attestation is recorded with the job rather than in a separate table: the
    // provenance and the permission to hold it are the same record.
    ownership_attested_at: now,
    ownership_attested_by: input.createdBy,
    attestation_text: IMPORT_ATTESTATION_TEXT,
    provider: detectListingProvider(input.sourceUrl),
    status: 'queued',
    stage_detail: 'Waiting to read the listing',
  }).select('id').single();
}

async function transition(client: Client, jobId: string, status: ImportJobStatus, detail: string, progress: number, extras: Partial<Database['public']['Tables']['property_import_jobs']['Update']> = {}) {
  const { error } = await client.from('property_import_jobs').update({
    status,
    stage_detail: detail,
    progress_pct: progress,
    updated_at: new Date().toISOString(),
    ...extras,
  }).eq('id', jobId);
  if (error) throw error;
}

function safeError(error: unknown): { reason: string; message: string } {
  if (isSsrfError(error)) return { reason: 'unsafe_url', message: 'That URL is not safe to fetch. Use a public https listing URL.' };
  const message = error instanceof Error ? error.message : 'Could not read that listing.';
  if (/blocking automated|no readable text/i.test(message)) return { reason: 'source_unreadable', message: 'We could not read that listing. You can continue by entering details manually.' };
  return { reason: 'import_failed', message: 'We could not import that listing. Please try again or enter details manually.' };
}

export async function runPropertyImportJob(client: Client, input: { jobId: string; hostAccountId: string; createdBy: string; sourceUrl: string }) {
  try {
    await transition(client, input.jobId, 'acquiring', 'Reading the public listing', 15, { attempts: 1, error_reason: null, error_message: null });
    const page = await fetchUrlContent(input.sourceUrl);
    await client.from('property_import_artifacts').insert({ job_id: input.jobId, kind: 'source_capture', payload: { title: page.title, sourceUrl: page.sourceUrl, text: page.text.slice(0, 100000) } as Json });

    await transition(client, input.jobId, 'extracting', 'Pulling out the details worth keeping', 45);
    const draft = buildListingDraft(page, input.sourceUrl);
    await client.from('property_import_artifacts').insert({ job_id: input.jobId, kind: 'listing_draft', payload: draft as unknown as Json });

    // The confidence gate (§1). A page that yielded nothing trustworthy must not
    // produce a property row: an empty draft named after a cookie banner is worse
    // than no draft, because the host then has to find and delete it. Failing here
    // leaves the host on the intake screen with the three manual paths.
    if (!draft.assessment.usable) {
      await client.from('property_import_jobs').update({
        status: 'failed',
        stage_detail: draft.assessment.reason,
        error_reason: jobErrorReason(draft.assessment.verdict),
        error_message: draft.assessment.reason,
        updated_at: new Date().toISOString(),
      }).eq('id', input.jobId);
      return { ok: false as const, error: draft.assessment.reason, verdict: draft.assessment.verdict };
    }

    await transition(client, input.jobId, 'drafting', 'Creating your draft property', 70);
    const { data: property, error: propertyError } = await client.from('properties').insert({
      host_account_id: input.hostAccountId,
      display_name: draft.listingTitle,
      slug: slugWithSuffix(draft.listingTitle),
      status: 'draft',
    }).select('id').single();
    if (propertyError || !property) throw propertyError ?? new Error('Could not create the draft property.');
    const { error: settingsError } = await client.from('property_settings').insert({ property_id: property.id, modules: DEFAULT_MODULES as unknown as Json });
    if (settingsError) throw settingsError;

    await transition(client, input.jobId, 'awaiting_review', 'Review the imported details before saving them to the Brain', 100, { property_id: property.id });
    // Nothing above wrote a Brain fact. Every extracted field still needs the
    // host's explicit accept on the review screen (Boundary 4).
    return { ok: true as const, propertyId: property.id, draft };
  } catch (error) {
    const failure = safeError(error);
    await client.from('property_import_jobs').update({
      status: 'failed', stage_detail: failure.message, error_reason: failure.reason, error_message: failure.message,
      updated_at: new Date().toISOString(),
    }).eq('id', input.jobId);
    return { ok: false as const, error: failure.message };
  }
}

export function asListingDraft(payload: Json): ImportedListingDraft | null {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null;
  const candidate = payload as unknown as Partial<ImportedListingDraft>;
  if (typeof candidate.listingTitle !== 'string' || !Array.isArray(candidate.reviewGroups) || typeof candidate.sourceUrl !== 'string') return null;
  // Artifacts written before structured extraction existed have no `fields` and no
  // `assessment`. They stay readable: an old job's review page shows its groups
  // and simply offers no structured rows, rather than 404ing.
  return {
    ...candidate,
    fields: Array.isArray(candidate.fields) ? candidate.fields : [],
    assessment: candidate.assessment ?? { verdict: 'usable', usable: true, confidence: 0, anchors: 0, fieldCount: 0, reason: 'Imported before structured extraction was added.' },
  } as ImportedListingDraft;
}
