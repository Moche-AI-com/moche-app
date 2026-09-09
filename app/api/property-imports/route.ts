import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getSessionContext } from '@/lib/auth/guards';
import { canCreateProperty } from '@/lib/billing/entitlements';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createImportJob, runPropertyImportJob, createPastedImportJob, runPastedTextImportJob } from '@/lib/property-import/jobs';
import { MAX_PASTED_TEXT, MIN_PASTED_TEXT } from '@/lib/property-import/pasted';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// attested is a literal true, not a boolean: a request that omits it or sends
// false fails validation instead of quietly importing without an attestation.
// Two shapes (issue #133): a public listing URL (best-effort crawl) OR the
// listing text pasted by the host (the reliable, platform-proof path).
const urlSchema = z.object({ url: z.string().url().max(2000), attested: z.literal(true) }).strict();
const pasteSchema = z.object({ text: z.string().min(MIN_PASTED_TEXT).max(MAX_PASTED_TEXT), attested: z.literal(true) }).strict();
const requestSchema = z.union([urlSchema, pasteSchema]);

async function failJob(client: ReturnType<typeof createClient>, jobId: string) {
  const message = 'The import worker is unavailable. Please try again shortly.';
  await client.from('property_import_jobs').update({ status: 'failed', stage_detail: message, error_reason: 'worker_unavailable', error_message: message, updated_at: new Date().toISOString() }).eq('id', jobId);
  return NextResponse.json({ jobId, ok: false, error: message }, { status: 503 });
}

export async function POST(request: Request) {
  const ctx = await getSessionContext();
  if (!ctx) return NextResponse.json({ error: 'Sign in to import a listing.' }, { status: 401 });
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'Invalid request.' }, { status: 400 }); }
  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    const message = parsed.error.issues.some((issue) => issue.path[0] === 'attested')
      ? 'Confirm that you own or manage this listing before importing it.'
      : 'Paste a valid public listing URL or the full listing text.';
    return NextResponse.json({ error: message }, { status: 400 });
  }

  const client = createClient();
  const gate = await canCreateProperty(client, ctx.account.id);
  if (!gate.ok) return NextResponse.json({ error: `You've reached your plan's property limit.` }, { status: 403 });

  // Paste-text path: no fetch, no crawl — the host's own listing text.
  if ('text' in parsed.data) {
    const { data: job, error } = await createPastedImportJob(client, { hostAccountId: ctx.account.id, createdBy: ctx.user.id, pastedText: parsed.data.text });
    if (error || !job) return NextResponse.json({ error: 'Could not start the import. Please try again.' }, { status: 500 });
    try {
      const result = await runPastedTextImportJob(createAdminClient(), { jobId: job.id, hostAccountId: ctx.account.id, pastedText: parsed.data.text });
      return NextResponse.json({ jobId: job.id, ...result }, { status: result.ok ? 201 : 422 });
    } catch {
      return failJob(client, job.id);
    }
  }

  const { data: job, error } = await createImportJob(client, { hostAccountId: ctx.account.id, createdBy: ctx.user.id, sourceUrl: parsed.data.url });
  if (error || !job) return NextResponse.json({ error: 'Could not start the import. Please try again.' }, { status: 500 });

  // The job exists before any network operation. If the request is interrupted,
  // its durable last state remains visible to the host instead of pretending it completed.
  try {
    const result = await runPropertyImportJob(createAdminClient(), { jobId: job.id, hostAccountId: ctx.account.id, createdBy: ctx.user.id, sourceUrl: parsed.data.url });
    return NextResponse.json({ jobId: job.id, ...result }, { status: result.ok ? 201 : 422 });
  } catch {
    return failJob(client, job.id);
  }
}
