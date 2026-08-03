import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getGuestSession } from '@/lib/guest/session';
import { guestServiceRequestStartSchema } from '@/lib/validation';
import { runSafetyTriage, runInterviewTurn, type InterviewEntry } from '@/lib/guest/service-request-interview';
import { checkRateLimit } from '@/lib/rate-limit';
import { notify } from '@/lib/notify';
import { log } from '@/lib/log';
import { capture } from '@/lib/posthog-server';
import type { Database } from '@/lib/database.types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Json = Database['public']['Tables']['service_requests']['Row']['interview_transcript'];

// WS-7 — guest taps "Report an issue" and sends their first free-text message.
// Deterministic safety triage runs first and can bypass the AI interview entirely.
export async function POST(req: Request, { params }: { params: { slug: string } }) {
  const session = await getGuestSession();
  if (!session) return NextResponse.json({ error: 'Your session has expired. Please verify again.' }, { status: 401 });

  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  }
  const parsed = guestServiceRequestStartSchema.safeParse(payload);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid request.' }, { status: 400 });
  const { message } = parsed.data;

  const admin = createAdminClient();

  const { data: property } = await admin
    .from('properties').select('id, slug, host_account_id, display_name').eq('id', session.propertyId).maybeSingle();
  if (!property || property.slug !== params.slug) {
    return NextResponse.json({ error: 'Session mismatch.' }, { status: 403 });
  }

  const rate = await checkRateLimit(admin, {
    key: session.sessionId,
    limit: 10,
    windowSeconds: 3600,
    action: 'guest.service_request.start',
  });
  if (!rate.allowed) {
    return NextResponse.json({ error: 'Too many reports submitted. Please try again in a bit.' }, { status: 429 });
  }

  const safety = runSafetyTriage(message);

  if (safety) {
    const timeline = [{ at: new Date().toISOString(), type: 'created', source: 'guest_interview_safety', note: message.slice(0, 300) }];
    const { data: created, error } = await admin
      .from('service_requests')
      .insert({
        property_id: session.propertyId,
        stay_id: session.stayId,
        service_type: 'safety',
        urgency: 'critical',
        status: 'new',
        description: message.slice(0, 1000),
        interview_status: 'safety_escalated',
        safety_flags: safety.flags as unknown as Json,
        summary: message.slice(0, 400),
        timeline: timeline as unknown as Json,
      } as never)
      .select('id')
      .single();

    if (error || !created) {
      log.warn('service_request_safety_create_failed', { error: error?.message });
      return NextResponse.json({ error: 'Could not submit your report. Please try again.' }, { status: 500 });
    }
    const id = (created as { id: string }).id;

    await notify(admin, {
      hostAccountId: property.host_account_id,
      kind: 'maintenance',
      title: `[CRITICAL] Safety issue reported at ${property.display_name}`,
      body: message.slice(0, 200),
      propertyId: session.propertyId,
      link: '/dashboard/service-requests',
    });

    log.info('service_request_safety_escalated', { serviceRequestId: id, flags: safety.flags });
    await capture('service_request_safety_escalated', session.propertyId, { property_id: session.propertyId });

    return NextResponse.json({
      id,
      status: 'safety_escalated',
      guestMessage: safety.guestMessage,
    });
  }

  const turn = await runInterviewTurn(message, []);
  const transcript: InterviewEntry[] = [{ role: 'guest', text: message }];
  if (turn.type === 'question') transcript.push({ role: 'assistant', text: turn.question, choices: turn.choices });

  const timeline = [{ at: new Date().toISOString(), type: 'created', source: 'guest_interview', note: message.slice(0, 300) }];

  const insertBase = {
    property_id: session.propertyId,
    stay_id: session.stayId,
    description: message.slice(0, 1000),
    interview_transcript: transcript as unknown as Json,
    timeline: timeline as unknown as Json,
  };

  if (turn.type === 'final') {
    const { report } = turn;
    const { data: created, error } = await admin
      .from('service_requests')
      .insert({
        ...insertBase,
        service_type: report.category,
        urgency: report.severity,
        status: 'new',
        interview_status: 'completed',
        location_note: report.locationNote || null,
        likely_causes: report.likelyCauses as unknown as Json,
        suggested_parts: report.suggestedParts as unknown as Json,
        access_instructions: report.accessInstructions || null,
        guest_availability: report.guestAvailability || null,
        summary: report.summary,
      } as never)
      .select('id')
      .single();

    if (error || !created) {
      log.warn('service_request_final_create_failed', { error: error?.message });
      return NextResponse.json({ error: 'Could not submit your report. Please try again.' }, { status: 500 });
    }
    const id = (created as { id: string }).id;

    const urgencyTag = report.severity === 'critical' || report.severity === 'high' ? `[${report.severity.toUpperCase()}] ` : '';
    await notify(admin, {
      hostAccountId: property.host_account_id,
      kind: 'maintenance',
      title: `${urgencyTag}New ${report.category} request at ${property.display_name}`,
      body: report.summary.slice(0, 200),
      propertyId: session.propertyId,
      link: '/dashboard/service-requests',
    });

    log.info('service_request_completed', { serviceRequestId: id, category: report.category, severity: report.severity });
    await capture('service_request_completed', session.propertyId, { property_id: session.propertyId });

    return NextResponse.json({ id, status: 'completed', report });
  }

  const { data: created, error } = await admin
    .from('service_requests')
    .insert({ ...insertBase, interview_status: 'in_progress' } as never)
    .select('id')
    .single();

  if (error || !created) {
    log.warn('service_request_interview_create_failed', { error: error?.message });
    return NextResponse.json({ error: 'Could not submit your report. Please try again.' }, { status: 500 });
  }
  const id = (created as { id: string }).id;

  log.info('service_request_interview_started', { serviceRequestId: id });

  return NextResponse.json({ id, status: 'in_progress', question: turn.question, choices: turn.choices ?? null });
}
