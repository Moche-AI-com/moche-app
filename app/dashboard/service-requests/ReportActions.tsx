'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Mail, Pencil, Printer, Smartphone, UserRoundPlus, X } from 'lucide-react';
import { ChipInput, isValidEmail } from '@/components/FormFeedback';
import {
  buildServiceReportSms,
  buildServiceReportText,
  shareContactReady,
  type ShareReportInput,
} from '@/lib/service-requests/share-report';
import {
  SERVICE_TYPE_OPTIONS,
  URGENCY_OPTIONS,
  emailSubjectPrefill,
  fromLines,
  toLines,
} from '@/lib/service-requests/report-fields';

// The contact shape this panel needs. Structurally compatible with the
// dashboard's PropertyContactOption and with the single-contact array the
// printable report page passes.
export interface ReportActionContact {
  id: string;
  name: string | null;
  label?: string | null;
  phone: string | null;
  email: string | null;
}

// An internal teammate (account owner or property member) a request can be
// assigned to.
export interface ReportActionMember {
  id: string;
  name: string | null;
  email: string | null;
}

// The ticket fields ReportActions reads. The Edit Report dialog works on the
// whole report — type, urgency, headline, details, the context fields, and the
// jsonb lists — so every consumer (Service tab card, printable report page)
// passes the full row through. Field helpers live in
// lib/service-requests/report-fields.ts.
export interface ReportActionTicket {
  id: string;
  property_id: string;
  service_type: string;
  urgency: string;
  summary: string | null;
  description: string | null;
  edited_summary: string | null;
  edited_details: string | null;
  created_at: string;
  assigned_contact_id: string | null;
  assigned_profile_id: string | null;
  location_note?: string | null;
  access_instructions?: string | null;
  guest_availability?: string | null;
  resolution_notes?: string | null;
  likely_causes?: unknown;
  suggested_parts?: unknown;
  safety_flags?: unknown;
}

export interface ReportEditPatch {
  service_type: string;
  urgency: string;
  edited_summary: string | null;
  edited_details: string | null;
  location_note: string | null;
  access_instructions: string | null;
  guest_availability: string | null;
  resolution_notes: string | null;
  likely_causes: string[];
  suggested_parts: string[];
  safety_flags: string[];
}

interface ShareRow {
  id: string;
  channel: 'sms' | 'email';
  destinationLast4: string | null;
  status: 'queued' | 'sent' | 'failed';
  createdAt: string;
}

