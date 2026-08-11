import { describe, expect, it, vi } from 'vitest';
import {
  generateRequestNumber,
  generateUniqueRequestNumber,
  REQUEST_NUMBER_PATTERN,
} from '@/lib/extras/request-number';

describe('extras request numbers', () => {
  it('creates a short, unambiguous, human-quotable reference', () => {
    const value = generateRequestNumber(() => 0);
    expect(value).toMatch(REQUEST_NUMBER_PATTERN);
    expect(value).not.toMatch(/[OI01]/);
  });

  it('retries after a collision and returns the first available number', async () => {
    const random = vi.fn()
      .mockReturnValueOnce(0)
      .mockReturnValueOnce(0.1)
      .mockReturnValueOnce(0.2)
      .mockReturnValueOnce(0.3)
      .mockReturnValueOnce(0.4)
      .mockReturnValueOnce(0.5)
      .mockReturnValueOnce(0.6)
      .mockReturnValueOnce(0.7)
      .mockReturnValueOnce(0.8)
      .mockReturnValueOnce(0.9)
      .mockReturnValueOnce(0.11)
      .mockReturnValueOnce(0.21);
    const isAvailable = vi.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true);

    await expect(generateUniqueRequestNumber(isAvailable, random, 2)).resolves.toMatch(REQUEST_NUMBER_PATTERN);
    expect(isAvailable).toHaveBeenCalledTimes(2);
  });

  it('fails closed if a unique number cannot be found within the retry limit', async () => {
    await expect(generateUniqueRequestNumber(async () => false, () => 0, 2)).rejects.toThrow(
      'Could not reserve a request number.',
    );
  });
});
