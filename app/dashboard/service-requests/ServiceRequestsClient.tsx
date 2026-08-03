'use client';

import { useMemo, useState } from 'react';
import {
  Sparkles, AlertTriangle, ChevronDown, ChevronUp, Image as ImageIcon,
  MapPin, Wrench, KeyRound, Clock3, UserRound, CheckCircle2,
} from 'lucide-react';

export interface ServiceTicket {
  id: string;
  property_id: string;
  description: string;
  service_type: string;
  status: string;
  urgency: string;
  resolution_notes: string | null;
  created_at: string;
  location_note: string | null;
  likely_causes: unknown;
  suggested_parts: unknown;
  access_instructions: string | null;
  guest_availability: string | null;
  summary: string | null;
  media_urls: unknown;
  interview_status: string;
  assigned_contact_id: string | null;
}

export interface PropertyContactOption {
  id: string;
  property_id: string;
  name: string | null;
  label: string | null;
  contact_type: string;
  phone: string | null;
  email: string | null;
  is_primary: boolean;
  is_emergency: boolean;
}

interface PropertyOption { id: string; name: string; canResolve: boolean }

const STATUS_BADGE: Record<string, string> = {
  new: 'badge-coral',
  acknowledged: 'badge-teal',
  in_progress: 'badge-teal',
  waiting_on_guest: 'badge-coral',
  resolved: '',
  closed: '',
};

const STATUS_LABEL: Record<string, string> = {
  new: 'New',
  acknowledged: 'Acknowledged',
  in_progress: 'In progress',
  waiting_on_guest: 'Waiting on guest',
  resolved: 'Resolved',
  closed: 'Closed',
};

const URGENCY_COLOR: Record<string, string> = {
  low: 'var(--text-muted)',
  medium: 'var(--teal)',
  high: 'var(--coral)',
  critical: '#ff5c5c',
};

const URGENCY_RANK: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };

// Forward-only next-step suggestions per status, mirroring the server's allowed-transition
// map. Buttons only ever offer moves the API will actually accept.
const NEXT_STATUSES: Record<string, string[]> = {
  new: ['acknowledged', 'resolved'],
  acknowledged: ['in_progress', 'waiting_on_guest', 'resolved'],
  in_progress: ['waiting_on_guest', 'resolved'],
  waiting_on_guest: ['in_progress', 'resolved'],
  resolved: ['closed', 'in_progress'],
  closed: [],
};

function timeAgo(iso: string): string {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'just now';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function asStringList(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is string => typeof x === 'string');
}

