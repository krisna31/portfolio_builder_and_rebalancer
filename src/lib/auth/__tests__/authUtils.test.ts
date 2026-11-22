import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  sha256Hash,
  pbkdf2Hash,
  timingSafeEqual,
  verifyPasswordHash,
  resolvePasswordRole,
  isSessionAuthenticated,
  getSessionRole,
  isGuestSession,
  authenticateSession,
  revokeSession,
  clearGuestSandboxStorage,
  recordFailedAttempt,
  getRemainingLockoutSeconds,
  resetFailedAttempts,
  MAX_AUTH_ATTEMPTS,
  AUTH_SESSION_KEY,
  AUTH_ROLE_KEY,
  AUTH_ATTEMPTS_KEY,
  AUTH_LOCKOUT_KEY,
  GUEST_STORAGE_KEYS,
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

  describe('Dual-Role Owner & Guest Password Resolution', () => {
    it('resolves owner password to "owner" and self-contained PBKDF2 guest password to "guest"', async () => {
      const ownerSalt = 'owner-salt-2026';
      const ownerHash = await pbkdf2Hash('masterOwnerSecret!', ownerSalt, 100000);
      const guestSalt = 'a1b2c3d4e5f60718';
      const guestDerived = await pbkdf2Hash('tamu2026', guestSalt, 100000);
      const guestToken = `pbkdf2:100000:${guestSalt}:${guestDerived}`;

      expect(
        await resolvePasswordRole('masterOwnerSecret!', {
          ownerHash,
          ownerSalt,
          guestHash: guestToken,
        })
      ).toBe('owner');

      expect(
        await resolvePasswordRole('tamu2026', {
          ownerHash,
          ownerSalt,
          guestHash: guestToken,
        })
      ).toBe('guest');

      expect(
        await resolvePasswordRole('wrongGuess', {
          ownerHash,
          ownerSalt,
          guestHash: guestToken,
        })
      ).toBeNull();
    });

    it('supports optional separate guestSalt and falls back to ownerSalt when guestSalt is omitted', async () => {
      const ownerSalt = 'shared-salt-01';
      const ownerHash = await pbkdf2Hash('ownerPass', ownerSalt, 100000);
      const guestHashSharedSalt = await pbkdf2Hash('guestPass', ownerSalt, 100000);

      expect(
        await resolvePasswordRole('guestPass', {
          ownerHash,
          ownerSalt,
          guestHash: guestHashSharedSalt,
        })
      ).toBe('guest');

      const customGuestSalt = 'separate-guest-salt-02';
      const guestHashCustomSalt = await pbkdf2Hash('guestPass2', customGuestSalt, 100000);

      expect(
        await resolvePasswordRole('guestPass2', {
          ownerHash,
          ownerSalt,
          guestHash: guestHashCustomSalt,
          guestSalt: customGuestSalt,
        })
      ).toBe('guest');
    });

    it('always prioritizes Owner role when owner and guest hashes are configured identically', async () => {
      const sharedHash = await sha256Hash('samePass123');
      expect(
        await resolvePasswordRole('samePass123', {
          ownerHash: sharedHash,
          guestHash: sharedHash,
        })
      ).toBe('owner');
    });

    it('disables guest authentication cleanly when guestHash is empty or undefined', async () => {
      const ownerHash = await sha256Hash('ownerOnly');
      expect(
        await resolvePasswordRole('tamu2026', {
          ownerHash,
          guestHash: '',
        })
      ).toBeNull();
    });
  });

  describe('Guest Session Role & Sandbox Isolation', () => {
    it('tracks owner vs guest roles accurately and supports legacy sessions', () => {
      expect(getSessionRole()).toBeNull();
      expect(isGuestSession()).toBe(false);

      authenticateSession('guest');
      expect(isSessionAuthenticated()).toBe(true);
      expect(getSessionRole()).toBe('guest');
      expect(isGuestSession()).toBe(true);
      expect(mockSessionStorage.getItem(AUTH_ROLE_KEY)).toBe('guest');

      authenticateSession('owner');
      expect(getSessionRole()).toBe('owner');
      expect(isGuestSession()).toBe(false);

      // Legacy session without AUTH_ROLE_KEY defaults safely to 'owner'
      mockSessionStorage.removeItem(AUTH_ROLE_KEY);
      expect(getSessionRole()).toBe('owner');
      expect(isGuestSession()).toBe(false);
    });

    it('wipes all ephemeral guest sessionStorage keys on revokeSession without touching Owner localStorage', () => {
      // Seed Owner persistent data in localStorage
      mockLocalStorage.setItem('quantporto_state_v2', JSON.stringify({ activeTab: 'rebalancer' }));
      mockLocalStorage.setItem('quantporto_saved_portfolios_v1', JSON.stringify([{ id: 'p1' }]));
      mockLocalStorage.setItem('quantporto_roadmap_settings_v1', JSON.stringify({ annualStepUpPct: 10 }));

      // Start Guest session and populate ephemeral guest sandbox keys
      authenticateSession('guest');
      for (const key of Object.values(GUEST_STORAGE_KEYS)) {
        mockSessionStorage.setItem(key, 'guest-temp-data');
      }

      revokeSession();

      // Session and all guest sandbox keys must be cleared
      expect(isSessionAuthenticated()).toBe(false);
      expect(getSessionRole()).toBeNull();
      expect(mockSessionStorage.getItem(AUTH_ROLE_KEY)).toBeNull();
      for (const key of Object.values(GUEST_STORAGE_KEYS)) {
        expect(mockSessionStorage.getItem(key)).toBeNull();
      }

      // Owner localStorage data must remain 100% untouched
      expect(mockLocalStorage.getItem('quantporto_state_v2')).toContain('rebalancer');
      expect(mockLocalStorage.getItem('quantporto_saved_portfolios_v1')).toContain('p1');
      expect(mockLocalStorage.getItem('quantporto_roadmap_settings_v1')).toContain('annualStepUpPct');
    });

    it('clearGuestSandboxStorage wipes guest sessionStorage keys while preserving session token and owner data', () => {
      mockLocalStorage.setItem('quantporto_state_v2', 'owner-real-state');
      authenticateSession('guest');
      mockSessionStorage.setItem(GUEST_STORAGE_KEYS.STATE, 'guest-edited-state');
      mockSessionStorage.setItem(GUEST_STORAGE_KEYS.ROADMAP_SETTINGS, 'guest-roadmap');

      clearGuestSandboxStorage();

      expect(mockSessionStorage.getItem(GUEST_STORAGE_KEYS.STATE)).toBeNull();
      expect(mockSessionStorage.getItem(GUEST_STORAGE_KEYS.ROADMAP_SETTINGS)).toBeNull();
      expect(getSessionRole()).toBe('guest');
      expect(mockLocalStorage.getItem('quantporto_state_v2')).toBe('owner-real-state');
    });
  });
});
