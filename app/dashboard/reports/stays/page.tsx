import Link from 'next/link';
import { Archive } from 'lucide-react';
import { requireSession } from '@/lib/auth/guards';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient, hasServiceRole } from '@/lib/supabase/admin';
import { PropertyFilter } from '@/components/dashboard/PropertyFilter';
import { fmtDateInTz, nightsBetween } from '@/lib/reports/format';
import { StaysReport, type StayReportRow } from './StaysReport';

export const dynamic = 'force-dynamic';

// Hard cap on one fetch. Archive volumes are small today, but a 60-property
// host's full history must not arrive as one unbounded payload; the toolbar
// says "Showing 500 of N" when the cap bites (plan §6 — PR 3 verifies at scale).
const ROW_CAP = 500;

const STATUS_LABEL: Record<string, string> = {
  completed: 'Completed',
  revoked: 'Revoked',
};

interface StaysSearchParams {
  property?: string;
  from?: string;
  to?: string;
  status?: string;
}

// stay_reference exists in the database (migration add_stay_reference,
// 2026-08-26) but only lands in database.types.ts on the next `supabase gen
// types` run — select('*') plus a local widening, the same pattern the
// printable service-request page already uses.
type StayRow = {
  id: string;
  property_id: string;
  guest_display_name: string | null;
  check_in: string;
  check_out: string;
  guest_count: number;
  status: string;
  guest_language: string | null;
  created_by: string | null;
  stay_reference?: string | null;
};

