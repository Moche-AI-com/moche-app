import { NextResponse } from 'next/server';
import { getPropertyAccess } from '@/lib/auth/guards';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getSessionContext } from '@/lib/auth/guards';
import { ingestUrlSchema } from '@/lib/validation';
import { fetchUrlContent, isSsrfError } from '@/lib/ingest/firecrawl';
import { standardizeListing } from '@/lib/ingest/standardize';
import { createProposal } from '@/lib/brain/proposal-store';
import { audit } from '@/lib/audit';
import { log } from '@/lib/log';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * URL ingestion now stops at the review queue (backlog P2-06/P2-07).
 *
 * This route used to run the fetched page through an AI standardization pass and
 * write the model's output straight into brain_items, where the concierge began
 * quoting it to guests immediately. A hallucinated check-out time or parking
 * rule went live with nobody having read it.
 *
 * It now creates a `proposed_updates` row instead. Nothing reaches guest-visible
 * storage until a human with brain-edit rights approves it — and they can approve
 * a corrected version, with both the model's text and theirs retained.
 */
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
  const parsed = ingestUrlSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid input.' }, { status: 400 });
  }
  const { url, title, category, visibility } = parsed.data;

  // Fetch through the SSRF-guarded, server-only boundary. Content is untrusted reference data.
  let page;
  try {
    page = await fetchUrlContent(url);
  } catch (e) {
    if (isSsrfError(e)) {
      log.warn('ingest_url_blocked', { propertyId: params.id, reason: e.message });
      return NextResponse.json({ error: e.message }, { status: 400 });
    }
    const msg = e instanceof Error ? e.message : 'Could not fetch that URL.';
    return NextResponse.json({ error: msg }, { status: 502 });
  }

  const ctx = await getSessionContext();
  const supabase = createClient();

  // Standardize the raw page into clean, guest-useful markdown. Degrades to raw
  // text if the AI pass fails, which is fine now: a weak draft is a weak draft
  // sitting in a review queue rather than a weak answer given to a guest.
  const standardized = await standardizeListing(page.text, page.sourceUrl);

  const resolvedTitle = (title && title.trim()) || page.title || url;
  const proposal = await createProposal(createAdminClient(), {
    propertyId: params.id,
    hostAccountId: access.property.host_account_id,
    fieldPath: 'brain.listing_summary',
    label: resolvedTitle.slice(0, 160),
    proposedValue: {
      title: resolvedTitle,
      text: standardized.text,
      category,
      visibility,
      sourceUrl: page.sourceUrl,
    },
    sourceType: 'listing_url',
    sourceRef: page.sourceUrl,
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
    propertyId: params.id,
    targetType: 'proposed_update',
    targetId: proposal.id,
    metadata: { fieldPath: 'brain.listing_summary', sourceUrl: page.sourceUrl, standardized: standardized.standardized },
  });

  return NextResponse.json({
    ok: true,
    queued: true,
    proposalId: proposal.id,
    title: resolvedTitle,
    message: 'Sent to your review queue. Nothing goes live until you approve it.',
  });
}
