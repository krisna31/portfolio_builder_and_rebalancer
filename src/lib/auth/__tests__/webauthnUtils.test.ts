import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  bufferToBase64Url,
  base64UrlToBuffer,
  isWebAuthnSupported,
  isPlatformAuthenticatorAvailable,
  getBiometricCredential,
  saveBiometricCredential,
  hasRegisteredBiometric,
  clearBiometricCredential,
  isBiometricPromptDismissed,
  setBiometricPromptDismissed,
  registerBiometricCredential,
  authenticateWithBiometric,
  getRelyingPartyEntity,
  WEBAUTHN_STORAGE_KEY,
  WEBAUTHN_PROMPT_DISMISSED_KEY,
  StoredBiometricCredential,
} from '../webauthnUtils';
import { isSessionAuthenticated, revokeSession } from '../authUtils';

// Mock in-memory storage for localStorage and sessionStorage
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

const mockLocalStorage = createMockStorage();
const mockSessionStorage = createMockStorage();

// Ensure globalThis has window and navigator mocks for Node test runners
const mockWindow: any = {
  localStorage: mockLocalStorage,
  sessionStorage: mockSessionStorage,
  crypto: globalThis.crypto,
  PublicKeyCredential: {},
  isSecureContext: true,
};

const mockNavigator: any = {
  credentials: {
    create: vi.fn(),
    get: vi.fn(),
  },
};

Object.defineProperty(globalThis, 'window', {
  value: mockWindow,
  configurable: true,
  writable: true,
});
Object.defineProperty(globalThis, 'navigator', {
  value: mockNavigator,
  configurable: true,
  writable: true,
});
Object.defineProperty(globalThis, 'localStorage', {
  value: mockLocalStorage,
  configurable: true,
  writable: true,
});
Object.defineProperty(globalThis, 'sessionStorage', {
  value: mockSessionStorage,
  configurable: true,
  writable: true,
});