function TicketCard({
  ticket, propertyName, canResolve, contacts, onChanged,
}: {
  ticket: ServiceTicket;
  propertyName: string;
  canResolve: boolean;
  contacts: PropertyContactOption[];
  onChanged: (patch: Partial<ServiceTicket>) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [busyStatus, setBusyStatus] = useState<string | null>(null);
  const [busyAssign, setBusyAssign] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mediaUrls, setMediaUrls] = useState<{ key: string; url: string }[] | null>(null);
  const [mediaLoading, setMediaLoading] = useState(false);

  const mediaKeys = asStringList(ticket.media_urls);
  const likelyCauses = asStringList(ticket.likely_causes);
  const suggestedParts = asStringList(ticket.suggested_parts);
  const nextOptions = NEXT_STATUSES[ticket.status] ?? [];
  const assignedContact = contacts.find((c) => c.id === ticket.assigned_contact_id) ?? null;

  async function changeStatus(next: string) {
    if (!canResolve || busyStatus) return;
    setBusyStatus(next);
    setError(null);
    try {
      const res = await fetch(`/api/host/properties/${ticket.property_id}/service-requests/${ticket.id}/status`, {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ status: next }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Could not update status.');
      onChanged({ status: next });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.');
    } finally {
      setBusyStatus(null);
    }
  }

  async function assign(contactId: string | null) {
    if (!canResolve || busyAssign) return;
    setBusyAssign(true);
    setError(null);
    try {
      const res = await fetch(`/api/host/properties/${ticket.property_id}/service-requests/${ticket.id}/assign`, {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ contactId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Could not assign.');
      onChanged({ assigned_contact_id: contactId });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.');
    } finally {
      setBusyAssign(false);
    }
  }

  async function loadMedia() {
    if (mediaUrls || mediaLoading || mediaKeys.length === 0) return;
    setMediaLoading(true);
    try {
      const res = await fetch(`/api/host/properties/${ticket.property_id}/service-requests/${ticket.id}/media`);
      const json = await res.json();
      if (res.ok) setMediaUrls(json.urls ?? []);
    } catch { /* best-effort */ } finally {
      setMediaLoading(false);
    }
  }

  return (
    <div className="card" style={{ padding: '1.15rem 1.25rem' }} data-testid="service-request-row">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '.6rem', marginBottom: '.5rem', flexWrap: 'wrap' }}>
        <span className="faint" style={{ fontSize: '.78rem' }}>
          {propertyName} &middot; {ticket.service_type.replace(/_/g, ' ')}
        </span>
        <span style={{ display: 'inline-flex', gap: '.4rem', alignItems: 'center' }}>
          <span style={{ fontSize: '.72rem', color: URGENCY_COLOR[ticket.urgency] ?? 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.04em' }}>
            {ticket.urgency}
          </span>
          <span className={`badge ${STATUS_BADGE[ticket.status] ?? ''}`}>{STATUS_LABEL[ticket.status] ?? ticket.status}</span>
        </span>
      </div>

      <p style={{ margin: 0 }}>{ticket.summary || ticket.description}</p>

      {ticket.interview_status === 'safety_escalated' && (
        <p style={{ display: 'flex', alignItems: 'center', gap: '.35rem', color: '#ff5c5c', fontSize: '.82rem', fontWeight: 600, margin: '.5rem 0 0' }}>
          <AlertTriangle size={14} aria-hidden /> Safety escalation — reported directly, no interview run
        </p>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem', marginTop: '.65rem', flexWrap: 'wrap' }}>
        {assignedContact && (
          <span className="badge" style={{ display: 'inline-flex', alignItems: 'center', gap: '.3rem' }}>
            <UserRound size={12} aria-hidden /> {assignedContact.name ?? assignedContact.label ?? 'Contact'}
          </span>
        )}
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setExpanded((v) => !v); if (!expanded) loadMedia(); }} data-testid="button-expand-ticket">
          {expanded ? <ChevronUp size={14} aria-hidden /> : <ChevronDown size={14} aria-hidden />} {expanded ? 'Hide details' : 'View details'}
        </button>
      </div>

      {expanded && (
        <div style={{ marginTop: '.85rem', paddingTop: '.85rem', borderTop: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: '.6rem' }}>
          <p className="muted" style={{ margin: 0, fontSize: '.88rem' }}>{ticket.description}</p>

          {ticket.location_note && (
            <p style={{ display: 'flex', alignItems: 'flex-start', gap: '.4rem', margin: 0, fontSize: '.85rem' }}>
              <MapPin size={14} aria-hidden style={{ marginTop: 2, flexShrink: 0, color: 'var(--iris)' }} /> {ticket.location_note}
            </p>
          )}

          {likelyCauses.length > 0 && (
            <div style={{ fontSize: '.85rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '.4rem', fontWeight: 600, marginBottom: '.2rem' }}>
                <Wrench size={14} aria-hidden style={{ color: 'var(--iris)' }} /> Likely causes (unverified)
              </div>
              <ul style={{ margin: 0, paddingLeft: '1.4rem' }}>
                {likelyCauses.map((c) => <li key={c}>{c}</li>)}
              </ul>
            </div>
          )}

          {suggestedParts.length > 0 && (
            <div style={{ fontSize: '.85rem' }}>
              <div style={{ fontWeight: 600, marginBottom: '.2rem' }}>Suggested parts</div>
              <ul style={{ margin: 0, paddingLeft: '1.4rem' }}>
                {suggestedParts.map((p) => <li key={p}>{p}</li>)}
              </ul>
            </div>
          )}

          {ticket.access_instructions && (
            <p style={{ display: 'flex', alignItems: 'flex-start', gap: '.4rem', margin: 0, fontSize: '.85rem' }}>
              <KeyRound size={14} aria-hidden style={{ marginTop: 2, flexShrink: 0, color: 'var(--iris)' }} /> {ticket.access_instructions}
            </p>
          )}

          {ticket.guest_availability && (
            <p style={{ display: 'flex', alignItems: 'flex-start', gap: '.4rem', margin: 0, fontSize: '.85rem' }}>
              <Clock3 size={14} aria-hidden style={{ marginTop: 2, flexShrink: 0, color: 'var(--iris)' }} /> Guest available: {ticket.guest_availability}
            </p>
          )}

          {mediaKeys.length > 0 && (
            <div style={{ fontSize: '.85rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '.4rem', fontWeight: 600, marginBottom: '.35rem' }}>
                <ImageIcon size={14} aria-hidden style={{ color: 'var(--iris)' }} /> Attachments ({mediaKeys.length})
              </div>
              {mediaLoading ? (
                <p className="faint" style={{ margin: 0 }}>Loading…</p>
              ) : (
                <div style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap' }}>
                  {(mediaUrls ?? []).map((m) => (
                    <a key={m.key} href={m.url} target="_blank" rel="noreferrer" className="btn btn-ghost btn-sm">
                      View file
                    </a>
                  ))}
                </div>
              )}
            </div>
          )}

          {ticket.resolution_notes && (
            <p className="muted" style={{ fontSize: '.85rem', margin: 0, paddingLeft: '.75rem', borderLeft: '2px solid var(--border)' }}>
              {ticket.resolution_notes}
            </p>
          )}

          {canResolve && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '.5rem', marginTop: '.25rem' }}>
              {error && <span className="badge badge-coral">{error}</span>}
              {nextOptions.length > 0 && (
                <div style={{ display: 'flex', gap: '.4rem', flexWrap: 'wrap' }}>
                  {nextOptions.map((s) => (
                    <button
                      key={s}
                      type="button"
                      className={s === 'resolved' ? 'btn btn-primary btn-sm' : 'btn btn-ghost btn-sm'}
                      disabled={busyStatus !== null}
                      onClick={() => changeStatus(s)}
                      data-testid={`button-status-${s}`}
                    >
                      {busyStatus === s ? 'Updating…' : (s === 'resolved' ? <><CheckCircle2 size={13} aria-hidden /> Mark resolved</> : `Move to ${STATUS_LABEL[s]}`)}
                    </button>
                  ))}
                </div>
              )}
              {contacts.length > 0 && (
                <label style={{ display: 'flex', alignItems: 'center', gap: '.5rem', fontSize: '.82rem' }}>
                  Assign to
                  <select
                    className="select"
                    value={ticket.assigned_contact_id ?? ''}
                    disabled={busyAssign}
                    onChange={(e) => assign(e.target.value || null)}
                    data-testid="select-assign-contact"
                  >
                    <option value="">Unassigned</option>
                    {contacts.map((c) => (
                      <option key={c.id} value={c.id}>{c.name ?? c.label ?? 'Contact'}{c.name && c.label ? ` (${c.label})` : ''}</option>
                    ))}
                  </select>
                </label>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function ServiceRequestsClient({
  tickets, propertyNames, properties, contacts,
}: {
  tickets: ServiceTicket[];
  propertyNames: Record<string, string>;
  properties: PropertyOption[];
  contacts: PropertyContactOption[];
}) {
  const [rows, setRows] = useState(tickets);
  const canResolveMap = useMemo(() => new Map(properties.map((p) => [p.id, p.canResolve])), [properties]);
  const contactsByProperty = useMemo(() => {
    const map = new Map<string, PropertyContactOption[]>();
    for (const c of contacts) {
      const list = map.get(c.property_id) ?? [];
      list.push(c);
      map.set(c.property_id, list);
    }
    return map;
  }, [contacts]);

  // Active first (grouped by not-done), then sorted by urgency severity, then newest first.
  const sorted = useMemo(
    () =>
      [...rows].sort((a, b) => {
        const aActive = !['resolved', 'closed'].includes(a.status);
        const bActive = !['resolved', 'closed'].includes(b.status);
        if (aActive !== bActive) return aActive ? -1 : 1;
        const rankDiff = (URGENCY_RANK[a.urgency] ?? 9) - (URGENCY_RANK[b.urgency] ?? 9);
        if (rankDiff !== 0) return rankDiff;
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      }),
    [rows],
  );
  const active = rows.filter((s) => !['resolved', 'closed'].includes(s.status));

  function patchTicket(id: string, patch: Partial<ServiceTicket>) {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }

  return (
    <div>
      <div style={{ marginBottom: '1.5rem' }}>
        <h1 style={{ fontSize: '1.8rem' }}>Service requests</h1>
        <p className="muted" style={{ fontSize: '.9rem' }}>
          Maintenance, cleaning, and safety issues raised by guests or the concierge. {active.length} active.
        </p>
      </div>

      {sorted.length === 0 ? (
        <div className="card" style={{ padding: '2rem', textAlign: 'center' }}>
          <Sparkles size={22} aria-hidden style={{ color: 'var(--teal)', marginBottom: '.6rem' }} />
          <p className="muted">No service requests yet. When a guest reports a problem, it&rsquo;s routed here with a type and urgency so you can act fast.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '.75rem' }}>
          {sorted.map((s) => (
            <TicketCard
              key={s.id}
              ticket={s}
              propertyName={propertyNames[s.property_id] ?? 'Property'}
              canResolve={canResolveMap.get(s.property_id) ?? false}
              contacts={contactsByProperty.get(s.property_id) ?? []}
              onChanged={(patch) => patchTicket(s.id, patch)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
