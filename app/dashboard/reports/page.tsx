import Link from 'next/link';
import { Printer, Archive, FileText, Sparkles } from 'lucide-react';
import { requireSession } from '@/lib/auth/guards';
import { createClient } from '@/lib/supabase/server';
import { PropertyFilter } from '@/components/dashboard/PropertyFilter';
import { EXTRAS_ORDER_STATUS_LABEL, type ExtrasOrderStatus } from '@/lib/dashboard/extras-orders';

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

  const { data: properties } = await supabase
    .from('properties')
    .select('id, display_name')
    .eq('host_account_id', ctx.account.id)
    .is('deleted_at', null)
    .order('display_name');

  const propList = properties ?? [];
  const propNames = new Map(propList.map((p) => [p.id, p.display_name]));

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

  const empty = requests.length === 0 && stays.length === 0 && extras.length === 0;

  return (
    <div>
      <div style={{ marginBottom: '1.25rem' }}>
        <h1 style={{ fontSize: '1.8rem', margin: 0 }}>Reports</h1>
        <p className="muted" style={{ fontSize: '.9rem', margin: '.35rem 0 0' }}>
          Your archive of completed work. Print any service report for a contractor, an owner, or your own records.
        </p>
      </div>

      <PropertyFilter properties={propList.map((p) => ({ id: p.id, name: p.display_name }))} activeId={activeProperty} basePath="/dashboard/reports" />

      {empty ? (
        <div className="card" style={{ padding: '2rem', textAlign: 'center' }}>
          <Archive size={22} aria-hidden style={{ color: 'var(--text-faint)', marginBottom: '.6rem' }} />
          <p className="muted">
            Nothing archived yet. Once you resolve a service request, complete an extra, or a stay checks out, it appears
            here as a printable record.
          </p>
        </div>
      ) : (
        <>
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
