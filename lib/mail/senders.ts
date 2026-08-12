import 'server-only';

// Directive §0.2 row 6 — "Role of `updates@Moche-Ai.com`".
//
// The deferred row shipped a safe default of "no role at all": not a reviewer, not an
// incident destination, not a Git identity, with no automated flow sending to or acting
// on the address. The owner has now assigned it one narrow role (decision D-0020):
//
//   updates@ is a SEND-ONLY outbound identity for non-transactional product mail
//   (the weekly freshness digest, §9). It is never an inbox we read, never an
//   approval authority, and never a commit author.
//
// Encoding the role as data with explicit negative capabilities — rather than as a
// bare string constant — is what makes the constraint testable. The failure mode this
// prevents is a later contributor reaching for the "friendly" updates@ address for an
// escalation or incident email, which would route a time-critical message to a mailbox
// nobody is required to monitor.

export type SenderRole = 'transactional' | 'product_updates';

export interface Sender {
  readonly role: SenderRole;
  /** RFC 5322 From value. */
  readonly from: string;
  /** Where a human reply actually lands. */
  readonly replyTo: string;
  /** May carry escalations, incidents, or anything else time-critical. */
  readonly allowsTimeCritical: boolean;
  /** May be named as a reviewer/approver or an incident destination. */
  readonly isAuthority: boolean;
  /** May be used as a Git commit identity. */
  readonly isGitIdentity: boolean;
}

// Escalations, maintenance alerts, billing, and system notices. Monitored path.
export const TRANSACTIONAL_SENDER: Sender = {
  role: 'transactional',
  from: 'Moche-AI <noreply@moche-ai.com>',
  replyTo: 'support@moche-ai.com',
  allowsTimeCritical: true,
  isAuthority: false,
  isGitIdentity: false,
};

// Weekly freshness digest and similar batch product mail. Deliberately non-urgent:
// a digest that fails to send is a missed nudge, not a missed incident.
export const UPDATES_SENDER: Sender = {
  role: 'product_updates',
  from: 'Moche-AI Updates <updates@moche-ai.com>',
  // Replies go to the monitored support address, not back to updates@, so a host who
  // hits reply reaches a human rather than an unwatched mailbox.
  replyTo: 'support@moche-ai.com',
  allowsTimeCritical: false,
  isAuthority: false,
  isGitIdentity: false,
};

export const SENDERS: readonly Sender[] = [TRANSACTIONAL_SENDER, UPDATES_SENDER];

// Pick the sender for a class of mail. Time-critical mail resolves to the
// transactional identity by construction, so a caller cannot accidentally send an
// escalation from the digest identity by passing the wrong role.
export function senderFor(kind: 'time_critical' | 'digest'): Sender {
  return kind === 'time_critical' ? TRANSACTIONAL_SENDER : UPDATES_SENDER;
}
