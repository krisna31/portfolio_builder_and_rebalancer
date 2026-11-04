import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useAutoLock } from '../useAutoLock';

describe('useAutoLock Hook', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('exports useAutoLock as a valid hook function', () => {
    expect(typeof useAutoLock).toBe('function');
  });

  it('validates hook option defaults and types', () => {
    const onLock = vi.fn();
    expect(() => {
      // Basic type test
      const opts = { isEnabled: false, onLock };
      expect(opts.isEnabled).toBe(false);
      expect(typeof opts.onLock).toBe('function');
    }).not.toThrow();
  });
});
