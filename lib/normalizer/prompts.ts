import type { NodeType } from './schemas';

// Per-category extraction prompts. Each instructs the model to emit ONE JSON object
// with a fixed key set and nothing else. Unknown values must be null (never guessed) —
// the concierge treats these nodes as the source of truth, so fabrication is worse
// than a missing field.
const SHARED_RULES = `You convert a single host knowledge note into ONE structured JSON object.
Rules:
- Output ONLY the JSON object. No prose, no markdown, no code fences.
- Use the EXACT keys listed. Do not add or rename keys.
- If a value is not stated in the note, set it to null. Never invent codes, passwords, times, or policies.
- Copy values verbatim where possible; do not paraphrase access codes, passwords, or times.`;

const SPECS: Record<NodeType, string> = {
  wifi: `Extract WiFi access details.
Keys:
  "network_name": string | null   // the SSID / network name
  "password": string | null       // the WiFi password, verbatim
  "instructions": string | null   // any extra steps to connect
  "notes": string | null          // caveats (e.g. guest network, speed limits)`,
  checkin: `Extract check-in details.
Keys:
  "time": string | null           // check-in time, e.g. "3:00 PM"
  "method": string | null         // how they get in, e.g. "lockbox", "smart lock", "meet host"
  "access_code": string | null    // door/lockbox code, verbatim
  "location": string | null       // where the entrance / lockbox is
  "instructions": string | null   // step-by-step arrival instructions
  "notes": string | null          // caveats (early check-in, ID needed, etc.)`,
  checkout: `Extract check-out details.
Keys:
  "time": string | null           // check-out time, e.g. "11:00 AM"
  "instructions": string | null   // general departure instructions
  "tasks": string[] | null        // discrete checkout tasks (trash, dishes, windows...)
  "key_return": string | null     // how/where to return keys
  "notes": string | null          // caveats (late checkout policy, fees, etc.)`,
};

export function buildNormalizerPrompt(nodeType: NodeType): string {
  return `${SHARED_RULES}\n\n${SPECS[nodeType]}`;
}
