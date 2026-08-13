import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { publicEnv, serverEnv } from '@/lib/env';
import { log } from '@/lib/log';
import { REGISTRY_FIELDS, HARD_BLOCK_FIELD_IDS } from '@/lib/brain/completeness';
import {
  selectFreshnessItems,
  shouldSend,
  renderDigest,
  type FreshnessValueInput,
  type PropertyDigest,
} from '@/lib/brain/freshness';
import { UPDATES_SENDER } from '@/lib/mail/senders';

// Weekly freshness digest (§9). Scheduled in vercel.json.
//
// Runs on the admin client because it crosses every property in the account set, which no
// host session can do. That makes the shared-secret check the only thing standing between
// an anonymous caller and a service-role read, so it is the first statement in the handler
// and it fails closed when the secret is unset — an unconfigured deployment must not
// expose an open service-role endpoint.
//
// The digest is best-effort by design (§9.0a): a send failure is logged and the run
// continues. Nothing urgent travels this path, so a missed digest is a missed nudge.

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** Batch cap per run, so one invocation cannot exceed the function budget. */
const MAX_PROPERTIES = 200;

const FIELD_LABELS = new Map(REGISTRY_FIELDS.map((f) => [f.field_id, f.label]));
const HARD_BLOCKS = new Set(HARD_BLOCK_FIELD_IDS);

function authorized(req: Request): boolean {
  const secret = serverEnv.cronSecret;
  if (!secret) return false;
  const header = req.headers.get('authorization') ?? '';
  return header === `Bearer ${secret}`;
}

export async function GET(req: Request): Promise<NextResponse> {
  if (!authorized(req)) {
    // 404 rather than 401: an unauthenticated caller learns nothing about whether a
    // scheduled job lives here.
    return new NextResponse(null, { status: 404 });
  }

  const now = new Date();
  const admin = createAdminClient();

  const { data: properties, error: propError } = await admin
    .from('properties')
    .select('id, display_name, host_account_id, host_accounts(owner_id, profiles:owner_id(email))')
    .is('deleted_at', null)
    .not('published_at', 'is', null)
    .limit(MAX_PROPERTIES);

  if (propError) {
    log.error('freshness_digest_property_query_failed', { error: propError.message });
    return NextResponse.json({ ok: false }, { status: 500 });
  }

  const propertyIds = (properties ?? []).map((p) => p.id);
  if (propertyIds.length === 0) return NextResponse.json({ ok: true, considered: 0, sent: 0 });

  // One query for every property's live values rather than N queries: the digest is a
  // batch job and a per-property round trip is what makes these jobs time out later.
  const { data: values, error: valueError } = await admin
    .from('brain_values')
    .select('property_id, field_id, ttl_expires_at, verified_at')
    .in('property_id', propertyIds)
    .eq('status', 'active')
    .is('superseded_by', null);

  if (valueError) {
    log.error('freshness_digest_value_query_failed', { error: valueError.message });
    return NextResponse.json({ ok: false }, { status: 500 });
  }

  const byProperty = new Map<string, FreshnessValueInput[]>();
  const presentFields = new Map<string, Set<string>>();
  for (const row of values ?? []) {
    const arr = byProperty.get(row.property_id) ?? [];
    arr.push({
      propertyId: row.property_id,
      fieldId: row.field_id,
      label: FIELD_LABELS.get(row.field_id) ?? row.field_id.replace(/_/g, ' '),
      ttlExpiresAt: row.ttl_expires_at,
      verifiedAt: row.verified_at,
      hardBlock: HARD_BLOCKS.has(row.field_id),
    });
    byProperty.set(row.property_id, arr);
    const seen = presentFields.get(row.property_id) ?? new Set<string>();
    seen.add(row.field_id);
    presentFields.set(row.property_id, seen);
  }

  let sent = 0;
  let skipped = 0;
  for (const property of properties ?? []) {
    // The Supabase client types embedded relations loosely here; the shape is narrowed
    // rather than cast so a missing owner profile skips the property instead of throwing.
    const account = property.host_accounts as unknown as { profiles?: { email?: string } | null } | null;
    const hostEmail = account?.profiles?.email;
    if (!hostEmail) {
      skipped += 1;
      continue;
    }

    const present = presentFields.get(property.id) ?? new Set<string>();
    const digest: PropertyDigest = {
      propertyId: property.id,
      propertyName: property.display_name,
      hostEmail,
      items: selectFreshnessItems(byProperty.get(property.id) ?? [], now),
      missingHardBlockCount: HARD_BLOCK_FIELD_IDS.filter((id) => !present.has(id)).length,
    };

    if (!shouldSend(digest)) {
      skipped += 1;
      continue;
    }

    const rendered = renderDigest(
      digest,
      `${publicEnv.appUrl.replace(/\/$/, '')}/dashboard/properties/${property.id}/brain`,
    );
    const ok = await sendDigest(hostEmail, rendered.subject, rendered.text);
    if (ok) sent += 1;
  }

  log.info('freshness_digest_run', { considered: (properties ?? []).length, sent, skipped });
  return NextResponse.json({ ok: true, considered: (properties ?? []).length, sent, skipped });
}

/**
 * Sends from the product_updates identity (D-0020). Never throws: one host's bounced
 * address must not abort the rest of the batch.
 */
async function sendDigest(to: string, subject: string, text: string): Promise<boolean> {
  if (!serverEnv.resendApiKey) {
    log.warn('freshness_digest_no_resend_key', {});
    return false;
  }
  try {
    const { Resend } = await import('resend');
    const resend = new Resend(serverEnv.resendApiKey);
    const { error } = await resend.emails.send({
      from: UPDATES_SENDER.from,
      replyTo: UPDATES_SENDER.replyTo,
      to,
      subject,
      text,
    });
    if (error) {
      log.error('freshness_digest_send_failed', { error: error.message });
      return false;
    }
    return true;
  } catch (e) {
    log.error('freshness_digest_send_error', { error: String(e) });
    return false;
  }
}