function timeAgo(iso: string): string {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'just now';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

// Icon-only share buttons (Email / Text / Print). Icons are sized identically
// and the hit areas are equal, so the row reads as one consistent family; the
// tooltip (title) and aria-label carry the meaning. `.btn` supplies the pill
// (rounded) shape — an earlier version also hung `sr-print-link` on the print
// button, whose 8px radius was written for a bare anchor on the list rows and
// squared the button off. Layout belongs to the caller's container.
const ICON_BUTTON_STYLE = {
  minWidth: '2.1rem',
  minHeight: '2.1rem',
  padding: '.3rem',
} as const;

// One action cluster for a service request. Which controls show depends on
// where it renders:
//   - Service tab card (layout 'card'): "View report" opens the printable page
//     (which is also where editing happens); Assign stays on the card; the
//     share icons sit alongside.
//   - Report page footer (layout 'page', the default): Edit report + Assign.
//   - Report page header (layout 'header'): the Email / Text / Print icons,
//     top-right of the report.
// The printable page itself lives at /dashboard/service-requests/[id] — the
// Service tab's own scope, NOT the Reports section (the legacy
// /dashboard/reports/service-request/[id] URL permanently redirects there).
// The compose dialog previews the exact starting message because it reuses the
// same pure builder the API route defaults to (lib/service-requests/share-report.ts).
export function ReportActions({
  ticket,
  propertyName,
  contacts,
  members = [],
  canManage,
  layout = 'page',
  printMode = 'link',
  onEdited,
  onAssigned,
}: {
  ticket: ReportActionTicket;
  propertyName: string;
  contacts: ReportActionContact[];
  members?: ReportActionMember[];
  canManage: boolean;
  layout?: 'card' | 'page' | 'header';
  /** 'link' opens the printable report in a new tab; 'native' calls window.print(). */
  printMode?: 'link' | 'native';
  onEdited?: (patch: ReportEditPatch) => void;
  onAssigned?: (profileId: string | null) => void;
}) {
  const router = useRouter();
  const [open, setOpen] = useState<null | 'edit' | 'assign' | 'email' | 'sms'>(null);
  const assignedContact = contacts.find((c) => c.id === ticket.assigned_contact_id) ?? null;
  const ready = shareContactReady(assignedContact);

  const shareInput: ShareReportInput = useMemo(
    () => ({
      propertyName,
      serviceType: ticket.service_type,
      urgency: ticket.urgency,
      summary: ticket.edited_summary ?? ticket.summary,
      details: ticket.edited_details ?? ticket.description,
      reportedAt: ticket.created_at,
      reference: ticket.id,
      contact: assignedContact ?? { name: null, phone: null, email: null },
    }),
    [ticket, propertyName, assignedContact],
  );

  // Share icons (Email / Text / Print) render for 'card' and 'header'; the
  // report page's own Print button is the window.print() variant.
  const showShareIcons = layout !== 'page';
  const shareIcons = showShareIcons ? (
    <div style={{ display: 'inline-flex', gap: '.4rem', alignItems: 'center' }}>
      {canManage && (
        <>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            style={ICON_BUTTON_STYLE}
            onClick={() => setOpen('email')}
            disabled={!ready}
            title={ready ? 'Email the share-safe report to someone' : 'Assign a contact with a phone or email first'}
            aria-label={ready ? 'Email the share-safe report' : 'Email report — assign a contact with a phone or email first'}
            data-testid="button-email-report"
          >
            <Mail size={14} aria-hidden />
          </button>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            style={ICON_BUTTON_STYLE}
            onClick={() => setOpen('sms')}
            disabled={!ready}
            title={ready ? 'Text the share-safe report to someone' : 'Assign a contact with a phone or email first'}
            aria-label={ready ? 'Text the share-safe report' : 'Text report — assign a contact with a phone or email first'}
            data-testid="button-text-report"
          >
            <Smartphone size={14} aria-hidden />
          </button>
        </>
      )}
      {printMode === 'link' ? (
        <Link
          href={`/dashboard/service-requests/${ticket.id}`}
          target="_blank"
          rel="noopener"
          className="btn btn-ghost btn-sm"
          style={ICON_BUTTON_STYLE}
          title="Open the printable report"
          aria-label="Open the printable report"
          data-testid="service-request-print"
        >
          <Printer size={14} aria-hidden />
        </Link>
      ) : (
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          style={ICON_BUTTON_STYLE}
          onClick={() => window.print()}
          title="Print or save as PDF"
          aria-label="Print or save as PDF"
          data-testid="button-print-report"
        >
          <Printer size={14} aria-hidden />
        </button>
      )}
    </div>
  ) : null;

  if (layout === 'header') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '.45rem', alignItems: 'flex-end' }} data-testid="report-actions">
        {shareIcons}
        {(open === 'email' || open === 'sms') && assignedContact && (
          <ShareReportDialog
            channel={open}
            ticket={ticket}
            input={shareInput}
            contactName={assignedContact.name ?? assignedContact.label ?? 'the assigned contact'}
            onClose={() => setOpen(null)}
          />
        )}
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '.45rem' }} data-testid="report-actions">
      <div style={{ display: 'flex', gap: '.4rem', flexWrap: 'wrap', alignItems: 'center' }}>
        {layout === 'card' && (
          <Link
            href={`/dashboard/service-requests/${ticket.id}`}
            className="btn btn-ghost btn-sm"
            data-testid="button-view-report"
          >
            View report
          </Link>
        )}
        {canManage && layout === 'page' && (
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setOpen('edit')} data-testid="button-edit-report">
            <Pencil size={14} aria-hidden /> Edit report
          </button>
        )}
        {canManage && (
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setOpen('assign')} data-testid="button-assign-report">
            <UserRoundPlus size={14} aria-hidden /> Assign
          </button>
        )}
        {shareIcons}
      </div>
      {canManage && !ready && (
        <p className="faint" style={{ margin: 0, fontSize: '.78rem' }}>
          Assign a contact with a phone number or email to enable sending — the message tells recipients to
          reach the hosts through that contact, so a wrong number never exposes anything private.
        </p>
      )}
      {open === 'edit' && layout === 'page' && (
        <EditReportDialog
          ticket={ticket}
          onClose={() => setOpen(null)}
          onSaved={(patch) => {
            onEdited?.(patch);
            router.refresh();
            setOpen(null);
          }}
        />
      )}
      {open === 'assign' && (
        <AssignDialog
          ticket={ticket}
          members={members}
          onClose={() => setOpen(null)}
          onAssigned={(profileId) => {
            onAssigned?.(profileId);
            router.refresh();
            setOpen(null);
          }}
        />
      )}
      {(open === 'email' || open === 'sms') && assignedContact && (
        <ShareReportDialog
          channel={open}
          ticket={ticket}
          input={shareInput}
          contactName={assignedContact.name ?? assignedContact.label ?? 'the assigned contact'}
          onClose={() => setOpen(null)}
        />
      )}
    </div>
  );
}

