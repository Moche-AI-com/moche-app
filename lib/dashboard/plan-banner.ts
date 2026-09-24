import { PLANS, type PlanId } from '@/lib/constants';

export interface PlanBannerInput {
  planId: PlanId | null;
  active: boolean;
  isReadOnly: boolean;
  trialing: boolean;
  trialEnd: string | null;
  propertyLimit: number;
  conversationAllowance: number;
}

export type PlanBannerVariant = 'read_only' | 'trial' | 'free_build' | 'cap_reached';

export interface PlanBanner {
  variant: PlanBannerVariant;
  tone: 'info' | 'warn' | 'error';
  title: string;
  body: string;
  ctaLabel: string;
  ctaHref: string;
}

export function pluralize(count: number, singular: string, plural?: string): string {
  return `${count} ${count === 1 ? singular : (plural ?? `${singular}s`)}`;
}

export function daysUntil(iso: string | null | undefined, now: Date = new Date()): number | null {
  if (!iso) return null;
  const end = new Date(iso).getTime();
  if (Number.isNaN(end)) return null;
  const ms = end - now.getTime();
  if (ms <= 0) return 0;
  return Math.ceil(ms / 86_400_000);
}

export function capsSentence(propertyLimit: number, conversationAllowance: number): string {
  const props = pluralize(propertyLimit, 'property', 'properties');
  if (conversationAllowance <= 0) return props;
  return `${props} and ${conversationAllowance.toLocaleString('en-US')} guest conversations a month`;
}

export function planBannerFor(ent: PlanBannerInput, now: Date = new Date()): PlanBanner | null {
  if (ent.isReadOnly) {
    const planName = ent.planId && PLANS[ent.planId] ? PLANS[ent.planId].name : null;
    return {
      variant: 'read_only',
      tone: 'error',
      title: 'Your concierge is paused',
      body: planName
        ? `Billing on your ${planName} plan needs attention, so your concierge is not answering guests right now. Your properties and Brain are untouched.`
        : 'Billing needs attention, so your concierge is not answering guests right now. Your properties and Brain are untouched.',
      ctaLabel: 'Fix billing',
      ctaHref: '/dashboard/profile/billing',
    };
  }

  if (ent.trialing) {
    const left = daysUntil(ent.trialEnd, now);
    return {
      variant: 'trial',
      tone: left !== null && left <= 3 ? 'warn' : 'info',
      title:
        left === null
          ? 'Your plan is in a trial period'
          : left === 0
            ? 'Your trial ends today'
            : `${pluralize(left, 'day')} left in your trial`,
      body: `You have every premium feature plus ${capsSentence(ent.propertyLimit, ent.conversationAllowance)}. Pick a plan before the trial ends to keep your concierge answering.`,
      ctaLabel: 'Choose a plan',
      ctaHref: '/dashboard/profile/billing',
    };
  }

  if (!ent.active) {
    return {
      variant: 'free_build',
      tone: 'info',
      title: 'You are on the free plan',
      body: `Build and preview ${capsSentence(ent.propertyLimit, ent.conversationAllowance)}. Guest publishing requires a paid plan; your draft property and Brain remain yours while you decide.`,
      ctaLabel: 'Choose a plan to publish',
      ctaHref: '/dashboard/profile/billing',
    };
  }

  return null;
}
