import { LAUNCH_DATE_LABEL, PLANS, type PlanId } from '@/lib/constants';

/**
 * Plan-state copy for the host dashboard.
 *
 * The dashboard used to render a single hardcoded line: "You're on the free build
 * tier (1 property)." That was wrong in three ways.
 *
 * 1. `active: false` covers two very different situations. A host who has never
 *    subscribed really is on the free build tier. A host whose paid subscription
 *    lapsed is ALSO `active: false`, but their guest AI is being refused right
 *    now. Telling them to "choose a plan" buries the actual problem.
 * 2. The property count was hardcoded as the singular "property", so any cap
 *    other than 1 read as "5 property".
 * 3. Nothing surfaced the conversation allowance, even though that is the cap
 *    hosts actually hit first.
 *
 * All of that lives here as pure functions so it is testable, since component
 * files are not in the vitest include globs.
 */

/** The subset of Entitlements this module reads. Keeps it decoupled from billing. */
export interface PlanBannerInput {
  planId: PlanId | null;
  active: boolean;
  isReadOnly: boolean;
  trialing: boolean;
  trialEnd: string | null;
  propertyLimit: number;
  conversationAllowance: number;
  /**
   * True until Moche-AI goes live. Passed in rather than read from the clock so
   * this stays a pure function and the billing variants remain testable without
   * time-travelling the whole suite. The dashboard supplies `isPreLaunch()`.
   */
  preLaunch?: boolean;
}

export type PlanBannerVariant = 'pre_launch' | 'read_only' | 'trial' | 'free_build' | 'cap_reached';

export interface PlanBanner {
  variant: PlanBannerVariant;
  /** Maps to the existing .alert-* classes. */
  tone: 'info' | 'warn' | 'error';
  title: string;
  body: string;
  ctaLabel: string;
  ctaHref: string;
}

/** "1 property" / "5 properties". */
export function pluralize(count: number, singular: string, plural?: string): string {
  return `${count} ${count === 1 ? singular : (plural ?? `${singular}s`)}`;
}

/**
 * Whole days remaining, rounded up, so the last partial day still reads as "1 day
 * left" rather than "0 days left". Returns null for a missing or unparseable date
 * so a bad value degrades to a banner without a countdown instead of "NaN days".
 */
export function daysUntil(iso: string | null | undefined, now: Date = new Date()): number | null {
  if (!iso) return null;
  const end = new Date(iso).getTime();
  if (Number.isNaN(end)) return null;
  const ms = end - now.getTime();
  if (ms <= 0) return 0;
  return Math.ceil(ms / 86_400_000);
}

/**
 * Describes the plan's caps in one clause. `conversationAllowance` is 0 on the
 * sales-assisted tiers, where the allowance is contractual, so it is omitted
 * rather than printed as "0 guest conversations".
 */
export function capsSentence(propertyLimit: number, conversationAllowance: number): string {
  const props = pluralize(propertyLimit, 'property', 'properties');
  if (conversationAllowance <= 0) return props;
  return `${props} and ${conversationAllowance.toLocaleString('en-US')} guest conversations a month`;
}

/**
 * Returns the banner to show, or null when the host is on a healthy paid plan and
 * has nothing to act on.
 */
export function planBannerFor(ent: PlanBannerInput, now: Date = new Date()): PlanBanner | null {
  // Before launch this outranks every billing banner, because none of them are
  // true yet: nothing is billed, nothing can lapse, and "choose a plan to publish"
  // is advice a host cannot act on until publishing exists. Telling them what they
  // CAN do is the only useful message on the page.
  if (ent.preLaunch) {
    return {
      variant: 'pre_launch',
      tone: 'info',
      title: `Building for ${LAUNCH_DATE_LABEL}`,
      body: 'Add your properties and build each Property Brain now, and preview the guest portal exactly as a guest will see it. Nothing is billed before launch and no card is on file. Publishing, guest links and QR codes switch on at launch, and your founding rate is already attached to this account.',
      ctaLabel: 'Add a property',
      ctaHref: '/dashboard/properties/new',
    };
  }

  // Checked before `active` because a lapsed account is inactive AND read-only,
  // and the read-only message is the one that matters.
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

  // Defensive path. Checkout no longer grants a trial (the founding offer is a
  // Stripe coupon instead, see lib/billing/founding.ts), so this only fires for a
  // subscription Stripe reports as trialing: a legacy row, or one adjusted by hand
  // in the Stripe dashboard. It stays because such a host still deserves an
  // explanation of why their concierge will change state on a date.
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
      title: 'You are on the free build tier',
      body: `Build and preview ${capsSentence(ent.propertyLimit, ent.conversationAllowance)}. Choose a plan to publish, add more properties, and unlock concierge personality, co-hosts, cloning, and review nudges.`,
      ctaLabel: 'Choose a plan',
      ctaHref: '/dashboard/profile/billing',
    };
  }

  return null;
}