export default async function PastStaysReportPage({
  searchParams,
}: {
  searchParams?: Promise<StaysSearchParams>;
}) {
  const ctx = await requireSession();
  const supabase = createClient();
  const sp = (await searchParams) ?? {};

  // Same tombstone rule as the Reports hub: names cover permanently deleted
  // properties too, so a retained report keeps its label.
  const { data: properties } = await supabase
    .from('properties')
    .select('id, display_name, deleted_at, timezone')
    .eq('host_account_id', ctx.account.id)
    .order('display_name');
  const allProps = properties ?? [];
  const propNames = new Map(allProps.map((p) => [p.id, p.display_name]));
  const propTimezones = new Map(allProps.map((p) => [p.id, p.timezone ?? null]));
  const propList = allProps.filter((p) => p.deleted_at === null);

  // Only honour a property filter for a property this account actually owns —
  // a hand-edited ?property= is ignored rather than producing an empty page.
  const requested = typeof sp.property === 'string' ? sp.property : null;
  const activeProperty = requested && propNames.has(requested) ? requested : null;
  const scopeIds = activeProperty ? [activeProperty] : propList.map((p) => p.id);

  // Top filters ride the URL (the dashboard's existing pattern — see
  // PropertyFilter). Grid layout state never does: a refresh resets the grid
  // arrangement but keeps these deliberate, shareable filter choices.
  const from = sp.from && /^\d{4}-\d{2}-\d{2}$/.test(sp.from) ? sp.from : null;
  const to = sp.to && /^\d{4}-\d{2}-\d{2}$/.test(sp.to) ? sp.to : null;
  const status = sp.status === 'completed' || sp.status === 'revoked' ? sp.status : null;

  let rows: StayReportRow[] = [];
  let totalCount = 0;

  if (scopeIds.length > 0) {
    let query = supabase
      .from('stays')
      .select('*', { count: 'exact' })
      .in('property_id', scopeIds)
      .is('deleted_at', null)
      .eq('lifecycle_status', 'archived')
      .order('check_out', { ascending: false, nullsFirst: false })
      .limit(ROW_CAP);
    if (from) query = query.gte('check_in', `${from}T00:00:00.000Z`);
    if (to) query = query.lte('check_in', `${to}T23:59:59.999Z`);
    if (status) query = query.eq('status', status);

    const { data: stayData, count } = await query;
    totalCount = count ?? 0;
    const stays = (stayData ?? []) as StayRow[];
    const stayIds = stays.map((s) => s.id);

    if (stays.length > 0) {
      // Companion names + per-stay activity counts: one round trip each,
      // grouped in memory — the hub's handled-escalations pattern.
      const [guestsRes, convosRes, escRes, extrasRes] = await Promise.all([
        supabase.from('stay_guests').select('stay_id, display_name').in('stay_id', stayIds).not('display_name', 'is', null),
        supabase.from('conversations').select('stay_id').in('stay_id', stayIds),
        supabase.from('escalations').select('stay_id').in('stay_id', stayIds),
        supabase.from('extras_orders').select('stay_id').in('stay_id', stayIds),
      ]);

      const partyNames = new Map<string, string[]>();
      for (const g of guestsRes.data ?? []) {
        const list = partyNames.get(g.stay_id) ?? [];
        if (g.display_name) list.push(g.display_name);
        partyNames.set(g.stay_id, list);
      }
      const countByStay = (rows: Array<{ stay_id: string | null }> | null) => {
        const map = new Map<string, number>();
        for (const r of rows ?? []) {
          if (r.stay_id) map.set(r.stay_id, (map.get(r.stay_id) ?? 0) + 1);
        }
        return map;
      };
      const convoCounts = countByStay(convosRes.data);
      const escCounts = countByStay(escRes.data);
      const extrasCounts = countByStay(extrasRes.data);

      // "Created by" names come from profiles, which the RLS session client
      // does not reliably expose for other members — read them through the
      // service role, as the printable service-request page already does.
      const creatorIds = [...new Set(stays.map((s) => s.created_by).filter((v): v is string => Boolean(v)))];
      const creatorNames = new Map<string, string>();
      if (creatorIds.length > 0 && hasServiceRole()) {
        const admin = createAdminClient();
        const { data: profiles } = await admin.from('profiles').select('id, full_name, email').in('id', creatorIds);
        for (const p of profiles ?? []) {
          const name = (p.full_name ?? '').trim() || p.email;
          if (name) creatorNames.set(p.id, name);
        }
      }

      rows = stays.map((s) => {
        const names = partyNames.get(s.id) ?? [];
        const shownNames = names.slice(0, 2).join(', ');
        const overflow = names.length - 2;
        // "4 — Ana, Luis +1": headcount first, then as many companion names as
        // read cleanly, with the remainder collapsed.
        const party = `${s.guest_count}${names.length > 0 ? ` — ${shownNames}${overflow > 0 ? ` +${overflow}` : ''}` : ''}`;
        return {
          id: s.id,
          reference: s.stay_reference ?? '\u2014',
          guest: s.guest_display_name || 'Guest',
          party,
          property: propNames.get(s.property_id) ?? 'Property',
          checkIn: fmtDateInTz(s.check_in, propTimezones.get(s.property_id)),
          checkOut: fmtDateInTz(s.check_out, propTimezones.get(s.property_id)),
          checkInTs: new Date(s.check_in).getTime(),
          checkOutTs: new Date(s.check_out).getTime(),
          nights: nightsBetween(s.check_in, s.check_out),
          status: STATUS_LABEL[s.status] ?? s.status,
          language: s.guest_language ?? '\u2014',
          createdBy: (s.created_by && creatorNames.get(s.created_by)) || '\u2014',
          conversations: convoCounts.get(s.id) ?? 0,
          escalations: escCounts.get(s.id) ?? 0,
          extras: extrasCounts.get(s.id) ?? 0,
        };
      });
    }
  }

  const printSubtitle = [
    `Property: ${activeProperty ? propNames.get(activeProperty) ?? 'Property' : 'All properties'}`,
    `Check-in: ${from ?? 'any'} \u2192 ${to ?? 'any'}`,
    `Status: ${status ? STATUS_LABEL[status] : 'All'}`,
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
          <Archive size={20} aria-hidden /> Past stays
        </h1>
        <p className="muted" style={{ fontSize: '.9rem', margin: '.35rem 0 0' }}>
          Every completed or revoked stay as a spreadsheet: sort any column, drag columns into the order you want,
          filter by stay ref, guest, or party, then print or export exactly what you see. Refreshing the page
          restores the default view.
        </p>
      </div>

      <PropertyFilter
        properties={propList.map((p) => ({ id: p.id, name: p.display_name }))}
        activeId={activeProperty}
        basePath="/dashboard/reports/stays"
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
          Check-in from
          <input className="input" type="date" name="from" defaultValue={from ?? ''} style={{ minHeight: 40, width: 'auto' }} />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: '.3rem', fontSize: '.78rem', fontWeight: 600 }} className="muted">
          Check-in to
          <input className="input" type="date" name="to" defaultValue={to ?? ''} style={{ minHeight: 40, width: 'auto' }} />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: '.3rem', fontSize: '.78rem', fontWeight: 600 }} className="muted">
          Status
          <select className="select" name="status" defaultValue={status ?? ''} style={{ minHeight: 40, width: 'auto' }}>
            <option value="">All</option>
            <option value="completed">Completed</option>
            <option value="revoked">Revoked</option>
          </select>
        </label>
        <button type="submit" className="btn btn-primary btn-sm" data-testid="stays-filters-apply">
          Apply
        </button>
        <Link href="/dashboard/reports/stays" className="btn btn-ghost btn-sm" data-testid="stays-filters-reset">
          Reset
        </Link>
      </form>

      <StaysReport rows={rows} printSubtitle={printSubtitle} totalCount={totalCount} />
    </div>
  );
}
