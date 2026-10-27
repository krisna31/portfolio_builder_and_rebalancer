/**
 * QuantPorto WebAuthn / Passkeys Client-Side Biometric Authentication Utilities
 *
 * Implements hardware biometric authentication (Windows Hello, Touch ID, Face ID)
 * fully client-side using the Web Authentication API (FIDO2 / WebAuthn).
 *
 * No external backend server or database is required: the private key remains
 * locked inside the device's hardware enclave (TPM / Secure Enclave), while the
 * credential identifier is persisted locally. Biometric verification triggers
 * the native platform authenticator, unlocking the tab session upon success.
 */

import { authenticateSession } from './authUtils';

export const WEBAUTHN_STORAGE_KEY = 'quantporto_webauthn_credential';
export const WEBAUTHN_PROMPT_DISMISSED_KEY = 'quantporto_webauthn_prompt_dismissed';

export interface StoredBiometricCredential {
  id: string; // Base64url credential identifier
  rawId: string; // Base64url raw ID
  createdAt: string; // ISO 8601 timestamp
  deviceLabel?: string; // Optional user-friendly device label
}

/**
 * Safely resolves the active window instance across browser and test environments.
 */
function getWindow(): any {
  if (typeof window !== 'undefined') return window;
  if (typeof globalThis !== 'undefined' && (globalThis as any).window) return (globalThis as any).window;
  return null;
}

/**
 * Safely resolves the active navigator instance across browser and test environments.
 */
function getNavigator(): any {
  if (typeof navigator !== 'undefined') return navigator;
  if (typeof globalThis !== 'undefined' && (globalThis as any).navigator) return (globalThis as any).navigator;
  return null;
}

/**
 * Safely resolves the active localStorage instance across browser and test environments.
 */
function getLocalStorage(): Storage | null {
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
 * Safely resolves the active Crypto instance across browser and test environments.
 */
function getCrypto(): Crypto | null {
  try {
    if (typeof window !== 'undefined' && window.crypto) {
      return window.crypto;
    }
    if (typeof globalThis !== 'undefined' && globalThis.crypto) {
      return globalThis.crypto;
    }
  } catch {
    return null;
  }
  return null;
}

/**
 * Converts an ArrayBuffer or Uint8Array into a URL-safe Base64 string (RFC 4648 §5).
 */
export function bufferToBase64Url(buffer: ArrayBuffer | Uint8Array): string {
  if (!buffer) return '';
  const bytes =
    buffer instanceof Uint8Array
      ? buffer
      : ArrayBuffer.isView(buffer)
        ? new Uint8Array((buffer as any).buffer, (buffer as any).byteOffset, (buffer as any).byteLength)
        : new Uint8Array(buffer);

  if (bytes.byteLength === 0) return '';

  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }

  const base64 =
    typeof btoa !== 'undefined'
      ? btoa(binary)
      : typeof (globalThis as any).Buffer !== 'undefined'
        ? (globalThis as any).Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength).toString('base64')
        : '';

  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * Converts a URL-safe Base64 string into an ArrayBuffer.
 */
export function base64UrlToBuffer(base64url: string): ArrayBuffer {
  if (!base64url || typeof base64url !== 'string') {
    return new ArrayBuffer(0);
  }

  const cleaned = base64url.trim();
  if (cleaned.length === 0) {
    return new ArrayBuffer(0);
  }

  try {
    let base64 = cleaned.replace(/-/g, '+').replace(/_/g, '/');
    while (base64.length % 4 !== 0) {
      base64 += '=';
    }

    if (typeof atob !== 'undefined') {
      const binary = atob(base64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
      }
      return bytes.buffer;
    } else if (typeof (globalThis as any).Buffer !== 'undefined') {
      const buf = (globalThis as any).Buffer.from(base64, 'base64');
      const ab = new ArrayBuffer(buf.length);
      const view = new Uint8Array(ab);
      for (let i = 0; i < buf.length; i++) {
        view[i] = buf[i];
      }
      return ab;
    } else {
      const encoder = new TextEncoder();
      const u = encoder.encode(cleaned);
      return u.buffer.slice(u.byteOffset, u.byteOffset + u.byteLength) as ArrayBuffer;
    }
  } catch {
    // Resilient fallback for arbitrary string IDs
    const encoder = new TextEncoder();
    const u = encoder.encode(cleaned);
    return u.buffer.slice(u.byteOffset, u.byteOffset + u.byteLength) as ArrayBuffer;
  }
}

/**
 * Checks whether the Web Authentication API is supported in the current environment.
 */
export function isWebAuthnSupported(): boolean {
  try {
    const win = getWindow();
    const nav = getNavigator();

    // WebAuthn requires a secure context (https:// or localhost)
    if (win && typeof win.isSecureContext === 'boolean' && !win.isSecureContext) {
      return false;
    }

    return (
      Boolean(win) &&
      typeof win.PublicKeyCredential !== 'undefined' &&
      Boolean(nav) &&
      Boolean(nav.credentials) &&
      typeof nav.credentials.create === 'function' &&
      typeof nav.credentials.get === 'function'
    );
  } catch {
    return false;
  }
}

