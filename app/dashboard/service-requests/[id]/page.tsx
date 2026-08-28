import { notFound } from 'next/navigation';
import { requireSession, getPropertyAccess } from '@/lib/auth/guards';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient, hasServiceRole } from '@/lib/supabase/admin';
import { DomeMark } from '@/components/Logo';
import { ReportActions } from '../ReportActions';

export const dynamic = 'force-dynamic';

// The printable Service Report lives under the Service tab — NOT under Reports.
// It is the shareable/printable record of a service request, but the workflow
// around it (triage, edit, assign, email/text, print) is Service-tab scope, so
// the URL, the top-nav active state, and the breadcrumb trail all stay inside
// /dashboard/service-requests. The legacy /dashboard/reports/service-request/[id]
// URL permanently redirects here.

const STATUS_LABEL: Record<string, string> = {
  new: 'New',
  acknowledged: 'Acknowledged',
  in_progress: 'In progress',
  waiting_on_guest: 'Waiting on guest',
  resolved: 'Resolved',
  closed: 'Closed',
};

function fmt(value: string | null | undefined) {
  if (!value) return null;
  return new Date(value).toLocaleString('en-US', {
    year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  });
}

/** Normalises the jsonb columns, which may hold a string, an array, or null. */
function toList(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((v): v is string => typeof v === 'string' && v.trim() !== '');
  if (typeof value === 'string' && value.trim() !== '') return [value];
  return [];
}

interface TimelineEntry { at?: string; status?: string; note?: string; by?: string }

function toTimeline(value: unknown): TimelineEntry[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is TimelineEntry => typeof v === 'object' && v !== null);
}

