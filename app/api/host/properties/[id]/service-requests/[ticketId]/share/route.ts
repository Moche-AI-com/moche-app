import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/admin';
import { getUser, requirePropertyAccess } from '@/lib/auth/guards';
import { hashContact } from '@/lib/crypto';
import { checkRateLimit } from '@/lib/rate-limit';
import { sendServiceReportShare } from '@/lib/notify';
import {
  buildServiceReportSms,
  buildServiceReportSubject,
  buildServiceReportText,
  shareContactReady,
  type ShareReportContact,
} from '@/lib/service-requests/share-report';
import { audit } from '@/lib/audit';
import { log } from '@/lib/log';
import type { Json as DbJson } from '@/lib/database.types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const postSchema = z.object({
  channel: z.enum(['sms', 'email']),
  destination: z.string().trim().min(5).max(320),
});

// Sends the share-safe version of a service report (allowlisted fields only —
// see lib/service-requests/share-report.ts) to any recipient the host chooses,
// by email (Resend) or text (Twilio). The ticket must have an assigned contact
// with a phone or email first: the message's follow-up line points recipients
// at that contact, so a misdirected send exposes nothing internal. Every
// attempt is logged to service_report_shares (hash + last4 only) and audit_logs.
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
    return NextResponse.json({ error: 'Enter a valid phone number or email address.' }, { status: 400 });
  }
  const { channel, destination } = parsed.data;
  if (channel === 'email' && !destination.includes('@')) {
    return NextResponse.json({ error: 'Enter a valid email address.' }, { status: 400 });
  }
  if (channel === 'sms') {
    const digits = destination.replace(/\D/g, '');
    if (digits.length < 7 || digits.length > 15) {
      return NextResponse.json({ error: 'Enter a valid phone number.' }, { status: 400 });
    }
  }

  const { data: ticket } = await db
    .from('service_requests')
    .select('id, property_id, service_type, urgency, summary, description, edited_summary, edited_details, created_at, assigned_contact_id')
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

  const input = {
    propertyName: access.property.display_name,
    serviceType: String(ticket.service_type ?? 'other'),
    urgency: String(ticket.urgency ?? 'medium'),
    // Host-edited copy wins; the guest's original intake is the fallback.
    summary: (ticket.edited_summary as string | null) ?? (ticket.summary as string | null),
    details: (ticket.edited_details as string | null) ?? (ticket.description as string | null),
    reportedAt: ticket.created_at as string,
    reference: ticketId,
    contact: contact as ShareReportContact,
  };
  const text = channel === 'email' ? buildServiceReportText(input) : buildServiceReportSms(input);
  const subject = buildServiceReportSubject(input);

  const sent = await sendServiceReportShare({
    channel,
    contact: destination,
    replyToEmail: (contact as ShareReportContact).email,
    subject,
    text,
  });

  const { contactHash, last4 } = hashContact(destination);
  const user = await getUser();
  const { error: logError } = await db.from('service_report_shares').insert({
    property_id: id,
    service_request_id: ticketId,
    channel,
    destination_hash: contactHash,
    destination_last4: last4,
    body_snapshot: text,
    status: sent ? 'sent' : 'failed',
    error: sent ? null : 'provider_send_failed',
    sent_by: user?.id ?? null,
  });
  if (logError) log.warn('service_report_share_log_failed', { propertyId: id, ticketId, error: logError.message });

  await audit(admin, {
    action: sent ? 'service_request.report_shared' : 'service_request.report_share_failed',
    actorProfileId: user?.id ?? null,
    hostAccountId: access.property.host_account_id,
    propertyId: id,
    targetType: 'service_request',
    targetId: ticketId,
    metadata: { channel } as unknown as DbJson,
  });

  if (!sent) {
    return NextResponse.json(
      {
        error:
          channel === 'sms'
            ? 'The text could not be sent — SMS may not be configured yet. Try email instead.'
            : 'The email could not be sent. Check the address and try again.',
      },
      { status: 502 },
    );
  }
  return NextResponse.json({ ok: true });
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
