import { notFound, redirect } from 'next/navigation';
import { getSessionContext } from '@/lib/auth/guards';
import { createClient } from '@/lib/supabase/server';
import { asListingDraft } from '@/lib/property-import/jobs';
import { ImportReviewClient } from './ImportReviewClient';

export const dynamic = 'force-dynamic';

export default async function ImportReviewPage({ params }: { params: { jobId: string } }) {
  const ctx = await getSessionContext();
  if (!ctx) redirect('/login');
  const client = createClient();
  const { data: job } = await client.from('property_import_jobs').select('id, property_id, status').eq('id', params.jobId).maybeSingle();
  if (!job) notFound();
  if (job.status === 'failed') redirect('/dashboard/properties/new?import=failed');
  if (!job.property_id || job.status !== 'awaiting_review') redirect('/dashboard/properties/new');
  const { data: artifact } = await client.from('property_import_artifacts').select('payload').eq('job_id', job.id).eq('kind', 'listing_draft').order('created_at', { ascending: false }).limit(1).maybeSingle();
  const draft = artifact ? asListingDraft(artifact.payload) : null;
  if (!draft) notFound();

  return (
    <div>
      <p className="faint" style={{ marginBottom: '.25rem' }}>Step 2 of 2</p>
      <h1 style={{ fontSize: '1.8rem', margin: '.5rem 0' }}>Review imported details</h1>
      <p className="faint" style={{ marginBottom: '1.5rem' }}>From {draft.provider} · {draft.listingTitle}</p>
      <ImportReviewClient jobId={job.id} propertyId={job.property_id} groups={draft.reviewGroups} />
    </div>
  );
}
