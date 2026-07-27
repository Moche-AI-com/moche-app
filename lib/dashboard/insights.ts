import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/database.types';
import { createAdminClient } from '@/lib/supabase/admin';
import { hasServiceRole } from '@/lib/env';
import { log } from '@/lib/log';

type Client = SupabaseClient<Database>;

// ---------------------------------------------------------------------------
// Activity trend — daily guest questions vs. AI answers over a trailing window.
// Powers the sparkline/area chart on the dashboard home. Deliberately returns a
// dense series (one entry per day, zero-filled) so the chart never has gaps.
// ---------------------------------------------------------------------------

export interface TrendDay {
  date: string; // ISO yyyy-mm-dd (UTC day bucket)
  label: string; // short display label, e.g. "Jul 14"
  questions: number; // guest turns that day
  answers: number; // assistant turns that day
  escalations: number; // escalations opened that day
}

export interface ActivityTrend {
  days: TrendDay[];
  totalQuestions: number;
  totalAnswers: number;
  totalEscalations: number;
  peakQuestions: number; // max questions in a single day (chart y-scale)
  /** % change in questions, current half of window vs. previous half. null when no prior baseline. */
  deltaPct: number | null;
  busiestDay: TrendDay | null;
}

function dayKey(iso: string): string {
  return new Date(iso).toISOString().slice(0, 10);
}

function emptyTrend(days: number): ActivityTrend {
  const out: TrendDay[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86400000);
    const key = d.toISOString().slice(0, 10);
    out.push({
      date: key,
      label: d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' }),
      questions: 0,
      answers: 0,
      escalations: 0,
    });
  }
  return {
    days: out,
    totalQuestions: 0,
    totalAnswers: 0,
    totalEscalations: 0,
    peakQuestions: 0,
    deltaPct: null,
    busiestDay: null,
  };
}

export async function loadActivityTrend(supabase: Client, propertyIds: string[], days = 14): Promise<ActivityTrend> {
  const trend = emptyTrend(days);
  if (propertyIds.length === 0) return trend;

  const admin = hasServiceRole() ? createAdminClient() : supabase;
  const since = new Date(Date.now() - (days - 1) * 86400000);
  since.setUTCHours(0, 0, 0, 0);
  const sinceIso = since.toISOString();

  try {
    const [{ data: msgs }, { data: escs }] = await Promise.all([
      admin
        .from('messages')
        .select('role, created_at')
        .in('property_id', propertyIds)
        .in('role', ['guest', 'assistant'])
        .gte('created_at', sinceIso)
        .limit(5000),
      admin
        .from('escalations')
        .select('created_at')
        .in('property_id', propertyIds)
        .gte('created_at', sinceIso)
        .limit(2000),
    ]);

    const byKey = new Map(trend.days.map((d) => [d.date, d]));
    for (const m of msgs ?? []) {
      const bucket = byKey.get(dayKey(m.created_at as string));
      if (!bucket) continue;
      if (m.role === 'guest') bucket.questions += 1;
      else bucket.answers += 1;
    }
    for (const e of escs ?? []) {
      const bucket = byKey.get(dayKey(e.created_at as string));
      if (bucket) bucket.escalations += 1;
    }

    trend.totalQuestions = trend.days.reduce((a, d) => a + d.questions, 0);
    trend.totalAnswers = trend.days.reduce((a, d) => a + d.answers, 0);
    trend.totalEscalations = trend.days.reduce((a, d) => a + d.escalations, 0);
    trend.peakQuestions = trend.days.reduce((a, d) => Math.max(a, d.questions), 0);

    // Momentum: second half of the window vs. the first half.
    const mid = Math.floor(days / 2);
    const prev = trend.days.slice(0, mid).reduce((a, d) => a + d.questions, 0);
    const curr = trend.days.slice(mid).reduce((a, d) => a + d.questions, 0);
    if (prev > 0) trend.deltaPct = Math.round(((curr - prev) / prev) * 100);
    else if (curr > 0) trend.deltaPct = null; // brand-new activity, no honest baseline

    const busiest = trend.days.reduce<TrendDay | null>((best, d) => (d.questions > (best?.questions ?? 0) ? d : best), null);
    trend.busiestDay = busiest;
  } catch (e) {
    log.warn('dashboard_activity_trend_failed', { error: String(e) });
  }

  return trend;
}

