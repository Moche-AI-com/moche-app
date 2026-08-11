import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const portalSource = readFileSync(
  resolve(process.cwd(), 'app/g/[slug]/GuestPortal.tsx'),
  'utf8',
);

describe('guest portal sheet accessibility guardrails', () => {
  it('uses one reusable dismissal hook for keyboard, focus, and scroll handling', () => {
    expect(portalSource).toContain('function useSheetDismiss');
    expect(portalSource).toContain("event.key === 'Escape'");
    expect(portalSource).toContain("event.key !== 'Tab'");
    expect(portalSource).toContain("document.body.style.overflow = 'hidden'");
    expect(portalSource).toContain('previouslyFocused.focus()');
  });

  it('keeps portaled sheet form fields readable in normal, focused, and autofill states', () => {
    expect(portalSource).toContain('.gp-sheet-scrim input:-webkit-autofill');
    expect(portalSource).toContain('-webkit-box-shadow: inset 0 0 0 1000px #171c25');
    expect(portalSource).toContain('-webkit-text-fill-color: #fbf7ef');
    expect(portalSource).toContain('.gp-sheet-scrim input:focus-visible');
    expect(portalSource).toContain('.gp-lang-search:hover');
  });

  it('gives every portaled sheet a persistent route to portal home', () => {
    for (const sheet of ['subchoice', 'host-composer', 'service-request', 'place-detail', 'language', 'history']) {
      expect(portalSource).toContain(`button-portal-home-${sheet}`);
    }
  });
});
