import { NextResponse } from 'next/server';
import { getSessionContext } from '@/lib/auth/guards';
import { createClient } from '@/lib/supabase/server';
import { getStripe, BillingNotConfiguredError } from '@/lib/billing/stripe';
import { publicEnv } from '@/lib/env';
import { log } from '@/lib/log';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST() {
  const ctx = await getSessionContext();
  if (!ctx) return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 });

  const canManageBilling = ctx.account.owner_id === ctx.user.id;
  if (!canManageBilling) {
    return NextResponse.json({ error: 'You cannot manage billing for this account.' }, { status: 403 });
  }

  let stripe;
  try {
    stripe = getStripe();
  } catch (e) {
    if (e instanceof BillingNotConfiguredError) {
      return NextResponse.json({ error: e.message }, { status: 503 });
    }
    throw e;
  }

  const supabase = createClient();
  const { data: sub } = await supabase
    .from('subscriptions')
    .select('stripe_customer_id')
    .eq('host_account_id', ctx.account.id)
    .maybeSingle();

  if (!sub?.stripe_customer_id) {
    return NextResponse.json({ error: 'No billing account yet.' }, { status: 400 });
  }

  try {
    const session = await stripe.billingPortal.sessions.create({
      customer: sub.stripe_customer_id,
      return_url: `${publicEnv.appUrl}/dashboard/profile/billing`,
    });
    return NextResponse.json({ url: session.url });
  } catch (e) {
    log.error('stripe_portal_failed', { error: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: 'Could not open billing portal. Please try again.' }, { status: 502 });
  }
}
