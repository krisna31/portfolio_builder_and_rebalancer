import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  sha256Hash,
  isSessionAuthenticated,
  authenticateSession,
  revokeSession,
  recordFailedAttempt,
  getRemainingLockoutSeconds,
  resetFailedAttempts,
  MAX_AUTH_ATTEMPTS,
  AUTH_SESSION_KEY,
  AUTH_ATTEMPTS_KEY,
  AUTH_LOCKOUT_KEY,
} from '../authUtils';

// Mock in-memory storage for Node/Vitest test environment
const createMockStorage = () => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => {
      store[key] = String(value);
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
  };
};

const mockSessionStorage = createMockStorage();
Object.defineProperty(globalThis, 'sessionStorage', {
  value: mockSessionStorage,
  writable: true,
  configurable: true,
});

if (typeof window !== 'undefined') {
  Object.defineProperty(window, 'sessionStorage', {
    value: mockSessionStorage,
    writable: true,
    configurable: true,
  });
}

describe('authUtils', () => {
  beforeEach(() => {
    mockSessionStorage.clear();
    vi.restoreAllMocks();
  });

  describe('sha256Hash', () => {
    it('correctly hashes empty string to standard SHA-256 hex', async () => {
      const hash = await sha256Hash('');
      expect(hash).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    });

    it('correctly computes known hash for password "quantporto2026"', async () => {
      const hash = await sha256Hash('quantporto2026');
      expect(hash).toBe('808651910d8f5ba9c2984b0cc144c83522ea84edcb4bc5e429abb146eb54e4dc');
    });
  });

  describe('Session Authentication Management', () => {
    it('returns false when no session token exists', () => {
      expect(isSessionAuthenticated()).toBe(false);
    });

    it('authenticates session and clears failed attempts', () => {
      mockSessionStorage.setItem(AUTH_ATTEMPTS_KEY, '3');
      authenticateSession();

      expect(isSessionAuthenticated()).toBe(true);
      expect(mockSessionStorage.getItem(AUTH_SESSION_KEY)).toBe('authenticated');
      expect(mockSessionStorage.getItem(AUTH_ATTEMPTS_KEY)).toBeNull();
    });

    it('revokes session properly', () => {
      authenticateSession();
      expect(isSessionAuthenticated()).toBe(true);

      revokeSession();
      expect(isSessionAuthenticated()).toBe(false);
      expect(mockSessionStorage.getItem(AUTH_SESSION_KEY)).toBeNull();
    });
  });

  describe('Rate Limiting & Lockout', () => {
    it('tracks attempts up to maximum before locking out', () => {
      expect(getRemainingLockoutSeconds()).toBe(0);

      // Attempts 1 to 4
      for (let i = 1; i < MAX_AUTH_ATTEMPTS; i++) {
        const res = recordFailedAttempt();
        expect(res.isLocked).toBe(false);
        expect(res.attemptsLeft).toBe(MAX_AUTH_ATTEMPTS - i);
      }

      // 5th attempt triggers lockout
      const lockRes = recordFailedAttempt();
      expect(lockRes.isLocked).toBe(true);
      expect(lockRes.attemptsLeft).toBe(0);
      expect(lockRes.remainingSec).toBeGreaterThan(0);
      expect(getRemainingLockoutSeconds()).toBeGreaterThan(0);
    });

    it('resets failed attempts when requested', () => {
      for (let i = 0; i < 3; i++) {
        recordFailedAttempt();
      }
      expect(mockSessionStorage.getItem(AUTH_ATTEMPTS_KEY)).toBe('3');

      resetFailedAttempts();
      expect(mockSessionStorage.getItem(AUTH_ATTEMPTS_KEY)).toBeNull();
      expect(mockSessionStorage.getItem(AUTH_LOCKOUT_KEY)).toBeNull();
    });

    it('clears expired lockout automatically', () => {
      // Set expired lockout timestamp in the past
      mockSessionStorage.setItem(AUTH_LOCKOUT_KEY, (Date.now() - 5000).toString());
      mockSessionStorage.setItem(AUTH_ATTEMPTS_KEY, '5');

      expect(getRemainingLockoutSeconds()).toBe(0);
      expect(mockSessionStorage.getItem(AUTH_LOCKOUT_KEY)).toBeNull();
      expect(mockSessionStorage.getItem(AUTH_ATTEMPTS_KEY)).toBeNull();
    });
  });
});
