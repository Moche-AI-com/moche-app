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
  FOUNDING_COUPON_ID,
  FOUNDING_DISCOUNT_MONTHS,
  FOUNDING_DISCOUNT_PERCENT,
  type PlanId,
} from '@/lib/constants';
import { isFoundingCouponRedeemable, isFoundingDiscountEligible } from '@/lib/billing/founding';
import { countBillableProperties } from '@/lib/billing/quantity-sync';
import { recordAcceptances } from '@/lib/legal/acceptance';
import { audit } from '@/lib/audit';
import { log } from '@/lib/log';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Derived from PLANS so a new tier cannot be added to the grid and silently stay
// unbuyable, and so the sales-assisted tiers (portfolio, enterprise) are rejected here
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
  const h = await headers();
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

    // The Founding Host offer is FOUNDING_DISCOUNT_PERCENT off for
    // FOUNDING_DISCOUNT_MONTHS months, delivered by a live Stripe coupon whose
    // max_redemptions enforces the account cap. Attached automatically below so a
    // founding host never has to know a promo code exists.
    //
    // Anyone who has already had a subscription has consumed their claim, so the
    // discount is offered only when no subscription id was ever recorded. Without
    // that check a host could cancel and re-checkout to restart the 12 months.
    const foundingDiscount = isFoundingDiscountEligible({
      hasEverSubscribed: !!existing?.stripe_subscription_id,
      couponValid: await isFoundingCouponRedeemable(stripe),
    });

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

    // Per-property pricing (pitch-deck model, Aug 2026): self-serve tiers are priced
    // per property per month, so the line-item quantity is the number of active
    // properties on the account. Shared with lib/billing/quantity-sync.ts, which
    // keeps this quantity current as properties are added, archived, or deleted, so
    // the count at signup and the count afterwards can never diverge.
    const quantity = await countBillableProperties(supabase, hostAccountId);

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: customerId,
      line_items: [{ price, quantity }],
      client_reference_id: hostAccountId,
      subscription_data: {
        metadata: {
          host_account_id: hostAccountId,
          plan: planId,
          ...(foundingDiscount
            ? {
                founding_member: 'true',
                founding_discount_percent: String(FOUNDING_DISCOUNT_PERCENT),
                founding_discount_months: String(FOUNDING_DISCOUNT_MONTHS),
              }
            : {}),
        },
      },
      // A card is always collected. No trial is granted here, so this only removes
      // Stripe's 'if_required' shortcut and guarantees the first invoice can be paid.
      payment_method_collection: 'always',
      metadata: { host_account_id: hostAccountId, plan: planId },
      success_url: `${publicEnv.appUrl}/dashboard/profile/billing?status=success`,
      cancel_url: `${publicEnv.appUrl}/dashboard/profile/billing?status=cancelled`,
      // Stripe rejects a session carrying both `discounts` and
      // `allow_promotion_codes`, so these are mutually exclusive by necessity.
      // Founding hosts get the discount applied for them and need no code box;
      // everyone else keeps the box, so a future campaign code still works.
      ...(foundingDiscount
        ? { discounts: [{ coupon: FOUNDING_COUPON_ID }] }
        : { allow_promotion_codes: true }),
    });

    if (!session.url) {
      return NextResponse.json({ error: 'Could not start checkout. Please try again.' }, { status: 502 });
    }

    await audit(supabase, {
      action: 'billing.checkout.started',
      actorProfileId: ctx.user.id,
      hostAccountId,
      targetType: 'subscription',
      metadata: { plan: planId, interval, quantity, foundingDiscount },
    });

    return NextResponse.json({ url: session.url });
  } catch (e) {
    log.error('stripe_checkout_failed', { error: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: 'Could not start checkout. Please try again.' }, { status: 502 });
  }
}
