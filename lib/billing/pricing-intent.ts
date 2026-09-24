import { PLANS, type BillingInterval } from '@/lib/constants';

export type SelfServePlanId = 'starter' | 'pro' | 'portfolio';

/** Marketing selection only. Never use this value to grant access or calculate a charge. */
export interface PricingIntent {
  planId: SelfServePlanId;
  interval: BillingInterval;
}

const SELF_SERVE_PLAN_IDS: readonly SelfServePlanId[] = ['starter', 'pro', 'portfolio'];

export function parsePricingIntent(planId: unknown, interval: unknown): PricingIntent | null {
  if (typeof planId !== 'string' || typeof interval !== 'string') return null;
  if (!SELF_SERVE_PLAN_IDS.some(id => id === planId)) return null;
  if (interval !== 'monthly' && interval !== 'annual') return null;
  const validatedId = planId as SelfServePlanId;
  if (!PLANS[validatedId].selfServe) return null;
  return { planId: validatedId, interval: interval as BillingInterval };
}

export function pricingIntentFromMetadata(metadata: Record<string, unknown> | null | undefined): PricingIntent | null {
  const value = metadata?.pricing_intent;
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const intent = value as Record<string, unknown>;
  return parsePricingIntent(intent.planId, intent.interval);
}

export function pricingIntentQuery(intent: PricingIntent): string {
  return `plan=${encodeURIComponent(intent.planId)}&interval=${encodeURIComponent(intent.interval)}`;
}
