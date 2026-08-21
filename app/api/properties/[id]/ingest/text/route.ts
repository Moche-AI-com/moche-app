import { NextResponse } from 'next/server';
import { getPropertyAccess, getSessionContext } from '@/lib/auth/guards';
import { createClient } from '@/lib/supabase/server';
import { ingestTextSchema } from '@/lib/validation';
import { standardizeListing } from '@/lib/ingest/standardize';
import { createAdminClient } from '@/lib/supabase/admin';
import { createProposal } from '@/lib/brain/proposal-store';
import { deepIntake } from '@/lib/onboarding/deep-intake';
import { loadActiveValues } from '@/lib/brain/values';
import { audit } from '@/lib/audit';
import { ensureIngestionSource, recordManualSource } from '@/lib/acquisition/audit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Pasted text is source material only. It always becomes a host-reviewed proposal.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const access = await getPropertyAccess((await params).id);
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
    propertyId: (await params).id, kind: 'manual_site', profile: 'manual_site_v1', label: (title && title.trim()) || 'Pasted notes', createdBy: ctx?.user.id ?? null,
    // A manual source deliberately has no URL or stored document, so it is represented by its artifact only.
    documentId: null,
  });
  // Pasted source text is untrusted reference data; it still gets an auditable artifact.
  await recordManualSource(admin, { propertyId: (await params).id, sourceId, profile: 'manual_site_v1', title: (title && title.trim()) || 'Pasted notes', text, provider: 'manual-text' });

  const finalText = standardize ? (await standardizeListing(text)).text : text;
  const resolvedTitle = (title && title.trim()) || 'Pasted notes';
  const propertyId = (await params).id;

  try {
    // Directive §6: pasted text must be "cleaned, split, and routed" rather than
    // filed as one blob. The previous behaviour created a single
    // `brain.document_summary` proposal holding the entire paste, which is the
    // "single-field dump" the directive names as a non-goal — a host approving it
    // approved 4,000 characters in one click and the concierge got one
    // undifferentiated chunk. `deepIntake` splits by topic and routes each part to
    // the section the registry says it belongs to.
    const deep = await deepIntake(admin, {
      propertyId,
      hostAccountId: access.property.host_account_id,
      actorProfileId: ctx?.user.id ?? '',
      text: finalText,
      sourceType: 'text_paste',
      sourceRef: resolvedTitle,
      existingFieldIds: await answeredFieldIds(admin, propertyId),
    });

    if (!deep.empty) {
      await audit(supabase, {
        action: 'brain.proposal.create',
        actorProfileId: ctx?.user.id,
        hostAccountId: access.property.host_account_id,
        propertyId,
        targetType: 'proposed_update',
        metadata: {
          sourceType: 'text_paste',
          proposals: deep.proposalIds.length,
          conflicts: deep.conflicts.length,
          split: true,
        },
      });
      return NextResponse.json({
        ok: true,
        queued: true,
        proposalIds: deep.proposalIds,
        proposalCount: deep.proposalIds.length,
        conflictCount: deep.conflicts.length,
        title: resolvedTitle,
        message:
          deep.conflicts.length > 0
            ? `We split this into ${deep.proposalIds.length} items to review. ${deep.conflicts.length} disagree with something already saved, so nothing was overwritten.`
            : `We split this into ${deep.proposalIds.length} items for you to review.`,
      });
    }

    // The split pass found nothing usable — most often a paste that is genuinely
    // one narrative block. Keeping the whole text as one reviewable proposal is
    // better than discarding what the host gave us, so the old single-proposal
    // path survives strictly as the fallback rather than as the default.
    const proposal = await createProposal(admin, {
      propertyId,
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
      propertyId,
      targetType: 'proposed_update',
      targetId: proposal.id,
      metadata: { fieldPath: 'brain.document_summary', sourceType: 'text_paste', split: false },
    });
    return NextResponse.json({
      ok: true,
      queued: true,
      proposalId: proposal.id,
      proposalCount: 1,
      conflictCount: 0,
      title: resolvedTitle,
      message: 'We could not split this one up, so it is queued as a single note for you to review.',
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Ingestion failed.';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

/** field_ids already answered, so the split pass can flag contradictions. */
async function answeredFieldIds(
  admin: ReturnType<typeof createAdminClient>,
  propertyId: string,
): Promise<string[]> {
  try {
    return (await loadActiveValues(admin, propertyId)).map((v) => v.fieldId);
  } catch {
    // Only costs the conflict markers; the proposals still land for review.
    return [];
  }
}
