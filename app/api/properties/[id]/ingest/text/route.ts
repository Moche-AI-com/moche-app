import { NextResponse } from 'next/server';
import { getPropertyAccess, getSessionContext } from '@/lib/auth/guards';
import { createClient } from '@/lib/supabase/server';
import { ingestTextSchema } from '@/lib/validation';
import { standardizeListing } from '@/lib/ingest/standardize';
import { segmentSourceContent } from '@/lib/ingest/segment';
import { createAdminClient } from '@/lib/supabase/admin';
import { createProposal } from '@/lib/brain/proposal-store';
import { autofillBrainFromSegments, isInitialSetup } from '@/lib/brain/setup-autofill';
import { audit } from '@/lib/audit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Paste / typed-text ingestion has the same narrow setup exception as URL and
// document imports. An empty draft Brain receives validated sections directly;
// later imports are proposals so existing guest knowledge remains host-reviewed.
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const access = await getPropertyAccess(params.id);
  if (!access) return NextResponse.json({ error: 'Not found.' }, { status: 404 });
  if (!access.can.editBrain) return NextResponse.json({ error: 'You cannot edit this Brain.' }, { status: 403 });

  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  }
  const parsed = ingestTextSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid input.' }, { status: 400 });
  }
  const { text, title, category, visibility, standardize } = parsed.data;

  const ctx = await getSessionContext();
  const supabase = createClient();
  const admin = createAdminClient();

  if (await isInitialSetup(admin, params.id)) {
    const segmented = await segmentSourceContent(text);
    const result = await autofillBrainFromSegments(admin, {
      propertyId: params.id,
      hostAccountId: access.property.host_account_id,
      actorProfileId: ctx?.user.id ?? null,
      sourceType: 'text_paste',
      segments: segmented.segments,
    });
    const sectionCount = new Set(result.filed.map((item) => item.category)).size;
    return NextResponse.json({
      ok: true,
      autofilled: true,
      created: result.created,
      filed: result.filed,
      message: `Added ${result.created} details to your Brain, sorted into ${sectionCount} sections. Check anything that looks off.`,
    });
  }

  // Later imports remain a single reviewable proposal. The optional
  // standardization is retained from the prior ingestion flow.
  const finalText = standardize ? (await standardizeListing(text)).text : text;
  const resolvedTitle = (title && title.trim()) || 'Pasted notes';

  try {
    const proposal = await createProposal(admin, {
      propertyId: params.id,
      hostAccountId: access.property.host_account_id,
      fieldPath: 'brain.document_summary',
      label: resolvedTitle,
      proposedValue: { title: resolvedTitle, text: finalText, category, visibility },
      sourceType: 'text_paste',
      confidence: standardize ? 0.8 : 0.4,
    });
    if (!proposal.ok) return NextResponse.json({ error: proposal.error }, { status: 500 });
    await audit(supabase, {
      action: 'brain.proposal.create',
      actorProfileId: ctx?.user.id,
      hostAccountId: access.property.host_account_id,
      propertyId: params.id,
      targetType: 'proposed_update',
      targetId: proposal.id,
      metadata: { fieldPath: 'brain.document_summary', sourceType: 'text_paste' },
    });
    return NextResponse.json({
      ok: true,
      queued: true,
      proposalId: proposal.id,
      title: resolvedTitle,
      message: 'Your imported details are ready for you to review.',
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Ingestion failed.';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
