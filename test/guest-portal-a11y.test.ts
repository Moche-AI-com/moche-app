import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// The guest portal was rebuilt (PR #53) as a step machine — code entry →
// registration → main menu → one of four workflows — replacing the old stacked
// sheet modals. These guardrails assert the *new* shell's accessibility contract
// rather than the retired sheet implementation (useSheetDismiss, .gp-sheet-scrim,
// and per-sheet button-portal-home-* hooks no longer exist).

const read = (file: string) =>
  readFileSync(resolve(process.cwd(), 'app/g/[slug]', file), 'utf8');

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
