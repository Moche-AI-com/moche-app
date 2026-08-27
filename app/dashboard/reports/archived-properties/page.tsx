import Link from 'next/link';
import { Building2 } from 'lucide-react';
import { requireSession } from '@/lib/auth/guards';
import { createClient } from '@/lib/supabase/server';
import { PropertyFilter } from '@/components/dashboard/PropertyFilter';
import { fmtDateInTz } from '@/lib/reports/format';
import { RestorePropertyButton } from '../RestorePropertyButton';

export const dynamic = 'force-dynamic';

interface ArchivedSearchParams {
  property?: string;
}

export default async function ArchivedPropertiesPage({
  searchParams,
}: {
  searchParams?: Promise<ArchivedSearchParams>;
}) {
  const ctx = await requireSession();
  const supabase = createClient();
  const sp = (await searchParams) ?? {};

  const { data: properties } = await supabase
    .from('properties')
    .select('id, display_name, status, archived_at, updated_at, deleted_at, timezone')
    .eq('host_account_id', ctx.account.id)
    .order('display_name');
  const allProps = properties ?? [];
  const propNames = new Map(allProps.map((p) => [p.id, p.display_name]));
  const propTimezones = new Map(allProps.map((p) => [p.id, p.timezone ?? null]));
  const propList = allProps.filter((p) => p.deleted_at === null);

  const requested = typeof sp.property === 'string' ? sp.property : null;
  const activeProperty = requested && propNames.has(requested) ? requested : null;

  // Archived properties live here rather than in the Properties list. Ordered
  // newest-archived-first, falling back to `updated_at` for rows archived before
  // `archived_at` existed.
  const archived = propList
    .filter((p) => p.status === 'archived' && (!activeProperty || p.id === activeProperty))
    .sort((a, b) => (b.archived_at ?? b.updated_at).localeCompare(a.archived_at ?? a.updated_at));

  return (
    <div>
      {/* This page has no ReportGrid, so it carries the .no-print rule itself —
          the grid's scoped style block defines it everywhere else. */}
      <style>{`@media print { .no-print { display: none !important; } }`}</style>
      <div className="no-print" style={{ marginBottom: '1.25rem' }}>
        <p style={{ margin: '0 0 .35rem', fontSize: '.82rem' }}>
          <Link href="/dashboard/reports" className="muted">
            ← Reports
          </Link>
        </p>
        <h1 style={{ fontSize: '1.8rem', margin: 0, display: 'flex', alignItems: 'center', gap: '.5rem' }}>
          <Building2 size={20} aria-hidden /> Archived properties
          <span className="faint" style={{ fontSize: '.9rem', fontWeight: 400 }}>({archived.length})</span>
        </h1>
        <p className="muted" style={{ fontSize: '.9rem', margin: '.35rem 0 0' }}>
          These are out of your active list and their guest portals are closed. Their records stay here, and you can
          restore one at any time — it comes back paused so you decide when guests get in again.
        </p>
      </div>

      <div className="no-print">
        <PropertyFilter
          properties={propList.map((p) => ({ id: p.id, name: p.display_name }))}
          activeId={activeProperty}
          basePath="/dashboard/reports/archived-properties"
        />
      </div>

      <div style={{ marginTop: '1rem' }}>
        {archived.length === 0 ? (
          <div className="card" style={{ padding: '2rem', textAlign: 'center' }}>
            <p className="muted" style={{ margin: 0, fontSize: '.9rem' }}>
              No archived properties. Archiving a property moves it here and closes its guest portal.
            </p>
          </div>
        ) : (
          <div className="report-list">
            {archived.map((p) => (
              <div key={p.id} className="report-list-row" data-testid="archived-property-row">
                <div style={{ minWidth: 0 }}>
                  <p className="report-list-title">{p.display_name}</p>
                  <p className="report-list-meta">
                    Archived {fmtDateInTz(p.archived_at ?? p.updated_at, propTimezones.get(p.id))}
                  </p>
                </div>
                <div style={{ display: 'flex', gap: '.4rem', flexWrap: 'wrap' }}>
                  <RestorePropertyButton propertyId={p.id} />
                  <Link href={`/dashboard/properties/${p.id}`} className="btn btn-ghost btn-sm">
                    Open
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
