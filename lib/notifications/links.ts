// Links locate records; they NEVER authorize access. Every target reauthenticates.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const isMessageLocator = (value: unknown): value is string => typeof value === 'string' && UUID.test(value);

export function guestConversationLink(slug: string, conversationId: string, messageId: string): string {
  return `/g/${encodeURIComponent(slug)}?${new URLSearchParams({ view: 'host', conversation: conversationId, message: messageId })}`;
}

export function hostConversationLink(propertyId: string, stayId: string, conversationId: string, messageId?: string): string {
  return `/dashboard/properties/${encodeURIComponent(propertyId)}/stays/${encodeURIComponent(stayId)}/conversations/${encodeURIComponent(conversationId)}${messageId ? `?message=${encodeURIComponent(messageId)}` : ''}`;
}

/** Permit only our app origin and app paths, with an allowlist of non-secret
 * locators. Arbitrary absolute URLs and legacy bearer answer links are refused. */
export function safeNotificationUrl(appUrl: string, path: string | undefined): string | null {
  if (!path) return null;
  try {
    const base = new URL(appUrl);
    if (base.protocol !== 'https:' || base.username || base.password || base.search || base.hash) return null;
    const target = new URL(path, base.origin);
    if (target.origin !== base.origin || target.username || target.password ||
        !/^\/(?:dashboard(?:\/|$)|g\/[a-z0-9_-]+(?:\/|$))/i.test(target.pathname)) return null;
    for (const [key, value] of target.searchParams) {
      if (key === 'view' && value === 'host') continue;
      if (!['conversation', 'message', 'escalation', 'stay'].includes(key) || !isMessageLocator(value)) return null;
    }
    if (target.hash) return null;
    return target.toString();
  } catch { return null; }
}
