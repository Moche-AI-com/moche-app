import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/admin';
import { getUser, requirePropertyAccess } from '@/lib/auth/guards';
import { hashContact } from '@/lib/crypto';
import { checkRateLimit } from '@/lib/rate-limit';
import { sendServiceReportShare } from '@/lib/notify';
import { shareContactReady, type ShareReportContact } from '@/lib/service-requests/share-report';
import { audit } from '@/lib/audit';
import { log } from '@/lib/log';
import type { Json as DbJson } from '@/lib/database.types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const emailAddress = z.string().trim().email().max(320);

const postSchema = z.discriminatedUnion('channel', [
  // Email: one or more validated To addresses plus optional CC, and the host
  // may edit the subject/message from the prefilled template before sending.
  z.object({
    channel: z.literal('email'),
    to: z.array(emailAddress).min(1).max(10),
    cc: z.array(emailAddress).max(10).optional().default([]),
    subject: z.string().trim().min(1).max(200),
    message: z.string().trim().min(1).max(4000),
  }),
  // SMS: a single recipient per send; the body stays short by design.
  z.object({
    channel: z.literal('sms'),
    to: z.array(z.string().trim().min(5).max(40)).min(1).max(1),
    message: z.string().trim().min(1).max(1600),
  }),
]);

// Sends the service report to recipients the host chose on the compose screen,
// by email (Resend) or text (Twilio). The compose view prefills from the
// allowlisted builders in lib/service-requests/share-report.ts and the host can
// edit before sending; what is submitted here is what leaves the platform. The
// ticket must still have an assigned contact with a phone or email first — the
// default template's follow-up line points recipients at that contact, so a
// misdirected send never strands anyone. Every attempt is logged to
// service_report_shares (hash + last4 only) and audit_logs.
export async function POST(req: Request, { params }: { params: Promise<{ id: string; ticketId: string }> }) {
  const { id, ticketId } = await params;
  const access = await requirePropertyAccess(id);
  if (!access.can.resolveMaintenance) {
    return NextResponse.json({ error: 'You do not have permission to manage service requests for this property.' }, { status: 403 });
  }

  const admin = createAdminClient();
  // service_report_shares and the edited_* columns land in database.types.ts on
  // the next `supabase gen types` run; until then this client opts out (same
  // convention as the stay_share_invites route).
  const db = admin as any;

  const rate = await checkRateLimit(admin, {
    key: `service_report_share:${id}`,
    action: 'service_request.share',
    limit: 30,
    windowSeconds: 3600,
  });
  if (!rate.allowed) {
    return NextResponse.json({ error: 'Too many sends. Please wait before sending more.' }, { status: 429 });
  }

  const parsed = postSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Check the recipients and message, then try again.' }, { status: 400 });
  }
  const payload = parsed.data;
  if (payload.channel === 'sms') {
    const digits = payload.to[0].replace(/\D/g, '');
    if (digits.length < 7 || digits.length > 15) {
      return NextResponse.json({ error: 'Enter a valid phone number.' }, { status: 400 });
    }
  }

  const { data: ticket } = await db
    .from('service_requests')
    .select('id, property_id, assigned_contact_id')
    .eq('id', ticketId)
    .eq('property_id', id)
    .maybeSingle();
  if (!ticket) return NextResponse.json({ error: 'Service request not found.' }, { status: 404 });

  let contact: ShareReportContact | null = null;
  if (ticket.assigned_contact_id) {
    const { data: row } = await admin
      .from('property_contacts')
      .select('name, label, phone, email')
      .eq('id', ticket.assigned_contact_id as string)
      .eq('property_id', id)
      .maybeSingle();
    contact = row ?? null;
  }
  if (!shareContactReady(contact)) {
    return NextResponse.json(
      { error: 'Assign a contact with a phone number or email first — the message tells recipients to reach the hosts through that contact.' },
      { status: 400 },
    );
  }

  const user = await getUser();

  // Email goes out once with the full To/CC list (true CC semantics); SMS has a
  // single recipient. Either way every destination gets its own masked row in
  // service_report_shares.
  const sent =
    payload.channel === 'email'
      ? await sendServiceReportShare({
          channel: 'email',
          contact: payload.to[0],
          to: payload.to,
          cc: payload.cc,
          replyToEmail: (contact as ShareReportContact).email,
          subject: payload.subject,
          text: payload.message,
        })
      : await sendServiceReportShare({
          channel: 'sms',
          contact: payload.to[0],
          subject: buildServiceReportFallbackSubject(),
          text: payload.message,
        });

  const destinations = payload.channel === 'email' ? [...payload.to, ...payload.cc] : payload.to;
  for (const destination of destinations) {
    const { contactHash, last4 } = hashContact(destination);
    const { error: logError } = await db.from('service_report_shares').insert({
      property_id: id,
      service_request_id: ticketId,
      channel: payload.channel,
      destination_hash: contactHash,
      destination_last4: last4,
      body_snapshot: payload.message,
      status: sent ? 'sent' : 'failed',
      error: sent ? null : 'provider_send_failed',
      sent_by: user?.id ?? null,
    });
    if (logError) log.warn('service_report_share_log_failed', { propertyId: id, ticketId, error: logError.message });
  }

  await audit(admin, {
    action: sent ? 'service_request.report_shared' : 'service_request.report_share_failed',
    actorProfileId: user?.id ?? null,
    hostAccountId: access.property.host_account_id,
    propertyId: id,
    targetType: 'service_request',
    targetId: ticketId,
    metadata: { channel: payload.channel, recipients: destinations.length } as unknown as DbJson,
  });

  if (!sent) {
    return NextResponse.json(
      {
        error:
          payload.channel === 'sms'
            ? 'The text could not be sent — SMS may not be configured yet. Try email instead.'
            : 'The email could not be sent. Check the addresses and try again.',
      },
      { status: 502 },
    );
  }
  return NextResponse.json({ ok: true, sent: destinations.length });
}

// Recent sends for the ticket (newest first). Destinations are masked.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string; ticketId: string }> }) {
  const { id, ticketId } = await params;
  const access = await requirePropertyAccess(id);
  if (!access.can.resolveMaintenance) {
    return NextResponse.json({ error: 'You do not have permission to view this request.' }, { status: 403 });
  }
  const admin = createAdminClient();
  const { data, error } = await (admin as any)
    .from('service_report_shares')
    .select('id, channel, destination_last4, status, created_at')
    .eq('property_id', id)
    .eq('service_request_id', ticketId)
    .order('created_at', { ascending: false })
    .limit(10);
  if (error) return NextResponse.json({ error: 'Could not load send history.' }, { status: 500 });
  const shares = (data ?? []).map((row: any) => ({
    id: row.id as string,
    channel: row.channel as 'sms' | 'email',
    destinationLast4: (row.destination_last4 ?? null) as string | null,
    status: row.status as 'queued' | 'sent' | 'failed',
    createdAt: row.created_at as string,
  }));
  return NextResponse.json({ shares });
}
