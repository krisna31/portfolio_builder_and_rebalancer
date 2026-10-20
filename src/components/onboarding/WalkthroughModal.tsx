import React, { useEffect, useId, useRef, useState } from 'react';
import {
  Sparkles,
  Scale,
  Sliders,
  TrendingUp,
  CheckCircle2,
  ArrowRight,
  ArrowLeft,
  X,
  Compass,
} from 'lucide-react';
import { BrandLogo } from '../BrandLogo';

interface WalkthroughModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenRecommender: () => void;
}

interface WalkthroughStep {
  badge: string;
  title: string;
  subtitle: string;
  points: { title: string; desc: string }[];
  videoTimestamp: string;
}

const WALKTHROUGH_STEPS: WalkthroughStep[] = [
  {
    badge: 'Langkah 1 dari 4 • Konsep Dasar',
    title: 'Selamat Datang di QuantPorto (Reverse-Engineered Rp 10M Pertama)',
    subtitle:
      'Aplikasi ini membedah rumus kuantitatif dari video Leon Hartono & Sander (eks Quant Strategist AS) agar kamu tidak perlu menebak-nebak bobot investasi.',
    videoTimestamp: 'Menit 00:13 – 13:55',
    points: [
      {
        title: 'Kenapa Bukan Bagi Rata Modal (Equal Weight)?',
        desc: 'Jika kamu menaruh 50% di Obligasi (RDPT) dan 50% di Bitcoin, 95% fluktuasi portfoliomu tetap dikendalikan oleh Bitcoin. Risk Parity membagi rata RISIKO-nya, bukan modalnya.',
      },
      {
        title: '15 Portfolio Terbaik & Filter Pareto',
        desc: 'Dari puluhan kombinasi aset, hanya 15 portfolio yang paling efisien (return tertinggi untuk tingkat risiko penurunan/Max Drawdown yang sama).',
      },
      {
        title: 'Bisa Kustomisasi Kolom Instrumen (Contoh: BBCA ➔ PTBA)',
        desc: 'Di header tabel utama, kamu bisa mengganti benchmark standar (seperti BBCA) menjadi saham dividen tinggi (seperti PTBA atau AADI) dan seluruh 15 baris otomatis dihitung ulang.',
      },
    ],
  },
  {
    badge: 'Langkah 2 dari 4 • Custom Quant Lab',
    title: 'Racik Portfolio Sendiri & Cari Estimasi Saham Apa Saja',
    subtitle:
      'Ingin memilih instrumen sendiri atau punya keyakinan (conviction) di aset tertentu? Gunakan Custom Portfolio Quant Lab.',
    videoTimestamp: 'Menit 08:25 – 10:15',
    points: [
      {
        title: 'Tanya Quant / Kuis Rekomendasi Otomatis',
        desc: 'Bingung mulai dari mana? Klik tombol "Tanya Quant (Rekomendasi Portfolio)" untuk menjawab 4 pertanyaan pilihan ganda dan dapatkan estimasi bobot terbaik.',
      },
      {
        title: 'Tambah Ticker Saham IDX / US / Crypto (AADI.JK, PTBA, NVDA)',
        desc: 'Ketik simbol ticker Yahoo Finance. Sistem menyajikan estimasi CAGR, Max Drawdown, & asumsi risiko (termasuk penyesuaian konservatif untuk saham IPO baru < 3 tahun seperti AADI).',
      },
      {
        title: 'Pin Racikanmu ke Tabel Utama (+ Masukkan ke Tabel)',
        desc: 'Setiap racikan custom bisa kamu sematkan menjadi baris baru di tabel utama untuk dibandingkan berdampingan dengan 15 preset video.',
      },
    ],
  },
  {
    badge: 'Langkah 3 dari 4 • Rebalancer & Crash Ladder',
    title: 'Disiplin Rebalancing & Siapkan Jaring Limit Order Saat Crash',
    subtitle:
      'Rahasia utama supaya tidak jantungan saat market crash adalah memiliki aturan jual-beli otomatis (Menit 14:10 – 16:08).',
    videoTimestamp: 'Menit 14:10 – 16:08',
    points: [
      {
        title: 'Simulasi Market Crash (-50%) & Bull Run (3x)',
        desc: 'Uji bagaimana nilai portfoliomu bertahan saat Crypto anjlok -50% atau saham koreksi -35%, lengkap dengan instruksi nominal Rupiah & jumlah Lot/Unit yang harus dibeli/dijual.',
      },
      {
        title: 'Pre-Planned Limit Order Ladder (-10%, -20%, -35%, -50%)',
        desc: 'Tidak perlu memantau layar tiap jam. Gunakan tabel Crash Buying Ladder untuk memasang antrean Limit Order dari sekarang yang didanai dari pencairan RDPT/Emas.',
      },
      {
        title: '1-Klik Catat ke Jurnal Rebalancing',
        desc: 'Setelah eksekusi di sekuritas/exchange, klik "Catat & Terapkan Rebalance Ini" untuk memperbarui posisi awal dan memantau kurva pertumbuhan Net Worth.',
      },
    ],
  },
  {
    badge: 'Langkah 4 dari 4 • Roadmap & Dividen Pasif',
    title: 'Simulasi Rp 1 Miliar – Rp 10 Miliar Pertama & Gaji Pasif Dividen',
    subtitle:
      'Lihat kapan modal awal Rp 100 Juta + tabungan rutinmu mencapai Rp 1 Miliar dan Rp 10 Miliar, beserta arus kas pasifnya.',
    videoTimestamp: 'Menit 02:48 – 03:56',
    points: [
      {
        title: 'Kalkulator Dividen Bersih (Pajak IDX 10% / Bebas Pajak Reinvestasi)',
        desc: 'Hitung berapa Rupiah dividen tahunan & setara gaji pasif bulanan dari kombinasi kupon RDPT, saham dividen (PTBA/BBRI/BBCA/AADI), dan ETF US.',
      },
      {
        title: 'Backtest 5 Tahun: Rebalance 3 Bulan vs Buy & Hold',
        desc: 'Buktikan secara visual bagaimana rebalancing tiap kuartal (3 bulan) memanen profit saat bull run 2021 dan menahan kejatuhan saat bear market 2022.',
      },
      {
        title: '100% Client-Side & Bisa Di-Share / Backup JSON',
        desc: 'Seluruh data tersimpan aman di browsermu (LocalStorage), mendukung Light/Dark Mode minimalis, dan siap di-deploy ke GitHub Pages.',
      },
    ],
  },
];

