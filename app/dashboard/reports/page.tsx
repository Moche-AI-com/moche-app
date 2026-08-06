import Link from 'next/link';
import { Printer, Archive, FileText, Sparkles, Building2 } from 'lucide-react';
import { requireSession } from '@/lib/auth/guards';
import { createClient } from '@/lib/supabase/server';
import { PropertyFilter } from '@/components/dashboard/PropertyFilter';
import { EXTRAS_ORDER_STATUS_LABEL, type ExtrasOrderStatus } from '@/lib/dashboard/extras-orders';
import { RestorePropertyButton } from './RestorePropertyButton';

export const dynamic = 'force-dynamic';

const STATUS_LABEL: Record<string, string> = {
  resolved: 'Resolved',
  closed: 'Closed',
  completed: 'Completed',
  revoked: 'Revoked',
};

function fmtDate(value: string | null) {
  if (!value) return '\u2014';
  return new Date(value).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

export default async function ReportsPage({
  searchParams,
}: {
  searchParams?: { property?: string | string[] };
}) {
  const ctx = await requireSession();
  const supabase = createClient();

  // Deliberately NOT filtered on `deleted_at`. Permanently deleting a property
  // keeps the host's reports and leaves the property row behind as a stripped
  // tombstone (see lib/properties/purge.ts) precisely so those reports can still
  // say which property they came from. Filtering deleted rows out here would
  // label every retained report "Property".
  const { data: properties } = await supabase
    .from('properties')
    .select('id, display_name, status, archived_at, updated_at, deleted_at')
    .eq('host_account_id', ctx.account.id)
    .order('display_name');

  const allProps = properties ?? [];
  // Names cover deleted properties too, so a retained report keeps its label.
  const propNames = new Map(allProps.map((p) => [p.id, p.display_name]));
  // The filter and the report scope only offer properties that still exist.
  const propList = allProps.filter((p) => p.deleted_at === null);

  // Archived properties live here rather than in the Properties list. Ordered
  // newest-archived-first, falling back to `updated_at` for rows archived before
  // `archived_at` existed.
  const archivedProps = propList
    .filter((p) => p.status === 'archived')
    .sort((a, b) => (b.archived_at ?? b.updated_at).localeCompare(a.archived_at ?? a.updated_at));

  // Only honour a property filter for a property this account actually owns.
  // Otherwise a hand-edited ?property= would produce a confusing empty page
  // instead of simply being ignored.
  const requested = Array.isArray(searchParams?.property) ? searchParams?.property[0] : searchParams?.property;
  const activeProperty = requested && propNames.has(requested) ? requested : null;
  const scopeIds = activeProperty ? [activeProperty] : propList.map((p) => p.id);

  let requests: Array<{ id: string; property_id: string; service_type: string; status: string; urgency: string; created_at: string; archived_at: string | null; summary: string | null; description: string }> = [];
  let stays: Array<{ id: string; property_id: string; guest_display_name: string | null; check_in: string | null; check_out: string | null; status: string; archived_at: string | null }> = [];
  let extras: Array<{ id: string; property_id: string; item_title: string; item_price_text: string | null; quantity: number; status: ExtrasOrderStatus; created_at: string; archived_at: string | null }> = [];

  if (scopeIds.length) {
    const [reqRes, stayRes, extrasRes] = await Promise.all([
      supabase
        .from('service_requests')
        .select('id, property_id, service_type, status, urgency, created_at, archived_at, summary, description')
        .in('property_id', scopeIds)
        .eq('lifecycle_status', 'archived')
        .order('archived_at', { ascending: false, nullsFirst: false })
        .limit(200),
      supabase
        .from('stays')
        .select('id, property_id, guest_display_name, check_in, check_out, status, archived_at')
        .in('property_id', scopeIds)
        .is('deleted_at', null)
        .eq('lifecycle_status', 'archived')
        .order('check_out', { ascending: false, nullsFirst: false })
        .limit(200),
      supabase
        .from('extras_orders')
        .select('id, property_id, item_title, item_price_text, quantity, status, created_at, archived_at')
        .in('property_id', scopeIds)
        .eq('lifecycle_status', 'archived')
        .order('archived_at', { ascending: false, nullsFirst: false })
        .limit(200),
    ]);
    requests = reqRes.data ?? [];
    stays = stayRes.data ?? [];
    extras = (extrasRes.data ?? []) as typeof extras;
  }

  const empty =
    requests.length === 0 && stays.length === 0 && extras.length === 0 && archivedProps.length === 0;

  return (
    <div>
      <div style={{ marginBottom: '1.25rem' }}>
        <h1 style={{ fontSize: '1.8rem', margin: 0 }}>Reports</h1>
        <p className="muted" style={{ fontSize: '.9rem', margin: '.35rem 0 0' }}>
          Your archive of completed work and retired properties. Print any service report for a contractor, an owner,
          or your own records.
        </p>
      </div>

      <PropertyFilter properties={propList.map((p) => ({ id: p.id, name: p.display_name }))} activeId={activeProperty} basePath="/dashboard/reports" />

      {empty ? (
        <div className="card" style={{ padding: '2rem', textAlign: 'center' }}>
          <Archive size={22} aria-hidden style={{ color: 'var(--text-faint)', marginBottom: '.6rem' }} />
          <p className="muted">
            Nothing archived yet. Once you resolve a service request, complete an extra, a stay checks out, or you
            archive a property, it appears here as a printable record.
          </p>
        </div>
      ) : (
        <>
          {archivedProps.length > 0 && (
            <section style={{ marginBottom: '2rem' }} data-testid="archived-properties-section">
              <h2 style={{ fontSize: '1.1rem', display: 'flex', alignItems: 'center', gap: '.45rem', marginBottom: '.75rem' }}>
                <Building2 size={16} aria-hidden /> Archived properties
                <span className="faint" style={{ fontSize: '.8rem', fontWeight: 400 }}>({archivedProps.length})</span>
              </h2>
              <p className="muted" style={{ fontSize: '.85rem', margin: '0 0 .75rem' }}>
                These are out of your active list and their guest portals are closed. Their records stay here, and you can
                restore one at any time — it comes back paused so you decide when guests get in again.
              </p>
              <div className="report-list">
                {archivedProps.map((p) => (
                  <div key={p.id} className="report-list-row" data-testid="archived-property-row">
                    <div style={{ minWidth: 0 }}>
                      <p className="report-list-title">{p.display_name}</p>
                      <p className="report-list-meta">Archived {fmtDate(p.archived_at ?? p.updated_at)}</p>
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
            </section>
          )}

          <section style={{ marginBottom: '2rem' }}>
            <h2 style={{ fontSize: '1.1rem', display: 'flex', alignItems: 'center', gap: '.45rem', marginBottom: '.75rem' }}>
              <FileText size={16} aria-hidden /> Service reports
              <span className="faint" style={{ fontSize: '.8rem', fontWeight: 400 }}>({requests.length})</span>
            </h2>
            {requests.length === 0 ? (
              <p className="muted" style={{ fontSize: '.88rem' }}>No resolved service requests yet.</p>
            ) : (
              <div className="report-list">
                {requests.map((r) => (
                  <div key={r.id} className="report-list-row" data-testid="report-request-row">
                    <div style={{ minWidth: 0 }}>
                      <p className="report-list-title">{r.summary || r.description}</p>
                      <p className="report-list-meta">
                        {propNames.get(r.property_id) ?? 'Property'} &middot; {r.service_type.replace(/_/g, ' ')} &middot;{' '}
                        {STATUS_LABEL[r.status] ?? r.status} {fmtDate(r.archived_at ?? r.created_at)}
                      </p>
                    </div>
                    <Link
                      href={`/dashboard/reports/service-request/${r.id}`}
                      className="btn btn-ghost btn-sm"
                      data-testid="report-print-link"
                    >
                      <Printer size={13} aria-hidden /> Report
                    </Link>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section style={{ marginBottom: '2rem' }}>
            <h2 style={{ fontSize: '1.1rem', display: 'flex', alignItems: 'center', gap: '.45rem', marginBottom: '.75rem' }}>
              <Sparkles size={16} aria-hidden /> Completed extras
              <span className="faint" style={{ fontSize: '.8rem', fontWeight: 400 }}>({extras.length})</span>
            </h2>
            {extras.length === 0 ? (
              <p className="muted" style={{ fontSize: '.88rem' }}>No completed extras yet.</p>
            ) : (
              <div className="report-list">
                {extras.map((e) => (
                  <div key={e.id} className="report-list-row" data-testid="report-extra-row">
                    <div style={{ minWidth: 0 }}>
                      <p className="report-list-title">
                        {e.item_title}
                        {e.quantity > 1 && <span className="faint"> &times;{e.quantity}</span>}
                      </p>
                      <p className="report-list-meta">
                        {propNames.get(e.property_id) ?? 'Property'}
                        {e.item_price_text ? ` \u00b7 ${e.item_price_text}` : ''} &middot;{' '}
                        {EXTRAS_ORDER_STATUS_LABEL[e.status] ?? e.status} {fmtDate(e.archived_at ?? e.created_at)}
                      </p>
                    </div>
                    <Link href="/dashboard/extras?view=past" className="btn btn-ghost btn-sm">
                      Open
                    </Link>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section>
            <h2 style={{ fontSize: '1.1rem', display: 'flex', alignItems: 'center', gap: '.45rem', marginBottom: '.75rem' }}>
              <Archive size={16} aria-hidden /> Past stays
              <span className="faint" style={{ fontSize: '.8rem', fontWeight: 400 }}>({stays.length})</span>
            </h2>
            {stays.length === 0 ? (
              <p className="muted" style={{ fontSize: '.88rem' }}>No completed stays yet.</p>
            ) : (
              <div className="report-list">
                {stays.map((s) => (
                  <div key={s.id} className="report-list-row" data-testid="report-stay-row">
                    <div style={{ minWidth: 0 }}>
                      <p className="report-list-title">{s.guest_display_name || 'Guest'}</p>
                      <p className="report-list-meta">
                        {propNames.get(s.property_id) ?? 'Property'} &middot; {fmtDate(s.check_in)} to {fmtDate(s.check_out)} &middot;{' '}
                        {STATUS_LABEL[s.status] ?? s.status}
                      </p>
                    </div>
                    <Link
                      href={`/dashboard/properties/${s.property_id}/stays?view=past`}
                      className="btn btn-ghost btn-sm"
                    >
                      Open
                    </Link>
                  </div>
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