describe('webauthnUtils', () => {
  beforeEach(() => {
    mockLocalStorage.clear();
    mockSessionStorage.clear();
    revokeSession();
    vi.restoreAllMocks();

    mockWindow.isSecureContext = true;
    mockWindow.PublicKeyCredential = {};
    delete mockWindow.location;
    mockNavigator.credentials = {
      create: vi.fn(),
      get: vi.fn(),
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Base64Url Encoding & Decoding', () => {
    it('handles empty buffer correctly', () => {
      const empty = new Uint8Array(0);
      const encoded = bufferToBase64Url(empty.buffer);
      expect(encoded).toBe('');

      const decoded = base64UrlToBuffer('');
      expect(new Uint8Array(decoded)).toEqual(new Uint8Array(0));
    });

    it('correctly replaces + with - and / with _ without padding =', () => {
      // 0xfb, 0xff, 0xfe produces "+//+" in standard base64 -> "-__-" in base64url
      const testBytes = new Uint8Array([0xfb, 0xff, 0xfe]);
      const encoded = bufferToBase64Url(testBytes);
      expect(encoded).toBe('-__-');
      expect(encoded).not.toContain('+');
      expect(encoded).not.toContain('/');
      expect(encoded).not.toContain('=');

      const decoded = base64UrlToBuffer(encoded);
      expect(Array.from(new Uint8Array(decoded))).toEqual([0xfb, 0xff, 0xfe]);
    });

    it('handles TypedArray slice/views with non-zero byteOffset accurately', () => {
      const full = new Uint8Array([10, 20, 30, 40, 50, 60]);
      const sub = full.subarray(2, 5); // [30, 40, 50]
      const encoded = bufferToBase64Url(sub);
      const decoded = new Uint8Array(base64UrlToBuffer(encoded));
      expect(Array.from(decoded)).toEqual([30, 40, 50]);
    });

    it('handles empty or nullish inputs gracefully in bufferToBase64Url and base64UrlToBuffer', () => {
      expect(bufferToBase64Url(null as any)).toBe('');
      expect(bufferToBase64Url(undefined as any)).toBe('');
      expect(base64UrlToBuffer(null as any).byteLength).toBe(0);
      expect(base64UrlToBuffer('   ').byteLength).toBe(0);
    });

    it('roundtrips buffers of varying byte lengths', () => {
      const lengths = [1, 2, 3, 4, 7, 16, 32, 64];
      for (const len of lengths) {
        const original = new Uint8Array(len);
        for (let i = 0; i < len; i++) {
          original[i] = (i * 37 + 13) % 256;
        }

        const encoded = bufferToBase64Url(original);
        expect(encoded).not.toContain('=');
        expect(encoded).not.toContain('+');
        expect(encoded).not.toContain('/');

        const decoded = new Uint8Array(base64UrlToBuffer(encoded));
        expect(Array.from(decoded)).toEqual(Array.from(original));
      }
    });
  });

  describe('Storage Management', () => {
    it('returns null and false when no credential has been registered', () => {
      expect(getBiometricCredential()).toBeNull();
      expect(hasRegisteredBiometric()).toBe(false);
    });

    it('saves and retrieves biometric credentials accurately', () => {
      const cred: StoredBiometricCredential = {
        id: 'test-cred-id-123',
        rawId: 'test-raw-id-456',
        createdAt: '2026-10-27T10:00:00.000Z',
        deviceLabel: 'Laptop Kantor',
      };

      saveBiometricCredential(cred);
      expect(hasRegisteredBiometric()).toBe(true);

      const retrieved = getBiometricCredential();
      expect(retrieved).toEqual(cred);
      expect(mockLocalStorage.getItem(WEBAUTHN_STORAGE_KEY)).toContain('test-cred-id-123');
    });

    it('falls back to id when rawId is omitted in storage', () => {
      mockLocalStorage.setItem(
        WEBAUTHN_STORAGE_KEY,
        JSON.stringify({ id: 'only-id-present', createdAt: '2026-10-27T10:00:00.000Z' })
      );
      const retrieved = getBiometricCredential();
      expect(retrieved?.id).toBe('only-id-present');
      expect(retrieved?.rawId).toBe('only-id-present');
    });

    it('manages prompt dismissal preferences and clears them upon credential updates', () => {
      expect(isBiometricPromptDismissed()).toBe(false);

      setBiometricPromptDismissed(true);
      expect(isBiometricPromptDismissed()).toBe(true);
      expect(mockLocalStorage.getItem(WEBAUTHN_PROMPT_DISMISSED_KEY)).toBe('true');

      setBiometricPromptDismissed(false);
      expect(isBiometricPromptDismissed()).toBe(false);

      // Dismiss again, then check clearBiometricCredential resets it
      setBiometricPromptDismissed(true);
      clearBiometricCredential();
      expect(isBiometricPromptDismissed()).toBe(false);
    });

    it('clears stored credential correctly', () => {
      saveBiometricCredential({
        id: 'to-delete',
        rawId: 'to-delete-raw',
        createdAt: '2026-10-27T10:00:00.000Z',
      });
      expect(hasRegisteredBiometric()).toBe(true);

      clearBiometricCredential();
      expect(hasRegisteredBiometric()).toBe(false);
      expect(getBiometricCredential()).toBeNull();
      expect(mockLocalStorage.getItem(WEBAUTHN_STORAGE_KEY)).toBeNull();
    });

    it('gracefully handles corrupted JSON in localStorage', () => {
      mockLocalStorage.setItem(WEBAUTHN_STORAGE_KEY, '{invalid json');
      expect(getBiometricCredential()).toBeNull();
      expect(hasRegisteredBiometric()).toBe(false);
    });
  });

  describe('WebAuthn Support Detection', () => {
    it('returns false when window.PublicKeyCredential or navigator.credentials is absent', () => {
      delete mockWindow.PublicKeyCredential;
      expect(isWebAuthnSupported()).toBe(false);

      mockWindow.PublicKeyCredential = {};
      delete mockNavigator.credentials;
      expect(isWebAuthnSupported()).toBe(false);
    });

    it('returns false in insecure context (isSecureContext === false)', () => {
      mockWindow.isSecureContext = false;
      expect(isWebAuthnSupported()).toBe(false);
      mockWindow.isSecureContext = true;
    });

    it('detects platform authenticator availability', async () => {
      const mockIsAvailable = vi.fn().mockResolvedValue(true);
      mockWindow.PublicKeyCredential = {
        isUserVerifyingPlatformAuthenticatorAvailable: mockIsAvailable,
      };

      const available = await isPlatformAuthenticatorAvailable();
      expect(available).toBe(true);
      expect(mockIsAvailable).toHaveBeenCalled();
    });

    it('handles platform authenticator check rejection gracefully', async () => {
      mockWindow.PublicKeyCredential = {
        isUserVerifyingPlatformAuthenticatorAvailable: vi.fn().mockRejectedValue(new Error('Hardware error')),
      };

      const available = await isPlatformAuthenticatorAvailable();
      expect(available).toBe(false);
    });
  });

  describe('Relying Party (RP) Resolution (getRelyingPartyEntity)', () => {
    it('returns default fallback name without rp.id when window.location is absent or empty', () => {
      delete mockWindow.location;
      const rp = getRelyingPartyEntity();
      expect(rp).toEqual({ name: 'QuantPorto' });
      expect(rp.id).toBeUndefined();
    });

    it('sets rp.id when running on standard production domain (e.g., porto.k31.my.id)', () => {
      mockWindow.location = { hostname: 'porto.k31.my.id' };
      const rp = getRelyingPartyEntity();
      expect(rp).toEqual({
        name: 'QuantPorto',
        id: 'porto.k31.my.id',
      });
    });

    it('normalizes uppercase or whitespace in hostname to lowercase rp.id', () => {
      mockWindow.location = { hostname: '  PORTO.K31.MY.ID  ' };
      const rp = getRelyingPartyEntity();
      expect(rp).toEqual({
        name: 'QuantPorto',
        id: 'porto.k31.my.id',
      });
    });

    it('omits rp.id when running on localhost to allow default origin scoping', () => {
      mockWindow.location = { hostname: 'localhost' };
      const rp = getRelyingPartyEntity();
      expect(rp).toEqual({ name: 'QuantPorto' });
      expect(rp.id).toBeUndefined();
    });

    it('omits rp.id on IPv4 or IPv6 addresses per WebAuthn specification', () => {
      mockWindow.location = { hostname: '192.168.1.100' };
      expect(getRelyingPartyEntity().id).toBeUndefined();

      mockWindow.location = { hostname: '127.0.0.1' };
      expect(getRelyingPartyEntity().id).toBeUndefined();

      mockWindow.location = { hostname: '::1' };
      expect(getRelyingPartyEntity().id).toBeUndefined();
    });
  });

  describe('Biometric Registration (registerBiometricCredential)', () => {
    it('fails gracefully when WebAuthn is not supported', async () => {
      delete mockWindow.PublicKeyCredential;
      const result = await registerBiometricCredential();
      expect(result.success).toBe(false);
      expect(result.error).toContain('tidak didukung');
    });

    it('successfully registers credential and saves to storage', async () => {
      const rawIdBuffer = new Uint8Array([1, 2, 3, 4, 5]).buffer;
      const mockCreate = vi.fn().mockResolvedValue({
        id: 'new-credential-abc',
        rawId: rawIdBuffer,
      });

      mockWindow.PublicKeyCredential = {
        isUserVerifyingPlatformAuthenticatorAvailable: vi.fn().mockResolvedValue(true),
      };
      mockNavigator.credentials = {
        create: mockCreate,
        get: vi.fn(),
      };

      const result = await registerBiometricCredential('ThinkPad Sensor');
      expect(result.success).toBe(true);
      expect(result.credential?.id).toBe('new-credential-abc');
      expect(result.credential?.deviceLabel).toBe('ThinkPad Sensor');
      expect(hasRegisteredBiometric()).toBe(true);
      expect(getBiometricCredential()?.id).toBe('new-credential-abc');
    });

    it('falls back to credential.id when credential.rawId is omitted by authenticator', async () => {
      const mockCreate = vi.fn().mockResolvedValue({
        id: 'fallback-id-only',
      });

      mockWindow.PublicKeyCredential = {
        isUserVerifyingPlatformAuthenticatorAvailable: vi.fn().mockResolvedValue(true),
      };
      mockNavigator.credentials = {
        create: mockCreate,
        get: vi.fn(),
      };

      const result = await registerBiometricCredential();
      expect(result.success).toBe(true);
      expect(result.credential?.id).toBe('fallback-id-only');
      expect(result.credential?.rawId).toBe('fallback-id-only');
    });

    it('handles NotAllowedError when user cancels biometric prompt', async () => {
      const err = new Error('User cancelled');
      err.name = 'NotAllowedError';
      mockWindow.PublicKeyCredential = {};
      mockNavigator.credentials = {
        create: vi.fn().mockRejectedValue(err),
        get: vi.fn(),
      };

      const result = await registerBiometricCredential();
      expect(result.success).toBe(false);
      expect(result.error).toContain('dibatalkan oleh pengguna');
      expect(hasRegisteredBiometric()).toBe(false);
    });

    it('handles AbortError when registration operation is aborted', async () => {
      const err = new Error('Registration aborted');
      err.name = 'AbortError';
      mockWindow.PublicKeyCredential = {};
      mockNavigator.credentials = {
        create: vi.fn().mockRejectedValue(err),
        get: vi.fn(),
      };

      const result = await registerBiometricCredential();
      expect(result.success).toBe(false);
      expect(result.error).toContain('dibatalkan');
      expect(hasRegisteredBiometric()).toBe(false);
    });

    it('handles InvalidStateError when already registered', async () => {
      const err = new Error('Already registered');
      err.name = 'InvalidStateError';
      mockWindow.PublicKeyCredential = {};
      mockNavigator.credentials = {
        create: vi.fn().mockRejectedValue(err),
        get: vi.fn(),
      };

      const result = await registerBiometricCredential();
      expect(result.success).toBe(false);
      expect(result.error).toContain('sudah terdaftar');
    });

    it('configures creationOptions with userVerification preferred, universal pubKeyCredParams and dynamic rp', async () => {
      mockWindow.location = { hostname: 'porto.k31.my.id' };
      mockWindow.PublicKeyCredential = {
        isUserVerifyingPlatformAuthenticatorAvailable: vi.fn().mockResolvedValue(true),
      };
      const mockCreate = vi.fn().mockResolvedValue({
        id: 'cred-123',
        rawId: new Uint8Array([1, 2]).buffer,
      });
      mockNavigator.credentials = { create: mockCreate, get: vi.fn() };

      const res = await registerBiometricCredential();
      expect(res.success).toBe(true);

      expect(mockCreate).toHaveBeenCalledTimes(1);
      const passedOptions = mockCreate.mock.calls[0][0];
      expect(passedOptions.publicKey.rp).toEqual({
        name: 'QuantPorto',
        id: 'porto.k31.my.id',
      });
      expect(passedOptions.publicKey.authenticatorSelection.userVerification).toBe('preferred');
      expect(passedOptions.publicKey.pubKeyCredParams).toEqual([
        { type: 'public-key', alg: -7 },
        { type: 'public-key', alg: -257 },
      ]);
    });

    it('automatically attempts fallback without authenticatorAttachment when platform attachment fails with NotReadableError on Android', async () => {
      const notReadableErr = new Error('An unknown error occurred while talking to the credential manager.');
      notReadableErr.name = 'NotReadableError';

      const mockCreate = vi
        .fn()
        .mockRejectedValueOnce(notReadableErr)
        .mockResolvedValueOnce({
          id: 'fallback-passkey-id',
          rawId: new Uint8Array([5, 6, 7]).buffer,
        });

      mockWindow.PublicKeyCredential = {
        isUserVerifyingPlatformAuthenticatorAvailable: vi.fn().mockResolvedValue(true),
      };
      mockNavigator.credentials = { create: mockCreate, get: vi.fn() };

      const res = await registerBiometricCredential();
      expect(res.success).toBe(true);
      expect(res.credential?.id).toBe('fallback-passkey-id');
      expect(mockCreate).toHaveBeenCalledTimes(2);

      // First attempt: with authenticatorAttachment: 'platform'
      expect(
        mockCreate.mock.calls[0][0].publicKey.authenticatorSelection.authenticatorAttachment
      ).toBe('platform');
      // Second attempt (fallback): authenticatorAttachment omitted
      expect(
        mockCreate.mock.calls[1][0].publicKey.authenticatorSelection.authenticatorAttachment
      ).toBeUndefined();
      expect(
        mockCreate.mock.calls[1][0].publicKey.authenticatorSelection.userVerification
      ).toBe('preferred');
    });

    it('maps Android Credential Manager errors to friendly Indonesian guidance when both attempts fail', async () => {
      const androidErr = new Error('An unknown error occurred while talking to the credential manager.');
      androidErr.name = 'NotReadableError';

      const mockCreate = vi.fn().mockRejectedValue(androidErr);
      mockWindow.PublicKeyCredential = {
        isUserVerifyingPlatformAuthenticatorAvailable: vi.fn().mockResolvedValue(true),
      };
      mockNavigator.credentials = { create: mockCreate, get: vi.fn() };

      const res = await registerBiometricCredential();
      expect(res.success).toBe(false);
      expect(res.error).toBe(
        'Layanan Kredensial Android memerlukan Kunci Layar (PIN/Pola/Sidik Jari) aktif di Pengaturan HP Anda dan browser Chrome resmi.'
      );
    });

    it('triggers fallback when initial attempt error message contains credential manager even with different error name', async () => {
      const credMgrErr = new Error('Failed talking to credential manager backend.');
      credMgrErr.name = 'UnknownError';

      const mockCreate = vi
        .fn()
        .mockRejectedValueOnce(credMgrErr)
        .mockResolvedValueOnce({
          id: 'recovered-passkey-id',
          rawId: new Uint8Array([8, 9]).buffer,
        });

      mockWindow.PublicKeyCredential = {
        isUserVerifyingPlatformAuthenticatorAvailable: vi.fn().mockResolvedValue(true),
      };
      mockNavigator.credentials = { create: mockCreate, get: vi.fn() };

      const res = await registerBiometricCredential();
      expect(res.success).toBe(true);
      expect(res.credential?.id).toBe('recovered-passkey-id');
      expect(mockCreate).toHaveBeenCalledTimes(2);
    });

    it('maps to Indonesian guidance if fallback attempt fails with generic error following credential manager rejection', async () => {
      const initialErr = new Error('talk to credential manager failed');
      initialErr.name = 'NotReadableError';
      const fallbackGenericErr = new Error('Internal hardware bridge failure');
      fallbackGenericErr.name = 'UnknownError';

      const mockCreate = vi
        .fn()
        .mockRejectedValueOnce(initialErr)
        .mockRejectedValueOnce(fallbackGenericErr);

      mockWindow.PublicKeyCredential = {
        isUserVerifyingPlatformAuthenticatorAvailable: vi.fn().mockResolvedValue(true),
      };
      mockNavigator.credentials = { create: mockCreate, get: vi.fn() };

      const res = await registerBiometricCredential();
      expect(res.success).toBe(false);
      expect(res.error).toBe(
        'Layanan Kredensial Android memerlukan Kunci Layar (PIN/Pola/Sidik Jari) aktif di Pengaturan HP Anda dan browser Chrome resmi.'
      );
    });

    it('correctly reports user cancellation when user cancels during the fallback attempt', async () => {
      const initialErr = new Error('talk to credential manager failed');
      initialErr.name = 'NotReadableError';
      const cancelErr = new Error('The user canceled the operation.');
      cancelErr.name = 'NotAllowedError';

      const mockCreate = vi
        .fn()
        .mockRejectedValueOnce(initialErr)
        .mockRejectedValueOnce(cancelErr);

      mockWindow.PublicKeyCredential = {
        isUserVerifyingPlatformAuthenticatorAvailable: vi.fn().mockResolvedValue(true),
      };
      mockNavigator.credentials = { create: mockCreate, get: vi.fn() };

      const res = await registerBiometricCredential();
      expect(res.success).toBe(false);
      expect(res.error).toBe('Pendaftaran sidik jari dibatalkan oleh pengguna atau waktu habis.');
    });
  });

  describe('Biometric Authentication (authenticateWithBiometric)', () => {
    it('fails when WebAuthn is not supported', async () => {
      delete mockWindow.PublicKeyCredential;
      const result = await authenticateWithBiometric();
      expect(result.success).toBe(false);
      expect(result.error).toContain('tidak didukung');
    });

    it('fails when no credential has been registered on the device', async () => {
      mockWindow.PublicKeyCredential = {};
      mockNavigator.credentials = {
        create: vi.fn(),
        get: vi.fn(),
      };

      const result = await authenticateWithBiometric();
      expect(result.success).toBe(false);
      expect(result.error).toContain('Belum ada sidik jari');
    });

    it('authenticates session and unlocks upon successful hardware scan', async () => {
      const validRawId = bufferToBase64Url(new Uint8Array([1, 2, 3, 4]));
      saveBiometricCredential({
        id: 'registered-id-123',
        rawId: validRawId,
        createdAt: new Date().toISOString(),
      });

      const mockGet = vi.fn().mockResolvedValue({
        id: 'registered-id-123',
      });

      mockWindow.PublicKeyCredential = {};
      mockNavigator.credentials = {
        create: vi.fn(),
        get: mockGet,
      };

      expect(isSessionAuthenticated()).toBe(false);

      const result = await authenticateWithBiometric();
      expect(result.success).toBe(true);
      expect(isSessionAuthenticated()).toBe(true);
      expect(mockGet).toHaveBeenCalled();
    });

    it('handles NotAllowedError on scan failure or cancel without authenticating', async () => {
      const validRawId = bufferToBase64Url(new Uint8Array([1, 2, 3, 4]));
      saveBiometricCredential({
        id: 'registered-id-123',
        rawId: validRawId,
        createdAt: new Date().toISOString(),
      });

      const err = new Error('Scan failed or cancelled');
      err.name = 'NotAllowedError';

      mockWindow.PublicKeyCredential = {};
      mockNavigator.credentials = {
        create: vi.fn(),
        get: vi.fn().mockRejectedValue(err),
      };

      const result = await authenticateWithBiometric();
      expect(result.success).toBe(false);
      expect(result.error).toContain('dibatalkan atau tidak terdeteksi');
      expect(isSessionAuthenticated()).toBe(false);
    });

    it('handles AbortError on authenticateWithBiometric gracefully', async () => {
      const validRawId = bufferToBase64Url(new Uint8Array([1, 2, 3, 4]));
      saveBiometricCredential({
        id: 'registered-id-123',
        rawId: validRawId,
        createdAt: new Date().toISOString(),
      });

      const abortErr = new Error('Scan aborted');
      abortErr.name = 'AbortError';

      mockWindow.PublicKeyCredential = {};
      mockNavigator.credentials = {
        create: vi.fn(),
        get: vi.fn().mockRejectedValue(abortErr),
      };

      const result = await authenticateWithBiometric();
      expect(result.success).toBe(false);
      expect(result.error).toContain('dibatalkan');
      expect(isSessionAuthenticated()).toBe(false);
    });

    it('handles NotSupportedError on authenticateWithBiometric gracefully', async () => {
      const validRawId = bufferToBase64Url(new Uint8Array([1, 2, 3, 4]));
      saveBiometricCredential({
        id: 'registered-id-123',
        rawId: validRawId,
        createdAt: new Date().toISOString(),
      });

      const notSupportedErr = new Error('Operation not supported');
      notSupportedErr.name = 'NotSupportedError';

      mockWindow.PublicKeyCredential = {};
      mockNavigator.credentials = {
        create: vi.fn(),
        get: vi.fn().mockRejectedValue(notSupportedErr),
      };

      const result = await authenticateWithBiometric();
      expect(result.success).toBe(false);
      expect(result.error).toContain('tidak mendukung');
      expect(isSessionAuthenticated()).toBe(false);
    });

    it('handles SecurityError in authenticateWithBiometric gracefully', async () => {
      const validRawId = bufferToBase64Url(new Uint8Array([1, 2, 3, 4]));
      saveBiometricCredential({
        id: 'registered-id-123',
        rawId: validRawId,
        createdAt: new Date().toISOString(),
      });

      const secErr = new Error('Insecure context');
      secErr.name = 'SecurityError';

      mockWindow.PublicKeyCredential = {};
      mockNavigator.credentials = {
        create: vi.fn(),
        get: vi.fn().mockRejectedValue(secErr),
      };

      const result = await authenticateWithBiometric();
      expect(result.success).toBe(false);
      expect(result.error).toContain('Domain atau konteks keamanan tidak valid');
      expect(isSessionAuthenticated()).toBe(false);
    });

    it('passes userVerification preferred and rpId when authenticating', async () => {
      mockWindow.location = { hostname: 'porto.k31.my.id' };
      const validRawId = bufferToBase64Url(new Uint8Array([1, 2, 3, 4]));
      saveBiometricCredential({
        id: 'registered-id-123',
        rawId: validRawId,
        createdAt: new Date().toISOString(),
      });

      const mockGet = vi.fn().mockResolvedValue({
        id: 'registered-id-123',
      });
      mockWindow.PublicKeyCredential = {};
      mockNavigator.credentials = { create: vi.fn(), get: mockGet };

      const result = await authenticateWithBiometric();
      expect(result.success).toBe(true);
      expect(mockGet).toHaveBeenCalledTimes(1);
      const passedGetOptions = mockGet.mock.calls[0][0];
      expect(passedGetOptions.publicKey.userVerification).toBe('preferred');
      expect(passedGetOptions.publicKey.rpId).toBe('porto.k31.my.id');
    });

    it('maps Android Credential Manager errors to friendly Indonesian guidance during authentication', async () => {
      const validRawId = bufferToBase64Url(new Uint8Array([1, 2, 3, 4]));
      saveBiometricCredential({
        id: 'registered-id-123',
        rawId: validRawId,
        createdAt: new Date().toISOString(),
      });

      const androidErr = new Error('An unknown error occurred while talking to the credential manager.');
      androidErr.name = 'NotReadableError';

      mockWindow.PublicKeyCredential = {};
      mockNavigator.credentials = {
        create: vi.fn(),
        get: vi.fn().mockRejectedValue(androidErr),
      };

      const result = await authenticateWithBiometric();
      expect(result.success).toBe(false);
      expect(result.error).toBe(
        'Layanan Kredensial Android memerlukan Kunci Layar (PIN/Pola/Sidik Jari) aktif di Pengaturan HP Anda dan browser Chrome resmi.'
      );
    });

    it('executes full client-side lifecycle: register -> verify -> revoke', async () => {
      // 1. Initial state: not registered, session locked
      expect(hasRegisteredBiometric()).toBe(false);
      expect(isSessionAuthenticated()).toBe(false);

      const fakeRawId = new Uint8Array([42, 43, 44, 45]).buffer;
      mockWindow.PublicKeyCredential = {
        isUserVerifyingPlatformAuthenticatorAvailable: vi.fn().mockResolvedValue(true),
      };
      mockNavigator.credentials = {
        create: vi.fn().mockResolvedValue({
          id: 'credential-lifecycle-id',
          rawId: fakeRawId,
        }),
        get: vi.fn().mockResolvedValue({
          id: 'credential-lifecycle-id',
        }),
      };

      // 2. Register
      const regRes = await registerBiometricCredential('Pixel 8 Sensor');
      expect(regRes.success).toBe(true);
      expect(hasRegisteredBiometric()).toBe(true);

      // 3. Authenticate with biometric
      const authRes = await authenticateWithBiometric();
      expect(authRes.success).toBe(true);
      expect(isSessionAuthenticated()).toBe(true);

      // 4. Revoke / clear credential
      clearBiometricCredential();
      expect(hasRegisteredBiometric()).toBe(false);
      revokeSession();

      // 5. Subsequent biometric attempt fails because credential was revoked
      const afterRevokeRes = await authenticateWithBiometric();
      expect(afterRevokeRes.success).toBe(false);
      expect(afterRevokeRes.error).toContain('Belum ada sidik jari yang terdaftar');
      expect(isSessionAuthenticated()).toBe(false);
    });
  });
});
