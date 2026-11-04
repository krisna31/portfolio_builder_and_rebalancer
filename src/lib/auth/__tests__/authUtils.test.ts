import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  sha256Hash,
  pbkdf2Hash,
  timingSafeEqual,
  verifyPasswordHash,
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
const mockLocalStorage = createMockStorage();

Object.defineProperty(globalThis, 'sessionStorage', {
  value: mockSessionStorage,
  writable: true,
  configurable: true,
});

Object.defineProperty(globalThis, 'localStorage', {
  value: mockLocalStorage,
  writable: true,
  configurable: true,
});

if (typeof window !== 'undefined') {
  Object.defineProperty(window, 'sessionStorage', {
    value: mockSessionStorage,
    writable: true,
    configurable: true,
  });
  Object.defineProperty(window, 'localStorage', {
    value: mockLocalStorage,
    writable: true,
    configurable: true,
  });
}

describe('authUtils', () => {
  beforeEach(() => {
    mockSessionStorage.clear();
    mockLocalStorage.clear();
    vi.restoreAllMocks();
  });

  describe('timingSafeEqual', () => {
    it('returns true for identical strings', () => {
      expect(timingSafeEqual('correct-token-123', 'correct-token-123')).toBe(true);
      expect(timingSafeEqual('', '')).toBe(true);
    });

    it('returns false for strings of different lengths', () => {
      expect(timingSafeEqual('abc', 'abcd')).toBe(false);
      expect(timingSafeEqual('password', 'pass')).toBe(false);
    });

    it('returns false for strings with single character difference', () => {
      expect(timingSafeEqual('password1', 'password2')).toBe(false);
      expect(timingSafeEqual('secret_token', 'searet_token')).toBe(false);
    });

    it('returns false when inputs are not strings', () => {
      expect(timingSafeEqual(null as any, 'abc')).toBe(false);
      expect(timingSafeEqual('abc', undefined as any)).toBe(false);
    });
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

  describe('pbkdf2Hash', () => {
    it('generates consistent deterministic hash for password and salt', async () => {
      const hash1 = await pbkdf2Hash('mySecurePin123', 'static-salt-xyz', 1000);
      const hash2 = await pbkdf2Hash('mySecurePin123', 'static-salt-xyz', 1000);
      expect(hash1).toBe(hash2);
      expect(hash1).toHaveLength(64);
    });

    it('produces completely different hashes for different salts', async () => {
      const hashA = await pbkdf2Hash('samePassword', 'salt-alpha', 1000);
      const hashB = await pbkdf2Hash('samePassword', 'salt-beta', 1000);
      expect(hashA).not.toBe(hashB);
    });
  });

  describe('verifyPasswordHash (Dual-Mode & Legacy Fallback)', () => {
    it('authenticates legacy raw SHA-256 hash smoothly', async () => {
      const password = 'quantporto2026';
      const expectedLegacyHash = await sha256Hash(password);

      const isValid = await verifyPasswordHash(password, expectedLegacyHash);
      expect(isValid).toBe(true);

      const isInvalid = await verifyPasswordHash('wrongPassword', expectedLegacyHash);
      expect(isInvalid).toBe(false);
    });

    it('authenticates PBKDF2 formatted token (pbkdf2:iterations:salt:hash)', async () => {
      const password = 'mySecretMasterKey';
      const salt = 'uniqueDeviceSalt';
      const iterations = 10000;
      const derivedHash = await pbkdf2Hash(password, salt, iterations);
      const token = `pbkdf2:${iterations}:${salt}:${derivedHash}`;

      const isValid = await verifyPasswordHash(password, token);
      expect(isValid).toBe(true);

      const isInvalid = await verifyPasswordHash('wrongPassword', token);
      expect(isInvalid).toBe(false);
    });

    it('clamps PBKDF2 iteration count to [10_000, 2_000_000] to prevent DoS or weak derivation', async () => {
      const password = 'clampTestPassword';
      const salt = 'clampSalt';
      // Token claims 50 iterations, but verifyPasswordHash clamps minimum to 10_000
      const derivedAt10k = await pbkdf2Hash(password, salt, 10000);
      const underflowToken = `pbkdf2:50:${salt}:${derivedAt10k}`;
      expect(await verifyPasswordHash(password, underflowToken)).toBe(true);
    });

    it('authenticates PBKDF2 with environment configured salt', async () => {
      const password = 'portfolioAdmin';
      const salt = 'envSalt2026';
      const expectedSaltedHash = await pbkdf2Hash(password, salt, 100000);

      const isValid = await verifyPasswordHash(password, expectedSaltedHash, salt);
      expect(isValid).toBe(true);

      const isInvalid = await verifyPasswordHash('wrongPassword', expectedSaltedHash, salt);
      expect(isInvalid).toBe(false);
    });

    it('rejects empty or malformed inputs safely', async () => {
      expect(await verifyPasswordHash('', 'someHash')).toBe(false);
      expect(await verifyPasswordHash('pass', '')).toBe(false);
    });
  });

  describe('Session Authentication Management', () => {
    it('returns false when no session token exists', () => {
      expect(isSessionAuthenticated()).toBe(false);
    });

    it('authenticates session and clears failed attempts', () => {
      mockLocalStorage.setItem(AUTH_ATTEMPTS_KEY, '3');
      authenticateSession();

      expect(isSessionAuthenticated()).toBe(true);
      expect(mockSessionStorage.getItem(AUTH_SESSION_KEY)).toBe('authenticated');
      expect(mockLocalStorage.getItem(AUTH_ATTEMPTS_KEY)).toBeNull();
    });

    it('revokes session properly', () => {
      authenticateSession();
      expect(isSessionAuthenticated()).toBe(true);

      revokeSession();
      expect(isSessionAuthenticated()).toBe(false);
      expect(mockSessionStorage.getItem(AUTH_SESSION_KEY)).toBeNull();
    });
  });

  describe('Rate Limiting & Lockout across persistent storage', () => {
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
      expect(mockLocalStorage.getItem(AUTH_ATTEMPTS_KEY)).toBe('3');

      resetFailedAttempts();
      expect(mockLocalStorage.getItem(AUTH_ATTEMPTS_KEY)).toBeNull();
      expect(mockLocalStorage.getItem(AUTH_LOCKOUT_KEY)).toBeNull();
    });

    it('clears expired lockout automatically', () => {
      // Set expired lockout timestamp in the past
      mockLocalStorage.setItem(AUTH_LOCKOUT_KEY, (Date.now() - 5000).toString());
      mockLocalStorage.setItem(AUTH_ATTEMPTS_KEY, '5');

      expect(getRemainingLockoutSeconds()).toBe(0);
      expect(mockLocalStorage.getItem(AUTH_LOCKOUT_KEY)).toBeNull();
      expect(mockLocalStorage.getItem(AUTH_ATTEMPTS_KEY)).toBeNull();
    });
  });
});
