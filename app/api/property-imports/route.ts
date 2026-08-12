import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getSessionContext } from '@/lib/auth/guards';
import { canCreateProperty } from '@/lib/billing/entitlements';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createImportJob, runPropertyImportJob } from '@/lib/property-import/jobs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// attested is a literal true, not a boolean: a request that omits it or sends
// false fails validation instead of quietly importing without an attestation.
const requestSchema = z.object({ url: z.string().url().max(2000), attested: z.literal(true) }).strict();

export async function POST(request: Request) {
  const ctx = await getSessionContext();
  if (!ctx) return NextResponse.json({ error: 'Sign in to import a listing.' }, { status: 401 });
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'Invalid request.' }, { status: 400 }); }
  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    const message = parsed.error.issues.some((issue) => issue.path[0] === 'attested')
      ? 'Confirm that you own or manage this listing before importing it.'
      : 'Enter a valid public listing URL.';
    return NextResponse.json({ error: message }, { status: 400 });
  }

  const client = createClient();
  const gate = await canCreateProperty(client, ctx.account.id);
  if (!gate.ok) return NextResponse.json({ error: `You've reached your plan's property limit.` }, { status: 403 });
  const { data: job, error } = await createImportJob(client, { hostAccountId: ctx.account.id, createdBy: ctx.user.id, sourceUrl: parsed.data.url });
  if (error || !job) return NextResponse.json({ error: 'Could not start the import. Please try again.' }, { status: 500 });

  // The job exists before any network operation. If the request is interrupted,
  // its durable last state remains visible to the host instead of pretending it completed.
  try {
    const result = await runPropertyImportJob(createAdminClient(), { jobId: job.id, hostAccountId: ctx.account.id, createdBy: ctx.user.id, sourceUrl: parsed.data.url });
    return NextResponse.json({ jobId: job.id, ...result }, { status: result.ok ? 201 : 422 });
  } catch {
    const message = 'The import worker is unavailable. Please try again shortly.';
    await client.from('property_import_jobs').update({ status: 'failed', stage_detail: message, error_reason: 'worker_unavailable', error_message: message, updated_at: new Date().toISOString() }).eq('id', job.id);
    return NextResponse.json({ jobId: job.id, ok: false, error: message }, { status: 503 });
  }
}
