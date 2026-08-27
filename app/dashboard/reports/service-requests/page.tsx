import Link from 'next/link';
import { FileText } from 'lucide-react';
import { requireSession } from '@/lib/auth/guards';
import { createClient } from '@/lib/supabase/server';
import { PropertyFilter } from '@/components/dashboard/PropertyFilter';
import { fmtDateInTz } from '@/lib/reports/format';
import type { Database } from '@/lib/database.types';
import { ServiceRequestsReport, type ServiceReportRow } from './ServiceRequestsReport';

export const dynamic = 'force-dynamic';

// Same cap as Past stays: one bounded fetch, and the toolbar's "Showing N of M"
// line says when the cap bites.
const ROW_CAP = 500;

type ServiceStatus = Database['public']['Enums']['service_status'];
type ServiceType = Database['public']['Enums']['service_type'];

// Only terminal statuses are offered as filters — the grid only shows archived
// rows, and those are always resolved or closed.
const STATUS_OPTIONS: readonly ServiceStatus[] = ['resolved', 'closed'];
const TYPE_OPTIONS: readonly ServiceType[] = [
  'maintenance',
  'cleaning',
  'information',
  'safety',
  'emergency',
  'other',
];

const STATUS_LABEL: Record<string, string> = {
  resolved: 'Resolved',
  closed: 'Closed',
};

const TYPE_LABEL: Record<ServiceType, string> = {
  maintenance: 'Maintenance',
  cleaning: 'Cleaning',
  information: 'Information',
  safety: 'Safety',
  emergency: 'Emergency',
  other: 'Other',
};

