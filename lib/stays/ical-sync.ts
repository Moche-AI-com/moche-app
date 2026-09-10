import 'server-only';

import { createHash } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/database.types';
import { assertPublicUrl } from '@/lib/net/ssrf';
import { serverEnv } from '@/lib/env';
import { log } from '@/lib/log';
import { isCurrentOrFuture, isReservationEvent, parseIcs } from '@/lib/ical/parse';
import { generateStayReference } from './reference';
import { mintStayPortalAccess } from './mint-portal-access';

type Client = SupabaseClient<Database>;

/** Fetches an iCal feed through the shared SSRF guard, with a hard size cap. */
export async function fetchIcalFeed(rawUrl: string): Promise<string> {
  const url = await assertPublicUrl(rawUrl);
  const res = await fetch(url, {
    signal: AbortSignal.timeout(10000),
    redirect: 'error',
    headers: { accept: 'text/calendar, text/plain, */*' },
  });
  if (!res.ok) throw new Error(`Calendar fetch failed (${res.status}).`);
  const text = await res.text();
  if (text.length > 1_000_000) throw new Error('Calendar feed is too large.');
  if (!text.includes('BEGIN:VCALENDAR')) throw new Error('That URL did not return an iCal feed.');
  return text;
}

export interface IcalSyncResult {
  created: number;
  updated: number;
  revoked: number;
  skipped: number;
  mintFailures: number;
}

function displayNameFor(summary: string): string {
  const cleaned = summary.trim();
  // Platform exports usually say just "Reserved" — don't pretend that's a name.
  if (!cleaned || /^reserved$/i.test(cleaned)) return 'iCal reservation';
  return cleaned.slice(0, 80);
}

function statusFor(today: string, startDate: string, endDate: string): 'upcoming' | 'active' | 'completed' {
  if (today < startDate) return 'upcoming';
  if (today >= endDate) return 'completed';
  return 'active';
}

/**
 * Syncs one property's booking calendar into stays (issue #133, item 4). One
 * stay per calendar event (stays.ical_uid unique per property); new
 * reservations auto-mint their portal link + visit code exactly like a manual
 * stay. Events that disappear from the feed are cancellations: the stay and
 * its access revoke, matching the manual revoke lifecycle (fail closed).
 */
export async function syncPropertyIcalFeed(
  admin: Client,
  property: { id: string; slug: string; host_account_id: string },
  feedText: string,
  opts: { today?: string } = {},
): Promise<IcalSyncResult> {
  const today = opts.today ?? new Date().toISOString().slice(0, 10);
  const reservations = parseIcs(feedText)
    .filter(isReservationEvent)
    .filter((event) => isCurrentOrFuture(event, today));
  const seenUids = new Set(reservations.map((event) => event.uid));

  const { data: account } = await admin
    .from('host_accounts').select('owner_id').eq('id', property.host_account_id).maybeSingle();
  const ownerId = (account as { owner_id: string } | null)?.owner_id;
  if (!ownerId) throw new Error('Property account has no owner.');

  const { data: existingRows } = await (admin as any)
    .from('stays')
    .select('id, ical_uid, check_in, check_out, status')
    .eq('property_id', property.id)
    .not('ical_uid', 'is', null)
    .is('deleted_at', null);
  const byUid = new Map<string, { id: string; check_in: string; check_out: string; status: string }>();
  for (const row of existingRows ?? []) {
    byUid.set(row.ical_uid as string, row as { id: string; check_in: string; check_out: string; status: string });
  }

  let created = 0;
  let updated = 0;
  let revoked = 0;
  let skipped = 0;
  let mintFailures = 0;

  for (const event of reservations) {
    const checkInIso = `${event.startDate}T00:00:00.000Z`;
    const checkOutIso = `${event.endDate}T00:00:00.000Z`;
    const status = statusFor(today, event.startDate, event.endDate);
    const current = byUid.get(event.uid);

    if (current) {
      // A stay the host revoked stays revoked — the feed must not resurrect it.
      if (current.status === 'revoked') { skipped++; continue; }
      const datesChanged = current.check_in.slice(0, 10) !== event.startDate
        || current.check_out.slice(0, 10) !== event.endDate;
      if (datesChanged || current.status !== status) {
        await admin.from('stays')
          .update({ check_in: checkInIso, check_out: checkOutIso, status } as never)
          .eq('id', current.id);
        updated++;
      } else {
        skipped++;
      }
      continue;
    }

    // New reservation → create the stay (retrying a stay_reference collision),
    // then mint its portal access exactly like a host-created stay.
    let stayId: string | null = null;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const { data, error } = await admin.from('stays').insert({
        property_id: property.id,
        guest_display_name: displayNameFor(event.summary),
        contact_hash: createHash('sha256').update(`${serverEnv.guestContactSalt}:ical:${event.uid}`).digest('hex'),
        contact_type: 'ical',
        contact_last4: null,
        check_in: checkInIso,
        check_out: checkOutIso,
        guest_count: 1,
        status,
        ical_uid: event.uid,
        stay_reference: generateStayReference(),
        created_by: ownerId,
      } as never).select('id').single();
      if (!error && data) { stayId = (data as { id: string }).id; break; }
      // 23505 = stay_reference or ical_uid race — retry with a fresh reference.
      if ((error as { code?: string } | null)?.code === '23505') continue;
      throw error ?? new Error('Could not create the stay.');
    }
    if (!stayId) { skipped++; continue; }
    created++;

    try {
      await mintStayPortalAccess(admin, {
        propertyId: property.id,
        stayId,
        propertySlug: property.slug,
        checkOut: new Date(checkOutIso),
        createdBy: ownerId,
        hostAccountId: property.host_account_id,
      });
    } catch (mintError) {
      // The stay is durable; the host can mint from the Guest access panel.
      mintFailures++;
      log.warn('ical_mint_failed', { propertyId: property.id, stayId, error: mintError instanceof Error ? mintError.message : String(mintError) });
    }
  }

  // Events that vanished from the feed are cancellations: revoke the stay, its
  // sessions, and its visit code (fail closed on reservation cancellation).
  const nowIso = new Date().toISOString();
  for (const row of existingRows ?? []) {
    const uid = row.ical_uid as string;
    if (seenUids.has(uid)) continue;
    if (row.status !== 'upcoming' && row.status !== 'active') continue;
    const stayId = row.id as string;
    await admin.from('stays').update({ status: 'revoked' } as never).eq('id', stayId).eq('property_id', property.id);
    await admin.from('guest_access_sessions')
      .update({ status: 'revoked', revoked_at: nowIso } as never)
      .eq('stay_id', stayId).eq('property_id', property.id);
    await admin.from('guest_access_links')
      .update({ code_revoked_at: nowIso } as never)
      .eq('stay_id', stayId).eq('property_id', property.id)
      .not('code_hash', 'is', null).is('code_revoked_at', null);
    revoked++;
  }

  await admin.from('properties').update({ ical_last_synced_at: nowIso } as never).eq('id', property.id);
  return { created, updated, revoked, skipped, mintFailures };
}
