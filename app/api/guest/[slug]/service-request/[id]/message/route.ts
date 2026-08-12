import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getGuestSession } from '@/lib/guest/session';
import { guestServiceRequestMessageSchema } from '@/lib/validation';
import { runInterviewTurn, type InterviewEntry } from '@/lib/guest/service-request-interview';
import { checkRateLimit } from '@/lib/rate-limit';
import { notify } from '@/lib/notify';
import { log } from '@/lib/log';
import { capture } from '@/lib/posthog-server';
import type { Database } from '@/lib/database.types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Json = Database['public']['Tables']['service_requests']['Row']['interview_transcript'];
type Row = Database['public']['Tables']['service_requests']['Row'];

// WS-7 — continues an in-progress guest interview one turn at a time.
export async function POST(req: Request, { params }: { params: Promise<{ slug: string; id: string }> }) {
  const session = await getGuestSession();
  if (!session) return NextResponse.json({ error: 'Your session has expired. Please verify again.' }, { status: 401 });

  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  }
  const parsed = guestServiceRequestMessageSchema.safeParse(payload);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid request.' }, { status: 400 });
  const { message, mediaKeys } = parsed.data;

  const admin = createAdminClient();

  const { data: property } = await admin
    .from('properties').select('id, slug, host_account_id, display_name').eq('id', session.propertyId).maybeSingle();
  if (!property || property.slug !== (await params).slug) {
    return NextResponse.json({ error: 'Session mismatch.' }, { status: 403 });
  }

  const { data: ticket } = await admin
    .from('service_requests')
    .select('id, property_id, stay_id, description, interview_status, interview_transcript, timeline, media_urls')
    .eq('id', (await params).id)
    .eq('property_id', session.propertyId)
    .eq('stay_id', session.stayId)
    .maybeSingle();
  if (!ticket) return NextResponse.json({ error: 'Report not found.' }, { status: 404 });

  const row = ticket as Pick<Row, 'id' | 'property_id' | 'stay_id' | 'description' | 'interview_status' | 'interview_transcript' | 'timeline'> & {
    media_urls?: Json;
  };
  if (row.interview_status !== 'in_progress') {
    return NextResponse.json({ error: 'This report is no longer accepting answers.', status: row.interview_status }, { status: 409 });
  }

  // Only accept media keys this guest's own presign call could have produced
  // for this exact ticket — never trust an arbitrary caller-supplied key.
  const keyPrefix = `service-requests/${session.propertyId}/${session.stayId}/${row.id}/`;
  const validMediaKeys = (mediaKeys ?? []).filter((k) => k.startsWith(keyPrefix));

  const rate = await checkRateLimit(admin, {
    key: session.sessionId,
    limit: 40,
    windowSeconds: 3600,
    action: 'guest.service_request.message',
  });
  if (!rate.allowed) {
    return NextResponse.json({ error: 'Too many messages sent. Please try again in a bit.' }, { status: 429 });
  }

  const priorTranscript = (Array.isArray(row.interview_transcript) ? row.interview_transcript : []) as unknown as InterviewEntry[];
  const transcript: InterviewEntry[] = [...priorTranscript, { role: 'guest', text: message }];

  const turn = await runInterviewTurn(row.description, transcript);
  if (turn.type === 'question') transcript.push({ role: 'assistant', text: turn.question, choices: turn.choices });

  const priorTimeline = Array.isArray(row.timeline) ? row.timeline : [];
  const priorMedia = Array.isArray(row.media_urls) ? (row.media_urls as unknown[]) : [];
  const mergedMedia = validMediaKeys.length ? [...priorMedia, ...validMediaKeys] : priorMedia;

  if (turn.type === 'final') {
    const { report } = turn;
    const timelineEvent = { at: new Date().toISOString(), type: 'interview_completed' };
    const { error } = await admin
      .from('service_requests')
      .update({
        interview_status: 'completed',
        interview_transcript: transcript as unknown as Json,
        service_type: report.category,
        urgency: report.severity,
        location_note: report.locationNote || null,
        likely_causes: report.likelyCauses as unknown as Json,
        suggested_parts: report.suggestedParts as unknown as Json,
        access_instructions: report.accessInstructions || null,
        guest_availability: report.guestAvailability || null,
        summary: report.summary,
        timeline: [...priorTimeline, timelineEvent] as unknown as Json,
        media_urls: mergedMedia as unknown as Json,
      } as never)
      .eq('id', row.id);

    if (error) {
      log.warn('service_request_interview_finalize_failed', { error: error.message, serviceRequestId: row.id });
      return NextResponse.json({ error: 'Could not save your report. Please try again.' }, { status: 500 });
    }

    const urgencyTag = report.severity === 'critical' || report.severity === 'high' ? `[${report.severity.toUpperCase()}] ` : '';
    await notify(admin, {
      hostAccountId: property.host_account_id,
      kind: 'maintenance',
      title: `${urgencyTag}New ${report.category} request at ${property.display_name}`,
      body: report.summary.slice(0, 200),
      propertyId: session.propertyId,
      link: '/dashboard/service-requests',
    });

    log.info('service_request_completed', { serviceRequestId: row.id, category: report.category, severity: report.severity });
    await capture('service_request_completed', session.propertyId, { property_id: session.propertyId });

    return NextResponse.json({ id: row.id, status: 'completed', report });
  }

  const { error } = await admin
    .from('service_requests')
    .update({ interview_transcript: transcript as unknown as Json, media_urls: mergedMedia as unknown as Json } as never)
    .eq('id', row.id);

  if (error) {
    log.warn('service_request_interview_turn_save_failed', { error: error.message, serviceRequestId: row.id });
    return NextResponse.json({ error: 'Could not save your answer. Please try again.' }, { status: 500 });
  }

  return NextResponse.json({ id: row.id, status: 'in_progress', question: turn.question, choices: turn.choices ?? null });
}
