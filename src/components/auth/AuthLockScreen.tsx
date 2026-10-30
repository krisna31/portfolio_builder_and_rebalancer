import React, { useEffect, useRef, useState } from 'react';
import {
  Lock,
  Eye,
  EyeOff,
  ShieldCheck,
  AlertCircle,
  Clock,
  ArrowRight,
  Fingerprint,
} from 'lucide-react';
import { BrandLogo } from '../BrandLogo';
import { stopInteractiveTour } from '../../services/tourGuide';
import {
  sha256Hash,
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
  onAuthenticated: () => void;
}

export const AuthLockScreen: React.FC<AuthLockScreenProps> = ({
  expectedHash,
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
          // Biometric is supported if platform authenticator is physically available OR already registered
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

  // Biometric Instant Login Handler
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
      setBiometricError('Terjadi kendala saat memverifikasi sensor sidik jari.');
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
      const computed = await sha256Hash(password);
      const isMatch = computed.toLowerCase().trim() === expectedHash.toLowerCase().trim();

      if (isMatch) {
        authenticateSession();

        // If biometric is supported on this device but not yet registered and not dismissed, offer registration
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
          setErrorMessage(
            `Terlalu banyak percobaan salah (${MAX_AUTH_ATTEMPTS}/${MAX_AUTH_ATTEMPTS}). Akses ditangguhkan sementara.`
          );
        } else {
          setErrorMessage(
            `Kata sandi salah. Sisa kesempatan: ${attemptResult.attemptsLeft} dari ${MAX_AUTH_ATTEMPTS}.`
          );
        }
        setPassword('');
        inputRef.current?.focus();
      }
    } catch {
      setErrorMessage('Terjadi kesalahan saat memverifikasi sandi. Silakan coba lagi.');
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
      setRegisterError('Gagal mendaftarkan sidik jari di perangkat ini.');
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
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col justify-center items-center p-4 selection:bg-emerald-500/30">


      <div className="w-full max-w-md relative z-10 space-y-6">
        {/* Brand & Security Title */}
        <div className="flex flex-col items-center text-center space-y-2">
          <BrandLogo className="w-12 h-12" />
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-semibold tracking-wide uppercase mt-1">
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>Sesi Akses Portofolio Terproteksi</span>
          </div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-white mt-1">
            {showRegisterPrompt ? 'Pendaftaran Sidik Jari' : 'Masukkan Kata Sandi'}
          </h1>
          <p className="text-xs text-slate-400 max-w-xs">
            {showRegisterPrompt
              ? 'Daftarkan sensor biometrik perangkat ini untuk kemudahan login cepat di masa mendatang.'
              : 'Akses dashboard QuantPorto dilindungi untuk keamanan strategi investasi dan data portofolio Anda.'}
          </p>
        </div>

        {/* Lock Screen Card */}
        <div
          className={`bg-zinc-900 border border-zinc-800 rounded-xl p-6 shadow-sm transition duration-150 ${
            isShaking ? 'animate-shake border-rose-500/50' : ''
          }`}
        >
          {showRegisterPrompt ? (
            /* Post-Login Biometric Registration Prompt */
            <div className="space-y-4 text-center">
              <div className="mx-auto w-12 h-12 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 shadow-inner">
                <Fingerprint className="w-8 h-8" />
              </div>

              <div>
                <h2 className="text-base font-bold text-white">
                  Aktifkan Login Sidik Jari?
                </h2>
                <p className="text-xs text-slate-400 mt-1.5 leading-relaxed">
                  Buka kunci dashboard pada browser ini langsung dengan sensor sidik jari (Windows Hello / Touch ID) tanpa mengetik kata sandi lagi.
                </p>
              </div>

              {registerError && (
                <div className="flex items-center gap-2 p-2.5 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs text-left">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{registerError}</span>
                </div>
              )}

              <div className="space-y-2 pt-2">
                <button
                  type="button"
                  onClick={handleRegisterBiometricNow}
                  disabled={isRegisteringBiometric}
                  className="w-full flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-semibold text-sm py-2.5 rounded-xl transition duration-150"
                >
                  <Fingerprint className={`w-4 h-4 ${isRegisteringBiometric ? 'animate-pulse' : ''}`} />
                  <span>
                    {isRegisteringBiometric ? 'Memindai Sensor...' : 'Aktifkan Sidik Jari Sekarang'}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={handleSkipRegistration}
                  disabled={isRegisteringBiometric}
                  className="w-full flex items-center justify-center gap-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium text-xs py-2 rounded-xl transition"
                >
                  <span>Lewati (Lanjut ke Dashboard)</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ) : (
            /* Normal Login Card */
            <div>
              {/* Prominent Biometric Login Button when registered & supported */}
              {isRegistered && isBiometricSupported && (
                <div className="space-y-3 mb-5">
                  <button
                    type="button"
                    id="biometric-login-btn"
                    onClick={handleBiometricLogin}
                    disabled={isVerifyingBiometric || lockoutSec > 0}
                    aria-label="Masuk dengan Sidik Jari atau Biometrik"
                    className="w-full py-3 px-4 bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-500/40 hover:border-emerald-500/70 text-emerald-300 font-semibold rounded-xl flex items-center justify-center gap-2.5 transition-all disabled:opacity-50"
                  >
                    <Fingerprint
                      className={`w-5 h-5 text-emerald-400 ${
                        isVerifyingBiometric ? 'animate-pulse' : ''
                      }`}
                    />
                    <span>
                      {isVerifyingBiometric ? 'Memindai Sidik Jari...' : 'Masuk dengan Sidik Jari'}
                    </span>
                  </button>

                  {biometricError && (
                    <div className="flex items-center gap-2 p-2.5 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs">
                      <AlertCircle className="w-4 h-4 shrink-0" />
                      <span>{biometricError}</span>
                    </div>
                  )}

                  <div className="flex items-center gap-3">
                    <div className="flex-1 h-px bg-slate-800" />
                    <span className="text-[10px] text-slate-500 uppercase tracking-wider font-medium">
                      atau gunakan kata sandi
                    </span>
                    <div className="flex-1 h-px bg-slate-800" />
                  </div>
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label
                    htmlFor="access-password"
                    className="block text-xs font-medium text-slate-300 mb-1.5"
                  >
                    Kata Sandi Akses:
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
                      <Lock className="w-4 h-4" />
                    </div>
                    <input
                      ref={inputRef}
                      id="access-password"
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      disabled={isVerifying || lockoutSec > 0}
                      placeholder={lockoutSec > 0 ? 'Terkunci sementara...' : 'Ketik kata sandi...'}
                      autoComplete="current-password"
                      className="w-full bg-slate-950 border border-slate-700 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 disabled:opacity-50 disabled:bg-slate-900 rounded-xl pl-10 pr-11 py-2.5 text-sm text-white placeholder:text-slate-600 outline-none transition"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((prev) => !prev)}
                      tabIndex={-1}
                      className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-400 hover:text-slate-200 transition"
                      aria-label={showPassword ? 'Sembunyikan sandi' : 'Tampilkan sandi'}
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {/* Error / Lockout Banner */}
                {lockoutSec > 0 ? (
                  <div className="flex items-center gap-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-400 text-xs">
                    <Clock className="w-4 h-4 shrink-0" />
                    <span>
                      Terlalu banyak percobaan. Silakan tunggu{' '}
                      <strong className="font-mono font-bold text-amber-300">
                        {lockoutSec} detik
                      </strong>{' '}
                      lagi.
                    </span>
                  </div>
                ) : errorMessage ? (
                  <div className="flex items-center gap-2 p-3 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>{errorMessage}</span>
                  </div>
                ) : null}

                {/* Submit Button */}
                <button
                  type="submit"
                  disabled={!password || isVerifying || lockoutSec > 0}
                  className="w-full flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:hover:bg-emerald-600 text-white font-semibold text-sm py-2.5 rounded-xl transition duration-150"
                >
                  {isVerifying ? (
                    <span>Memverifikasi...</span>
                  ) : (
                    <>
                      <span>Buka Dashboard</span>
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </form>
            </div>
          )}

          {/* Tab Session Note */}
          <div className="mt-4 pt-4 border-t border-slate-800 text-center">
            <p className="text-[11px] text-slate-500">
              Sesi login aktif selama tab browser ini terbuka. Gunakan tombol Kunci di Header untuk mengunci sewaktu-waktu.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
