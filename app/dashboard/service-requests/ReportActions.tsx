'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Mail, Pencil, Printer, Smartphone, UserRoundPlus, X } from 'lucide-react';
import {
  buildServiceReportSms,
  buildServiceReportText,
  shareContactReady,
  type ShareReportInput,
} from '@/lib/service-requests/share-report';

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

// Icon-only action buttons (Email / Text / Print): no text label by design —
// the tooltip (title) and aria-label carry the meaning on hover / for AT.
const ICON_BUTTON_STYLE = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  minWidth: '2.1rem',
  minHeight: '2.1rem',
  padding: '.3rem',
} as const;

// One action row for a service request: Edit report, Assign (teammate), then
// the icon-only Email / Text / Print buttons. Rendered on the Service tab's
// ticket card and on the printable report page. The share dialog previews the
// exact message because it reuses the same pure builder the API route sends
// through (lib/service-requests/share-report.ts).
export function ReportActions({
  ticket,
  propertyName,
  contacts,
  members = [],
  canManage,
  printMode = 'link',
  onEdited,
  onAssigned,
}: {
  ticket: ReportActionTicket;
  propertyName: string;
  contacts: ReportActionContact[];
  members?: ReportActionMember[];
  canManage: boolean;
  /** 'link' opens the printable report in a new tab; 'native' calls window.print(). */
  printMode?: 'link' | 'native';
  onEdited?: (patch: { edited_summary: string | null; edited_details: string | null }) => void;
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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '.45rem' }} data-testid="report-actions">
      <div style={{ display: 'flex', gap: '.4rem', flexWrap: 'wrap', alignItems: 'center' }}>
        {canManage && (
          <>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setOpen('edit')} data-testid="button-edit-report">
              <Pencil size={13} aria-hidden /> Edit report
            </button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setOpen('assign')} data-testid="button-assign-report">
              <UserRoundPlus size={13} aria-hidden /> Assign
            </button>
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
            href={`/dashboard/reports/service-request/${ticket.id}`}
            target="_blank"
            rel="noopener"
            className="btn btn-ghost btn-sm sr-print-link"
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
      {canManage && !ready && (
        <p className="faint" style={{ margin: 0, fontSize: '.78rem' }}>
          Assign a contact with a phone number or email to enable sending — the message tells recipients to
          reach the hosts through that contact, so a wrong number never exposes anything private.
        </p>
      )}
      {open === 'edit' && (
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
  wide?: boolean;
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
          width: '100%', maxWidth: wide ? '34rem' : '28rem',
          maxHeight: '85vh', overflowY: 'auto',
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
  onSaved: (patch: { edited_summary: string | null; edited_details: string | null }) => void;
}) {
  const [summary, setSummary] = useState(ticket.edited_summary ?? ticket.summary ?? '');
  const [details, setDetails] = useState(ticket.edited_details ?? ticket.description ?? '');
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
        body: JSON.stringify({ editedSummary: summary, editedDetails: details }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Could not save the edited report.');
      onSaved({ edited_summary: json.editedSummary ?? null, edited_details: json.editedDetails ?? null });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.');
      setBusy(false);
    }
  }

  return (
    <DialogShell title="Edit report" onClose={onClose}>
      <p className="faint" style={{ margin: 0, fontSize: '.8rem' }}>
        This is the wording that gets printed, emailed, or texted. The guest’s original report is never
        overwritten — clear both fields and save to revert to it.
      </p>
      <label style={{ display: 'flex', flexDirection: 'column', gap: '.3rem', fontSize: '.82rem' }}>
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
      <label style={{ display: 'flex', flexDirection: 'column', gap: '.3rem', fontSize: '.82rem' }}>
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
  const [destination, setDestination] = useState('');
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

  // Same builder the server sends through — what the host sees here is exactly
  // what leaves the platform.
  const preview = useMemo(
    () => (channel === 'email' ? buildServiceReportText(input) : buildServiceReportSms(input)),
    [channel, input],
  );

  const destinationOk =
    channel === 'email' ? destination.includes('@') : destination.replace(/\D/g, '').length >= 7;

  async function send() {
    if (busy || !destinationOk) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/host/properties/${ticket.property_id}/service-requests/${ticket.id}/share`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ channel, destination }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Could not send the report.');
      setSent(true);
      setDestination('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <DialogShell title={channel === 'email' ? 'Email report' : 'Text report'} onClose={onClose} wide>
      <p className="faint" style={{ margin: 0, fontSize: '.8rem' }}>
        This sends the share-safe report below — the intake details and a follow-up line pointing to{' '}
        {contactName}. No guest details, access info, or property internals are included.
      </p>
      <pre
        style={{
          margin: 0, padding: '.75rem', fontSize: '.78rem', whiteSpace: 'pre-wrap',
          background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '8px',
          maxHeight: '16rem', overflowY: 'auto',
        }}
        data-testid="share-preview"
      >
        {preview}
      </pre>
      <label style={{ display: 'flex', flexDirection: 'column', gap: '.3rem', fontSize: '.82rem' }}>
        {channel === 'email' ? 'Send to email' : 'Send to phone number'}
        <input
          className="input"
          type={channel === 'email' ? 'email' : 'tel'}
          value={destination}
          onChange={(e) => setDestination(e.target.value)}
          placeholder={channel === 'email' ? 'name@example.com' : '+1 555 123 4567'}
          disabled={busy}
          data-testid="input-share-destination"
          style={{ minHeight: 44 }}
        />
      </label>
      {error && <span className="badge badge-coral">{error}</span>}
      {sent && <span className="badge badge-teal">Sent. The recipient only sees the report above.</span>}
      <div style={{ display: 'flex', gap: '.4rem', justifyContent: 'flex-end' }}>
        <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>Close</button>
        <button
          type="button"
          className="btn btn-primary btn-sm"
          onClick={send}
          disabled={busy || !destinationOk}
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
    </DialogShell>
  );
}
