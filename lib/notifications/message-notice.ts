// Acceptance is not delivery. A stored message must not be resent just because
// its separate notification failed or the provider outcome is ambiguous.
export function messageNotificationNotice(status?: string): string {
  if (status === 'accepted') return 'Message saved. SMS alert accepted by the provider; delivery is not confirmed.';
  if (status === 'partial') return 'Message saved. Some SMS alerts were accepted, but not all. Delivery is not confirmed.';
  if (status === 'unknown') return 'Message saved. SMS outcome could not be confirmed. Do not resend the message.';
  if (status === 'failed') return 'Message saved, but the SMS alert failed. The recipient can still read it in the portal.';
  if (status === 'disabled') return 'Message saved. SMS delivery is disabled in this environment.';
  return 'Message saved. No SMS alert was sent; the recipient needs a verified phone and active SMS consent.';
}
