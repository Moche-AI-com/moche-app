import { NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { z } from 'zod';
import { getSessionContext } from '@/lib/auth/guards';
import { createClient } from '@/lib/supabase/server';
import { getStripe, priceIdFor, BillingNotConfiguredError } from '@/lib/billing/stripe';
import { publicEnv, serverEnv } from '@/lib/env';
import {
  PLANS,
  SELF_SERVE_PLAN_IDS,
  FOUNDING_TRIAL_DAYS,
  FOUNDING_TRIAL_PROPERTY_LIMIT,
  TOP_TIER_PLAN_ID,
  type PlanId,
} from '@/lib/constants';
import { recordAcceptances } from '@/lib/legal/acceptance';
import { audit } from '@/lib/audit';
import { log } from '@/lib/log';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Derived from PLANS so a new tier cannot be added to the grid and silently stay
// unbuyable, and so the sales-assisted tiers (enterprise, custom) are rejected here
// rather than failing later on a missing price id.
const SELF_SERVE = SELF_SERVE_PLAN_IDS as [PlanId, ...PlanId[]];

const bodySchema = z.object({
  planId: z.enum(SELF_SERVE as unknown as [string, ...string[]]).transform((v) => v as PlanId),
  interval: z.enum(['monthly', 'annual']).default('monthly'),
  // Clickwrap: the checkout UI presents an unchecked-by-default agreement box.
  // Required true so a paid subscription is never created without recorded consent.
  acceptTerms: z.literal(true),
});

export async function POST(req: Request) {
  const ctx = await getSessionContext();
  if (!ctx) return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 });

  // Account-level billing: only the account owner may manage billing (co-hosts cannot).
  const canManageBilling = ctx.account.owner_id === ctx.user.id;
  if (!canManageBilling) {
    return NextResponse.json({ error: 'You cannot manage billing for this account.' }, { status: 403 });
  }

  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid input.' }, { status: 400 });
  }
  const { planId, interval } = parsed.data;

  let stripe;
  try {
    stripe = getStripe();
  } catch (e) {
    if (e instanceof BillingNotConfiguredError) {
      return NextResponse.json({ error: e.message }, { status: 503 });
    }
    throw e;
  }

  // Defence in depth: the zod enum already excludes them, but a sales-assisted tier
  // must never reach Stripe even if that enum is widened by accident.
  if (!PLANS[planId]?.selfServe) {
    return NextResponse.json(
      { error: 'That plan is arranged with our team. Please contact sales.' },
      { status: 400 },
    );
  }

  const price = priceIdFor(planId, interval);
  if (!price) {
    return NextResponse.json({ error: 'That plan is not available right now.' }, { status: 503 });
  }

  const supabase = createClient();
  const hostAccountId = ctx.account.id;

  // Record the checkout clickwrap consent against the authenticated user (RLS lets a
  // user insert their own acceptance rows). Best-effort — never blocks checkout.
  const h = headers();
  await recordAcceptances(supabase, {
    userId: ctx.user.id,
    hostAccountId,
    context: 'checkout',
    // Record exactly the agreements shown at checkout (paid subscription adds the DPA).
    slugs: ['terms', 'privacy', 'acceptable-use', 'dpa'],
    ip: h.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null,
    userAgent: h.get('user-agent'),
  });

  try {
    // Ensure a Stripe customer exists for this account, reusing any stored id so we
    // never create duplicate customers across repeated checkouts.
    const { data: existing } = await supabase
      .from('subscriptions')
      .select('stripe_customer_id, stripe_subscription_id')
      .eq('host_account_id', hostAccountId)
      .maybeSingle();

    // The Founding Member offer is one free month on the top tier, once per account.
    // Anyone who has already had a Stripe subscription has already consumed it, so
    // the trial is offered only when no subscription id was ever recorded. Without
    // this check a host could cancel and re-checkout for an unlimited free ride.
    const isFoundingTrialEligible = !existing?.stripe_subscription_id;

    let customerId = existing?.stripe_customer_id ?? null;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: ctx.user.email ?? undefined,
        name: ctx.account.name ?? undefined,
        metadata: { host_account_id: hostAccountId },
      });
      customerId = customer.id;

      // Persist the customer id, idempotent on the unique host_account_id. Best-effort:
      // if RLS blocks the write, the webhook will persist it on checkout completion.
      const { error: upsertError } = await supabase
        .from('subscriptions')
        .upsert(
          { host_account_id: hostAccountId, stripe_customer_id: customerId },
          { onConflict: 'host_account_id' },
        );
      if (upsertError) {
        log.warn('stripe_checkout_customer_persist_failed', { error: upsertError.message });
      }
    }

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: customerId,
      line_items: [{ price, quantity: 1 }],
      client_reference_id: hostAccountId,
      subscription_data: {
        metadata: {
          host_account_id: hostAccountId,
          plan: planId,
          ...(isFoundingTrialEligible
            ? {
                founding_member: 'true',
                trial_grants_plan: TOP_TIER_PLAN_ID,
                trial_property_limit: String(FOUNDING_TRIAL_PROPERTY_LIMIT),
              }
            : {}),
        },
        ...(isFoundingTrialEligible
          ? {
              trial_period_days: FOUNDING_TRIAL_DAYS,
              // A card is collected up front (payment_method_collection: 'always'
              // below), so if it somehow goes missing we cancel rather than leave a
              // subscription that can never be charged.
              trial_settings: { end_behavior: { missing_payment_method: 'cancel' } },
            }
          : {}),
      },
      // Stripe defaults trials to 'if_required', which would let a host start a free
      // month with no card and force a second payment step at conversion. Requiring
      // the card now means the trial converts on its own.
      payment_method_collection: 'always',
      metadata: { host_account_id: hostAccountId, plan: planId },
      success_url: `${publicEnv.appUrl}/dashboard/billing?status=success`,
      cancel_url: `${publicEnv.appUrl}/dashboard/billing?status=cancelled`,
      allow_promotion_codes: true,
    });

    if (!session.url) {
      return NextResponse.json({ error: 'Could not start checkout. Please try again.' }, { status: 502 });
    }

    await audit(supabase, {
      action: 'billing.checkout.started',
      actorProfileId: ctx.user.id,
      hostAccountId,
      targetType: 'subscription',
      metadata: { plan: planId, interval, foundingTrial: isFoundingTrialEligible },
    });

    return NextResponse.json({ url: session.url });
  } catch (e) {
    log.error('stripe_checkout_failed', { error: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: 'Could not start checkout. Please try again.' }, { status: 502 });
  }
}
