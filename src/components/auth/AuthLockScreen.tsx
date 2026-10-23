import React, { useEffect, useRef, useState } from 'react';
import { Lock, Eye, EyeOff, ShieldCheck, AlertCircle, Clock, ArrowRight } from 'lucide-react';
import { BrandLogo } from '../BrandLogo';
import {
  sha256Hash,
  authenticateSession,
  recordFailedAttempt,
  getRemainingLockoutSeconds,
  MAX_AUTH_ATTEMPTS,
} from '../../lib/auth/authUtils';

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

  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-focus input on mount
  useEffect(() => {
    if (lockoutSec <= 0) {
      inputRef.current?.focus();
    }
  }, [lockoutSec]);

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password || isVerifying || lockoutSec > 0) return;

    setIsVerifying(true);
    setErrorMessage(null);

    try {
      const computed = await sha256Hash(password);
      const isMatch = computed.toLowerCase().trim() === expectedHash.toLowerCase().trim();

      if (isMatch) {
        authenticateSession();
        onAuthenticated();
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

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-center items-center p-4 selection:bg-emerald-500/30">
      {/* Background Ambience */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-emerald-500/10 blur-[120px] rounded-full" />
        <div className="absolute bottom-1/4 left-1/3 -translate-x-1/2 w-80 h-80 bg-sky-500/10 blur-[100px] rounded-full" />
      </div>

      <div className="w-full max-w-md relative z-10 space-y-6">
        {/* Brand & Security Title */}
        <div className="flex flex-col items-center text-center space-y-2">
          <BrandLogo className="w-12 h-12" />
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-semibold tracking-wide uppercase mt-1">
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>Sesi Akses Portofolio Terproteksi</span>
          </div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-white mt-1">
            Masukkan Kata Sandi
          </h1>
          <p className="text-xs text-slate-400 max-w-xs">
            Akses dashboard QuantPorto dilindungi untuk keamanan strategi investasi dan data portofolio Anda.
          </p>
        </div>

        {/* Lock Screen Card */}
        <div
          className={`bg-slate-900/90 border border-slate-800 rounded-2xl p-6 shadow-2xl backdrop-blur transition duration-200 ${
            isShaking ? 'animate-shake border-rose-500/50' : ''
          }`}
        >
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
                <Clock className="w-4 h-4 shrink-0 animate-pulse" />
                <span>
                  Terlalu banyak percobaan. Silakan tunggu{' '}
                  <strong className="font-mono font-bold text-amber-300">{lockoutSec} detik</strong>{' '}
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
              className="w-full flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:hover:bg-emerald-600 text-white font-semibold text-sm py-2.5 rounded-xl shadow-lg shadow-emerald-950/40 transition duration-150 active:scale-[0.99]"
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
