import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/database.types';
import { generateSessionToken, generateVisitCode, hashSessionToken, hashVisitCode, verifyVisitCode } from '@/lib/crypto';
import { audit } from '@/lib/audit';
import { publicEnv } from '@/lib/env';
import { DEFAULT_GRACE_PERIOD_HOURS, STAY_LINK_DEFAULT_MAX_REDEMPTIONS, VISIT_CODE_GRACE_PERIOD_HOURS } from '@/lib/constants';

type Client = SupabaseClient<Database>;

export interface MintedPortalAccess {
  /** Raw 4-digit visit code — returned to the caller exactly once, never stored raw. */
  code: string;
  /** Full portal URL carrying the one-time token — returned exactly once. */
  portalUrl: string;
  /** When the visit code stops working (check-out + grace). */
  codeExpiresAt: string;
}

/**
 * Mints a stay's portal link + 4-digit visit code. Extracted from the stays
 * server action so the iCal importer mints codes identically (issue #133).
 * Hash-only storage is preserved: the raw token and code are returned exactly
 * once and never persisted; the code is vaulted for host display on a
 * best-effort basis. THROWS on failure — the caller decides whether a mint
 * failure fails the operation (it must never fail stay creation).
 */
export async function mintStayPortalAccess(admin: Client, input: {
  propertyId: string;
  stayId: string;
  propertySlug: string;
  checkOut: Date;
  createdBy: string;
  hostAccountId: string;
}): Promise<MintedPortalAccess> {
  const token = generateSessionToken();
  const linkExpiresAt = new Date(input.checkOut.getTime() + DEFAULT_GRACE_PERIOD_HOURS * 60 * 60 * 1000).toISOString();
  const { data: link, error: linkError } = await admin
    .from('guest_access_links')
    .insert({
      property_id: input.propertyId,
      stay_id: input.stayId,
      token_hash: hashSessionToken(token),
      kind: 'stay',
      expires_at: linkExpiresAt,
      max_redemptions: STAY_LINK_DEFAULT_MAX_REDEMPTIONS,
      require_otp: false,
      created_by: input.createdBy,
    } as never)
    .select('id')
    .single();
  if (linkError || !link) {
    throw new Error(linkError?.message ?? 'link insert failed');
  }
  const linkId = (link as { id: string }).id;

  // One stay code: the tokenless portal entry (/auth/code without ?k=) resolves
  // a bare code to one stay, so codes must be unique across the property's
  // concurrently coded links. Hashes are per-link salted, so candidates are
  // verified one by one until one is clear.
  const { data: siblingLinks } = await admin
    .from('guest_access_links')
    .select('id, code_hash')
    .eq('property_id', input.propertyId)
    .not('code_hash', 'is', null)
    .is('code_revoked_at', null)
    .gt('code_expires_at', new Date().toISOString());
  let code = '';
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const candidate = generateVisitCode();
    const clash = (siblingLinks ?? []).some((sibling: any) =>
      verifyVisitCode(candidate, sibling.id as string, sibling.code_hash as string));
    if (!clash) {
      code = candidate;
      break;
    }
  }
  if (!code) throw new Error('could not allocate a unique visit code');

  const codeExpiresAt = new Date(input.checkOut.getTime() + VISIT_CODE_GRACE_PERIOD_HOURS * 60 * 60 * 1000).toISOString();
  const { error: codeError } = await admin
    .from('guest_access_links')
    .update({ code_hash: hashVisitCode(code, linkId), code_expires_at: codeExpiresAt } as never)
    .eq('id', linkId);
  if (codeError) {
    throw new Error(codeError.message);
  }

  // Vault the code so it stays host-viewable for the life of the stay. The hash
  // remains the verification path; a Vault failure degrades to hash-only.
  try {
    const { data: secretId, error: vaultError } = await (admin as any).rpc('portal_code_store', {
      p_secret: code,
      p_name: `stay-link:${linkId}:${Date.now()}`,
    });
    if (!vaultError && secretId) {
      await admin
        .from('guest_access_links')
        .update({ code_secret_ref: `vault:${secretId}` } as never)
        .eq('id', linkId);
    }
  } catch {
    // Display-only enhancement — never fail the mint over it.
  }

  await audit(admin, {
    action: 'guest_link.code_issued',
    actorProfileId: input.createdBy,
    hostAccountId: input.hostAccountId,
    propertyId: input.propertyId,
    targetType: 'guest_access_link',
    targetId: linkId,
  });

  return {
    code,
    portalUrl: `${publicEnv.appUrl.replace(/\/$/, '')}/stay/${input.propertySlug}?k=${token}`,
    codeExpiresAt,
  };
}
