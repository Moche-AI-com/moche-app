import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { GenerateResult } from '@/lib/ai/provider';

// Spy on the router so we can assert the normalizer declares the 'brain_ops' task
// tier by default (the wiring that makes routedCompletion pick the strong,
// no-downgrade brain-management model).
const routedCompletion = vi.fn((..._args: unknown[]) => Promise.resolve({} as GenerateResult));
vi.mock('@/lib/router/modelRouter', () => ({
  routedCompletion: (...args: unknown[]) => routedCompletion(...args),
}));

import { normalizeToNode, detectNodeType } from './index';

beforeEach(() => {
  routedCompletion.mockReset();
});

describe('detectNodeType', () => {
  it('maps a wifi note under core', () => {
    expect(detectNodeType('core', 'WiFi', 'the wireless network is HomeNet')).toBe('wifi');
  });
});

describe('normalizeToNode default routing', () => {
  it('calls routedCompletion with the brain_ops task tier', async () => {
    routedCompletion.mockResolvedValue({
      text: '{"network_name":"HomeNet","password":"abc","instructions":"join HomeNet"}',
      model: 'openai/gpt-4o',
    });

    const node = await normalizeToNode({ nodeType: 'wifi', title: 'WiFi', body: 'network HomeNet' });

    expect(routedCompletion).toHaveBeenCalled();
    const thirdArg = routedCompletion.mock.calls[0][2];
    expect(thirdArg).toEqual({ task: 'brain_ops' });
    expect(node?.nodeType).toBe('wifi');
  });
});
