import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/database.types';
import { PLANS, type PlanId } from '@/lib/constants';

type Client = SupabaseClient<Database>;
type Subscription = Database['public']['Tables']['subscriptions']['Row'];

export interface Entitlements {
  planId: PlanId | null;
  active: boolean;
  status: Subscription['status'] | 'none';
  propertyLimit: number;
  reviewNudge: boolean;
  smsEscalation: boolean;
  conciergeCustomization: boolean;
  coHosts: boolean;
  cloning: boolean;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
}

const ACTIVE_STATUSES: Subscription['status'][] = ['trialing', 'active', 'past_due'];

// Statuses for which a property's guest AI concierge stays ENABLED. Mirrors
// ACTIVE_STATUSES: trialing/active are fully paid-up, past_due is a grace period
// during dunning (we keep guests served while the host resolves payment). Blocked
// statuses: unpaid (dunning exhausted), canceled, incomplete, incomplete_expired,
// paused. Uses the EXISTING subscription_status enum — no new states invented.
const GUEST_AI_ENABLED_STATUSES: Subscription['status'][] = ['trialing', 'active', 'past_due'];

// Whether the guest AI concierge should run for a host account's subscription.
// A missing subscription (free tier / never subscribed) is NOT guest-AI enabled:
// the public concierge is a paid capability. Derived from the DB, never the client.
export function guestAiEnabled(sub: Subscription | null): boolean {
  return !!sub && GUEST_AI_ENABLED_STATUSES.includes(sub.status);
}

// Entitlements are DERIVED FROM THE DATABASE, never trusted from the client.
// A missing/inactive subscription grants the minimum (1 property, no paid features).
export function entitlementsFromSubscription(sub: Subscription | null): Entitlements {
  const active = !!sub && ACTIVE_STATUSES.includes(sub.status);
  const planId = (sub?.plan as PlanId | undefined) ?? null;
  const plan = planId && PLANS[planId] ? PLANS[planId] : null;

  if (!active || !plan) {
    return {
      planId: null,
      active: false,
      status: sub?.status ?? 'none',
      propertyLimit: 1, // allow one draft property so hosts can build before paying
      reviewNudge: false,
      smsEscalation: false,
      conciergeCustomization: false,
      coHosts: false,
      cloning: false,
      currentPeriodEnd: sub?.current_period_end ?? null,
      cancelAtPeriodEnd: sub?.cancel_at_period_end ?? false,
    };
  }

  return {
    planId: plan.id,
    active: true,
    status: sub!.status,
    propertyLimit: plan.propertyLimit,
    reviewNudge: plan.reviewNudge,
    smsEscalation: plan.smsEscalation,
    conciergeCustomization: plan.conciergeCustomization,
    coHosts: plan.id !== 'starter',
    cloning: plan.id !== 'starter',
    currentPeriodEnd: sub!.current_period_end,
    cancelAtPeriodEnd: sub!.cancel_at_period_end,
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
// guest concierge. Reused by the guest chat path (Part 4) to fail gracefully
// instead of calling the model for an unpaid/canceled account.
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
