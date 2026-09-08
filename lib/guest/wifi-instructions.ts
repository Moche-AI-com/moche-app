import { redactCredentials } from '@/lib/brain/redact';

export const WIFI_CONTEXT = /\b(wi[\s-]?fi|wireless|internet|network|ssid|router)\b/i;
export const WIFI_ACCESS_REQUEST = /\b(password|passphrase|connect|join|access|ssid|network name)\b/i;
export const WIFI_INSTRUCTION = 'Never disclose or reconstruct a Wi-Fi password. Use only the host-supplied password location and connection instructions. If no location is supplied, say you do not have it and ask the host. Never suggest a typical location.';

export interface WifiInstructions {
  location: string | null;
  instructions: string | null;
  network: string | null;
}

function safeText(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim() || value.length > 2000) return null;
  if (/\[(?:redacted|stored securely)/i.test(value) || redactCredentials(value).redactions.length) return null;
  return value.trim();
}

// A locative word does not make an embedded token safe: "on the sticker
// (Secret2026!)" still discloses a credential. Reject the whole guidance field,
// not just the token, so we never fabricate a sanitized host instruction.
// Conservative by design: long mixed-alphanumeric names belong in the separate
// network-name field. Short room numbers and 2.4/5GHz directions remain usable.
function hasEmbeddedCredential(text: string): boolean {
  // Guidance is plain, unquoted prose, not a container for an appended value.
  // Reject wrappers/delimiters regardless of the value's spelling: "(sunflower)"
  // is just as unsafe as "(Secret2026!)". Apostrophes inside words and hyphens
  // inside names remain prose; standalone quotes and dash suffixes do not.
  if (/[^\p{L}\p{N}\s.,'’-]/u.test(text)
    || /(?:^|[^\p{L}])['’]|['’](?:$|[^\p{L}])|\s-\s/u.test(text)) return true;
  return (text.match(/[a-z0-9]+/gi) ?? []).some((token) =>
    /^\d{4,}$/.test(token) || (token.length >= 6 && /[a-z]/i.test(token) && /\d/.test(token)),
  );
}

// A password-location field is not an escape hatch for a bare credential. Require
// explicit locative prose; never infer a physical location from the secret itself.
// An optional named artifact also works: "A note on the fridge" is host-supplied
// location prose, not arbitrary text that happens to contain the word "on".
export function safeWifiLocation(value: unknown): string | null {
  const text = safeText(value);
  if (!text || hasEmbeddedCredential(text)
    || !/^(?:(?:(?:a|the)\s+)?(?:note|card|sticker|label)\s+)?(?:on|in|inside|at|under|beside|behind|near|next to|printed|posted|written|located)\b/i.test(text)) return null;
  return text;
}

export function safeWifiInstructions(value: unknown): string | null {
  const text = safeText(value);
  // Two-word directions such as "join HomeNet" are valid; an unlabelled single
  // token is not a connection instruction and may be a legacy password.
  return text && /\s/.test(text) && !hasEmbeddedCredential(text) ? text : null;
}

function unique(values: Array<string | null>): string | null {
  const nonempty = [...new Set(values.filter((v): v is string => !!v))];
  return nonempty.length === 1 ? nonempty[0] : null;
}

/**
 * Transitional READ of host-approved notes only. Caller supplies current,
 * property-scoped, guest-visible manual/approved notes, never graph/cache rows.
 * Only explicit location/network/instruction labels or locative password prose
 * are recognized; legacy password fields are deliberately never read.
 */
export function wifiInstructionsFromNotes(notes: Array<{ title: string; body: string | null }>): WifiInstructions {
  const locations: Array<string | null> = [];
  const instructions: Array<string | null> = [];
  const networks: Array<string | null> = [];
  for (const note of notes) {
    const body = note.body ?? '';
    if (!WIFI_CONTEXT.test(`${note.title} ${body}`)) continue;
    if (/wi[\s-]?fi password location/i.test(note.title)) locations.push(safeWifiLocation(body));
    if (/wi[\s-]?fi connection instructions/i.test(note.title)) instructions.push(safeWifiInstructions(body));
    if (/wi[\s-]?fi network name/i.test(note.title)) networks.push(safeText(body));
    for (const line of body.split('\n')) {
      const location = line.match(/(?:wi[\s-]?fi\s+)?password\s+location\s*:\s*(.+)$/i)
        ?? line.match(/(?:wi[\s-]?fi\s+)?password\s+(?:is|can be found)\s+((?:on|in|inside|at|under|beside|behind|printed|posted|written|located)\b.+)$/i);
      if (location) locations.push(safeWifiLocation(location[1]));
      const steps = line.match(/^(?:wi[\s-]?fi\s+)?connection instructions\s*:\s*(.+)$/i);
      if (steps) instructions.push(safeWifiInstructions(steps[1]));
      const network = line.match(/^(?:wi[\s-]?fi\s+)?network(?: name)?\s*:\s*(.+)$/i);
      if (network) networks.push(safeText(network[1]));
    }
  }
  return { location: unique(locations), instructions: unique(instructions), network: unique(networks) };
}

export function wifiAnswer(question: string, facts: WifiInstructions): string | null {
  if (!WIFI_ACCESS_REQUEST.test(question)) return null;
  const passwordRequest = /\b(password|passphrase|code|connect|join|access)\b/i.test(question);
  const networkRequest = /\b(network|ssid|name)\b/i.test(question);
  if ((passwordRequest || !networkRequest) && !facts.location) return null;
  if (networkRequest && !facts.network) return null;
  const parts: string[] = [];
  if (facts.network && networkRequest) parts.push(`Wi-Fi network: ${facts.network}`);
  if (facts.location && (passwordRequest || !networkRequest)) parts.push(`Wi-Fi password location: ${facts.location}`);
  if (facts.instructions && (passwordRequest || !networkRequest)) parts.push(facts.instructions);
  return parts.join('\n') || null;
}
