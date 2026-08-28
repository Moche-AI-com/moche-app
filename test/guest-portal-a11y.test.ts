import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// The guest portal was rebuilt (PR #53) as a step machine — code entry →
// registration → main menu → one of four workflows — replacing the old stacked
// sheet modals. These guardrails assert the *new* shell's accessibility contract
// rather than the retired sheet implementation (useSheetDismiss, .gp-sheet-scrim,
// and per-sheet button-portal-home-* hooks no longer exist).
//
// PR #103 (party access + i18n overhaul) adds a second contract block below: the
// shared stay code admits the party, then every device self-identifies; each
// guest gets their own concierge + host-chat thread; and the whole chrome renders
// through the static portal-strings dictionary instead of hardcoded English.

const read = (file: string) =>
  readFileSync(resolve(process.cwd(), 'app/g/[slug]', file), 'utf8');
const readApi = (...parts: string[]) =>
  readFileSync(resolve(process.cwd(), 'app/api/guest/[slug]', ...parts), 'utf8');
const readLib = (...parts: string[]) =>
  readFileSync(resolve(process.cwd(), 'lib', ...parts), 'utf8');

const shell = read('GuestPortal.tsx');
// The scoped portal design system (inputs, labels, focus states, chat bubbles)
// lives in the shared portalStyles module — the shell and the local guide both
// render it. The CSS contract assertions below read from that home.
const styles = read('portalStyles.ts');
const workflows = (
  ['AiChatWorkflow.tsx', 'HostChatWorkflow.tsx', 'MaintenanceWorkflow.tsx', 'ExtrasWorkflow.tsx'] as const
).map((file) => [file, read(file)] as const);

describe('guest portal accessibility guardrails', () => {
  it('drives every screen through one step machine with a shared back-to-menu handler', () => {
    // The full step set is declared and reachable.
    for (const step of ['code', 'register', 'menu', 'ask', 'host', 'maintenance', 'extras']) {
      expect(shell).toContain(`'${step}'`);
    }
    // A single goMenu handler returns to the menu, and it is handed to every workflow
    // as onBack so no screen is a dead end.
    expect(shell).toContain("const goMenu = useCallback(() => setStep('menu')");
    const backWires = shell.match(/onBack={goMenu}/g) ?? [];
    expect(backWires.length).toBeGreaterThanOrEqual(4);
  });

  it('gives every workflow screen a persistent back-to-menu button', () => {
    for (const [file, source] of workflows) {
      expect(source, `${file} renders the shared gp-back button`).toContain('className="gp-back"');
      expect(source, `${file} wires the button to its onBack prop`).toContain('props.onBack');
    }
  });

  it('keeps chat streams and form fields readable and announced', () => {
    // Live regions announce new chat/turn arrivals to screen readers.
    for (const [file, source] of workflows) {
      if (file === 'ExtrasWorkflow.tsx') continue; // extras is a catalog, not a chat stream
      expect(source, `${file} chat list is a live region`).toContain('aria-live="polite"');
    }
    // Scoped portal inputs keep a visible focus state and labelled fields.
    expect(styles).toContain('.gp-input:focus');
    expect(styles).toContain('.gp-label');
    // The AI concierge always discloses itself in the ask workflow.
    expect(read('AiChatWorkflow.tsx')).toContain('AiDisclosure');
  });
});

describe('party access + i18n guardrails (PR #103)', () => {
  const guestCodeRoute = readApi('auth', 'guest-code', 'route.ts');
  const registerRoute = readApi('stay-guest', 'register', 'route.ts');
  const chatRoute = readApi('chat', 'route.ts');
  const messagesRoute = readApi('messages', 'route.ts');
  const strings = readLib('guest', 'portal-strings.ts');

  it('admits the party by code only — a new device never inherits another guest', () => {
    // A valid code mints a fresh, unregistered session for THIS device...
    expect(guestCodeRoute).toContain('registered: false');
    // ...and nothing copies the party pass's identity or registration onto it.
    expect(guestCodeRoute).not.toContain('guest_identity_id: match.guest_identity_id');
    // The retired phone-confirm gate (it pinned device #2 to guest #1's phone,
    // and compared a hashContact() object to a string) must not come back.
    expect(guestCodeRoute).not.toContain('requiresPhoneConfirm: true');
  });

  it('registers every guest with a name; phone stays optional', () => {
    expect(registerRoute).toContain('firstName: z.string().trim().min(1');
    expect(registerRoute).toContain('phone: z.string().trim().max(40).optional()');
    expect(registerRoute).toContain('termsAccepted: z.literal(true)');
    // Name-only guests still get a first-class identity row (synthetic hash).
    expect(registerRoute).toContain('name-only');
  });

  it('scopes the concierge conversation to the guest session, not the whole stay', () => {
    for (const [name, source] of [['chat', chatRoute], ['messages', messagesRoute]] as const) {
      expect(source, `${name} route filters by guest session`).toContain(".eq('guest_session_id', session.sessionId)");
      expect(source, `${name} route filters by concierge channel`).toContain(".eq('channel', 'ai_concierge')");
    }
  });

  it('renders every screen through the portal translator', () => {
    expect(shell).toContain('portalT(language)');
    for (const [file, source] of workflows) {
      expect(source, `${file} accepts the translator prop`).toContain('t: PortalT');
    }
    for (const file of ['CodeEntry.tsx', 'RegisterForm.tsx', 'MainMenu.tsx'] as const) {
      expect(read(file), `${file} accepts the translator prop`).toContain('t: PortalT');
    }
  });

  it('keeps the pill composer + service bell on every chat surface', () => {
    for (const [file, source] of workflows) {
      if (file === 'ExtrasWorkflow.tsx') continue; // catalog, no composer
      expect(source, `${file} uses the shared composer`).toContain('gp-composer');
      expect(source, `${file} sends with the service bell`).toContain('ConciergeBell');
    }
    expect(styles).toContain('.gp-composer');
    expect(styles).toContain('.gp-send');
  });

  it('ships static dictionaries for the top guest languages with English fallback', () => {
    expect(strings).toContain('export function portalT');
    for (const marker of [
      'const en: Dict',
      'const es: Dict',
      'const fr: Dict',
      'const de: Dict',
      'const it: Dict',
      'const pt: Dict',
      'const ptBR: Dict',
      'const nl: Dict',
      'const zhHans: Dict',
      'const ja: Dict',
    ]) {
      expect(strings, `portal-strings ships ${marker}`).toContain(marker);
    }
  });
});
