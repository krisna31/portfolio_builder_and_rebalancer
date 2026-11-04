/**
 * QuantPorto Authentication & Cryptographic Utilities
 *
 * Implements client-side SHA-256 and PBKDF2-SHA256 key stretching,
 * constant-time string comparison (timing attack mitigation),
 * tab-level session state via sessionStorage, and persistent brute-force
 * lockout rate limiting across tabs via localStorage.
 */

export const AUTH_SESSION_KEY = 'quantporto_auth_session';
export const AUTH_ATTEMPTS_KEY = 'quantporto_auth_attempts';
export const AUTH_LOCKOUT_KEY = 'quantporto_auth_lockout_until';

export const MAX_AUTH_ATTEMPTS = 5;
export const LOCKOUT_DURATION_MS = 30000; // 30 seconds
export const PBKDF2_DEFAULT_ITERATIONS = 100000;

/**
 * Safely resolves the active sessionStorage instance across browser and test environments.
 */
function getSessionStorage(): Storage | null {
  try {
    if (typeof window !== 'undefined' && window.sessionStorage) {
      return window.sessionStorage;
    }
    if (typeof globalThis !== 'undefined' && (globalThis as any).sessionStorage) {
      return (globalThis as any).sessionStorage;
    }
  } catch {
    return null;
  }
  return null;
}

/**
 * Safely resolves persistent localStorage to prevent brute-force tab bypassing.
 */
function getPersistentStorage(): Storage | null {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      return window.localStorage;
    }
    if (typeof globalThis !== 'undefined' && (globalThis as any).localStorage) {
      return (globalThis as any).localStorage;
    }
  } catch {
    return null;
  }
  return null;
}

/**
 * Timing-safe string comparison preventing side-channel timing attacks.
 * Operates with bitwise XOR accumulation across all byte pairs.
 */