// ---------------------------------------------------------------------------
// Topic breakdown — what guests actually ask about, from classified intents on
// assistant replies. Answers the host question "what is my concierge handling?"
// ---------------------------------------------------------------------------

export interface TopicRow {
  intent: string;
  label: string;
  count: number;
  pct: number;
}

// Human labels for the intents the classifier emits. Unknown intents fall back
// to a title-cased version of the raw value rather than being dropped.
const INTENT_LABEL: Record<string, string> = {
  wifi: 'Wi-Fi & connectivity',
  checkin: 'Check-in',
  checkout: 'Check-out',
  parking: 'Parking',
  local: 'Local recommendations',
  amenities: 'Amenities',
  house_rules: 'House rules',
  maintenance: 'Maintenance',
  appliance: 'Appliances',
  trash: 'Trash & recycling',
  other: 'Other questions',
};

function titleCase(s: string): string {
  return s.replace(/[_-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export async function loadTopTopics(supabase: Client, propertyIds: string[], limit = 5): Promise<TopicRow[]> {
  if (propertyIds.length === 0) return [];
  const admin = hasServiceRole() ? createAdminClient() : supabase;

  try {
    const { data } = await admin
      .from('messages')
      .select('intent')
      .in('property_id', propertyIds)
      .eq('role', 'assistant')
      .not('intent', 'is', null)
      .order('created_at', { ascending: false })
      .limit(2000);

    const counts = new Map<string, number>();
    for (const row of data ?? []) {
      const intent = (row.intent as string | null)?.trim();
      if (!intent) continue;
      counts.set(intent, (counts.get(intent) ?? 0) + 1);
    }
    const total = [...counts.values()].reduce((a, b) => a + b, 0);
    if (total === 0) return [];

    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([intent, count]) => ({
        intent,
        label: INTENT_LABEL[intent] ?? titleCase(intent),
        count,
        pct: Math.round((count / total) * 100),
      }));
  } catch (e) {
    log.warn('dashboard_top_topics_failed', { error: String(e) });
    return [];
  }
}

// ---------------------------------------------------------------------------
// Unified activity feed — one chronological stream of everything that happened
// across a host's portfolio, so the home page answers "what changed?" without
// making them visit five separate pages.
// ---------------------------------------------------------------------------

export type FeedKind = 'escalation' | 'service_request' | 'stay' | 'feedback' | 'brain';

export interface FeedEvent {
  id: string;
  kind: FeedKind;
  title: string;
  detail: string | null;
  createdAt: string;
  href: string | null;
  propertyName: string | null;
  /** true when the event still needs the host to do something */
  actionable: boolean;
}

const URGENCY_LABEL: Record<string, string> = { high: 'High urgency', urgent: 'Urgent', low: 'Low urgency', normal: '' };

function clip(s: string | null | undefined, n = 120): string | null {
  if (!s) return null;
  const t = s.trim().replace(/\s+/g, ' ');
  if (t.length <= n) return t;
  // Cut on a word boundary so the ellipsis never lands mid-word.
  return `${t.slice(0, t.lastIndexOf(' ', n) > 40 ? t.lastIndexOf(' ', n) : n)}…`;
}

export async function loadActivityFeed(
  supabase: Client,
  propertyIds: string[],
  propertyNames: Map<string, string>,
  limit = 10,
): Promise<FeedEvent[]> {
  if (propertyIds.length === 0) return [];
  const admin = hasServiceRole() ? createAdminClient() : supabase;
  const per = Math.max(limit, 8);
  const events: FeedEvent[] = [];

  try {
    const [{ data: escs }, { data: svcs }, { data: stays }, { data: fb }, { data: brain }] = await Promise.all([
      admin
        .from('escalations')
        .select('id, property_id, question, status, created_at')
        .in('property_id', propertyIds)
        .order('created_at', { ascending: false })
        .limit(per),
      admin
        .from('service_requests')
        .select('id, property_id, service_type, urgency, description, status, created_at')
        .in('property_id', propertyIds)
        .order('created_at', { ascending: false })
        .limit(per),
      admin
        .from('stays')
        .select('id, property_id, guest_display_name, check_in, check_out, status, created_at')
        .in('property_id', propertyIds)
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .limit(per),
      admin
        .from('product_feedback')
        .select('id, property_id, rating, comment, created_at')
        .in('property_id', propertyIds)
        .eq('source', 'guest')
        .order('created_at', { ascending: false })
        .limit(per),
      admin
        .from('brain_items')
        .select('id, property_id, title, category, created_at')
        .in('property_id', propertyIds)
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .limit(per),
    ]);

    const nameOf = (pid: string | null) => (pid ? propertyNames.get(pid) ?? null : null);

    for (const e of escs ?? []) {
      const open = e.status === 'open';
      events.push({
        id: `esc-${e.id}`,
        kind: 'escalation',
        title: open ? 'Guest question needs your answer' : 'Escalation resolved',
        detail: clip(e.question as string | null),
        createdAt: e.created_at as string,
        href: '/dashboard/escalations',
        propertyName: nameOf(e.property_id as string | null),
        actionable: open,
      });
    }

    for (const s of svcs ?? []) {
      const open = ['new', 'acknowledged', 'in_progress'].includes(s.status as string);
      const urgency = URGENCY_LABEL[(s.urgency as string) ?? 'normal'] ?? '';
      const type = titleCase((s.service_type as string) ?? 'service');
      events.push({
        id: `svc-${s.id}`,
        kind: 'service_request',
        title: `${type} request${open ? '' : ' closed'}`,
        detail: clip([urgency, s.description as string | null].filter(Boolean).join(' · ')),
        createdAt: s.created_at as string,
        href: '/dashboard/service-requests',
        propertyName: nameOf(s.property_id as string | null),
        actionable: open,
      });
    }

    for (const s of stays ?? []) {
      const guest = (s.guest_display_name as string | null)?.trim() || 'A guest';
      events.push({
        id: `stay-${s.id}`,
        kind: 'stay',
        title: s.status === 'active' ? `${guest} is checked in` : `Stay added for ${guest}`,
        detail: s.check_in
          ? `${new Date(s.check_in as string).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} → ${
              s.check_out ? new Date(s.check_out as string).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : 'open'
            }`
          : null,
        createdAt: s.created_at as string,
        href: s.property_id ? `/dashboard/properties/${s.property_id}/stays` : null,
        propertyName: nameOf(s.property_id as string | null),
        actionable: false,
      });
    }

    for (const f of fb ?? []) {
      const rating = f.rating as number | null;
      events.push({
        id: `fb-${f.id}`,
        kind: 'feedback',
        title: rating != null ? `Guest rated your AI ${rating}/5` : 'Guest left AI feedback',
        detail: clip(f.comment as string | null),
        createdAt: f.created_at as string,
        href: null,
        propertyName: nameOf(f.property_id as string | null),
        actionable: rating != null && rating <= 2,
      });
    }

    for (const b of brain ?? []) {
      events.push({
        id: `brain-${b.id}`,
        kind: 'brain',
        title: 'Knowledge added to your Brain',
        detail: clip(b.title as string | null, 80),
        createdAt: b.created_at as string,
        href: b.property_id ? `/dashboard/properties/${b.property_id}/brain` : null,
        propertyName: nameOf(b.property_id as string | null),
        actionable: false,
      });
    }
  } catch (e) {
    log.warn('dashboard_activity_feed_failed', { error: String(e) });
    return [];
  }

  return events
    .filter((e) => e.createdAt)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, limit);
}
