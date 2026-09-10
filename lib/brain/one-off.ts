import 'server-only';

// One-off answer guard (issue #133, item 6): the self-updating Brain learns
// only from REUSABLE host answers. "Late checkout's fine this once" is help for
// one guest, not policy — queuing it as a permanent Brain entry would teach
// every future guest the exception. This gate runs at draft time, before any
// model call, so a one-off announcement never becomes a proposal.

const ONE_OFF_MARKERS = [
  /\bthis\s+(?:stay|time|once|booking|reservation|guest|weekend|week)\b/i,
  /\bjust\s+(?:this\s+)?(?:once|today|tonight|tomorrow)\b/i,
  /\bfor\s+(?:today|tonight|tomorrow)\b/i,
  /\b(?:one[-\s]off)\b/i,
  /\bas\s+an?\s+exception\b/i,
  /\bexception\s+for\b/i,
];

export interface OneOffCheck {
  oneOff: boolean;
  marker: string | null;
}

export function detectOneOffAnswer(hostAnswer: string): OneOffCheck {
  for (const pattern of ONE_OFF_MARKERS) {
    const match = hostAnswer.match(pattern);
    if (match) return { oneOff: true, marker: match[0].toLowerCase() };
  }
  return { oneOff: false, marker: null };
}

export function oneOffReason(marker: string): string {
  return `Held back: the reply looks scoped to one stay ("${marker}"). Teach the Brain from it only if it should apply to every guest.`;
}
