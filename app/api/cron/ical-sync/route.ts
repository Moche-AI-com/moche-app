import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { isCronAuthorized } from '@/lib/cron/auth';
import { log } from '@/lib/log';
import { fetchIcalFeed, syncPropertyIcalFeed } from '@/lib/stays/ical-sync';

// iCal stay import (issue #133, item 4). Runs on the production Vercel
// deployment so it uses Vercel's Supabase credentials and GUEST_CONTACT_SALT:
// visit codes and contact hashes minted here are always verifiable by the app.
// Called every 30 minutes by the Trigger.dev clock in trigger/ical-sync.ts.
//
// Oldest-synced properties go first, in batches within a time budget, so a
// growing fleet is covered across runs instead of timing out. One bad feed
// never stops the rest.

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const BATCH = 25;
const TIME_BUDGET_MS = 45_000;

type PropertyRow = { id: string; slug: string; host_account_id: string; ical_import_url: string | null };

async function handle(req: Request): Promise<NextResponse> {
  if (!isCronAuthorized(req)) return new NextResponse(null, { status: 404 });
  const started = Date.now();
  const admin = createAdminClient();
  const { data, error } = await (admin as any)
    .from('properties')
    .select('id, slug, host_account_id, ical_import_url')
    .not('ical_import_url', 'is', null)
    .is('deleted_at', null)
    .order('ical_last_synced_at', { ascending: true, nullsFirst: true })
    .limit(BATCH);
  if (error) {
    log.error('ical_sync_query_failed', {});
    return NextResponse.json({ ok: false }, { status: 500 });
  }

  const summary = { properties: 0, created: 0, updated: 0, revoked: 0, failures: 0, deferred: 0 };
  for (const property of (data ?? []) as PropertyRow[]) {
    if (!property.ical_import_url) continue;
    if (Date.now() - started > TIME_BUDGET_MS) {
      summary.deferred += 1;
      continue;
    }
    summary.properties += 1;
    try {
      const feed = await fetchIcalFeed(property.ical_import_url);
      const result = await syncPropertyIcalFeed(admin, {
        id: property.id,
        slug: property.slug,
        host_account_id: property.host_account_id,
      }, feed);
      summary.created += result.created;
      summary.updated += result.updated;
      summary.revoked += result.revoked;
    } catch (e) {
      summary.failures += 1;
      log.warn('ical_sync_property_failed', {
        propertyId: property.id,
        error: e instanceof Error ? e.message : 'unknown',
      });
    }
  }

  log.info('ical_sync_run', summary);
  return NextResponse.json({ ok: true, ...summary });
}

export const GET = handle;
export const POST = handle;
