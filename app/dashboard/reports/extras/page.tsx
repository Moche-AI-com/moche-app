import Link from 'next/link';
import { Sparkles } from 'lucide-react';
import { requireSession } from '@/lib/auth/guards';
import { createClient } from '@/lib/supabase/server';
import { PropertyFilter } from '@/components/dashboard/PropertyFilter';
import { fmtDateInTz, fmtMoneyFromCents } from '@/lib/reports/format';
import { EXTRAS_ORDER_STATUS_LABEL, type ExtrasOrderStatus } from '@/lib/dashboard/extras-orders';
import { ExtrasReport, type ExtrasReportRow } from './ExtrasReport';

export const dynamic = 'force-dynamic';

const ROW_CAP = 500;

interface ExtrasSearchParams {
  property?: string;
  from?: string;
  to?: string;
  status?: string;
}

type ExtrasOrderRow = {
  id: string;
  property_id: string;
  item_title: string;
  item_price_text: string | null;
  quantity: number;
  status: ExtrasOrderStatus;
  created_at: string;
  archived_at: string | null;
  quoted_amount_cents: number | null;
  quote_currency: string | null;
};

export default async function CompletedExtrasReportPage({
  searchParams,
}: {
  searchParams?: Promise<ExtrasSearchParams>;
}) {
  const ctx = await requireSession();
  const supabase = createClient();
  const sp = (await searchParams) ?? {};

  // Tombstone rule: names cover permanently deleted properties too.
  const { data: properties } = await supabase
    .from('properties')
    .select('id, display_name, deleted_at, timezone')
    .eq('host_account_id', ctx.account.id)
    .order('display_name');
  const allProps = properties ?? [];
  const propNames = new Map(allProps.map((p) => [p.id, p.display_name]));
  const propTimezones = new Map(allProps.map((p) => [p.id, p.timezone ?? null]));
  const propList = allProps.filter((p) => p.deleted_at === null);

  const requested = typeof sp.property === 'string' ? sp.property : null;
  const activeProperty = requested && propNames.has(requested) ? requested : null;
  const scopeIds = activeProperty ? [activeProperty] : propList.map((p) => p.id);

  const from = sp.from && /^\d{4}-\d{2}-\d{2}$/.test(sp.from) ? sp.from : null;
  const to = sp.to && /^\d{4}-\d{2}-\d{2}$/.test(sp.to) ? sp.to : null;
  const status =
    sp.status === 'fulfilled' || sp.status === 'declined' || sp.status === 'cancelled' ? sp.status : null;

  let rows: ExtrasReportRow[] = [];
  let totalCount = 0;

  if (scopeIds.length > 0) {
    let query = supabase
      .from('extras_orders')
      .select('*', { count: 'exact' })
      .in('property_id', scopeIds)
      .eq('lifecycle_status', 'archived')
      .order('archived_at', { ascending: false, nullsFirst: false })
      .limit(ROW_CAP);
    if (from) query = query.gte('created_at', `${from}T00:00:00.000Z`);
    if (to) query = query.lte('created_at', `${to}T23:59:59.999Z`);
    if (status) query = query.eq('status', status);

    const { data: orderData, count } = await query;
    totalCount = count ?? 0;
    const orders = (orderData ?? []) as ExtrasOrderRow[];

    rows = orders.map((o) => ({
      id: o.id,
      item: o.quantity > 1 ? `${o.item_title} \u00d7${o.quantity}` : o.item_title,
      property: propNames.get(o.property_id) ?? 'Property',
      quantity: o.quantity,
      price: o.item_price_text?.trim() || fmtMoneyFromCents(o.quoted_amount_cents, o.quote_currency),
      status: EXTRAS_ORDER_STATUS_LABEL[o.status] ?? o.status,
      requested: fmtDateInTz(o.created_at, propTimezones.get(o.property_id)),
      completed: fmtDateInTz(o.archived_at, propTimezones.get(o.property_id)),
      requestedTs: new Date(o.created_at).getTime(),
      completedTs: o.archived_at ? new Date(o.archived_at).getTime() : 0,
    }));
  }

  const printSubtitle = [
    `Property: ${activeProperty ? propNames.get(activeProperty) ?? 'Property' : 'All properties'}`,
    `Requested: ${from ?? 'any'} \u2192 ${to ?? 'any'}`,
    `Status: ${status ? EXTRAS_ORDER_STATUS_LABEL[status] : 'All'}`,
  ].join(' \u00b7 ');

  return (
    <div>
      <div style={{ marginBottom: '1.25rem' }}>
        <p style={{ margin: '0 0 .35rem', fontSize: '.82rem' }}>
          <Link href="/dashboard/reports" className="muted">
            \u2190 Reports
          </Link>
        </p>
        <h1 style={{ fontSize: '1.8rem', margin: 0, display: 'flex', alignItems: 'center', gap: '.5rem' }}>
          <Sparkles size={20} aria-hidden /> Completed extras
        </h1>
        <p className="muted" style={{ fontSize: '.9rem', margin: '.35rem 0 0' }}>
          Every extras order that reached a final state, as a spreadsheet: sort any column, drag columns into the
          order you want, filter by item or property, then print or export exactly what you see. Refreshing the
          page restores the default view.
        </p>
      </div>

      <PropertyFilter
        properties={propList.map((p) => ({ id: p.id, name: p.display_name }))}
        activeId={activeProperty}
        basePath="/dashboard/reports/extras"
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
            <option value="fulfilled">Fulfilled</option>
            <option value="declined">Declined</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </label>
        <button type="submit" className="btn btn-primary btn-sm" data-testid="extras-filters-apply">
          Apply
        </button>
        <Link href="/dashboard/reports/extras" className="btn btn-ghost btn-sm" data-testid="extras-filters-reset">
          Reset
        </Link>
      </form>

      <ExtrasReport rows={rows} printSubtitle={printSubtitle} totalCount={totalCount} />
    </div>
  );
}
