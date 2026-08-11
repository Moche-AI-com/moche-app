import { NextResponse } from 'next/server';
import { getPropertyAccess, getSessionContext } from '@/lib/auth/guards';
import { createClient } from '@/lib/supabase/server';
import { ingestTextSchema } from '@/lib/validation';
import { standardizeListing } from '@/lib/ingest/standardize';
import { createAdminClient } from '@/lib/supabase/admin';
import { createProposal } from '@/lib/brain/proposal-store';
import { audit } from '@/lib/audit';
import { ensureIngestionSource, recordManualSource } from '@/lib/acquisition/audit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Pasted text is source material only. It always becomes a host-reviewed proposal.
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

  const sourceId = await ensureIngestionSource(admin, {
    propertyId: params.id, kind: 'manual_site', profile: 'manual_site_v1', label: (title && title.trim()) || 'Pasted notes', createdBy: ctx?.user.id ?? null,
    // A manual source deliberately has no URL or stored document, so it is represented by its artifact only.
    documentId: null,
  });
  // Pasted source text is untrusted reference data; it still gets an auditable artifact.
  await recordManualSource(admin, { propertyId: params.id, sourceId, profile: 'manual_site_v1', title: (title && title.trim()) || 'Pasted notes', text, provider: 'manual-text' });

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
