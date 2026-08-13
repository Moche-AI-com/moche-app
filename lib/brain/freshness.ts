// Weekly freshness digest (§9). Pure builder: the classification and the rendered email
// are computed from data passed in, so the interesting logic is testable without a
// database, a scheduler, or an email provider.
//
// The digest is deliberately a nudge, not an alert. It ships from the product_updates
// sender and carries no time-critical content — anything urgent (an escalation, an
// emergency, a validator failure) already has its own monitored path per §9.0a. A digest
// that silently fails to send must never be the only way a host learns something urgent.

export type FreshnessBucket = 'expired' | 'expiring_soon' | 'unverified' | 'fresh';

/** A value is "expiring soon" inside this window before its TTL. */
export const EXPIRING_SOON_DAYS = 14;
/** A value with no verification in this long is surfaced even if it has no TTL. */
export const UNVERIFIED_AFTER_DAYS = 180;

export interface FreshnessValueInput {
  propertyId: string;
  fieldId: string;
  label: string;
  ttlExpiresAt: string | null;
  verifiedAt: string | null;
  hardBlock: boolean;
}

export interface FreshnessItem extends FreshnessValueInput {
  bucket: Exclude<FreshnessBucket, 'fresh'>;
  /** Negative when already past due. */
  daysUntilExpiry: number | null;
}

export interface PropertyDigest {
  propertyId: string;
  propertyName: string;
  hostEmail: string;
  items: FreshnessItem[];
  /** Hard-block fields with no value at all. Counted, not enumerated, to keep the mail short. */
  missingHardBlockCount: number;
}

const DAY_MS = 86_400_000;

function daysBetween(from: Date, to: Date): number {
  return Math.floor((to.getTime() - from.getTime()) / DAY_MS);
}

export function classifyFreshness(v: FreshnessValueInput, now: Date): FreshnessBucket {
  if (v.ttlExpiresAt) {
    const days = daysBetween(now, new Date(v.ttlExpiresAt));
    if (!Number.isFinite(days)) return 'fresh';
    if (days <= 0) return 'expired';
    if (days <= EXPIRING_SOON_DAYS) return 'expiring_soon';
    return 'fresh';
  }
  // No TTL: fall back to how long since a human last confirmed it. A value that was
  // never verified is treated by its age, not as automatically stale, because an
  // import-sourced value is legitimately unverified on day one.
  const reference = v.verifiedAt ? new Date(v.verifiedAt) : null;
  if (!reference || !Number.isFinite(reference.getTime())) return 'fresh';
  return daysBetween(reference, now) >= UNVERIFIED_AFTER_DAYS ? 'unverified' : 'fresh';
}

/**
 * Ordering is the product decision here: expired before expiring, hard blocks before
 * ordinary fields, then soonest first. The host reads the top of the list and stops.
 */
const BUCKET_RANK: Record<Exclude<FreshnessBucket, 'fresh'>, number> = {
  expired: 0,
  expiring_soon: 1,
  unverified: 2,
};

export function selectFreshnessItems(values: readonly FreshnessValueInput[], now: Date): FreshnessItem[] {
  const items: FreshnessItem[] = [];
  for (const v of values) {
    const bucket = classifyFreshness(v, now);
    if (bucket === 'fresh') continue;
    items.push({
      ...v,
      bucket,
      daysUntilExpiry: v.ttlExpiresAt ? daysBetween(now, new Date(v.ttlExpiresAt)) : null,
    });
  }
  return items.sort(
    (a, b) =>
      BUCKET_RANK[a.bucket] - BUCKET_RANK[b.bucket] ||
      Number(b.hardBlock) - Number(a.hardBlock) ||
      (a.daysUntilExpiry ?? 9999) - (b.daysUntilExpiry ?? 9999) ||
      a.fieldId.localeCompare(b.fieldId),
  );
}

/** Nothing to say means no email. A weekly "all clear" trains hosts to ignore the sender. */
export function shouldSend(digest: PropertyDigest): boolean {
  return digest.items.length > 0 || digest.missingHardBlockCount > 0;
}

function describe(item: FreshnessItem): string {
  if (item.bucket === 'expired') {
    const d = item.daysUntilExpiry ?? 0;
    return `expired ${Math.abs(d)} day${Math.abs(d) === 1 ? '' : 's'} ago`;
  }
  if (item.bucket === 'expiring_soon') return `expires in ${item.daysUntilExpiry} days`;
  return 'not confirmed in over 6 months';
}

export interface RenderedDigest {
  subject: string;
  text: string;
}

/**
 * Plain text only, and field labels only — never a stored value. The digest is mail to an
 * address we do not control the security of, so a door code or WiFi password must not be
 * reproducible from it even though the digest is precisely about those fields going stale.
 */
export function renderDigest(digest: PropertyDigest, dashboardUrl: string): RenderedDigest {
  const lines: string[] = [];
  lines.push(`Weekly Brain check for ${digest.propertyName}`, '');

  if (digest.missingHardBlockCount > 0) {
    lines.push(
      `${digest.missingHardBlockCount} required field${digest.missingHardBlockCount === 1 ? '' : 's'} still has no answer.`,
      '',
    );
  }

  const shown = digest.items.slice(0, 10);
  if (shown.length > 0) {
    lines.push('Might be stale:');
    for (const item of shown) {
      lines.push(`  - ${item.label}${item.hardBlock ? ' (required)' : ''} — ${describe(item)}`);
    }
    if (digest.items.length > shown.length) {
      lines.push(`  ...and ${digest.items.length - shown.length} more.`);
    }
    lines.push('');
  }

  lines.push(
    'Review and confirm these in your dashboard:',
    dashboardUrl,
    '',
    'This is a weekly summary. Anything urgent is sent to you separately.',
  );

  const headline =
    digest.items.filter((i) => i.bucket === 'expired').length > 0
      ? 'needs attention'
      : 'weekly check';

  return {
    subject: `${digest.propertyName}: ${headline}`,
    text: lines.join('\n'),
  };
}
