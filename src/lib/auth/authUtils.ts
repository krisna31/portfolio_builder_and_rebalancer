/**
 * QuantPorto Authentication & Cryptographic Utilities
 *
 * Implements client-side SHA-256 hash calculation, tab-level session state
 * management via sessionStorage, and brute-force lockout rate limiting.
 */

export const AUTH_SESSION_KEY = 'quantporto_auth_session';
export const AUTH_ATTEMPTS_KEY = 'quantporto_auth_attempts';
export const AUTH_LOCKOUT_KEY = 'quantporto_auth_lockout_until';

export const MAX_AUTH_ATTEMPTS = 5;
export const LOCKOUT_DURATION_MS = 30000; // 30 seconds

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
 * Returns 0 if not locked out.
 */
export function getRemainingLockoutSeconds(): number {
  try {
    const storage = getSessionStorage();
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
 */
export function recordFailedAttempt(): {
  isLocked: boolean;
  remainingSec: number;
  attemptsLeft: number;
} {
  try {
    const storage = getSessionStorage();
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
 * Clears failed attempts and lockout timers from session storage.
 */
export function resetFailedAttempts(): void {
  try {
    const storage = getSessionStorage();
    if (!storage) return;
    storage.removeItem(AUTH_ATTEMPTS_KEY);
    storage.removeItem(AUTH_LOCKOUT_KEY);
  } catch {
    // Ignore storage quota or access errors
  }
}
