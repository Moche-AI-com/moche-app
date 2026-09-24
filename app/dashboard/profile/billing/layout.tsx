import { requireSession } from '@/lib/auth/guards';
import { createClient } from '@/lib/supabase/server';
import { getEntitlements } from '@/lib/billing/entitlements';
import { pricingIntentFromMetadata } from '@/lib/billing/pricing-intent';
import { BillingIntentProvider } from './BillingIntentProvider';

export default async function BillingLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requireSession();
  const isOwner = ctx.account.owner_id === ctx.user.id;
  const entitlements = isOwner
    ? await getEntitlements(createClient(), ctx.account.id)
    : null;
  const intent = isOwner && !entitlements?.active
    ? pricingIntentFromMetadata(ctx.user.user_metadata)
    : null;
  return <BillingIntentProvider intent={intent}>{children}</BillingIntentProvider>;
}
