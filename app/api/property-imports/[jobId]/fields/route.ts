import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getPropertyAccess, getSessionContext } from '@/lib/auth/guards';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { asListingDraft } from '@/lib/property-import/jobs';
import { acceptExtractedField } from '@/lib/property-import/accept-field';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// `key` selects a field from the stored artifact. `value` is the host's optional
// edit. There is deliberately no `fieldPath` in the request body: the write
// target is read from the server-side artifact, so no request can point an
// accepted value at a field the extractor never proposed.
const bodySchema = z.object({
  key: z.string().trim().min(1).max(80),
  value: z.string().trim().max(2000).optional(),
}).strict();

export async function POST(request: Request, { params }: { params: Promise<{ jobId: string }> }) {
  const ctx = await getSessionContext();
  if (!ctx) return NextResponse.json({ error: 'Sign in to review this import.' }, { status: 401 });

  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'Invalid request.' }, { status: 400 }); }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: 'Choose a valid detail to save.' }, { status: 400 });

  const client = createClient();
  const { data: job } = await client
    .from('property_import_jobs')
    .select('id, property_id, host_account_id')
    .eq('id', (await params).jobId)
    .maybeSingle();
  if (!job?.property_id) return NextResponse.json({ error: 'This import is not ready for review.' }, { status: 409 });

  const access = await getPropertyAccess(job.property_id);
  if (!access || !access.can.editBrain || access.property.host_account_id !== job.host_account_id) {
    return NextResponse.json({ error: 'You cannot apply this import.' }, { status: 403 });
  }

  const { data: artifact } = await client
    .from('property_import_artifacts')
    .select('payload')
    .eq('job_id', job.id)
    .eq('kind', 'listing_draft')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  const draft = artifact ? asListingDraft(artifact.payload) : null;
  const field = draft?.fields.find((item) => item.key === parsed.data.key) ?? null;
  if (!draft || !field) return NextResponse.json({ error: 'That imported detail is no longer available.' }, { status: 404 });

  const result = await acceptExtractedField(createAdminClient(), {
    propertyId: job.property_id,
    hostAccountId: job.host_account_id,
    actorProfileId: ctx.user.id,
    sourceUrl: draft.sourceUrl,
    field,
    editedValue: parsed.data.value ?? null,
  });
  return NextResponse.json(result, { status: result.ok ? 200 : 422 });
}
