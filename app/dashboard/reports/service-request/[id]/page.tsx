import { notFound } from 'next/navigation';
import { requireSession, getPropertyAccess } from '@/lib/auth/guards';
import { createClient } from '@/lib/supabase/server';
import { PrintButton } from '@/components/dashboard/PrintButton';
import { ReportActions } from '@/app/dashboard/service-requests/ReportActions';

export const dynamic = 'force-dynamic';

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

  // edited_* columns land in database.types.ts on the next `supabase gen
  // types` run; until then, widen the row type locally.
  const t = ticket as typeof ticket & {
    edited_summary: string | null;
    edited_details: string | null;
    edited_at: string | null;
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
    ['Assigned to', contact ? [contact.name, contact.label].filter(Boolean).join(' \u00b7 ') || contact.contact_type : null],
  ];

  return (
    <div className="report-sheet">
      <div className="report-toolbar">
        <a href="/dashboard/reports" className="btn btn-ghost btn-sm">← All reports</a>
        <ReportActions
          ticket={{
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
          }}
          propertyName={access.property.display_name}
          contacts={shareContacts}
          canManage={access.can.resolveMaintenance}
        />
        <PrintButton />
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
                <span className="report-timeline-when">{fmt(entry.at) ?? '\u2014'}</span>
                <span>
                  {entry.status ? <strong>{STATUS_LABEL[entry.status] ?? entry.status}</strong> : null}
                  {entry.note ? `${entry.status ? ' \u00b7 ' : ''}${entry.note}` : null}
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
    </div>
  );
}
