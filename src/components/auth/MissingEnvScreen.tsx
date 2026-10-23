import React, { useState } from 'react';
import { ShieldAlert, KeyRound, Copy, Check, Terminal, ExternalLink, RefreshCw } from 'lucide-react';
import { BrandLogo } from '../BrandLogo';
import { sha256Hash } from '../../lib/auth/authUtils';

export const MissingEnvScreen: React.FC = () => {
  const [inputPassword, setInputPassword] = useState('');
  const [generatedHash, setGeneratedHash] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputPassword.trim()) return;

    setIsGenerating(true);
    try {
      const hash = await sha256Hash(inputPassword);
      setGeneratedHash(hash);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleCopyEnvLine = () => {
    if (!generatedHash) return;
    const textToCopy = `VITE_APP_PASSWORD_HASH=${generatedHash}`;
    navigator.clipboard.writeText(textToCopy);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-center items-center p-4 sm:p-6 selection:bg-rose-500/30">
      <div className="w-full max-w-xl space-y-6">
        {/* Brand Header */}
        <div className="flex flex-col items-center text-center space-y-2">
          <BrandLogo className="w-12 h-12" />
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs font-semibold tracking-wide uppercase mt-2">
            <ShieldAlert className="w-3.5 h-3.5" />
            <span>Keamanan Akses Terproteksi</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white mt-1">
            Konfigurasi Sandi Belum Ditemukan
          </h1>
          <p className="text-sm text-slate-400 max-w-md">
            Sesuai standar keamanan, QuantPorto mewajibkan variabel lingkungan{' '}
            <code className="text-rose-400 font-mono bg-rose-950/40 px-1.5 py-0.5 rounded border border-rose-800/40">
              VITE_APP_PASSWORD_HASH
            </code>{' '}
            disetel di file <code className="text-slate-300 font-mono">.env</code> sebelum aplikasi dapat dibuka.
          </p>
        </div>

        {/* Interactive Hash Generator Card */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 sm:p-6 shadow-2xl backdrop-blur space-y-5">
          <div className="flex items-center gap-2 text-sm font-semibold text-emerald-400">
            <KeyRound className="w-4 h-4" />
            <span>Alat Generator Hash SHA-256 Otomatis</span>
          </div>

          <form onSubmit={handleGenerate} className="space-y-3">
            <div>
              <label htmlFor="dev-pass-input" className="block text-xs font-medium text-slate-300 mb-1">
                Ketik sandi akses yang Anda inginkan:
              </label>
              <div className="flex gap-2">
                <input
                  id="dev-pass-input"
                  type="text"
                  value={inputPassword}
                  onChange={(e) => setInputPassword(e.target.value)}
                  placeholder="Contoh: passwordRahasia2026"
                  className="flex-1 bg-slate-950 border border-slate-700 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 rounded-lg px-3.5 py-2 text-sm font-mono text-white placeholder:text-slate-600 outline-none transition"
                />
                <button
                  type="submit"
                  disabled={!inputPassword.trim() || isGenerating}
                  className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-semibold text-xs px-4 py-2 rounded-lg transition shrink-0"
                >
                  {isGenerating ? 'Membuat...' : 'Buat Hash'}
                </button>
              </div>
            </div>
          </form>

          {/* Generated Result */}
          {generatedHash && (
            <div className="space-y-2 pt-2 border-t border-slate-800">
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span>Hasil Hash SHA-256 untuk file .env:</span>
                <span className="text-[10px] text-emerald-400 font-mono">64-char Hexadecimal</span>
              </div>
              <div className="flex items-center justify-between gap-2 p-3 bg-slate-950 border border-slate-700/80 rounded-lg font-mono text-xs">
                <span className="truncate text-emerald-300 select-all">
                  VITE_APP_PASSWORD_HASH={generatedHash}
                </span>
                <button
                  type="button"
                  onClick={handleCopyEnvLine}
                  className="shrink-0 flex items-center gap-1 px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium transition"
                  title="Salin baris konfigurasi ke clipboard"
                >
                  {copied ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                      <span className="text-emerald-400">Tersalin!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      <span>Salin</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          )}

          {/* Instructions */}
          <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-4 text-xs text-slate-400 space-y-2">
            <div className="flex items-center gap-1.5 font-semibold text-slate-200">
              <Terminal className="w-3.5 h-3.5 text-sky-400" />
              <span>Langkah Pemasangan Cepat untuk Pengembang:</span>
            </div>
            <ol className="list-decimal list-inside space-y-1.5 text-slate-300 pl-1 leading-relaxed">
              <li>
                Buat atau buka file <code className="text-amber-300 font-mono">.env</code> di direktori utama proyek.
              </li>
              <li>
                Tempelkan baris <code className="text-emerald-400 font-mono">VITE_APP_PASSWORD_HASH=&lt;hash_anda&gt;</code> ke dalam file tersebut.
              </li>
              <li>
                Restart dev server Vite Anda (tekan <kbd className="bg-slate-800 px-1 py-0.5 rounded border border-slate-700 text-[10px]">Ctrl+C</kbd> lalu jalankan ulang <code className="text-sky-300 font-mono">npm run dev</code>).
              </li>
            </ol>
          </div>

          <div className="flex items-center justify-center pt-1">
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-200 transition"
            >
              <RefreshCw className="w-3 h-3" />
              <span>Sudah menyetel .env? Muat Ulang Halaman</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