export default async function ServiceRequestReportPage({ params }: { params: Promise<{ id: string }> }) {
  await requireSession();
  const supabase = createClient();

  const { data: ticket } = await supabase
    .from('service_requests')
    .select('*')
    .eq('id', (await params).id)
    .maybeSingle();

  // RLS already scopes this select, but re-checking property access explicitly
  // means a leaked or guessed report URL still cannot render for someone who
  // lost access to the property, and it gives us the property name to print.
  if (!ticket) notFound();
  const access = await getPropertyAccess(ticket.property_id);
  if (!access) notFound();

  // edited_* / assigned_profile_id land in database.types.ts on the next
  // `supabase gen types` run; until then, widen the row type locally.
  const t = ticket as typeof ticket & {
    edited_summary: string | null;
    edited_details: string | null;
    edited_at: string | null;
    assigned_profile_id: string | null;
  };

  const causes = toList(t.likely_causes);
  const parts = toList(t.suggested_parts);
  const flags = toList(t.safety_flags);
  const timeline = toTimeline(t.timeline);

  const { data: contact } = t.assigned_contact_id
    ? await supabase
        .from('property_contacts')
        .select('name, label, contact_type, phone, email')
        .eq('id', t.assigned_contact_id)
        .maybeSingle()
    : { data: null };

  // The contact list the share dialog needs: just the assigned contact, in the
  // shape ReportActions expects.
  const shareContacts = contact && t.assigned_contact_id
    ? [{ id: t.assigned_contact_id, name: contact.name, label: contact.label, phone: contact.phone, email: contact.email }]
    : [];

  // Assignable teammates for the Assign dialog: the account owner plus every
  // member of this property, read through the service role (member names and
  // emails are account data the RLS session client does not expose).
  let members: { id: string; name: string | null; email: string | null }[] = [];
  let assignedMemberName: string | null = null;
  if (hasServiceRole()) {
    const admin = createAdminClient();
    const [{ data: account }, { data: membershipRows }] = await Promise.all([
      admin.from('host_accounts').select('owner_id').eq('id', access.property.host_account_id).maybeSingle(),
      admin.from('property_members').select('profile_id').eq('property_id', t.property_id),
    ]);
    const memberIds = [...new Set([account?.owner_id, ...(membershipRows ?? []).map((m) => m.profile_id)].filter((v): v is string => Boolean(v)))];
    const profileIds = [...new Set([...memberIds, t.assigned_profile_id].filter((v): v is string => Boolean(v)))];
    const { data: profiles } = profileIds.length
      ? await admin.from('profiles').select('id, email, full_name').in('id', profileIds)
      : { data: [] };
    const profileById = new Map((profiles ?? []).map((p) => [p.id, p]));
    members = memberIds
      .map((pid) => profileById.get(pid))
      .filter((p): p is NonNullable<typeof p> => Boolean(p))
      .map((p) => ({ id: p.id, name: (p.full_name ?? '').trim() || null, email: p.email ?? null }));
    const assignedProfile = t.assigned_profile_id ? profileById.get(t.assigned_profile_id) : null;
    assignedMemberName = assignedProfile ? (assignedProfile.full_name ?? '').trim() || assignedProfile.email || null : null;
  }

  const rows: Array<[string, string | null]> = [
    ['Property', access.property.display_name],
    ['Request ID', t.id],
    ['Type', String(t.service_type ?? '').replace(/_/g, ' ') || null],
    ['Urgency', t.urgency ?? null],
    ['Status', STATUS_LABEL[t.status] ?? t.status],
    ['Reported', fmt(t.created_at)],
    ['Closed', fmt(t.archived_at)],
    ['Edited by host', fmt(t.edited_at)],
    ['Location', t.location_note ?? null],
    ['Assigned to', contact ? [contact.name, contact.label].filter(Boolean).join(' · ') || contact.contact_type : null],
    ['Assigned user', assignedMemberName],
  ];

  // One ticket shape feeds both ReportActions instances (header share icons +
  // footer Edit/Assign) — identical data, two layouts.
  const actionTicket = {
    id: t.id,
    property_id: t.property_id,
    service_type: String(t.service_type ?? 'other'),
    urgency: String(t.urgency ?? 'medium'),
    summary: t.summary ?? null,
    description: t.description ?? null,
    edited_summary: t.edited_summary,
    edited_details: t.edited_details,
    created_at: t.created_at,
    assigned_contact_id: t.assigned_contact_id ?? null,
    assigned_profile_id: t.assigned_profile_id ?? null,
    location_note: t.location_note ?? null,
    access_instructions: t.access_instructions ?? null,
    guest_availability: t.guest_availability ?? null,
    resolution_notes: t.resolution_notes ?? null,
    likely_causes: t.likely_causes,
    suggested_parts: t.suggested_parts,
    safety_flags: t.safety_flags,
  };

  return (
    <div className="report-sheet">
      {/* Print-only letterhead: the sheet reads as a Moche-AI document when it
          leaves the app — on paper, in a PDF, in an email attachment. Hidden
          on screen (the report page doesn't render ReportGrid, so it carries
          the hide/show rule itself). */}
      <style>{`.report-print-brand { display: none; } @media print { .report-print-brand { display: flex; align-items: center; gap: .45rem; margin-bottom: 1rem; color: #000; font-family: var(--font-display); font-weight: 600; } }`}</style>
      <div className="report-print-brand" aria-hidden>
        <DomeMark size={22} variant="mono" />
        <span>Moche-AI</span>
      </div>

      {/* Share actions sit top-right of the report on screen; Edit report and
          Assign stay at the foot. The header row is hidden from print via
          .report-toolbar (the global print block already hides it). */}
      <div className="report-toolbar" style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '.5rem' }}>
        <ReportActions
          ticket={actionTicket}
          propertyName={access.property.display_name}
          contacts={shareContacts}
          canManage={access.can.resolveMaintenance}
          layout="header"
          printMode="native"
        />
      </div>

      <header className="report-head">
        <p className="report-kicker">Service report</p>
        <h1 className="report-title">
          {t.edited_summary || t.summary || String(t.service_type ?? 'Service request').replace(/_/g, ' ')}
        </h1>
        <p className="report-sub">{access.property.display_name}</p>
      </header>

      {flags.length > 0 && (
        <div className="report-flags" role="note">
          <strong>Safety flags:</strong> {flags.join(', ')}
        </div>
      )}

      <table className="report-meta">
        <caption className="sr-only">Request details</caption>
        <tbody>
          {rows
            .filter(([, v]) => v)
            .map(([label, value]) => (
              <tr key={label}>
                <th scope="row">{label}</th>
                <td>{value}</td>
              </tr>
            ))}
        </tbody>
      </table>

      <section className="report-section">
        <h2>Reported issue</h2>
        <p>{t.edited_details || t.description || 'No description recorded.'}</p>
      </section>

      {t.access_instructions && (
        <section className="report-section">
          <h2>Access instructions</h2>
          <p>{t.access_instructions}</p>
        </section>
      )}

      {t.guest_availability && (
        <section className="report-section">
          <h2>Guest availability</h2>
          <p>{t.guest_availability}</p>
        </section>
      )}

      {causes.length > 0 && (
        <section className="report-section">
          <h2>Likely causes</h2>
          <ul>{causes.map((c, i) => <li key={i}>{c}</li>)}</ul>
        </section>
      )}

      {parts.length > 0 && (
        <section className="report-section">
          <h2>Suggested parts and tools</h2>
          <ul>{parts.map((p, i) => <li key={i}>{p}</li>)}</ul>
        </section>
      )}

      {timeline.length > 0 && (
        <section className="report-section">
          <h2>Timeline</h2>
          <ol className="report-timeline">
            {timeline.map((entry, i) => (
              <li key={i}>
                <span className="report-timeline-when">{fmt(entry.at) ?? '—'}</span>
                <span>
                  {entry.status ? <strong>{STATUS_LABEL[entry.status] ?? entry.status}</strong> : null}
                  {entry.note ? `${entry.status ? ' · ' : ''}${entry.note}` : null}
                </span>
              </li>
            ))}
          </ol>
        </section>
      )}

      <section className="report-section">
        <h2>Resolution</h2>
        <p>{t.resolution_notes || 'Not yet resolved.'}</p>
      </section>

      <footer className="report-foot">
        <span>Moche AI service report</span>
        <span>Generated {fmt(new Date().toISOString())}</span>
      </footer>

      {/* Edit + Assign stay at the foot of the report. The print stylesheet
          hides .report-toolbar, so a hard copy is the report alone. */}
      <div
        className="report-toolbar"
        role="toolbar"
        aria-label="Report actions"
        style={{ display: 'flex', justifyContent: 'flex-start', marginTop: '2rem', marginBottom: 0, paddingTop: '1rem', borderTop: '1px solid var(--border)' }}
      >
        <ReportActions
          ticket={actionTicket}
          propertyName={access.property.display_name}
          contacts={shareContacts}
          members={members}
          canManage={access.can.resolveMaintenance}
          layout="page"
          printMode="native"
        />
      </div>
    </div>
  );
}
