import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// The guest portal was rebuilt (PR #53) as a step machine — code entry → register →
// main menu → one of four workflows — replacing the old portaled-sheet modal stack.
// These guardrails assert the accessibility contract of the NEW architecture, not the
// old one: the previous assertions (useSheetDismiss, .gp-sheet-scrim, button-portal-home-*)
// tested components that no longer exist.
const read = (file: string) =>
  readFileSync(resolve(process.cwd(), 'app/g/[slug]', file), 'utf8');

const shell = read('GuestPortal.tsx');
const workflows = [
  'AiChatWorkflow.tsx',
  'HostChatWorkflow.tsx',
  'MaintenanceWorkflow.tsx',
  'ExtrasWorkflow.tsx',
].map((file) => [file, read(file)] as const);

describe('guest portal accessibility guardrails', () => {
  it('drives every screen through one step machine with a shared route back to the menu', () => {
    // Every step the shell can render.
    for (const step of ['code', 'register', 'menu', 'ask', 'host', 'maintenance', 'extras']) {
      expect(shell).toContain(`'${step}'`);
    }
    // A single back-to-menu handler exists and is handed to each workflow as onBack.
    expect(shell).toContain("const goMenu = useCallback(() => setStep('menu')");
    expect(shell).toContain('onBack={goMenu}');
    for (const [, source] of workflows) {
      expect(source).toContain('onBack');
    }
  });

  it('gives every workflow screen a persistent back-to-menu button', () => {
    for (const [file, source] of workflows) {
      expect(source, `${file} should render the gp-back button`).toContain('className="gp-back"');
    }
  });

  it('keeps chat streams and form fields accessible', () => {
    // Chat lists announce new messages to screen readers.
    expect(read('AiChatWorkflow.tsx')).toContain('aria-live="polite"');
    expect(read('HostChatWorkflow.tsx')).toContain('aria-live="polite"');
    expect(read('MaintenanceWorkflow.tsx')).toContain('aria-live="polite"');
    // Scoped portal inputs keep a visible focus state.
    expect(shell).toContain('.gp-input:focus');
    // The AI concierge always discloses itself.
    expect(read('AiChatWorkflow.tsx')).toContain('AiDisclosure');
  });
});
