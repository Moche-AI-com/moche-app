import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getSessionContext } from '@/lib/auth/guards';
import { createClient } from '@/lib/supabase/server';

const paramsSchema = z.string().uuid();

export async function GET(_request: Request, { params }: { params: { jobId: string } }) {
  if (!paramsSchema.safeParse(params.jobId).success) return NextResponse.json({ error: 'Invalid job.' }, { status: 400 });
  if (!await getSessionContext()) return NextResponse.json({ error: 'Sign in to view this import.' }, { status: 401 });
  const client = createClient();
  const { data: job, error } = await client.from('property_import_jobs').select('id, property_id, status, stage_detail, progress_pct, error_reason, error_message, updated_at').eq('id', params.jobId).maybeSingle();
  if (error || !job) return NextResponse.json({ error: 'Import not found.' }, { status: 404 });
  const active = new Set(['queued', 'acquiring', 'extracting', 'drafting']);
  const stale = active.has(job.status) && Date.now() - new Date(job.updated_at).getTime() > 10 * 60 * 1000;
  if (stale) {
    const detail = 'This import stopped updating. Retry it or enter details manually.';
    const { data: updated } = await client
      .from('property_import_jobs')
      .update({ status: 'failed', stage_detail: detail, error_reason: 'stale', error_message: detail, updated_at: new Date().toISOString() })
      .eq('id', job.id)
      .select('id, property_id, status, stage_detail, progress_pct, error_reason, error_message, updated_at')
      .single();
    return NextResponse.json({ job: updated ?? { ...job, status: 'failed', stage_detail: detail }, stale: true, retryable: true });
  }
  return NextResponse.json({ job, stale: false, retryable: job.status === 'failed' || job.status === 'canceled' });
}
