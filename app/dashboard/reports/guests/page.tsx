import Link from 'next/link';
import { Users } from 'lucide-react';
import { requireSession } from '@/lib/auth/guards';
import { createClient } from '@/lib/supabase/server';
import { PropertyFilter } from '@/components/dashboard/PropertyFilter';
import { fmtDateInTz, contactLast4Line } from '@/lib/reports/format';
import { GuestsReport, type GuestReportRow } from './GuestsReport';

export const dynamic = 'force-dynamic';

const ROW_CAP = 500;

interface GuestsSearchParams {
  property?: string;
  from?: string;
  to?: string;
}

type GuestIdentityRow = {
  id: string;
  property_id: string;
  display_name: string | null;
  first_name: string | null;
  last_name: string | null;
  contact_type: string | null;
  contact_last4: string | null;
  created_at: string;
};

export default async function GuestDirectoryPage({
  searchParams,
}: {
  searchParams?: Promise<GuestsSearchParams>;
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

  let rows: GuestReportRow[] = [];
  let totalCount = 0;

  if (scopeIds.length > 0) {
    let query = supabase
      .from('guest_identities')
      .select('*', { count: 'exact' })
      .in('property_id', scopeIds)
      .order('created_at', { ascending: false })
      .limit(ROW_CAP);
    if (from) query = query.gte('created_at', `${from}T00:00:00.000Z`);
    if (to) query = query.lte('created_at', `${to}T23:59:59.999Z`);

    const { data: guestData, count } = await query;
    totalCount = count ?? 0;
    const guests = (guestData ?? []) as GuestIdentityRow[];

    rows = guests.map((g) => {
      const full = [g.first_name, g.last_name].filter(Boolean).join(' ').trim();
      return {
        id: g.id,
        guest: g.display_name?.trim() || full || 'Guest',
        property: propNames.get(g.property_id) ?? 'Property',
        contact: contactLast4Line(g.contact_type, g.contact_last4),
        added: fmtDateInTz(g.created_at, propTimezones.get(g.property_id)),
        addedTs: new Date(g.created_at).getTime(),
      };
    });
  }

  const printSubtitle = [
    `Property: ${activeProperty ? propNames.get(activeProperty) ?? 'Property' : 'All properties'}`,
    `Added: ${from ?? 'any'} → ${to ?? 'any'}`,
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
          <Users size={20} aria-hidden /> Guest directory
        </h1>
        <p className="muted" style={{ fontSize: '.9rem', margin: '.35rem 0 0' }}>
          Every guest who registered across your properties, as a spreadsheet: sort any column, drag columns into
          the order you want, filter by name or property, then print or export exactly what you see. Contacts show
          the last four only — full numbers are never stored. Refreshing the page restores the default view.
        </p>
      </div>

      <PropertyFilter
        properties={propList.map((p) => ({ id: p.id, name: p.display_name }))}
        activeId={activeProperty}
        basePath="/dashboard/reports/guests"
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
          Added from
          <input className="input" type="date" name="from" defaultValue={from ?? ''} style={{ minHeight: 40, width: 'auto' }} />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: '.3rem', fontSize: '.78rem', fontWeight: 600 }} className="muted">
          Added to
          <input className="input" type="date" name="to" defaultValue={to ?? ''} style={{ minHeight: 40, width: 'auto' }} />
        </label>
        <button type="submit" className="btn btn-primary btn-sm" data-testid="guests-filters-apply">
          Apply
        </button>
        <Link href="/dashboard/reports/guests" className="btn btn-ghost btn-sm" data-testid="guests-filters-reset">
          Reset
        </Link>
      </form>

      <GuestsReport rows={rows} printSubtitle={printSubtitle} totalCount={totalCount} />
    </div>
  );
}
