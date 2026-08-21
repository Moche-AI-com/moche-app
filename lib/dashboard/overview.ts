import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/database.types';
import { createAdminClient } from '@/lib/supabase/admin';
import { hasServiceRole } from '@/lib/env';
import { log } from '@/lib/log';

type Client = SupabaseClient<Database>;

export interface ValueMetrics {
  // Headline value signals — "you made the right call" numbers.
  questionsAnswered: number; // assistant messages across the host's properties (all-time)
  questionsThisWeek: number; // assistant messages in the trailing 7 days
  questionsPrevWeek: number; // assistant messages in the 7 days before that (week-over-week delta)
  guestsHelped: number; // distinct conversations that had at least one guest turn
  guestsThisWeek: number; // conversations started in the trailing 7 days
  avgConfidencePct: number | null; // mean assistant confidence (0-100), null if unknown
  avgResponseSeconds: number | null; // mean assistant latency in seconds, null if unknown
  instantAnswerRate: number | null; // % of guest questions answered by AI without escalation
  hoursSaved: number; // estimated host hours saved (questionsAnswered * 4min / 60)
  knowledgeItems: number; // live brain items powering the concierge
  activeStays: number;
  openEscalations: number;
  openServiceRequests: number;
}

export interface GuestAiFeedbackItem {
  id: string;
  rating: number | null;
  comment: string | null;
  page: string | null;
  createdAt: string;
  propertyId: string | null;
  propertyName: string | null;
}

export interface GuestFeedbackSummary {
  count: number;
  positive: number; // ratings >= 4
  avgRating: number | null;
  satisfactionPct: number | null; // positive / count
  recent: GuestAiFeedbackItem[]; // newest first, capped
}

const MINUTES_SAVED_PER_ANSWER = 4;

// Loads headline value metrics for a host, scoped to the properties they own/co-host.
// Reads via the service-role admin client because product_feedback / messages have no
// host SELECT policy (guest-written rows). All queries are filtered by the caller's own
// property IDs, so this never leaks cross-tenant data. Fully best-effort: any failure
// degrades to zeroes so the dashboard always renders.
export async function loadValueMetrics(
  supabase: Client,
  propertyIds: string[],
  precomputed: { activeStays: number; openEscalations: number; openServiceRequests: number; knowledgeItems: number },
): Promise<ValueMetrics> {
  const base: ValueMetrics = {
    questionsAnswered: 0,
    questionsThisWeek: 0,
    questionsPrevWeek: 0,
    guestsHelped: 0,
    guestsThisWeek: 0,
    avgConfidencePct: null,
    avgResponseSeconds: null,
    instantAnswerRate: null,
    hoursSaved: 0,
    knowledgeItems: precomputed.knowledgeItems,
    activeStays: precomputed.activeStays,
    openEscalations: precomputed.openEscalations,
    openServiceRequests: precomputed.openServiceRequests,
  };

  if (propertyIds.length === 0) return base;

  const admin = hasServiceRole() ? createAdminClient() : supabase;
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const twoWeeksAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();

  try {
    const [
      { count: answered },
      { count: answeredWeek },
      { count: answeredPrevWeek },
      { count: conversations },
      { count: conversationsWeek },
      { data: quality },
    ] = await Promise.all([
      admin.from('messages').select('id', { count: 'exact', head: true }).in('property_id', propertyIds).eq('role', 'assistant'),
      admin.from('messages').select('id', { count: 'exact', head: true }).in('property_id', propertyIds).eq('role', 'assistant').gte('created_at', weekAgo),
      admin.from('messages').select('id', { count: 'exact', head: true }).in('property_id', propertyIds).eq('role', 'assistant').gte('created_at', twoWeeksAgo).lt('created_at', weekAgo),
      admin.from('conversations').select('id', { count: 'exact', head: true }).in('property_id', propertyIds),
      admin.from('conversations').select('id', { count: 'exact', head: true }).in('property_id', propertyIds).gte('created_at', weekAgo),
      // Confidence + latency sample from recent assistant answers (bounded for cost).
      admin.from('messages').select('confidence, latency_ms').in('property_id', propertyIds).eq('role', 'assistant').order('created_at', { ascending: false }).limit(500),
    ]);

    const questionsAnswered = answered ?? 0;
    base.questionsAnswered = questionsAnswered;
    base.questionsThisWeek = answeredWeek ?? 0;
    base.questionsPrevWeek = answeredPrevWeek ?? 0;
    base.guestsHelped = conversations ?? 0;
    base.guestsThisWeek = conversationsWeek ?? 0;
    base.hoursSaved = Math.round((questionsAnswered * MINUTES_SAVED_PER_ANSWER) / 60);

    const rows = quality ?? [];
    const conf = rows.map((r) => (r.confidence == null ? null : Number(r.confidence))).filter((n): n is number => n != null && !Number.isNaN(n));
    if (conf.length > 0) {
      const mean = conf.reduce((a, b) => a + b, 0) / conf.length;
      // confidence stored 0-1 or 0-100 depending on model; normalize to a percentage.
      base.avgConfidencePct = Math.round((mean <= 1 ? mean * 100 : mean));
    }
    const lat = rows.map((r) => r.latency_ms).filter((n): n is number => typeof n === 'number' && n > 0);
    if (lat.length > 0) {
      const mean = lat.reduce((a, b) => a + b, 0) / lat.length;
      base.avgResponseSeconds = Math.round((mean / 1000) * 10) / 10;
    }

    // Instant-answer rate: of the guest questions asked, how many were resolved by the AI
    // rather than turning into an escalation. Uses guest message count as the denominator.
    const [{ count: guestTurns }, { count: escalations }] = await Promise.all([
      admin.from('messages').select('id', { count: 'exact', head: true }).in('property_id', propertyIds).eq('role', 'guest'),
      admin.from('escalations').select('id', { count: 'exact', head: true }).in('property_id', propertyIds),
    ]);
    const asked = guestTurns ?? 0;
    if (asked > 0) {
      const esc = escalations ?? 0;
      base.instantAnswerRate = Math.max(0, Math.min(100, Math.round(((asked - esc) / asked) * 100)));
    }
  } catch (e) {
    log.warn('dashboard_value_metrics_failed', { error: String(e) });
  }

  return base;
}

