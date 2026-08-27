import Link from 'next/link';
import { MessagesSquare } from 'lucide-react';
import { requireSession } from '@/lib/auth/guards';
import { createClient } from '@/lib/supabase/server';
import { PropertyFilter } from '@/components/dashboard/PropertyFilter';
import { fmtDateTimeInTz } from '@/lib/reports/format';
import { ConversationsReport, type ConversationReportRow } from './ConversationsReport';

export const dynamic = 'force-dynamic';

const ROW_CAP = 500;

// A bounded message fetch covers 500 conversations with room for long threads;
// stats for conversations past the cap simply fall back to zeroes.
const MESSAGE_CAP = 5000;

const INTENT_LABEL: Record<string, string> = {
  wifi: 'Wi-Fi',
  checkin: 'Check-in',
  checkout: 'Check-out',
  house_rules: 'House rules',
};

function humanizeToken(value: string | null | undefined): string {
  if (!value) return '—';
  const words = value.replace(/_/g, ' ').trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function intentLabel(value: string | null | undefined): string {
  if (!value) return '—';
  return INTENT_LABEL[value] ?? humanizeToken(value);
}

interface ConversationsSearchParams {
  property?: string;
  from?: string;
  to?: string;
}

type ConversationRow = {
  id: string;
  property_id: string;
  stay_id: string | null;
  title: string | null;
  channel: string | null;
  created_at: string;
  last_message_at: string | null;
};

type StayLite = {
  id: string;
  guest_display_name: string | null;
  stay_reference?: string | null;
};

export default async function ConciergeActivityPage({
  searchParams,
}: {
  searchParams?: Promise<ConversationsSearchParams>;
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

  let rows: ConversationReportRow[] = [];
  let totalCount = 0;

  if (scopeIds.length > 0) {
    let query = supabase
      .from('conversations')
      .select('*', { count: 'exact' })
      .in('property_id', scopeIds)
      .order('last_message_at', { ascending: false, nullsFirst: false })
      .limit(ROW_CAP);
    if (from) query = query.gte('created_at', `${from}T00:00:00.000Z`);
    if (to) query = query.lte('created_at', `${to}T23:59:59.999Z`);

    const { data: convoData, count } = await query;
    totalCount = count ?? 0;
    const conversations = (convoData ?? []) as ConversationRow[];
    const convoIds = conversations.map((c) => c.id);
    const stayIds = [...new Set(conversations.map((c) => c.stay_id).filter((v): v is string => Boolean(v)))];

    if (conversations.length > 0) {
      // Stay labels + per-conversation message stats: one round trip each,
      // grouped in memory — the same pattern as Past stays.
      const [stayRes, msgRes] = await Promise.all([
        stayIds.length > 0
          ? supabase.from('stays').select('*').in('id', stayIds)
          : Promise.resolve({ data: [] }),
        supabase
          .from('messages')
          .select('conversation_id, role, intent, confidence, escalation_id')
          .in('conversation_id', convoIds)
          .limit(MESSAGE_CAP),
      ]);

      const stayById = new Map<string, StayLite>(((stayRes.data ?? []) as StayLite[]).map((s) => [s.id, s]));

      const stats = new Map<
        string,
        { total: number; escalationIds: Set<string>; intents: Map<string, number>; confidenceSum: number; confidenceN: number }
      >();
      for (const m of msgRes.data ?? []) {
        const s = stats.get(m.conversation_id) ?? {
          total: 0,
          escalationIds: new Set<string>(),
          intents: new Map<string, number>(),
          confidenceSum: 0,
          confidenceN: 0,
        };
        s.total += 1;
        if (m.escalation_id) s.escalationIds.add(m.escalation_id);
        if (m.role === 'assistant') {
          if (m.intent) s.intents.set(m.intent, (s.intents.get(m.intent) ?? 0) + 1);
          if (typeof m.confidence === 'number') {
            s.confidenceSum += m.confidence;
            s.confidenceN += 1;
          }
        }
        stats.set(m.conversation_id, s);
      }

      rows = conversations.map((c) => {
        const s = stats.get(c.id);
        const stay = c.stay_id ? stayById.get(c.stay_id) : undefined;
        const guest = stay
          ? `${stay.guest_display_name || 'Guest'}${stay.stay_reference ? ` · ${stay.stay_reference}` : ''}`
          : c.title?.trim() || 'Guest';
        let topIntent = '—';
        if (s && s.intents.size > 0) {
          const [top] = [...s.intents.entries()].sort((a, b) => b[1] - a[1]);
          topIntent = intentLabel(top[0]);
        }
        // Confidence is stored 0–1 for newer rows; anything above 1 is already a percentage.
        const avgConfidence =
          s && s.confidenceN > 0
            ? (() => {
                const avg = s.confidenceSum / s.confidenceN;
                return `${Math.round(avg <= 1 ? avg * 100 : avg)}%`;
              })()
            : '—';
        return {
          id: c.id,
          guest,
          property: propNames.get(c.property_id) ?? 'Property',
          channel: c.channel ? humanizeToken(c.channel) : '—',
          messages: s?.total ?? 0,
          topIntent,
          escalations: s?.escalationIds.size ?? 0,
          avgConfidence,
          lastActive: fmtDateTimeInTz(c.last_message_at ?? c.created_at, propTimezones.get(c.property_id)),
          lastActiveTs: new Date(c.last_message_at ?? c.created_at).getTime(),
        };
      });
    }
  }

  const printSubtitle = [
    `Property: ${activeProperty ? propNames.get(activeProperty) ?? 'Property' : 'All properties'}`,
    `Started: ${from ?? 'any'} → ${to ?? 'any'}`,
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
          <MessagesSquare size={20} aria-hidden /> Concierge activity
        </h1>
        <p className="muted" style={{ fontSize: '.9rem', margin: '.35rem 0 0' }}>
          Every guest conversation, as a spreadsheet: what guests asked about most, how confident the concierge was,
          and which chats needed a person. Sort any column, drag columns into the order you want, filter, print, or
          export exactly what you see. Refreshing the page restores the default view.
        </p>
      </div>

      <PropertyFilter
        properties={propList.map((p) => ({ id: p.id, name: p.display_name }))}
        activeId={activeProperty}
        basePath="/dashboard/reports/conversations"
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
          Started from
          <input className="input" type="date" name="from" defaultValue={from ?? ''} style={{ minHeight: 40, width: 'auto' }} />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: '.3rem', fontSize: '.78rem', fontWeight: 600 }} className="muted">
          Started to
          <input className="input" type="date" name="to" defaultValue={to ?? ''} style={{ minHeight: 40, width: 'auto' }} />
        </label>
        <button type="submit" className="btn btn-primary btn-sm" data-testid="conversations-filters-apply">
          Apply
        </button>
        <Link href="/dashboard/reports/conversations" className="btn btn-ghost btn-sm" data-testid="conversations-filters-reset">
          Reset
        </Link>
      </form>

      <ConversationsReport rows={rows} printSubtitle={printSubtitle} totalCount={totalCount} />
    </div>
  );
}
