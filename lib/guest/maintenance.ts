import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/database.types';
import type { ConciergeAnswer } from '@/lib/guest/concierge';
import { notify } from '@/lib/notify';
import { log } from '@/lib/log';

type Admin = SupabaseClient<Database>;
type ServiceType = Database['public']['Enums']['service_type'];
type UrgencyLevel = Database['public']['Enums']['urgency_level'];

// Intents that should spawn a host-facing service request. `information`,
// `local`, `wifi`, etc. never create a ticket — only real "something needs
// attention at the property" intents do.
const ACTIONABLE_INTENTS: ReadonlySet<Database['public']['Enums']['intent_type']> = new Set([
  'maintenance',
  'cleaning',
  'safety',
  'emergency',
]);

// Maps a concierge intent onto the service_type enum for the ticket.
function serviceTypeForIntent(intent: Database['public']['Enums']['intent_type']): ServiceType {
  switch (intent) {
    case 'maintenance': return 'maintenance';
    case 'cleaning': return 'cleaning';
    case 'safety': return 'safety';
    case 'emergency': return 'emergency';
    default: return 'other';
  }
}

// Critical / high-signal keywords bump urgency above the intent default.
const CRITICAL_WORDS = /\b(fire|smoke|gas|carbon monoxide|flood|flooding|burst|sparking|electrical|shock|no heat|no power|locked out|break[- ]?in|injur|bleeding|unconscious|can'?t breathe)\b/i;
const HIGH_WORDS = /\b(leak|leaking|broken|not working|won'?t (turn|start|work)|overflow|clogged|backed up|no (hot )?water|ac (is )?(out|down|not)|heat (is )?(out|down)|stuck|hot tub|jacuzzi|pool)\b/i;

// Infers urgency from the guest's wording, floored by the intent.
function inferUrgency(intent: Database['public']['Enums']['intent_type'], question: string): UrgencyLevel {
  if (intent === 'emergency' || CRITICAL_WORDS.test(question)) return 'critical';
  if (intent === 'safety') return 'high';
  if (HIGH_WORDS.test(question)) return 'high';
  if (intent === 'maintenance') return 'medium';
  return 'low';
}

// Ranks urgency so a repeat report that is MORE urgent can escalate an open ticket.
const URGENCY_RANK: Record<UrgencyLevel, number> = { low: 0, medium: 1, high: 2, critical: 3 };

type Json = Database['public']['Tables']['service_requests']['Row']['timeline'];

interface MaintenanceResult {
  created: boolean;
  serviceRequestId: string | null;
  urgency: UrgencyLevel | null;
  // A short guest-facing line to append to the concierge answer, or null.
  guestLine: string | null;
}

// D2 — Intelligence powers actions.
//
// After the concierge answers, if the guest's question represents something that
// needs the host's attention (maintenance / cleaning / safety / emergency), open
// a service_requests ticket and notify the host (in-app + email; SMS stays gated).
//
// Guardrails:
//   - Verified guest sessions only (the caller passes stayId/conversationId from a
//     validated session — this helper never runs for unauthenticated traffic).
//   - De-dupe: if an OPEN ticket already exists for this conversation, we do NOT
//     create a second one. If the new report is strictly more urgent we bump the
//     existing ticket's urgency and append a timeline event instead.
//   - Never throws: a failure here must never break the guest's chat reply.
export async function maybeCreateServiceRequest(
  admin: Admin,
  opts: {
    propertyId: string;
    stayId: string | null;
    conversationId: string;
    question: string;
    answer: ConciergeAnswer;
  },
): Promise<MaintenanceResult> {
  const noop: MaintenanceResult = { created: false, serviceRequestId: null, urgency: null, guestLine: null };
  try {
    const { intent } = opts.answer;
    if (!ACTIONABLE_INTENTS.has(intent)) return noop;

    const urgency = inferUrgency(intent, opts.question);
    const serviceType = serviceTypeForIntent(intent);

    // De-dupe against still-open tickets for this same conversation.
    const OPEN_STATUSES: Database['public']['Enums']['service_status'][] = [
      'new', 'acknowledged', 'in_progress', 'waiting_on_guest',
    ];
    const { data: openTickets } = await admin
      .from('service_requests')
      .select('id, urgency, timeline')
      .eq('conversation_id', opts.conversationId)
      .in('status', OPEN_STATUSES)
      .order('created_at', { ascending: false })
      .limit(1);

    const existing = (openTickets ?? [])[0] as
      | { id: string; urgency: UrgencyLevel; timeline: Json }
      | undefined;

    if (existing) {
      // A ticket is already open for this conversation. Only act if the new
      // report is more urgent — bump urgency + record the follow-up in the timeline.
      if (URGENCY_RANK[urgency] > URGENCY_RANK[existing.urgency]) {
        const prior = Array.isArray(existing.timeline) ? existing.timeline : [];
        const event = {
          at: new Date().toISOString(),
          type: 'urgency_bumped',
          from: existing.urgency,
          to: urgency,
          note: opts.question.slice(0, 300),
        };
        await admin
          .from('service_requests')
          .update({ urgency, timeline: [...prior, event] as unknown as Json } as never)
          .eq('id', existing.id);
        log.info('service_request_urgency_bumped', { serviceRequestId: existing.id, to: urgency });
      }
      // No new ticket, no second notification — avoid host alert spam.
      return { created: false, serviceRequestId: existing.id, urgency, guestLine: null };
    }

    // Create the ticket.
    const timeline = [
      {
        at: new Date().toISOString(),
        type: 'created',
        source: 'guest_chat',
        intent,
        note: opts.question.slice(0, 300),
      },
    ] as unknown as Json;

    const { data: created, error } = await admin
      .from('service_requests')
      .insert({
        property_id: opts.propertyId,
        stay_id: opts.stayId,
        conversation_id: opts.conversationId,
        service_type: serviceType,
        urgency,
        status: 'new',
        description: opts.question.slice(0, 1000),
        timeline,
      } as never)
      .select('id')
      .single();

    if (error || !created) {
      log.warn('service_request_create_failed', { error: error?.message });
      return noop;
    }
    const serviceRequestId = (created as { id: string }).id;

    // Notify the host (in-app + email; SMS remains behind NOTIFY_SMS_ENABLED).
    const { data: prop } = await admin
      .from('properties')
      .select('host_account_id, display_name')
      .eq('id', opts.propertyId)
      .maybeSingle();
    if (prop) {
      const p = prop as { host_account_id: string; display_name: string };
      const urgencyTag = urgency === 'critical' || urgency === 'high' ? `[${urgency.toUpperCase()}] ` : '';
      await notify(admin, {
        hostAccountId: p.host_account_id,
        kind: 'maintenance',
        title: `${urgencyTag}New ${serviceType} request at ${p.display_name}`,
        body: opts.question.slice(0, 200),
        propertyId: opts.propertyId,
        link: '/dashboard/service-requests',
      });
    }

    log.info('service_request_created', { serviceRequestId, serviceType, urgency, intent });

    // Guest-facing confirmation. Emergencies get a stronger line.
    const guestLine =
      intent === 'emergency' || urgency === 'critical'
        ? "I've alerted your host right away and opened an urgent request. If this is a life-safety emergency, please also contact local emergency services."
        : "I've let your host know and opened a request for this — they'll follow up with you.";

    return { created: true, serviceRequestId, urgency, guestLine };
  } catch (e) {
    log.warn('maybe_create_service_request_error', { error: String(e) });
    return noop;
  }
}