/**
 * Verifies whether a platform biometric authenticator (e.g., Windows Hello, Touch ID)
 * is available on the current physical device.
 */
export async function isPlatformAuthenticatorAvailable(): Promise<boolean> {
  try {
    if (!isWebAuthnSupported()) return false;
    const win = getWindow();
    if (
      !win?.PublicKeyCredential ||
      typeof win.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable !==
        'function'
    ) {
      return false;
    }
    return await win.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch {
    return false;
  }
}

/**
 * Retrieves the stored biometric credential from localStorage.
 */
export function getBiometricCredential(): StoredBiometricCredential | null {
  try {
    const storage = getLocalStorage();
    if (!storage) return null;
    const raw = storage.getItem(WEBAUTHN_STORAGE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.id === 'string') {
      return {
        id: parsed.id,
        rawId: typeof parsed.rawId === 'string' ? parsed.rawId : parsed.id,
        createdAt: typeof parsed.createdAt === 'string' ? parsed.createdAt : new Date().toISOString(),
        deviceLabel: typeof parsed.deviceLabel === 'string' ? parsed.deviceLabel : undefined,
      };
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Checks whether a biometric credential is currently registered on this device.
 */
export function hasRegisteredBiometric(): boolean {
  return Boolean(getBiometricCredential()?.id);
}

/**
 * Persists a biometric credential to localStorage and resets prompt dismissal.
 */
export function saveBiometricCredential(cred: StoredBiometricCredential): void {
  try {
    const storage = getLocalStorage();
    if (!storage) return;
    const toSave: StoredBiometricCredential = {
      ...cred,
      rawId: cred.rawId || cred.id,
      createdAt: cred.createdAt || new Date().toISOString(),
    };
    storage.setItem(WEBAUTHN_STORAGE_KEY, JSON.stringify(toSave));
    setBiometricPromptDismissed(false);
  } catch {
    // Ignore storage quota or access errors
  }
}

/**
 * Clears the stored biometric credential, revoking fingerprint login on this device.
 */
export function clearBiometricCredential(): void {
  try {
    const storage = getLocalStorage();
    if (!storage) return;
    storage.removeItem(WEBAUTHN_STORAGE_KEY);
    setBiometricPromptDismissed(false);
  } catch {
    // Ignore storage quota or access errors
  }
}

/**
 * Checks whether the user has dismissed the post-login biometric setup offer on this device.
 */
export function isBiometricPromptDismissed(): boolean {
  try {
    const storage = getLocalStorage();
    if (!storage) return false;
    return storage.getItem(WEBAUTHN_PROMPT_DISMISSED_KEY) === 'true';
  } catch {
    return false;
  }
}

/**
 * Sets or clears the post-login biometric setup dismissal preference.
 */
export function setBiometricPromptDismissed(dismissed = true): void {
  try {
    const storage = getLocalStorage();
    if (!storage) return;
    if (dismissed) {
      storage.setItem(WEBAUTHN_PROMPT_DISMISSED_KEY, 'true');
    } else {
      storage.removeItem(WEBAUTHN_PROMPT_DISMISSED_KEY);
    }
  } catch {
    // Ignore storage quota or access errors
  }
}

/**
 * Registers a new biometric credential using native platform authenticator (Windows Hello, Touch ID).
 */
export async function registerBiometricCredential(
  deviceLabel = 'Perangkat Ini'
): Promise<{ success: boolean; error?: string; credential?: StoredBiometricCredential }> {
  if (!isWebAuthnSupported()) {
    return {
      success: false,
      error: 'WebAuthn tidak didukung pada browser atau perangkat ini.',
    };
  }

  const cryptoObj = getCrypto();
  if (!cryptoObj) {
    return {
      success: false,
      error: 'Web Crypto API tidak tersedia di lingkungan ini.',
    };
  }

  const nav = getNavigator();
  if (!nav?.credentials) {
    return {
      success: false,
      error: 'Credentials container tidak tersedia.',
    };
  }

  try {
    const challenge = new Uint8Array(32);
    cryptoObj.getRandomValues(challenge);

    const userId = new Uint8Array(16);
    cryptoObj.getRandomValues(userId);

    const creationOptions: CredentialCreationOptions = {
      publicKey: {
        challenge: challenge.buffer.slice(
          challenge.byteOffset,
          challenge.byteOffset + challenge.byteLength
        ) as ArrayBuffer,
        rp: {
          name: 'QuantPorto',
        },
        user: {
          id: userId.buffer.slice(
            userId.byteOffset,
            userId.byteOffset + userId.byteLength
          ) as ArrayBuffer,
          name: 'quantporto-owner',
          displayName: 'Pemilik QuantPorto',
        },
        pubKeyCredParams: [
          { type: 'public-key', alg: -7 }, // ES256 (standard)
          { type: 'public-key', alg: -257 }, // RS256 (fallback)
          { type: 'public-key', alg: -8 }, // Ed25519
          { type: 'public-key', alg: -37 }, // PS256
        ],
        authenticatorSelection: {
          authenticatorAttachment: 'platform',
          userVerification: 'required',
          residentKey: 'preferred',
        },
        timeout: 60000,
        attestation: 'none',
      },
    };

    const credential = (await nav.credentials.create(
      creationOptions
    )) as PublicKeyCredential | null;

    if (!credential) {
      return {
        success: false,
        error: 'Pendaftaran sidik jari dibatalkan atau tidak menghasilkan kredensial.',
      };
    }

    const rawIdStr =
      credential.rawId &&
      (credential.rawId instanceof ArrayBuffer || ArrayBuffer.isView(credential.rawId))
        ? bufferToBase64Url(credential.rawId as ArrayBuffer)
        : credential.id;

    const stored: StoredBiometricCredential = {
      id: credential.id,
      rawId: rawIdStr,
      createdAt: new Date().toISOString(),
      deviceLabel,
    };

    saveBiometricCredential(stored);

    return {
      success: true,
      credential: stored,
    };
  } catch (err: any) {
    let friendlyError = 'Gagal mendaftarkan sidik jari di perangkat ini.';
    if (err?.name === 'NotAllowedError') {
      friendlyError = 'Pendaftaran sidik jari dibatalkan oleh pengguna atau waktu habis.';
    } else if (err?.name === 'AbortError') {
      friendlyError = 'Pendaftaran sidik jari dibatalkan.';
    } else if (err?.name === 'InvalidStateError') {
      friendlyError = 'Kredensial biometrik sudah terdaftar pada perangkat ini.';
    } else if (err?.name === 'NotSupportedError') {
      friendlyError = 'Perangkat keras biometrik tidak kompatibel dengan algoritma yang diminta.';
    } else if (err?.message) {
      friendlyError = `Gagal mendaftar biometrik: ${err.message}`;
    }

    return {
      success: false,
      error: friendlyError,
    };
  }
}

/**
 * Authenticates the user via platform biometric sensor.
 * On cryptographic success, automatically calls authenticateSession() and unlocks tab.
 */
export async function authenticateWithBiometric(): Promise<{
  success: boolean;
  error?: string;
}> {
  if (!isWebAuthnSupported()) {
    return {
      success: false,
      error: 'WebAuthn tidak didukung pada browser ini.',
    };
  }

  const stored = getBiometricCredential();
  if (!stored || !stored.id) {
    return {
      success: false,
      error: 'Belum ada sidik jari yang terdaftar di perangkat ini.',
    };
  }

  const cryptoObj = getCrypto();
  if (!cryptoObj) {
    return {
      success: false,
      error: 'Web Crypto API tidak tersedia di lingkungan ini.',
    };
  }

  const nav = getNavigator();
  if (!nav?.credentials) {
    return {
      success: false,
      error: 'Credentials container tidak tersedia.',
    };
  }

  try {
    const challenge = new Uint8Array(32);
    cryptoObj.getRandomValues(challenge);

    const credentialDescriptor: PublicKeyCredentialDescriptor = {
      type: 'public-key',
      id: base64UrlToBuffer(stored.rawId || stored.id),
    };

    const getOptions: CredentialRequestOptions = {
      publicKey: {
        challenge: challenge.buffer.slice(
          challenge.byteOffset,
          challenge.byteOffset + challenge.byteLength
        ) as ArrayBuffer,
        allowCredentials: [credentialDescriptor],
        userVerification: 'required',
        timeout: 60000,
      },
    };

    const assertion = (await nav.credentials.get(
      getOptions
    )) as PublicKeyCredential | null;

    if (!assertion) {
      return {
        success: false,
        error: 'Verifikasi sidik jari dibatalkan.',
      };
    }

    // Hardware cryptographic biometric verification succeeded!
    authenticateSession();

    return {
      success: true,
    };
  } catch (err: any) {
    let friendlyError = 'Verifikasi sidik jari gagal.';
    if (err?.name === 'NotAllowedError') {
      friendlyError = 'Autentikasi sidik jari dibatalkan atau tidak terdeteksi.';
    } else if (err?.name === 'AbortError') {
      friendlyError = 'Autentikasi sidik jari dibatalkan.';
    } else if (err?.name === 'SecurityError') {
      friendlyError = 'Domain atau konteks keamanan tidak valid untuk WebAuthn.';
    } else if (err?.name === 'NotSupportedError') {
      friendlyError = 'Perangkat atau browser tidak mendukung autentikasi biometrik ini.';
    } else if (err?.message) {
      friendlyError = `Verifikasi biometrik gagal: ${err.message}`;
    }

    return {
      success: false,
      error: friendlyError,
    };
  }
}
