import { permanentRedirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

/**
 * Permanent redirect to the billing section of the profile shell (backlog P3-10).
 *
 * Billing now lives at /dashboard/profile/billing. This route stays forever rather
 * than 404ing because it is baked into places we cannot retroactively edit:
 * notification rows already written to the database, and any bookmark a host made.
 *
 * The query string is forwarded, which is load-bearing: Stripe checkout returns
 * with `?status=success|cancelled` and the property gate sends `?reason=limit`.
 * Dropping it would silently swallow the confirmation a host just paid to see.
 */
export default function BillingRedirectPage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(searchParams)) {
    if (typeof v === 'string') qs.set(k, v);
    else if (Array.isArray(v)) for (const one of v) qs.append(k, one);
  }
  const query = qs.toString();
  permanentRedirect(`/dashboard/profile/billing${query ? `?${query}` : ''}`);
}
