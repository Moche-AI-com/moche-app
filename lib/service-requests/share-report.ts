// Builds the OUTBOUND (emailed / texted) version of a service report.
//
// Security contract: this is an ALLOWLIST renderer. Only the fields explicitly
// interpolated below can ever leave the platform — never the guest's interview
// transcript, media, availability, access instructions, location notes, safety
// flags, internal timeline, or resolution notes. A column added to
// service_requests in the future cannot leak into outbound messages unless
// someone deliberately adds it here.
//
// Do not import server-only modules from this file: the share dialog reuses
// these builders client-side so the preview the host confirms is
// byte-identical to what the API route sends.

export interface ShareReportContact {
  name: string | null;
  label?: string | null;
  phone: string | null;
  email: string | null;
}

export interface ShareReportInput {
  propertyName: string;
  serviceType: string;
  urgency: string;
  /** Host-edited copy wins upstream; this is already the outbound wording. */
  summary: string | null;
  details: string | null;
  /** ISO timestamp of when the guest reported the issue. */
  reportedAt: string;
  /** Ticket id; only the first 8 characters are shown. */
  reference: string;
  contact: ShareReportContact;
}

// A report may only leave the platform once it carries a host-chosen public
// contact: the message tells recipients to follow up through that contact, so
// a misdirected send never strands the recipient and never exposes property
// internals.
export function shareContactReady(contact: ShareReportContact | null | undefined): boolean {
  return !!contact && !!(contact.phone?.trim() || contact.email?.trim());
}

// The follow-up line every outbound report ends with, filled from the assigned
// property contact the host chose before sending.
export function contactLine(contact: ShareReportContact): string {
  const email = contact.email?.trim() || null;
  const phone = contact.phone?.trim() || null;
  if (email && phone) return `Message the property hosts at ${email} or text ${phone} for more information.`;
  if (email) return `Message the property hosts at ${email} for more information.`;
  return `Message the property hosts by text at ${phone ?? ''} for more information.`;
}

function fmtReported(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

// Full plain-text body for the email channel.
export function buildServiceReportText(input: ShareReportInput): string {
  const reported = fmtReported(input.reportedAt);
  const lines = [
    `Service report — ${input.propertyName}`,
    `Reference: ${input.reference.slice(0, 8)}${reported ? ` · Reported ${reported}` : ''}`,
    `Type: ${input.serviceType.replace(/_/g, ' ')} · Urgency: ${input.urgency}`,
    '',
    (input.summary ?? '').trim() || 'Service request',
    '',
    (input.details ?? '').trim(),
    '',
    contactLine(input.contact),
    '',
    `Sent via Moche-AI on behalf of ${input.propertyName}.`,
  ];
  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

export function buildServiceReportSubject(input: Pick<ShareReportInput, 'propertyName' | 'serviceType'>): string {
  return `Service report — ${input.serviceType.replace(/_/g, ' ')} at ${input.propertyName}`;
}

// SMS stays compact: headline + clipped details + the same follow-up path.
// Long intakes are clipped so one send stays within a few segments instead of
// becoming a wall of texts.
export function buildServiceReportSms(input: ShareReportInput): string {
  const headline = (input.summary ?? '').trim() || `${input.serviceType.replace(/_/g, ' ')} request`;
  const details = (input.details ?? '').trim();
  const clipped = details.length > 400 ? `${details.slice(0, 397).trimEnd()}…` : details;
  const body = clipped ? ` ${clipped}` : '';
  return `Moche-AI service report — ${input.propertyName}: ${headline} (ref ${input.reference.slice(0, 8)}).${body} ${contactLine(input.contact)} Reply STOP to opt out.`;
}