export function timingSafeEqual(a: string, b: string): boolean {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  if (a.length !== b.length) return false;

  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

/**
 * Computes hexadecimal SHA-256 hash of a string using Web Crypto API.
 */
export async function sha256Hash(text: string): Promise<string> {
  const cryptoObj =
    typeof window !== 'undefined' && window.crypto
      ? window.crypto
      : typeof globalThis !== 'undefined' && globalThis.crypto
        ? globalThis.crypto
        : null;

  if (!cryptoObj || !cryptoObj.subtle) {
    throw new Error('Web Crypto API is not supported in this browser environment.');
  }

  const encoder = new TextEncoder();
  const data = encoder.encode(text);
  const hashBuffer = await cryptoObj.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Derives a PBKDF2-SHA256 hash (100,000 iterations default) for hardened password verification.
 */
export async function pbkdf2Hash(
  password: string,
  salt: string,
  iterations = PBKDF2_DEFAULT_ITERATIONS
): Promise<string> {
  const cryptoObj =
    typeof window !== 'undefined' && window.crypto
      ? window.crypto
      : typeof globalThis !== 'undefined' && globalThis.crypto
        ? globalThis.crypto
        : null;

  if (!cryptoObj || !cryptoObj.subtle) {
    throw new Error('Web Crypto API is not supported in this browser environment.');
  }

  const encoder = new TextEncoder();
  const keyMaterial = await cryptoObj.subtle.importKey(
    'raw',
    encoder.encode(password),
    { name: 'PBKDF2' },
    false,
    ['deriveBits']
  );

  const derivedBits = await cryptoObj.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: encoder.encode(salt),
      iterations,
      hash: 'SHA-256',
    },
    keyMaterial,
    256
  );

  const hashArray = Array.from(new Uint8Array(derivedBits));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Dual-mode password verification supporting:
 * 1. PBKDF2 with salt token format: `pbkdf2:<iterations>:<salt>:<hexHash>`
 * 2. PBKDF2 with configured environment salt (`VITE_APP_PASSWORD_SALT`)
 * 3. Backward-compatible fallback for legacy plain SHA-256 hashes
 *
 * Always compares outputs using constant-time timingSafeEqual.
 */
export async function verifyPasswordHash(
  password: string,
  expectedHash: string,
  configuredSalt?: string
): Promise<boolean> {
  if (!password || !expectedHash) return false;
  const cleanExpected = expectedHash.trim();

  // Mode 1: Encoded PBKDF2 token (pbkdf2:iterations:salt:hash)
  if (cleanExpected.startsWith('pbkdf2:')) {
    const parts = cleanExpected.split(':');
    if (parts.length === 4) {
      const iterations = parseInt(parts[1], 10) || PBKDF2_DEFAULT_ITERATIONS;
      const salt = parts[2];
      const targetHash = parts[3].toLowerCase();
      const computed = await pbkdf2Hash(password, salt, iterations);
      return timingSafeEqual(computed.toLowerCase(), targetHash);
    }
  }

  // Mode 2: Configured Salt via environment variable
  if (configuredSalt && configuredSalt.trim().length > 0) {
    const computedSalted = await pbkdf2Hash(password, configuredSalt.trim(), PBKDF2_DEFAULT_ITERATIONS);
    if (timingSafeEqual(computedSalted.toLowerCase(), cleanExpected.toLowerCase())) {
      return true;
    }
  }

  // Mode 3: Legacy plain SHA-256 hash fallback
  const legacyHash = await sha256Hash(password);
  return timingSafeEqual(legacyHash.toLowerCase(), cleanExpected.toLowerCase());
}

/**
 * Checks if the current browser tab session is authenticated.
 */
export function isSessionAuthenticated(): boolean {
  try {
    const storage = getSessionStorage();
    if (!storage) return false;
    return storage.getItem(AUTH_SESSION_KEY) === 'authenticated';
  } catch {
    return false;
  }
}

/**
 * Sets the current tab session as authenticated and clears previous failure counters.
 */
export function authenticateSession(): void {
  try {
    const storage = getSessionStorage();
    if (!storage) return;
    storage.setItem(AUTH_SESSION_KEY, 'authenticated');
    resetFailedAttempts();
  } catch {
    // Ignore storage quota or access errors
  }
}

/**
 * Revokes the current tab session, locking the application immediately.
 */
export function revokeSession(): void {
  try {
    const storage = getSessionStorage();
    if (!storage) return;
    storage.removeItem(AUTH_SESSION_KEY);
  } catch {
    // Ignore storage quota or access errors
  }
}

/**
 * Retrieves remaining lockout seconds if the user is currently rate-limited.
 * Returns 0 if not locked out. Uses persistent storage across tabs.
 */
export function getRemainingLockoutSeconds(): number {
  try {
    const storage = getPersistentStorage() ?? getSessionStorage();
    if (!storage) return 0;
    const rawLockout = storage.getItem(AUTH_LOCKOUT_KEY);
    if (!rawLockout) return 0;

    const lockoutUntil = parseInt(rawLockout, 10);
    if (isNaN(lockoutUntil)) {
      storage.removeItem(AUTH_LOCKOUT_KEY);
      return 0;
    }

    const remainingMs = lockoutUntil - Date.now();
    if (remainingMs > 0) {
      return Math.ceil(remainingMs / 1000);
    }

    // Lockout expired: clean up
    storage.removeItem(AUTH_LOCKOUT_KEY);
    storage.removeItem(AUTH_ATTEMPTS_KEY);
    return 0;
  } catch {
    return 0;
  }
}

/**
 * Records a failed password attempt, triggering a 30s lockout if attempts >= MAX_AUTH_ATTEMPTS.
 * Enforces brute-force limits across tabs using persistent storage.
 */
export function recordFailedAttempt(): {
  isLocked: boolean;
  remainingSec: number;
  attemptsLeft: number;
} {
  try {
    const storage = getPersistentStorage() ?? getSessionStorage();
    if (!storage) {
      return { isLocked: false, remainingSec: 0, attemptsLeft: MAX_AUTH_ATTEMPTS - 1 };
    }

    // Check if already locked
    const activeLock = getRemainingLockoutSeconds();
    if (activeLock > 0) {
      return { isLocked: true, remainingSec: activeLock, attemptsLeft: 0 };
    }

    const rawAttempts = storage.getItem(AUTH_ATTEMPTS_KEY);
    const currentAttempts = rawAttempts ? parseInt(rawAttempts, 10) || 0 : 0;
    const nextAttempts = currentAttempts + 1;

    storage.setItem(AUTH_ATTEMPTS_KEY, nextAttempts.toString());

    if (nextAttempts >= MAX_AUTH_ATTEMPTS) {
      const lockoutUntil = Date.now() + LOCKOUT_DURATION_MS;
      storage.setItem(AUTH_LOCKOUT_KEY, lockoutUntil.toString());
      return {
        isLocked: true,
        remainingSec: Math.ceil(LOCKOUT_DURATION_MS / 1000),
        attemptsLeft: 0,
      };
    }

    return {
      isLocked: false,
      remainingSec: 0,
      attemptsLeft: Math.max(0, MAX_AUTH_ATTEMPTS - nextAttempts),
    };
  } catch {
    return { isLocked: false, remainingSec: 0, attemptsLeft: 0 };
  }
}

/**
 * Clears failed attempts and lockout timers from persistent storage.
 */
export function resetFailedAttempts(): void {
  try {
    const storage = getPersistentStorage() ?? getSessionStorage();
    if (!storage) return;
    storage.removeItem(AUTH_ATTEMPTS_KEY);
    storage.removeItem(AUTH_LOCKOUT_KEY);
  } catch {
    // Ignore storage quota or access errors
  }
}
