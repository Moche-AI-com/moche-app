import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync('app/dashboard/profile/billing/page.tsx', 'utf8');

describe('Profile billing Pricing V2 presentation', () => {
  it('keeps Free separate from paid Starter', () => {
    expect(source).toContain('>Free</h2>');
    expect(source).toContain('1 draft property');
    expect(source).not.toContain("const isFree = id === 'starter'");
  });

  it('renders paid plan prices as flat rates without misleading averages', () => {
    expect(source).toContain('${plan.monthly.toLocaleString()}');
    expect(source).toContain('flat monthly rate');
    expect(source).not.toContain('each on average');
  });
});