function DialogShell({
  title,
  onClose,
  children,
  wide,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  /** Widen the dialog card; 'full' is the compose view's two-column sheet. */
  wide?: boolean | 'full';
}) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      style={{
        position: 'fixed', inset: 0, zIndex: 60,
        background: 'rgba(0,0,0,.55)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '1rem',
      }}
      onClick={onClose}
    >
      <div
        className="card"
        style={{
          width: '100%', maxWidth: wide === 'full' ? '62rem' : wide ? '34rem' : '28rem',
          maxHeight: '90vh', overflowY: 'auto',
          padding: '1.1rem 1.2rem', display: 'flex', flexDirection: 'column', gap: '.7rem',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ fontSize: '1.05rem', margin: 0 }}>{title}</h2>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={onClose}
            aria-label="Close dialog"
            data-testid="button-close-dialog"
            style={{ minWidth: 44, minHeight: 44 }}
          >
            <X size={16} aria-hidden />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function EditReportDialog({
  ticket,
  onClose,
  onSaved,
}: {
  ticket: ReportActionTicket;
  onClose: () => void;
  onSaved: (patch: ReportEditPatch) => void;
}) {
  const [serviceType, setServiceType] = useState(ticket.service_type);
  const [urgency, setUrgency] = useState(ticket.urgency);
  const [summary, setSummary] = useState(ticket.edited_summary ?? ticket.summary ?? '');
  const [details, setDetails] = useState(ticket.edited_details ?? ticket.description ?? '');
  const [location, setLocation] = useState(ticket.location_note ?? '');
  const [access, setAccess] = useState(ticket.access_instructions ?? '');
  const [availability, setAvailability] = useState(ticket.guest_availability ?? '');
  const [resolution, setResolution] = useState(ticket.resolution_notes ?? '');
  const [causes, setCauses] = useState(toLines(ticket.likely_causes));
  const [parts, setParts] = useState(toLines(ticket.suggested_parts));
  const [flags, setFlags] = useState(toLines(ticket.safety_flags));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/host/properties/${ticket.property_id}/service-requests/${ticket.id}/report`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          serviceType,
          urgency,
          editedSummary: summary,
          editedDetails: details,
          locationNote: location,
          accessInstructions: access,
          guestAvailability: availability,
          resolutionNotes: resolution,
          likelyCauses: fromLines(causes),
          suggestedParts: fromLines(parts),
          safetyFlags: fromLines(flags),
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Could not save the edited report.');
      onSaved({
        service_type: serviceType,
        urgency,
        edited_summary: json.editedSummary ?? null,
        edited_details: json.editedDetails ?? null,
        location_note: location.trim() || null,
        access_instructions: access.trim() || null,
        guest_availability: availability.trim() || null,
        resolution_notes: resolution.trim() || null,
        likely_causes: fromLines(causes),
        suggested_parts: fromLines(parts),
        safety_flags: fromLines(flags),
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.');
      setBusy(false);
    }
  }

  const fieldLabel: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: '.3rem', fontSize: '.82rem' };

  return (
    <DialogShell title="Edit report" onClose={onClose} wide>
      <p className="faint" style={{ margin: 0, fontSize: '.8rem' }}>
        This is the wording that gets printed, emailed, or texted. The guest’s original report is never
        overwritten — clear the headline and details and save to revert to it. Type, urgency, and the context
        fields update the report itself.
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(10rem, 1fr))', gap: '.6rem' }}>
        <label style={fieldLabel}>
          Type
          <select className="select" value={serviceType} onChange={(e) => setServiceType(e.target.value)} disabled={busy} data-testid="select-edit-type" style={{ minHeight: 44 }}>
            {SERVICE_TYPE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </label>
        <label style={fieldLabel}>
          Urgency
          <select className="select" value={urgency} onChange={(e) => setUrgency(e.target.value)} disabled={busy} data-testid="select-edit-urgency" style={{ minHeight: 44 }}>
            {URGENCY_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </label>
      </div>
      <label style={fieldLabel}>
        Headline
        <input
          className="input"
          value={summary}
          onChange={(e) => setSummary(e.target.value)}
          maxLength={200}
          disabled={busy}
          data-testid="input-edit-summary"
          style={{ minHeight: 44 }}
        />
      </label>
      <label style={fieldLabel}>
        Details
        <textarea
          className="input"
          rows={6}
          value={details}
          onChange={(e) => setDetails(e.target.value)}
          maxLength={4000}
          disabled={busy}
          data-testid="input-edit-details"
        />
      </label>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(14rem, 1fr))', gap: '.6rem' }}>
        <label style={fieldLabel}>
          Location on the property
          <input className="input" value={location} onChange={(e) => setLocation(e.target.value)} maxLength={300} disabled={busy} data-testid="input-edit-location" style={{ minHeight: 44 }} />
        </label>
        <label style={fieldLabel}>
          Guest availability
          <input className="input" value={availability} onChange={(e) => setAvailability(e.target.value)} maxLength={300} disabled={busy} data-testid="input-edit-availability" style={{ minHeight: 44 }} />
        </label>
      </div>
      <label style={fieldLabel}>
        Access instructions
        <textarea className="input" rows={2} value={access} onChange={(e) => setAccess(e.target.value)} maxLength={1000} disabled={busy} data-testid="input-edit-access" />
      </label>
      <label style={fieldLabel}>
        Likely causes (one per line)
        <textarea className="input" rows={3} value={causes} onChange={(e) => setCauses(e.target.value)} maxLength={2000} disabled={busy} data-testid="input-edit-causes" />
      </label>
      <label style={fieldLabel}>
        Suggested parts and tools (one per line)
        <textarea className="input" rows={3} value={parts} onChange={(e) => setParts(e.target.value)} maxLength={2000} disabled={busy} data-testid="input-edit-parts" />
      </label>
      <label style={fieldLabel}>
        Safety flags (one per line)
        <textarea className="input" rows={2} value={flags} onChange={(e) => setFlags(e.target.value)} maxLength={1000} disabled={busy} data-testid="input-edit-flags" />
      </label>
      <label style={fieldLabel}>
        Resolution
        <textarea className="input" rows={3} value={resolution} onChange={(e) => setResolution(e.target.value)} maxLength={1000} disabled={busy} placeholder="What was completed or resolved?" data-testid="input-edit-resolution" />
      </label>
      {error && <span className="badge badge-coral">{error}</span>}
      <div style={{ display: 'flex', gap: '.4rem', justifyContent: 'flex-end' }}>
        <button type="button" className="btn btn-ghost btn-sm" onClick={onClose} disabled={busy}>Cancel</button>
        <button type="button" className="btn btn-primary btn-sm" onClick={save} disabled={busy} data-testid="button-edit-save">
          {busy ? 'Saving…' : 'Save report'}
        </button>
      </div>
    </DialogShell>
  );
}

function AssignDialog({
  ticket,
  members,
  onClose,
  onAssigned,
}: {
  ticket: ReportActionTicket;
  members: ReportActionMember[];
  onClose: () => void;
  onAssigned: (profileId: string | null) => void;
}) {
  const [value, setValue] = useState(ticket.assigned_profile_id ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/host/properties/${ticket.property_id}/service-requests/${ticket.id}/assign`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ profileId: value || null }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Could not assign this request.');
      onAssigned(value || null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.');
      setBusy(false);
    }
  }

  return (
    <DialogShell title="Assign to a teammate" onClose={onClose}>
      <p className="faint" style={{ margin: 0, fontSize: '.8rem' }}>
        Assign this request to a teammate. The external contact used on shared Email/Text reports is unchanged.
      </p>
      {members.length === 0 ? (
        <p className="muted" style={{ margin: 0, fontSize: '.85rem' }}>
          No teammates found for this property. Invite teammates from Profile → User management first.
        </p>
      ) : (
        <label style={{ display: 'flex', flexDirection: 'column', gap: '.3rem', fontSize: '.82rem' }}>
          Teammate
          <select
            className="select"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            disabled={busy}
            data-testid="select-assign-member"
            style={{ minHeight: 44 }}
          >
            <option value="">Unassigned</option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name ?? m.email ?? 'Teammate'}{m.name && m.email ? ` (${m.email})` : ''}
              </option>
            ))}
          </select>
        </label>
      )}
      {error && <span className="badge badge-coral">{error}</span>}
      <div style={{ display: 'flex', gap: '.4rem', justifyContent: 'flex-end' }}>
        <button type="button" className="btn btn-ghost btn-sm" onClick={onClose} disabled={busy}>Cancel</button>
        <button
          type="button"
          className="btn btn-primary btn-sm"
          onClick={save}
          disabled={busy || members.length === 0}
          data-testid="button-assign-save"
        >
          {busy ? 'Saving…' : 'Save assignment'}
        </button>
      </div>
    </DialogShell>
  );
}

