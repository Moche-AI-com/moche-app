export const REVIEW_NUDGE_IDLE_MS = 30_000;
export const REVIEW_NUDGE_CHECK_LIMIT = 4;

export function safeReviewUrl(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 2000) return null;
  try {
    const url = new URL(value.trim());
    const host = url.hostname.toLowerCase();
    if (url.protocol !== 'https:' || url.username || url.password) return null;
    if (!host.includes('.') || host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal')) return null;
    if (host.includes(':') || /^[\d.]+$/.test(host)) return null;
    return url.toString();
  } catch { return null; }
}

export function canShowAutomaticPrompt(input: { visible: boolean; focused: boolean; editing: boolean; elapsedMs: number; claimed: boolean }) {
  return input.visible && input.focused && !input.editing && !input.claimed && input.elapsedMs >= REVIEW_NUDGE_IDLE_MS;
}
