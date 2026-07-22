import { NextResponse } from 'next/server';
import { z } from 'zod';
import type Stripe from 'stripe';
import { getSessionContext } from '@/lib/auth/guards';
import { createClient } from '@/lib/supabase/server';
import { getStripe, BillingNotConfiguredError } from '@/lib/billing/stripe';
import { audit } from '@/lib/audit';
import { log } from '@/lib/log';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Self-serve refund per /legal/refund:
//   - Annual plans: full refund within 14 days of the term start.
//   - Monthly plans: not prorated / non-refundable via self-serve — routed to support.
//   - Anything outside the window: routed to support.
// The subscription's period + interval + latest paid charge are read from Stripe
// (source of truth), not from our local mirror. GET returns eligibility only
// (non-destructive); POST issues the refund and cancels the subscription.
const ANNUAL_REFUND_WINDOW_DAYS = 14;

const bodySchema = z.object({
  confirm: z.literal(true),
});

interface Eligibility {
  eligible: boolean;
  reason: string;
  interval: 'month' | 'year' | 'unknown';
  amount: number | null; // in the charge's minor units (cents)
  currency: string | null;
  chargeId: string | null;
  windowEndsAt: string | null;
}

async function assessEligibility(
  stripe: Stripe,
  stripeSubscriptionId: string,
): Promise<Eligibility> {
  const sub = await stripe.subscriptions.retrieve(stripeSubscriptionId, {
    expand: ['latest_invoice.charge', 'items.data.price'],
  });

  const price = sub.items.data[0]?.price;
  const interval = (price?.recurring?.interval as 'month' | 'year' | undefined) ?? undefined;
  const normalizedInterval: Eligibility['interval'] =
    interval === 'year' ? 'year' : interval === 'month' ? 'month' : 'unknown';

  const latestInvoice =
    sub.latest_invoice && typeof sub.latest_invoice !== 'string' ? sub.latest_invoice : null;
  const charge =
    latestInvoice && latestInvoice.charge && typeof latestInvoice.charge !== 'string'
      ? latestInvoice.charge
      : null;

  const base: Eligibility = {
    eligible: false,
    reason: '',
    interval: normalizedInterval,
    amount: charge?.amount ?? null,
    currency: charge?.currency ?? null,
    chargeId: charge?.id ?? null,
    windowEndsAt: null,
  };

  if (normalizedInterval !== 'year') {
    return {
      ...base,
      reason:
        'Monthly plans are billed per period and are not refundable through self-serve. Cancel anytime from Manage billing; access continues to the end of the current period. Contact support for billing issues.',
    };
  }

  // Annual: 14-day window measured from the current period start.
  const periodStartSec = sub.current_period_start;
  if (!periodStartSec) {
    return { ...base, reason: 'Unable to determine your billing period. Please contact support.' };
  }
  const periodStart = new Date(periodStartSec * 1000);
  const windowEnd = new Date(periodStart.getTime() + ANNUAL_REFUND_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  base.windowEndsAt = windowEnd.toISOString();

  if (Date.now() > windowEnd.getTime()) {
    return {
      ...base,
      reason: `The ${ANNUAL_REFUND_WINDOW_DAYS}-day annual refund window closed on ${windowEnd.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}. You keep access through the paid term. Contact support for exceptional cases.`,
    };
  }

  if (!charge || !charge.paid || charge.refunded) {
    return {
      ...base,
      reason: charge?.refunded
        ? 'This charge has already been refunded.'
        : 'No refundable payment was found for this subscription. Please contact support.',
    };
  }

  return {
    ...base,
    eligible: true,
    reason: `Eligible: full refund of your annual payment within the ${ANNUAL_REFUND_WINDOW_DAYS}-day window (until ${windowEnd.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}).`,
  };
}

async function resolveContextAndSub() {
  const ctx = await getSessionContext();
  if (!ctx) {
    return { error: NextResponse.json({ error: 'Not authenticated.' }, { status: 401 }) };
  }
  if (ctx.account.owner_id !== ctx.user.id) {
    return {
      error: NextResponse.json(
        { error: 'Only the account owner can request a refund.' },
        { status: 403 },
      ),
    };
  }

  let stripe: Stripe;
  try {
    stripe = getStripe();
  } catch (e) {
    if (e instanceof BillingNotConfiguredError) {
      return { error: NextResponse.json({ error: e.message }, { status: 503 }) };
    }
    throw e;
  }

  const supabase = createClient();
  const { data: sub } = await supabase
    .from('subscriptions')
    .select('stripe_subscription_id')
    .eq('host_account_id', ctx.account.id)
    .maybeSingle();

  if (!sub?.stripe_subscription_id) {
    return {
      error: NextResponse.json({ error: 'No active subscription to refund.' }, { status: 400 }),
    };
  }

  return { ctx, stripe, supabase, stripeSubscriptionId: sub.stripe_subscription_id };
}

// GET — eligibility only. Never mutates anything.
export async function GET() {
  const resolved = await resolveContextAndSub();
  if ('error' in resolved) return resolved.error;
  const { stripe, stripeSubscriptionId } = resolved;

  try {
    const eligibility = await assessEligibility(stripe, stripeSubscriptionId);
    // Do not leak internal identifiers to the client.
    const { chargeId: _chargeId, ...safe } = eligibility;
    return NextResponse.json(safe);
  } catch (e) {
    log.error('stripe_refund_eligibility_failed', {
      error: e instanceof Error ? e.message : String(e),
    });
    return NextResponse.json(
      { error: 'Could not check refund eligibility. Please try again.' },
      { status: 502 },
    );
  }
}

// POST — issue the refund if eligible, then cancel the subscription.
export async function POST(req: Request) {
  const resolved = await resolveContextAndSub();
  if ('error' in resolved) return resolved.error;
  const { ctx, stripe, supabase, stripeSubscriptionId } = resolved;

  let payload: unknown = {};
  try {
    payload = await req.json();
  } catch {
    /* fall through */
  }
  if (!bodySchema.safeParse(payload ?? {}).success) {
    return NextResponse.json({ error: 'Refund must be explicitly confirmed.' }, { status: 400 });
  }

  let eligibility: Eligibility;
  try {
    eligibility = await assessEligibility(stripe, stripeSubscriptionId);
  } catch (e) {
    log.error('stripe_refund_eligibility_failed', {
      error: e instanceof Error ? e.message : String(e),
    });
    return NextResponse.json(
      { error: 'Could not verify refund eligibility. Please try again.' },
      { status: 502 },
    );
  }

  if (!eligibility.eligible || !eligibility.chargeId) {
    return NextResponse.json({ error: eligibility.reason, eligible: false }, { status: 409 });
  }

  try {
    const refund = await stripe.refunds.create({
      charge: eligibility.chargeId,
      reason: 'requested_by_customer',
      metadata: {
        host_account_id: ctx.account.id,
        source: 'self_serve_refund',
        policy: 'annual_14_day',
      },
    });

    // Stop future billing + access at period end; the refund covers the paid term.
    await stripe.subscriptions.update(stripeSubscriptionId, { cancel_at_period_end: true });

    await supabase
      .from('subscriptions')
      .update({ cancel_at_period_end: true, updated_at: new Date().toISOString() })
      .eq('host_account_id', ctx.account.id);

    await audit(supabase, {
      action: 'billing.refund_issued',
      actorProfileId: ctx.user.id,
      hostAccountId: ctx.account.id,
      targetType: 'subscription',
      targetId: stripeSubscriptionId,
      metadata: {
        refund_id: refund.id,
        amount: eligibility.amount,
        currency: eligibility.currency,
        policy: 'annual_14_day',
      },
    });

    log.info('stripe_refund_issued', {
      hostAccountId: ctx.account.id,
      refundId: refund.id,
      status: refund.status,
    });

    return NextResponse.json({
      ok: true,
      status: refund.status,
      amount: eligibility.amount,
      currency: eligibility.currency,
      message:
        'Your refund has been issued and your subscription is set to cancel at the end of the current period. Refunds typically arrive within 5–10 business days.',
    });
  } catch (e) {
    log.error('stripe_refund_failed', { error: e instanceof Error ? e.message : String(e) });
    return NextResponse.json(
      { error: 'We could not process the refund automatically. Please contact support.' },
      { status: 502 },
    );
  }
}
