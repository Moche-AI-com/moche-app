import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (file: string) =>
  readFileSync(resolve(process.cwd(), 'app/g/[slug]', file), 'utf8');

const shell = read('GuestPortal.tsx');
const workflows = [
  'AiChatWorkflow.tsx',
  'HostChatWorkflow.tsx',
  'MaintenanceWorkflow.tsx',
  'ExtrasWorkflow.tsx',
].map((file) => [file, read(file)] as const);

// The guest portal is a step machine (code → register → menu → one of four
// workflows), not a stack of sheet modals. These guardrails assert the
// accessibility properties of that architecture as it exists today.
describe('guest portal accessibility guardrails', () => {
  it('drives every screen through one step machine with a shared route back to the menu', () => {
    for (const step of ['code', 'register', 'menu', 'ask', 'host', 'maintenance', 'extras']) {
      expect(shell).toContain(`'${step}'`);
    }
    // The shared back-to-menu handler exists and is handed to each workflow.
    expect(shell).toContain("const goMenu = useCallback(() => setStep('menu')");
    for (const [, source] of workflows) {
      expect(source).toContain('onBack');
    }
  });

  it('gives every workflow screen a persistent back-to-menu button', () => {
    for (const [file, source] of workflows) {
      expect(source, `${file} should render the gp-back button`).toContain('className="gp-back"');
      expect(source).toContain('props.onBack');
    }
  });

  it('keeps chat and form fields accessible (live regions, labels, focus styles)', () => {
    // Chat streams announce new messages to screen readers.
    for (const [, source] of workflows.filter(([f]) => f.includes('Chat'))) {
      expect(source).toContain('aria-live="polite"');
    }
    // Scoped portal inputs keep a visible focus state.
    expect(shell).toContain('.gp-input:focus');
    // The AI concierge always discloses itself.
    expect(read('AiChatWorkflow.tsx')).toContain('AiDisclosure');
  });
});
