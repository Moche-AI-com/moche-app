import { createHmac } from 'node:crypto';

// Party invites ('Invite your group'). Server-only helpers with no I/O so they
// are unit tested directly. Browser-safe URL helpers live in
// ./party-invite-url.ts so node:crypto never lands in a client bundle.

export const PARTY_INVITE_DEFAULT_MAX_JOINS = 10;
export const PARTY_INVITE_HARD_MAX_JOINS = 30;

/**
 * Deterministic, unguessable token for one party link. Derived from the link id
 * with a server secret, so the raw token is never stored (only
 * hashSessionToken(token) is) yet the same link can be re-shown to every guest
 * on the stay. Rotating means revoking the row and minting a new one.
 * 32 base64url chars, which satisfies guestRedeemSchema (16..512).
 */
export function derivePartyInviteToken(linkId: string, secret: string): string {
  if (!secret || secret.length < 32) throw new Error('GUEST_PARTY_INVITE_SECRET missing or too short');
  return createHmac('sha256', secret).update(`party-invite:v1:${linkId}`).digest('base64url').slice(0, 32);
}

/** iCal imports hard-code stays.guest_count = 1, so guest_count alone cannot be the cap. */
export function partyInviteCap(guestCount: number | null | undefined, hostMax: number | null | undefined): number {
  const host = clamp(hostMax ?? PARTY_INVITE_DEFAULT_MAX_JOINS, 1, PARTY_INVITE_HARD_MAX_JOINS);
  const party = clamp(guestCount ?? 1, 1, PARTY_INVITE_HARD_MAX_JOINS);
  return Math.max(host, party);
}

/** The invite stops working at checkout plus the property grace window. */
export function partyInviteExpiry(checkOutIso: string, graceHours: number | null | undefined): Date {
  const grace = clamp(graceHours ?? 12, 0, 72);
  return new Date(new Date(checkOutIso).getTime() + grace * 3_600_000);
}

/**
 * Host 'Add spots' on a live or full link. The new cap never drops below the
 * spots already used and never exceeds the hard ceiling; the link is full
 * exactly when every spot is used.
 */
export function partyInviteCapUpdate(used: number, requested: number): { max: number; full: boolean } {
  const usedSafe = Number.isFinite(used) ? Math.max(0, Math.round(used)) : 0;
  const floor = Math.max(1, usedSafe);
  const wanted = Number.isFinite(requested) ? Math.round(requested) : floor;
  const max = Math.min(PARTY_INVITE_HARD_MAX_JOINS, Math.max(floor, wanted));
  return { max, full: usedSafe >= max };
}

function clamp(n: number, lo: number, hi: number): number {
  if (!Number.isFinite(n)) return lo;
  return Math.min(hi, Math.max(lo, Math.round(n)));
}
