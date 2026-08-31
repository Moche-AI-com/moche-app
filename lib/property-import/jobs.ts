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
  "We couldn't read enough from this link. It may be blocked, private, or not a listing page. Try another public listing link, or set up the property manually instead.";

function safeError(error: unknown): { reason: string; message: string } {
  if (isSsrfError(error)) return { reason: 'unsafe_url', message: 'That URL is not safe to fetch. Use a public https listing URL.' };
  if (error instanceof ListingContentUnusableError) return { reason: 'source_unusable', message: UNUSABLE_SOURCE_MESSAGE };
  const message = error instanceof Error ? error.message : 'Could not read that listing.';
  if (/extraction_model_mismatch/.test(message)) {
    return { reason: 'extraction_unavailable', message: 'Our high-reliability import service is temporarily unavailable. Please try again shortly, or set up the property manually.' };
  }
  if (/unusable output/i.test(message)) {
    return { reason: 'extraction_failed', message: "We could not confidently extract this listing's details. Try a different public listing link, or set up the property manually." };
  }
  if (/blocking automated|no readable text/i.test(message)) return { reason: 'source_unreadable', message: 'We could not read that listing. You can continue by entering details manually.' };
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
    const { data: property, error: propertyError } = await client.from('properties').insert({
      host_account_id: input.hostAccountId,
      display_name: draft.listingTitle,
      slug: slugWithSuffix(draft.listingTitle),
      status: 'draft',
    }).select('id').single();
    if (propertyError || !property) throw propertyError ?? new Error('Could not create the draft property.');
    const { error: settingsError } = await client.from('property_settings').insert({ property_id: property.id, modules: DEFAULT_MODULES as unknown as Json });
    if (settingsError) throw settingsError;

    // An imported draft is a billable property like any other, so Stripe has to
    // learn about it here too. Never throws, so a Stripe outage cannot fail an
    // import that already produced the property.
    await syncBillableQuantity(client, input.hostAccountId);

    await transition(client, input.jobId, 'awaiting_review', 'Review the imported details before saving them to the Brain', 100, { property_id: property.id });
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
  return candidate as ImportedListingDraft;
}
