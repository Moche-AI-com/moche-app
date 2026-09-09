import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, Json } from '@/lib/database.types';
import type { AIMessage } from '@/lib/ai/provider';
import { DEFAULT_MODULES } from '@/lib/constants';
import { fetchUrlContent, isSsrfError } from '@/lib/ingest/firecrawl';
import { slugWithSuffix } from '@/lib/slug';
import { syncBillableQuantity } from '@/lib/billing/quantity-sync';
import { routedCompletion } from '@/lib/router/modelRouter';
import { serverEnv } from '@/lib/env';
import { IMPORT_ATTESTATION_TEXT } from './attestation';
import { buildPastedPage, PASTED_PROVIDER, PASTED_SOURCE_URL } from './pasted';
import {
  assessFetchedPage,
  buildListingDraft,
  detectListingProvider,
  ListingContentUnusableError,
  type ImportedListingDraft,
} from './extract';

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

// Paste-text-first path (issue #133): same job + attestation record, but the
// source is the host's own pasted listing text, so there is no URL to crawl and
// nothing a platform can block.
export async function createPastedImportJob(client: Client, input: {
  hostAccountId: string;
  createdBy: string;
  pastedText: string;
}) {
  const now = new Date().toISOString();
  return client.from('property_import_jobs').insert({
    host_account_id: input.hostAccountId,
    created_by: input.createdBy,
    source_url: PASTED_SOURCE_URL,
    ownership_attested_at: now,
    ownership_attested_by: input.createdBy,
    attestation_text: IMPORT_ATTESTATION_TEXT,
    provider: PASTED_PROVIDER,
    status: 'queued',
    stage_detail: 'Waiting to read the pasted listing text',
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

const UNUSABLE_SOURCE_MESSAGE =
  "We couldn't read enough from this link. It may be blocked, private, or not a listing page. Try another public listing link, paste the listing text instead, or set up the property manually.";

const UNUSABLE_PASTE_MESSAGE =
  "We couldn't find enough listing detail in that text. Paste the full listing description — amenities, rules, and check-in details — or set up the property manually instead.";

function safeError(error: unknown, source: 'link' | 'paste' = 'link'): { reason: string; message: string } {
  if (isSsrfError(error)) return { reason: 'unsafe_url', message: 'That URL is not safe to fetch. Use a public https listing URL.' };
  if (error instanceof ListingContentUnusableError) {
    return { reason: 'source_unusable', message: source === 'paste' ? UNUSABLE_PASTE_MESSAGE : UNUSABLE_SOURCE_MESSAGE };
  }
  const message = error instanceof Error ? error.message : 'Could not read that listing.';
  if (/extraction_model_mismatch/.test(message)) {
    return { reason: 'extraction_unavailable', message: 'Our high-reliability import service is temporarily unavailable. Please try again shortly, or set up the property manually.' };
  }
  if (/unusable output/i.test(message)) {
    return { reason: 'extraction_failed', message: "We could not confidently extract this listing's details. Try again, or set up the property manually." };
  }
  if (/blocking automated|no readable text/i.test(message)) return { reason: 'source_unreadable', message: 'We could not read that listing. Paste the listing text instead — it always works — or enter details manually.' };
  return { reason: 'import_failed', message: 'We could not import that listing. Please try again or enter details manually.' };
}

/**
 * Runs the extraction messages through the router's high-reliability extraction tier
 * and refuses the result if any other model answered. Onboarding output becomes
 * canonical Brain content after host review, so a silent downgrade to a cheaper
 * model — via in-router fallback or the in-house provider — is a failure here,
 * not a rescue.
 */
async function generateExtraction(messages: AIMessage[]): Promise<string> {
  const result = await routedCompletion(
    messages,
    { temperature: 0.1, maxTokens: 4000 },
    { task: 'extraction' },
  );
  assertExtractionModel(result.model);
  return result.text;
}

function assertExtractionModel(model: string): void {
  // AI_DEV_FALLBACK is a dev-only stub provider and is never enabled in production
  // (isProductionRuntime gates it in lib/ai). Skipping the check keeps local import
  // development possible without a router key.
  if (serverEnv.aiDevFallback) return;
  const bare = (m: string) => m.trim().split(':')[0].split('/').pop() ?? '';
  const expected = serverEnv.openrouterModelExtraction;
  if (!model || (model !== expected && bare(model) !== bare(expected))) {
    throw new Error('extraction_model_mismatch');
  }
}

// An imported draft is a billable property like any other, so Stripe has to learn
// about it here too. syncBillableQuantity never throws, so a Stripe outage cannot
// fail an import that already produced the property.
async function createDraftProperty(client: Client, hostAccountId: string, draft: ImportedListingDraft): Promise<string> {
  const { data: property, error: propertyError } = await client.from('properties').insert({
    host_account_id: hostAccountId,
    display_name: draft.listingTitle,
    slug: slugWithSuffix(draft.listingTitle),
    status: 'draft',
  }).select('id').single();
  if (propertyError || !property) throw propertyError ?? new Error('Could not create the draft property.');
  const { error: settingsError } = await client.from('property_settings').insert({ property_id: property.id, modules: DEFAULT_MODULES as unknown as Json });
  if (settingsError) throw settingsError;
  await syncBillableQuantity(client, hostAccountId);
  return (property as { id: string }).id;
}

async function markFailed(client: Client, jobId: string, error: unknown, source: 'link' | 'paste') {
  const failure = safeError(error, source);
  await client.from('property_import_jobs').update({
    status: 'failed', stage_detail: failure.message, error_reason: failure.reason, error_message: failure.message,
    updated_at: new Date().toISOString(),
  }).eq('id', jobId);
  return { ok: false as const, error: failure.message };
}

export async function runPropertyImportJob(client: Client, input: { jobId: string; hostAccountId: string; createdBy: string; sourceUrl: string }) {
  try {
    await transition(client, input.jobId, 'acquiring', 'Reading the public listing', 15, { attempts: 1, error_reason: null, error_message: null });
    const page = await fetchUrlContent(input.sourceUrl);
    await client.from('property_import_artifacts').insert({ job_id: input.jobId, kind: 'source_capture', payload: { title: page.title, sourceUrl: page.sourceUrl, text: page.text.slice(0, 100000) } as Json });

    // Gate before any model spend: a blocked, thin, or non-listing page fails here
    // with guidance, instead of producing a draft property full of guesses.
    const assessment = assessFetchedPage(page);
    if (!assessment.usable) throw new ListingContentUnusableError(assessment.reason);

    await transition(client, input.jobId, 'extracting', 'Analyzing the listing with AI', 45);
    const draft = await buildListingDraft(page, input.sourceUrl, generateExtraction);
    await client.from('property_import_artifacts').insert({ job_id: input.jobId, kind: 'listing_draft', payload: draft as unknown as Json });

    await transition(client, input.jobId, 'drafting', 'Creating your draft property', 70);
    const propertyId = await createDraftProperty(client, input.hostAccountId, draft);

    await transition(client, input.jobId, 'awaiting_review', 'Review the imported details before saving them to the Brain', 100, { property_id: propertyId });
    return { ok: true as const, propertyId, draft };
  } catch (error) {
    return markFailed(client, input.jobId, error, 'link');
  }
}

/**
 * The paste-text runner (issue #133). Identical pipeline to the crawl minus the
 * fetch: nothing a platform can block, no SSRF surface, no Firecrawl dependency.
 * The pasted text is still gated for sufficiency and still lands in the host
 * review queue before anything touches the Brain.
 */
export async function runPastedTextImportJob(client: Client, input: { jobId: string; hostAccountId: string; pastedText: string }) {
  try {
    await transition(client, input.jobId, 'acquiring', 'Reading the pasted listing text', 15, { attempts: 1, error_reason: null, error_message: null });
    const page = buildPastedPage(input.pastedText);
    await client.from('property_import_artifacts').insert({ job_id: input.jobId, kind: 'source_capture', payload: { title: page.title, sourceUrl: page.sourceUrl, text: page.text.slice(0, 100000) } as Json });

    const assessment = assessFetchedPage(page);
    if (!assessment.usable) throw new ListingContentUnusableError(assessment.reason);

    await transition(client, input.jobId, 'extracting', 'Analyzing the pasted text with AI', 45);
    const draft = await buildListingDraft(page, PASTED_SOURCE_URL, generateExtraction);
    // Honest provenance: there is no platform host to name on the paste path.
    draft.provider = PASTED_PROVIDER;
    for (const group of draft.reviewGroups) group.title = `${group.label} from pasted text`.slice(0, 200);
    await client.from('property_import_artifacts').insert({ job_id: input.jobId, kind: 'listing_draft', payload: draft as unknown as Json });

    await transition(client, input.jobId, 'drafting', 'Creating your draft property', 70);
    const propertyId = await createDraftProperty(client, input.hostAccountId, draft);

    await transition(client, input.jobId, 'awaiting_review', 'Review the imported details before saving them to the Brain', 100, { property_id: propertyId });
    return { ok: true as const, propertyId, draft };
  } catch (error) {
    return markFailed(client, input.jobId, error, 'paste');
  }
}

export function asListingDraft(payload: Json): ImportedListingDraft | null {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null;
  const candidate = payload as unknown as Partial<ImportedListingDraft>;
  if (typeof candidate.listingTitle !== 'string' || !Array.isArray(candidate.reviewGroups) || typeof candidate.sourceUrl !== 'string') return null;
  return candidate as ImportedListingDraft;
}