// Loads the guest AI feedback feed + summary for a host's properties. Reads product_feedback
// rows written by verified guests (source='guest'). Admin-scoped to the caller's property IDs.
export async function loadGuestFeedback(
  supabase: Client,
  propertyIds: string[],
  propertyNames: Map<string, string>,
  limit = 8,
): Promise<GuestFeedbackSummary> {
  const empty: GuestFeedbackSummary = { count: 0, positive: 0, avgRating: null, satisfactionPct: null, recent: [] };
  if (propertyIds.length === 0) return empty;

  const admin = hasServiceRole() ? createAdminClient() : supabase;

  try {
    const [{ data: all }, { data: recent }] = await Promise.all([
      admin.from('product_feedback').select('rating').eq('source', 'guest').in('property_id', propertyIds),
      admin
        .from('product_feedback')
        .select('id, rating, comment, page, created_at, property_id')
        .eq('source', 'guest')
        .in('property_id', propertyIds)
        .order('created_at', { ascending: false })
        .limit(limit),
    ]);

    const ratings = (all ?? []).map((r) => r.rating).filter((n): n is number => typeof n === 'number');
    const count = ratings.length;
    const positive = ratings.filter((n) => n >= 4).length;
    const avgRating = count > 0 ? Math.round((ratings.reduce((a, b) => a + b, 0) / count) * 10) / 10 : null;
    const satisfactionPct = count > 0 ? Math.round((positive / count) * 100) : null;

    const recentItems: GuestAiFeedbackItem[] = (recent ?? []).map((r) => ({
      id: r.id as string,
      rating: (r.rating as number | null) ?? null,
      comment: (r.comment as string | null) ?? null,
      page: (r.page as string | null) ?? null,
      createdAt: r.created_at as string,
      propertyId: (r.property_id as string | null) ?? null,
      propertyName: r.property_id ? propertyNames.get(r.property_id as string) ?? null : null,
    }));

    return { count, positive, avgRating, satisfactionPct, recent: recentItems };
  } catch (e) {
    log.warn('dashboard_guest_feedback_failed', { error: String(e) });
    return empty;
  }
}