function humanizeToken(value: string | null | undefined): string {
  if (!value) return '—';
  const words = value.replace(/_/g, ' ').trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

interface ServiceSearchParams {
  property?: string;
  from?: string;
  to?: string;
  status?: string;
  type?: string;
}

type ServiceRequestRow = {
  id: string;
  property_id: string;
  service_type: string;
  urgency: string;
  status: string;
  summary: string | null;
  description: string;
  created_at: string;
  archived_at: string | null;
};

export default async function ServiceReportsPage({
  searchParams,
}: {
  searchParams?: Promise<ServiceSearchParams>;
}) {
  const ctx = await requireSession();
  const supabase = createClient();
  const sp = (await searchParams) ?? {};

  // Same tombstone rule as the Reports hub and Past stays: names cover
  // permanently deleted properties too, so a retained report keeps its label.
  const { data: properties } = await supabase
    .from('properties')
    .select('id, display_name, deleted_at, timezone')
    .eq('host_account_id', ctx.account.id)
    .order('display_name');
  const allProps = properties ?? [];
  const propNames = new Map(allProps.map((p) => [p.id, p.display_name]));
  const propTimezones = new Map(allProps.map((p) => [p.id, p.timezone ?? null]));
  const propList = allProps.filter((p) => p.deleted_at === null);

  // A hand-edited ?property= is ignored rather than producing an empty page.
  const requested = typeof sp.property === 'string' ? sp.property : null;
  const activeProperty = requested && propNames.has(requested) ? requested : null;
  const scopeIds = activeProperty ? [activeProperty] : propList.map((p) => p.id);

  // Top filters ride the URL; grid layout state never does (see Past stays).
  // Enum filters are narrowed to the generated union types — a plain string
  // fails typecheck against them.
  const from = sp.from && /^\d{4}-\d{2}-\d{2}$/.test(sp.from) ? sp.from : null;
  const to = sp.to && /^\d{4}-\d{2}-\d{2}$/.test(sp.to) ? sp.to : null;
  const status = STATUS_OPTIONS.includes(sp.status as ServiceStatus) ? (sp.status as ServiceStatus) : null;
  const type = TYPE_OPTIONS.includes(sp.type as ServiceType) ? (sp.type as ServiceType) : null;

  let rows: ServiceReportRow[] = [];
  let totalCount = 0;

  if (scopeIds.length > 0) {
    let query = supabase
      .from('service_requests')
      .select('*', { count: 'exact' })
      .in('property_id', scopeIds)
      .eq('lifecycle_status', 'archived')
      .order('archived_at', { ascending: false, nullsFirst: false })
      .limit(ROW_CAP);
    if (from) query = query.gte('created_at', `${from}T00:00:00.000Z`);
    if (to) query = query.lte('created_at', `${to}T23:59:59.999Z`);
    if (status) query = query.eq('status', status);
    if (type) query = query.eq('service_type', type);

    const { data: requestData, count } = await query;
    totalCount = count ?? 0;
    const requests = (requestData ?? []) as ServiceRequestRow[];

    rows = requests.map((r) => ({
      id: r.id,
      summary: r.summary?.trim() || r.description,
      property: propNames.get(r.property_id) ?? 'Property',
      serviceType: humanizeToken(r.service_type),
      urgency: humanizeToken(r.urgency),
      status: STATUS_LABEL[r.status] ?? humanizeToken(r.status),
      requested: fmtDateInTz(r.created_at, propTimezones.get(r.property_id)),
      resolvedOn: fmtDateInTz(r.archived_at, propTimezones.get(r.property_id)),
      requestedTs: new Date(r.created_at).getTime(),
      resolvedTs: r.archived_at ? new Date(r.archived_at).getTime() : 0,
    }));
  }

  const printSubtitle = [
    `Property: ${activeProperty ? propNames.get(activeProperty) ?? 'Property' : 'All properties'}`,
    `Requested: ${from ?? 'any'} → ${to ?? 'any'}`,
    `Status: ${status ? STATUS_LABEL[status] ?? humanizeToken(status) : 'All'}`,
    `Type: ${type ? TYPE_LABEL[type] : 'All'}`,
  ].join(' · ');

  return (
    <div>
      <div style={{ marginBottom: '1.25rem' }}>
        <p style={{ margin: '0 0 .35rem', fontSize: '.82rem' }}>
          <Link href="/dashboard/reports" className="muted">
            ← Reports
          </Link>
        </p>
        <h1 style={{ fontSize: '1.8rem', margin: 0, display: 'flex', alignItems: 'center', gap: '.5rem' }}>
          <FileText size={20} aria-hidden /> Service reports
        </h1>
        <p className="muted" style={{ fontSize: '.9rem', margin: '.35rem 0 0' }}>
          Every resolved service request as a spreadsheet: sort any column, drag columns into the order you want,
          filter by summary, property, or type, then print or export exactly what you see. The first column opens
          the full printable record for a contractor, an owner, or your own files. Refreshing the page restores
          the default view.
        </p>
      </div>

      <PropertyFilter
        properties={propList.map((p) => ({ id: p.id, name: p.display_name }))}
        activeId={activeProperty}
        basePath="/dashboard/reports/service-requests"
      />

      <form
        method="get"
        className="card"
        style={{
          padding: '.9rem 1rem',
          margin: '.85rem 0 1.1rem',
          display: 'flex',
          gap: '.75rem',
          flexWrap: 'wrap',
          alignItems: 'flex-end',
        }}
      >
        {activeProperty ? <input type="hidden" name="property" value={activeProperty} /> : null}
        <label style={{ display: 'flex', flexDirection: 'column', gap: '.3rem', fontSize: '.78rem', fontWeight: 600 }} className="muted">
          Requested from
          <input className="input" type="date" name="from" defaultValue={from ?? ''} style={{ minHeight: 40, width: 'auto' }} />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: '.3rem', fontSize: '.78rem', fontWeight: 600 }} className="muted">
          Requested to
          <input className="input" type="date" name="to" defaultValue={to ?? ''} style={{ minHeight: 40, width: 'auto' }} />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: '.3rem', fontSize: '.78rem', fontWeight: 600 }} className="muted">
          Status
          <select className="select" name="status" defaultValue={status ?? ''} style={{ minHeight: 40, width: 'auto' }}>
            <option value="">All</option>
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABEL[s] ?? humanizeToken(s)}
              </option>
            ))}
          </select>
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: '.3rem', fontSize: '.78rem', fontWeight: 600 }} className="muted">
          Type
          <select className="select" name="type" defaultValue={type ?? ''} style={{ minHeight: 40, width: 'auto' }}>
            <option value="">All</option>
            {TYPE_OPTIONS.map((t) => (
              <option key={t} value={t}>
                {TYPE_LABEL[t]}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" className="btn btn-primary btn-sm" data-testid="service-filters-apply">
          Apply
        </button>
        <Link href="/dashboard/reports/service-requests" className="btn btn-ghost btn-sm" data-testid="service-filters-reset">
          Reset
        </Link>
      </form>

      <ServiceRequestsReport rows={rows} printSubtitle={printSubtitle} totalCount={totalCount} />
    </div>
  );
}
