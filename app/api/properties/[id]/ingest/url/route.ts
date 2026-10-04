import { NextResponse } from 'next/server';
import { getPropertyAccess } from '@/lib/auth/guards';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getSessionContext } from '@/lib/auth/guards';
import { ingestUrlSchema } from '@/lib/validation';
import { acquire, AcquisitionError } from '@/lib/acquisition';
import { acquisitionAuditContext, ensureIngestionSource } from '@/lib/acquisition/audit';
import { standardizeKnowledge } from '@/lib/ingest/standardize';
import { knowledgeSourcePolicy, knowledgeReviewMessage } from '@/lib/ingest/source-policy';
import { createProposal } from '@/lib/brain/proposal-store';
import { audit } from '@/lib/audit';
import { log } from '@/lib/log';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** URL content is untrusted reference data and always becomes a host-reviewed proposal. */
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
  const parsed = ingestUrlSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid input.' }, { status: 400 });
  }
  const { url, title, category, visibility } = parsed.data;
  const sourcePolicy = knowledgeSourcePolicy(category);

  const ctx = await getSessionContext();
  const supabase = createClient();
  const admin = createAdminClient();
  const sourceId = await ensureIngestionSource(admin, {
    propertyId: (await params).id, ...sourcePolicy, url,
    label: title?.trim() || new URL(url).hostname, createdBy: ctx?.user.id ?? null,
  });

  // Fetch through the SSRF-guarded provider-neutral boundary. Each attempt is
  // recorded as untrusted reference data before any standardization occurs.
  let page;
  try {
    page = await acquire(url, sourcePolicy.profile, acquisitionAuditContext(admin, {
      propertyId: (await params).id, sourceId, profile: sourcePolicy.profile,
    }));
  } catch (e) {
    if (e instanceof AcquisitionError && e.reason === 'unsafe_target') {
      log.warn('ingest_url_blocked', { propertyId: (await params).id, reason: e.reason });
      return NextResponse.json({ error: e.message }, { status: 400 });
    }
    return NextResponse.json({ error: 'Could not fetch that URL. Try pasting the reference text instead.' }, { status: 502 });
  }

  // Standardize the raw page into clean, guest-useful markdown. Degrades to raw
  // text if the AI pass fails. This still becomes a host-reviewed proposal
  // rather than an unverified answer given to a guest.
  const standardized = await standardizeKnowledge(page.text, category, page.finalUrl);

  const resolvedTitle = (title && title.trim()) || page.title || url;
  const proposal = await createProposal(admin, {
    propertyId: (await params).id,
    hostAccountId: access.property.host_account_id,
    fieldPath: 'brain.document_summary',
    label: resolvedTitle.slice(0, 160),
    proposedValue: {
      title: resolvedTitle,
      text: standardized.text,
      category,
      visibility,
      sourceUrl: page.finalUrl,
    },
    sourceType: 'listing_url',
    sourceRef: page.finalUrl,
    // A page we could not standardize is a lower-confidence draft. Advisory
    // only; nothing auto-approves at any confidence.
    confidence: standardized.standardized ? 0.8 : 0.4,
  });

  if (!proposal.ok) {
    return NextResponse.json({ error: proposal.error }, { status: 500 });
  }

  await audit(supabase, {
    action: 'brain.proposal.create',
    actorProfileId: ctx?.user.id,
    hostAccountId: access.property.host_account_id,
    propertyId: (await params).id,
    targetType: 'proposed_update',
    targetId: proposal.id,
    metadata: { fieldPath: 'brain.document_summary', profile: sourcePolicy.profile, standardized: standardized.standardized, truncated: standardized.truncated },
  });

  return NextResponse.json({
    ok: true,
    queued: true,
    proposalId: proposal.id,
    title: resolvedTitle,
    standardized: standardized.standardized,
    truncated: standardized.truncated,
    message: knowledgeReviewMessage(standardized),
  });
}