// Compose view: recipient fields on the left (chip inputs for email — an
// address becomes a chip only once it validates), the message preview on the
// right, prefilled from the same builders the API defaults to. The host can
// edit the subject/message before sending; what is sent is snapshotted to
// service_report_shares. Editing the report itself stays one click away —
// closing this dialog lands back on the action row with Edit report.
function ShareReportDialog({
  channel,
  ticket,
  input,
  contactName,
  onClose,
}: {
  channel: 'email' | 'sms';
  ticket: ReportActionTicket;
  input: ShareReportInput;
  contactName: string;
  onClose: () => void;
}) {
  const prefill = useMemo(
    () => ({ summary: (input.summary ?? '').trim() || null, serviceType: input.serviceType, propertyName: input.propertyName }),
    [input],
  );
  const defaultBody = useMemo(
    () => (channel === 'email' ? buildServiceReportText(input) : buildServiceReportSms(input)),
    [channel, input],
  );

  const [to, setTo] = useState<string[]>([]);
  const [cc, setCc] = useState<string[]>([]);
  const [subject, setSubject] = useState(() => emailSubjectPrefill(prefill));
  const [message, setMessage] = useState(defaultBody);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [history, setHistory] = useState<ShareRow[]>([]);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/host/properties/${ticket.property_id}/service-requests/${ticket.id}/share`)
      .then((r) => (r.ok ? r.json() : null))
      .then((json: { shares?: ShareRow[] } | null) => {
        if (!cancelled && json?.shares) setHistory(json.shares);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [ticket.property_id, ticket.id, sent]);

  const emailProblem = (raw: string): string | null =>
    isValidEmail(raw) ? null : 'Enter a valid email address before adding it.';
  const phoneProblem = (raw: string): string | null => {
    const digits = raw.replace(/\D/g, '');
    return digits.length >= 7 && digits.length <= 15 ? null : 'Enter a valid phone number before adding it.';
  };

  const emailReady = to.length > 0 && subject.trim().length > 0 && message.trim().length > 0;
  const smsReady = to.length === 1 && message.trim().length > 0;
  const canSend = channel === 'email' ? emailReady : smsReady;

  async function send() {
    if (busy || !canSend) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/host/properties/${ticket.property_id}/service-requests/${ticket.id}/share`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(
          channel === 'email'
            ? { channel, to, cc, subject: subject.trim(), message: message.trim() }
            : { channel, to, message: message.trim() },
        ),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Could not send the report.');
      setSent(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  }

  const previewHeader =
    channel === 'email'
      ? [`To: ${to.join(', ') || '—'}`, cc.length ? `CC: ${cc.join(', ')}` : null, `Subject: ${subject || '—'}`]
          .filter(Boolean)
          .join('\n')
      : `To: ${to[0] ?? '—'}`;

  return (
    <DialogShell title={channel === 'email' ? 'Email report' : 'Text report'} onClose={onClose} wide="full">
      <p className="faint" style={{ margin: 0, fontSize: '.8rem' }}>
        This sends the share-safe report on the right — the intake details and a follow-up line pointing to{' '}
        {contactName}. No guest details, access info, or property internals are included unless you add them.
        The message starts from the standard template; edit it before sending if you need to.
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 22rem), 1fr))', gap: '1rem', alignItems: 'start' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '.8rem', minWidth: 0 }}>
          {channel === 'email' && (
            <label style={{ display: 'flex', flexDirection: 'column', gap: '.3rem', fontSize: '.82rem' }}>
              Subject
              <input
                className="input"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                maxLength={200}
                disabled={busy}
                data-testid="input-share-subject"
                style={{ minHeight: 44 }}
              />
            </label>
          )}
          <ChipInput
            id="share-to"
            label={channel === 'email' ? 'To' : 'Send to phone number'}
            hint={channel === 'sms' ? 'One number per send.' : 'Press Enter or Add after each address.'}
            values={to}
            onChange={(next) => setTo(channel === 'sms' ? next.slice(-1) : next)}
            validate={channel === 'email' ? emailProblem : phoneProblem}
            placeholder={channel === 'email' ? 'name@example.com' : '+1 555 123 4567'}
            inputType={channel === 'email' ? 'email' : 'tel'}
            addLabel="Add"
            testId="input-share-to"
            disabled={busy}
          />
          {channel === 'email' && (
            <ChipInput
              id="share-cc"
              label="CC"
              hint="Optional — same validation as To."
              values={cc}
              onChange={setCc}
              validate={emailProblem}
              placeholder="name@example.com"
              inputType="email"
              addLabel="Add"
              testId="input-share-cc"
              disabled={busy}
            />
          )}
          <label style={{ display: 'flex', flexDirection: 'column', gap: '.3rem', fontSize: '.82rem' }}>
            Message
            <textarea
              className="input"
              rows={channel === 'email' ? 9 : 5}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              maxLength={channel === 'email' ? 4000 : 1600}
              disabled={busy}
              data-testid="input-share-message"
            />
          </label>
          {error && <span className="badge badge-coral">{error}</span>}
          {sent && <span className="badge badge-teal">Sent. The recipient only sees the message on the right.</span>}
          <div style={{ display: 'flex', gap: '.4rem', justifyContent: 'flex-end' }}>
            <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>Close</button>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={send}
              disabled={busy || !canSend || sent}
              data-testid="button-share-send"
            >
              {busy ? 'Sending…' : channel === 'email' ? 'Send email' : 'Send text'}
            </button>
          </div>
          {history.length > 0 && (
            <p className="faint" style={{ margin: 0, fontSize: '.75rem' }}>
              Recent sends:{' '}
              {history
                .slice(0, 5)
                .map((h) => `${h.channel === 'email' ? 'Email' : 'Text'} ••••${h.destinationLast4 ?? ''} · ${h.status} · ${timeAgo(h.createdAt)}`)
                .join('  ·  ')}
            </p>
          )}
        </div>
        <div style={{ minWidth: 0 }}>
          <p className="label" style={{ marginBottom: '.35rem' }}>What the recipient gets</p>
          <pre
            style={{
              margin: 0, padding: '.85rem', fontSize: '.78rem', whiteSpace: 'pre-wrap',
              background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '8px',
              maxHeight: '26rem', overflowY: 'auto',
            }}
            data-testid="share-preview"
          >
            {previewHeader}
            {'\n\n'}
            {message}
          </pre>
        </div>
      </div>
    </DialogShell>
  );
}
