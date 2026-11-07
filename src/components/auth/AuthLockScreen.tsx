import React, { useEffect, useRef, useState } from 'react';
import {
  Eye,
  EyeOff,
  ArrowRight,
  Fingerprint,
} from 'lucide-react';
import { BrandLogo } from '../BrandLogo';
import { stopInteractiveTour } from '../../services/tourGuide';
import {
  verifyPasswordHash,
  authenticateSession,
  recordFailedAttempt,
  getRemainingLockoutSeconds,
  MAX_AUTH_ATTEMPTS,
} from '../../lib/auth/authUtils';
import {
  isWebAuthnSupported,
  isPlatformAuthenticatorAvailable,
  hasRegisteredBiometric,
  registerBiometricCredential,
  authenticateWithBiometric,
  isBiometricPromptDismissed,
  setBiometricPromptDismissed,
} from '../../lib/auth/webauthnUtils';

interface AuthLockScreenProps {
  expectedHash: string;
  configuredSalt?: string;
  onAuthenticated: () => void;
}

export const AuthLockScreen: React.FC<AuthLockScreenProps> = ({
  expectedHash,
  configuredSalt,
  onAuthenticated,
}) => {
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isShaking, setIsShaking] = useState(false);
  const [lockoutSec, setLockoutSec] = useState(() => getRemainingLockoutSeconds());

  // Biometric authentication state
  const [isBiometricSupported, setIsBiometricSupported] = useState(false);
  const [isRegistered, setIsRegistered] = useState(false);
  const [isVerifyingBiometric, setIsVerifyingBiometric] = useState(false);
  const [biometricError, setBiometricError] = useState<string | null>(null);

  // Post-password registration offer state
  const [showRegisterPrompt, setShowRegisterPrompt] = useState(false);
  const [isRegisteringBiometric, setIsRegisteringBiometric] = useState(false);
  const [registerError, setRegisterError] = useState<string | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);

  // Check WebAuthn platform biometric availability on mount
  useEffect(() => {
    let mounted = true;

    const detectBiometrics = async () => {
      try {
        if (!isWebAuthnSupported()) {
          if (mounted) {
            setIsBiometricSupported(false);
            setIsRegistered(false);
          }
          return;
        }

        const platformAvailable = await isPlatformAuthenticatorAvailable();
        const registered = hasRegisteredBiometric();

        if (mounted) {
          setIsBiometricSupported(platformAvailable || registered);
          setIsRegistered(registered);
        }
      } catch {
        if (mounted) {
          setIsBiometricSupported(false);
          setIsRegistered(false);
        }
      }
    };

    detectBiometrics();
    return () => {
      mounted = false;
    };
  }, []);

  // Ensure no lingering tour overlays are present while locked
  useEffect(() => {
    stopInteractiveTour();
  }, []);

  // Auto-focus input on mount if not in prompt or lockout
  useEffect(() => {
    if (lockoutSec <= 0 && !showRegisterPrompt) {
      inputRef.current?.focus();
    }
  }, [lockoutSec, showRegisterPrompt]);

  // Lockout countdown timer
  useEffect(() => {
    if (lockoutSec <= 0) return;

    const timer = setInterval(() => {
      setLockoutSec((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [lockoutSec]);

  // Biometric Login Handler
  const handleBiometricLogin = async () => {
    if (isVerifyingBiometric || lockoutSec > 0) return;

    setIsVerifyingBiometric(true);
    setBiometricError(null);
    setErrorMessage(null);

    try {
      const result = await authenticateWithBiometric();
      if (result.success) {
        onAuthenticated();
      } else if (result.error) {
        setBiometricError(result.error);
      }
    } catch {
      setBiometricError('Gagal verifikasi biometrik.');
    } finally {
      setIsVerifyingBiometric(false);
    }
  };

  // Password Login Handler
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password || isVerifying || lockoutSec > 0) return;

    setIsVerifying(true);
    setErrorMessage(null);
    setBiometricError(null);

    try {
      const isMatch = await verifyPasswordHash(password, expectedHash, configuredSalt);

      if (isMatch) {
        authenticateSession();

        if (isBiometricSupported && !isRegistered && !isBiometricPromptDismissed()) {
          setShowRegisterPrompt(true);
        } else {
          onAuthenticated();
        }
      } else {
        const attemptResult = recordFailedAttempt();
        setIsShaking(true);
        setTimeout(() => setIsShaking(false), 500);

        if (attemptResult.isLocked) {
          setLockoutSec(attemptResult.remainingSec);
          setErrorMessage(`Terkunci (${attemptResult.remainingSec}s)`);
        } else {
          setErrorMessage(`Sandi salah (${attemptResult.attemptsLeft}x lagi)`);
        }
        setPassword('');
        inputRef.current?.focus();
      }
    } catch {
      setErrorMessage('Gagal memverifikasi sandi.');
    } finally {
      setIsVerifying(false);
    }
  };

  // Registration after password login handler
  const handleRegisterBiometricNow = async () => {
    setIsRegisteringBiometric(true);
    setRegisterError(null);

    try {
      const res = await registerBiometricCredential();
      if (res.success) {
        setIsRegistered(true);
        onAuthenticated();
      } else if (res.error) {
        setRegisterError(res.error);
      }
    } catch {
      setRegisterError('Gagal mendaftar biometrik.');
    } finally {
      setIsRegisteringBiometric(false);
    }
  };

  // User explicitly skips post-login biometric setup
  const handleSkipRegistration = () => {
    setBiometricPromptDismissed(true);
    onAuthenticated();
  };

  return (
    <div className="min-h-screen ui-page flex flex-col justify-center items-center p-4">
      <div className="w-full max-w-[280px] space-y-3.5">
        {/* Minimalist Brand Logo & App Name */}
        <div className="flex flex-col items-center text-center">
          <BrandLogo className="w-9 h-9 mb-1.5" />
          <h1
            className="text-base font-normal tracking-tight ui-text-main"
            style={{
              fontFamily: 'var(--font-display)',
              fontVariationSettings: '"opsz" 48, "SOFT" 10, "WONK" 0',
            }}
          >
            {showRegisterPrompt ? 'Aktivasi Biometrik' : 'QuantPorto'}
          </h1>
          <span className="font-mono text-[9px] uppercase tracking-wider text-[#21543D] dark:text-[#68B68E] mt-0.5">
            Rp10M Edition
          </span>
        </div>

        {/* Minimalist Card */}
        <div
          className={`ui-card rounded-[var(--radius-lg)] p-4 shadow-surface transition duration-150 ${
            isShaking ? 'animate-shake border-[#9E472A]/50' : ''
          }`}
        >
          {showRegisterPrompt ? (
            /* Post-Login Biometric Registration (Minimalist) */
            <div className="space-y-3 text-center">
              <Fingerprint className="w-6 h-6 mx-auto text-[#21543D] dark:text-[#68B68E]" />
              <p className="text-xs ui-text-main font-medium">
                Aktifkan biometrik perangkat?
              </p>

              {registerError && (
                <div className="p-1.5 rounded-[var(--radius-xs)] bg-[#9E472A]/10 border border-[#9E472A]/30 text-[#9E472A] dark:text-[#E08263] text-[11px]">
                  {registerError}
                </div>
              )}

              <div className="flex gap-1.5 pt-1">
                <button
                  type="button"
                  onClick={handleSkipRegistration}
                  disabled={isRegisteringBiometric}
                  className="flex-1 ui-subtle ui-text-muted hover:ui-text-main text-xs py-1.5 rounded-[var(--radius-sm)] transition"
                >
                  Lewati
                </button>
                <button
                  type="button"
                  onClick={handleRegisterBiometricNow}
                  disabled={isRegisteringBiometric}
                  className="flex-1 bg-[#21543D] hover:bg-[#173D2C] dark:bg-[#68B68E] dark:hover:bg-[#82C7A3] disabled:opacity-50 text-[#F9F8F4] dark:text-[#111613] font-medium text-xs py-1.5 rounded-[var(--radius-sm)] transition"
                >
                  {isRegisteringBiometric ? '...' : 'Aktifkan'}
                </button>
              </div>
            </div>
          ) : (
            /* Minimalist Login Form */
            <div className="space-y-3">
              {/* Biometric Button if registered */}
              {isRegistered && isBiometricSupported && (
                <div className="space-y-2">
                  <button
                    type="button"
                    id="biometric-login-btn"
                    onClick={handleBiometricLogin}
                    disabled={isVerifyingBiometric || lockoutSec > 0}
                    aria-label="Masuk dengan Sidik Jari"
                    className="w-full py-2 px-3 bg-[#21543D]/10 hover:bg-[#21543D]/20 border border-[#21543D]/30 text-[#21543D] dark:bg-[#68B68E]/10 dark:hover:bg-[#68B68E]/20 dark:border-[#68B68E]/30 dark:text-[#68B68E] font-medium text-xs rounded-[var(--radius-sm)] flex items-center justify-center gap-1.5 transition disabled:opacity-50"
                  >
                    <Fingerprint
                      className={`w-4 h-4 ${isVerifyingBiometric ? 'animate-pulse' : ''}`}
                    />
                    <span>
                      {isVerifyingBiometric ? 'Memindai...' : 'Sidik Jari'}
                    </span>
                  </button>

                  {biometricError && (
                    <div className="p-1.5 rounded-[var(--radius-xs)] bg-[#9E472A]/10 border border-[#9E472A]/30 text-[#9E472A] dark:text-[#E08263] text-[11px] text-center">
                      {biometricError}
                    </div>
                  )}

                  <div className="flex items-center gap-2 pt-0.5">
                    <div className="flex-1 border-t ui-border" />
                    <span className="text-[10px] ui-text-muted uppercase tracking-wider">
                      atau sandi
                    </span>
                    <div className="flex-1 border-t ui-border" />
                  </div>
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-2.5">
                <div className="relative">
                  <input
                    ref={inputRef}
                    id="access-password"
                    name="password"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    disabled={isVerifying || lockoutSec > 0}
                    placeholder={lockoutSec > 0 ? `Tunggu ${lockoutSec}s...` : 'Sandi...'}
                    autoComplete="current-password"
                    autoCorrect="off"
                    autoCapitalize="off"
                    spellCheck={false}
                    className="w-full ui-input disabled:opacity-50 rounded-lg pl-3 pr-8 py-2 text-xs placeholder:text-zinc-500 transition"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((prev) => !prev)}
                    aria-pressed={showPassword}
                    className="absolute inset-y-0 right-0 pr-2.5 flex items-center ui-text-muted hover:ui-text-main transition"
                    aria-label={showPassword ? 'Sembunyikan sandi' : 'Tampilkan sandi'}
                  >
                    {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                </div>

                {/* Lockout or Error message */}
                {lockoutSec > 0 ? (
                  <div className="text-[11px] text-amber-600 dark:text-amber-400 text-center font-mono py-0.5">
                    Tunggu {lockoutSec} detik
                  </div>
                ) : errorMessage ? (
                  <div className="text-[11px] text-rose-500 text-center py-0.5">
                    {errorMessage}
                  </div>
                ) : null}

                <button
                  type="submit"
                  disabled={!password || isVerifying || lockoutSec > 0}
                  className="w-full flex items-center justify-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white font-medium text-xs py-2 rounded-lg transition shadow-2xs"
                >
                  <span>{isVerifying ? 'Memeriksa...' : 'Buka'}</span>
                  {!isVerifying && <ArrowRight className="w-3.5 h-3.5" />}
                </button>
              </form>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
