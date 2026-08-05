import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/database.types';
import {
  PLANS,
  TOP_TIER_PLAN_ID,
  FOUNDING_TRIAL_PROPERTY_LIMIT,
  type PlanId,
} from '@/lib/constants';

type Client = SupabaseClient<Database>;
type Subscription = Database['public']['Tables']['subscriptions']['Row'];

export interface Entitlements {
  planId: PlanId | null;
  active: boolean;
  status: Subscription['status'] | 'none';
  propertyLimit: number;
  // Pooled guest conversations per period for the whole host account. 0 means the
  // allowance is set by contract (sales-assisted tiers) or there is no plan.
  conversationAllowance: number;
  reviewNudge: boolean;
  smsEscalation: boolean;
  conciergeCustomization: boolean;
  coHosts: boolean;
  cloning: boolean;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  // True while the Founding Member trial is running. Trials grant top-tier FEATURES
  // with a lower property cap, so callers that care about the cap must read
  // propertyLimit rather than inferring it from planId.
  trialing: boolean;
  trialEnd: string | null;
  // Read-only degradation: the account keeps its data and every static guest-facing
  // surface, but guest AI is refused and write paths surface an upgrade prompt.
  isReadOnly: boolean;
}

const ACTIVE_STATUSES: Subscription['status'][] = ['trialing', 'active', 'past_due'];

// Statuses for which a property's guest AI concierge stays ENABLED. Mirrors
// ACTIVE_STATUSES: trialing/active are fully paid-up, past_due is a grace period
// during dunning (we keep guests served while the host resolves payment). Blocked
// statuses: unpaid (dunning exhausted), canceled, incomplete, incomplete_expired,
// paused. Uses the EXISTING subscription_status enum — no new states invented.
const GUEST_AI_ENABLED_STATUSES: Subscription['status'][] = ['trialing', 'active', 'past_due'];

// Statuses that put an account into read-only on their own, independent of the
// explicit subscriptions.is_read_only latch. past_due is deliberately NOT here: it
// is a dunning grace period, and cutting a paying host's guests off mid-stay over a
// card that expired is worse than carrying them for the dunning window.
const READ_ONLY_STATUSES: Subscription['status'][] = [
  'unpaid',
  'canceled',
  'incomplete_expired',
  'paused',
];

// Read-only is the OR of the explicit latch and the status-derived value. Support
// can force it on, and an exhausted dunning cycle produces it without anyone
// having to remember to set a column.
export function isReadOnly(sub: Subscription | null): boolean {
  if (!sub) return false; // never subscribed is not read-only, it is pre-trial
  return sub.is_read_only || READ_ONLY_STATUSES.includes(sub.status);
}

// Whether the guest AI concierge should run for a host account's subscription.
// A missing subscription (free tier / never subscribed) is NOT guest-AI enabled:
// the public concierge is a paid capability. Derived from the DB, never the client.
//
// Read-only wins over an otherwise-enabled status, which is how an explicit
// is_read_only latch takes effect on a row that still says 'active'.
export function guestAiEnabled(sub: Subscription | null): boolean {
  if (!sub) return false;
  if (isReadOnly(sub)) return false;
  return GUEST_AI_ENABLED_STATUSES.includes(sub.status);
}

// Entitlements are DERIVED FROM THE DATABASE, never trusted from the client.
// A missing/inactive subscription grants the minimum (1 property, no paid features).
export function entitlementsFromSubscription(sub: Subscription | null): Entitlements {
  const active = !!sub && ACTIVE_STATUSES.includes(sub.status);
  const readOnly = isReadOnly(sub);
  const trialing = !!sub && sub.status === 'trialing';
  const planId = (sub?.plan as PlanId | undefined) ?? null;
  const storedPlan = planId && PLANS[planId] ? PLANS[planId] : null;

  // During a Founding Member trial the host gets the top tier's features even if
  // the price they checked out on is a cheaper tier, because the offer is "one
  // month on the top tier". The property CAP still comes from the subscription row
  // (trial_property_limit), not from the top tier's own much higher limit.
  const plan = trialing ? PLANS[TOP_TIER_PLAN_ID] : storedPlan;

  if (!active || !plan || readOnly) {
    return {
      planId: readOnly ? planId : null,
      active: false,
      status: sub?.status ?? 'none',
      propertyLimit: 1, // allow one draft property so hosts can build before paying
      conversationAllowance: 0,
      reviewNudge: false,
      smsEscalation: false,
      conciergeCustomization: false,
      coHosts: false,
      cloning: false,
      currentPeriodEnd: sub?.current_period_end ?? null,
      cancelAtPeriodEnd: sub?.cancel_at_period_end ?? false,
      trialing: false,
      trialEnd: sub?.trial_end ?? null,
      isReadOnly: readOnly,
    };
  }

  const propertyLimit = trialing
    ? (sub!.trial_property_limit ?? FOUNDING_TRIAL_PROPERTY_LIMIT)
    : plan.propertyLimit;

  return {
    planId: plan.id,
    active: true,
    status: sub!.status,
    propertyLimit,
    conversationAllowance: plan.conversationAllowance,
    reviewNudge: plan.reviewNudge,
    smsEscalation: plan.smsEscalation,
    conciergeCustomization: plan.conciergeCustomization,
    coHosts: plan.id !== 'starter',
    cloning: plan.id !== 'starter',
    currentPeriodEnd: sub!.current_period_end,
    cancelAtPeriodEnd: sub!.cancel_at_period_end,
    trialing,
    trialEnd: sub!.trial_end,
    isReadOnly: false,
  };
}

export async function getEntitlements(client: Client, hostAccountId: string): Promise<Entitlements> {
  const { data: sub } = await client
    .from('subscriptions')
    .select('*')
    .eq('host_account_id', hostAccountId)
    .maybeSingle();
  return entitlementsFromSubscription(sub ?? null);
}

// Guest-AI gate for a host account: true when billing status permits serving the
// guest concierge. Reused by the guest chat path to fail gracefully instead of
// calling the model for an unpaid/canceled/read-only account.
export async function isGuestAiEnabled(client: Client, hostAccountId: string): Promise<boolean> {
  const { data: sub } = await client
    .from('subscriptions')
    .select('*')
    .eq('host_account_id', hostAccountId)
    .maybeSingle();
  return guestAiEnabled(sub ?? null);
}

// Enforces the property cap. Counts non-archived, non-deleted properties.
export async function canCreateProperty(client: Client, hostAccountId: string): Promise<{ ok: boolean; limit: number; used: number }> {
  const ent = await getEntitlements(client, hostAccountId);
  const { count } = await client
    .from('properties')
    .select('id', { count: 'exact', head: true })
    .eq('host_account_id', hostAccountId)
    .is('deleted_at', null)
    .neq('status', 'archived');
  const used = count ?? 0;
  return { ok: used < ent.propertyLimit, limit: ent.propertyLimit, used };
}