export const WalkthroughModal: React.FC<WalkthroughModalProps> = ({
  isOpen,
  onClose,
  onOpenRecommender,
}) => {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [stepIndex, setStepIndex] = useState(0);

  // Sync modal open/close state with native <dialog> top-layer API
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (isOpen) {
      setStepIndex(0);
      if (!dialog.open) {
        dialog.showModal();
      }
    } else if (dialog.open) {
      dialog.close();
    }
  }, [isOpen]);

  // Fallback for browsers that do not yet support declarative closedby="any"
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    const handleClose = () => {
      onClose();
    };
    dialog.addEventListener('close', handleClose);

    const handleBackdropClick = (event: MouseEvent) => {
      if (!('closedBy' in HTMLDialogElement.prototype)) {
        if (event.target !== dialog) return;
        const rect = dialog.getBoundingClientRect();
        const isDialogContent =
          rect.top <= event.clientY &&
          event.clientY <= rect.top + rect.height &&
          rect.left <= event.clientX &&
          event.clientX <= rect.left + rect.width;
        if (!isDialogContent) {
          dialog.close();
        }
      }
    };
    dialog.addEventListener('click', handleBackdropClick);

    return () => {
      dialog.removeEventListener('close', handleClose);
      dialog.removeEventListener('click', handleBackdropClick);
    };
  }, [onClose]);

  const currentStep = WALKTHROUGH_STEPS[stepIndex];

  return (
    <dialog
      ref={dialogRef}
      {...({ closedby: 'any' } as React.DialogHTMLAttributes<HTMLDialogElement>)}
      aria-labelledby={titleId}
      className="ui-card ui-text-main m-auto w-full max-w-2xl rounded-2xl p-0 shadow-2xl backdrop:bg-black/60 backdrop:backdrop-blur-[2px]"
    >
      <div className="p-6">
        {/* Top Header */}
        <div className="ui-border flex items-center justify-between border-b pb-4">
          <div className="flex items-center gap-2.5">
            <BrandLogo className="h-8 w-8 shrink-0" />
            <div>
              <span className="rounded bg-emerald-500/10 px-2 py-0.5 font-mono text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
                {currentStep.badge}
              </span>
              <div className="ui-text-muted mt-0.5 text-[11px]">
                Referensi Video: {currentStep.videoTimestamp}
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={() => dialogRef.current?.close()}
            className="ui-subtle ui-text-muted hover:ui-text-main rounded-lg p-1.5"
            aria-label="Tutup panduan"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Step Content */}
        <div className="mt-5">
          <h2 id={titleId} className="ui-text-main text-base font-bold sm:text-lg">
            {currentStep.title}
          </h2>
          <p className="ui-text-secondary mt-1 text-xs leading-relaxed">
            {currentStep.subtitle}
          </p>

          <div className="mt-4 space-y-3">
            {currentStep.points.map((pt, i) => (
              <div
                key={i}
                className="ui-subtle flex items-start gap-3 rounded-xl p-3.5"
              >
                <div className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-600 font-mono text-[11px] font-bold text-white">
                  {i + 1}
                </div>
                <div>
                  <div className="ui-text-main text-xs font-bold">
                    {pt.title}
                  </div>
                  <p className="ui-text-muted mt-0.5 text-xs leading-relaxed">
                    {pt.desc}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Step Indicator Dots */}
        <div className="mt-5 flex items-center justify-center gap-1.5">
          {WALKTHROUGH_STEPS.map((_, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => setStepIndex(idx)}
              aria-label={`Ke langkah ${idx + 1}`}
              className={`h-2 rounded-full transition-all ${
                idx === stepIndex
                  ? 'w-6 bg-emerald-600'
                  : 'ui-subtle w-2 hover:opacity-80'
              }`}
            />
          ))}
        </div>

        {/* Footer Actions */}
        <div className="ui-border mt-5 flex flex-col gap-2.5 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
          <button
            type="button"
            onClick={() => {
              dialogRef.current?.close();
              onOpenRecommender();
            }}
            className="flex items-center justify-center gap-1.5 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3.5 py-2 text-xs font-semibold text-emerald-700 hover:bg-emerald-500/20 dark:text-emerald-300"
          >
            <Compass className="h-3.5 w-3.5" />
            <span>Bantu Pilihkan Portfolio Saya (Kuis 30 Detik)</span>
          </button>

          <div className="flex items-center justify-end gap-2">
            {stepIndex > 0 && (
              <button
                type="button"
                onClick={() => setStepIndex((s) => s - 1)}
                className="ui-subtle ui-text-main flex items-center gap-1 rounded-lg px-3 py-2 text-xs font-medium"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                <span>Sebelumnya</span>
              </button>
            )}

            {stepIndex < WALKTHROUGH_STEPS.length - 1 ? (
              <button
                type="button"
                onClick={() => setStepIndex((s) => s + 1)}
                className="flex items-center gap-1 rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-500"
              >
                <span>Lanjut</span>
                <ArrowRight className="h-3.5 w-3.5" />
              </button>
            ) : (
              <button
                type="button"
                onClick={() => dialogRef.current?.close()}
                className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-500"
              >
                <CheckCircle2 className="h-3.5 w-3.5" />
                <span>Mulai Gunakan QuantPorto</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </dialog>
  );
};
