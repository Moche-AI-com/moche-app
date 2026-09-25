import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/database.types';
import { PLANS, TOP_TIER_PLAN_ID, FOUNDING_TRIAL_PROPERTY_LIMIT, type PlanId } from '@/lib/constants';

type Client = SupabaseClient<Database>;
type Subscription = Database['public']['Tables']['subscriptions']['Row'];

export interface Entitlements {
  planId: PlanId | null;
  active: boolean;
  status: Subscription['status'] | 'none';
  propertyLimit: number;
  conversationAllowance: number;
  smsAllowance: number;
  reviewNudge: boolean;
  smsEscalation: boolean;
  conciergeCustomization: boolean;
  coHosts: boolean;
  cloning: boolean;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  trialing: boolean;
  trialEnd: string | null;
  isReadOnly: boolean;
}

const ACTIVE_STATUSES: Subscription['status'][] = ['trialing', 'active', 'past_due'];
const GUEST_AI_ENABLED_STATUSES: Subscription['status'][] = ['trialing', 'active', 'past_due'];
const READ_ONLY_STATUSES: Subscription['status'][] = ['unpaid', 'canceled', 'incomplete_expired', 'paused'];

export function isReadOnly(sub: Subscription | null): boolean {
  if (!sub) return false;
  return sub.is_read_only || READ_ONLY_STATUSES.includes(sub.status);
}

export function guestAiEnabled(sub: Subscription | null): boolean {
  if (!sub) return false;
  if (isReadOnly(sub)) return false;
  return GUEST_AI_ENABLED_STATUSES.includes(sub.status);
}

export function entitlementsFromSubscription(sub: Subscription | null): Entitlements {
  const active = !!sub && ACTIVE_STATUSES.includes(sub.status);
  const readOnly = isReadOnly(sub);
  const trialing = !!sub && sub.status === 'trialing';
  const planId = (sub?.plan as PlanId | undefined) ?? null;
  const storedPlan = planId && PLANS[planId] ? PLANS[planId] : null;
  const plan = trialing ? PLANS[TOP_TIER_PLAN_ID] : storedPlan;
  if (!active || !plan || readOnly) {
    return {
      planId: readOnly ? planId : null, active: false, status: sub?.status ?? 'none',
      propertyLimit: 1, conversationAllowance: sub ? 0 : 30, smsAllowance: 0,
      reviewNudge: false, smsEscalation: false, conciergeCustomization: false,
      coHosts: false, cloning: false, currentPeriodEnd: sub?.current_period_end ?? null,
      cancelAtPeriodEnd: sub?.cancel_at_period_end ?? false, trialing: false,
      trialEnd: sub?.trial_end ?? null, isReadOnly: readOnly,
    };
  }
  const paidQuantity = sub!.quantity && Number.isFinite(sub!.quantity) && sub!.quantity > 0 ? sub!.quantity : 1;
  const propertyLimit = trialing
    ? (sub!.trial_property_limit ?? FOUNDING_TRIAL_PROPERTY_LIMIT)
    : Math.min(paidQuantity, plan.propertyLimit);
  return {
    planId: plan.id, active: true, status: sub!.status, propertyLimit,
    conversationAllowance: plan.conversationAllowance, smsAllowance: plan.smsAllowance,
    reviewNudge: plan.reviewNudge, smsEscalation: plan.smsEscalation,
    conciergeCustomization: plan.conciergeCustomization, coHosts: plan.id !== 'starter',
    cloning: plan.id !== 'starter', currentPeriodEnd: sub!.current_period_end,
    cancelAtPeriodEnd: sub!.cancel_at_period_end, trialing, trialEnd: sub!.trial_end,
    isReadOnly: false,
  };
}

export async function getEntitlements(client: Client, hostAccountId: string): Promise<Entitlements> {
  const { data: sub } = await client.from('subscriptions').select('*')
    .eq('host_account_id', hostAccountId).maybeSingle();
  return entitlementsFromSubscription(sub ?? null);
}

// Only a service-role server client can read app_settings. Demo access is scoped
// to a single host account, requires an explicit grant, and has no expiration.
// Any real subscription takes precedence, including canceled and read-only rows.
export async function isGuestAiEnabled(client: Client, hostAccountId: string): Promise<boolean> {
  const { data: sub, error: subError } = await client.from('subscriptions').select('*')
    .eq('host_account_id', hostAccountId).maybeSingle();
  if (subError) return false;
  if (sub) return guestAiEnabled(sub);
  const { data: grant, error: grantError } = await client.from('app_settings').select('value')
    .eq('key', `guest_ai_demo:${hostAccountId}`).maybeSingle();
  if (grantError) return false;
  const value = grant?.value;
  return !!value && typeof value === 'object' && !Array.isArray(value)
    && 'enabled' in value && value.enabled === true;
}

export async function canCreateProperty(client: Client, hostAccountId: string): Promise<{ ok: boolean; limit: number; used: number }> {
  const ent = await getEntitlements(client, hostAccountId);
  const { count } = await client.from('properties').select('id', { count: 'exact', head: true })
    .eq('host_account_id', hostAccountId).is('deleted_at', null).neq('status', 'archived');
  const used = count ?? 0;
  return { ok: used < ent.propertyLimit, limit: ent.propertyLimit, used };
}
