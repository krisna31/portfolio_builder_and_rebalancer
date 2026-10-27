import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { AssetDefinition, PortfolioPreset } from '../../lib/quant/types';
import {
  ConvictionPreferenceType,
  CrashToleranceType,
  generatePortfolioRecommendations,
  InvestorProfileType,
  PortfolioRecommendationItem,
  UserDiagnosticAnswers,
} from '../../lib/quant/portfolioRecommender';
import { formatIdr } from '../../lib/formatters';
import {
  Compass,
  Check,
  Pin,
  ArrowRight,
  X,
  ShieldCheck,
  Sparkles,
  CheckSquare,
  Square,
} from 'lucide-react';

interface SmartPortfolioRecommenderModalProps {
  isOpen: boolean;
  onClose: () => void;
  allAssets: AssetDefinition[];
  presets: PortfolioPreset[];
  initialCapitalIdr: number;
  monthlySavingsIdr: number;
  targetGoalIdr: number;
  onApplyRecommendation: (
    rec: PortfolioRecommendationItem,
    slotMapChoice: Record<string, string>,
    pinToTable: boolean,
    goToRebalancer: boolean
  ) => void;
}

export const SmartPortfolioRecommenderModal: React.FC<
  SmartPortfolioRecommenderModalProps
> = ({
  isOpen,
  onClose,
  allAssets,
  presets,
  initialCapitalIdr,
  monthlySavingsIdr,
  targetGoalIdr,
  onApplyRecommendation,
}) => {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  // Questionnaire Answers State (with sensible defaults)
  const [assetSelectionPreset, setAssetSelectionPreset] = useState<
    'all-default' | 'no-crypto' | 'high-dividend-idx' | 'custom-pick'
  >('all-default');

  const [selectedAssetIds, setSelectedAssetIds] = useState<string[]>([
    'RDPT',
    'BBCA',
    'GLD',
    'SPY',
    'QQQ',
    'BTC',
    'ETH',
  ]);

  const [idxEquitySlotChoice, setIdxEquitySlotChoice] = useState<
    'BBCA' | 'PTBA' | 'AADI'
  >('BBCA');

  const [profile, setProfile] =
    useState<InvestorProfileType>('balanced-quant');

  const [crashTolerance, setCrashTolerance] =
    useState<CrashToleranceType>('moderat');

  const [convictionPreference, setConvictionPreference] =
    useState<ConvictionPreferenceType>('auto-equal');

  // Sync modal open/close with native <dialog>
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (isOpen) {
      if (!dialog.open) {
        dialog.showModal();
      }
    } else if (dialog.open) {
      dialog.close();
    }
  }, [isOpen]);

  // Fallback for browsers without declarative closedby="any"
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

  const toggleCustomAssetId = (id: string) => {
    setAssetSelectionPreset('custom-pick');
    setSelectedAssetIds((prev) => {
      const exists = prev.includes(id);
      const next = exists ? prev.filter((x) => x !== id) : [...prev, id];
      return next.length > 0 ? next : [id];
    });
  };

  const answers: UserDiagnosticAnswers = useMemo(
    () => ({
      profile,
      crashTolerance,
      selectedAssetIds,
      assetSelectionPreset,
      convictionPreference,
      idxEquitySlotChoice,
      initialCapitalIdr,
      monthlySavingsIdr,
      targetGoalIdr,
    }),
    [
      profile,
      crashTolerance,
      selectedAssetIds,
      assetSelectionPreset,
      convictionPreference,
      idxEquitySlotChoice,
      initialCapitalIdr,
      monthlySavingsIdr,
      targetGoalIdr,
    ]
  );

  const recResult = useMemo(
    () => generatePortfolioRecommendations(answers, allAssets, presets),
    [answers, allAssets, presets]
  );

  const primary = recResult.primaryRecommendation;

  return (
    <dialog
      ref={dialogRef}
      {...({ closedby: 'any' } as React.DialogHTMLAttributes<HTMLDialogElement>)}
      aria-labelledby={titleId}
      className="ui-card ui-text-main m-auto max-h-[92vh] w-full max-w-5xl overflow-y-auto rounded-2xl p-0 shadow-2xl backdrop:bg-black/60 backdrop:backdrop-blur-[2px]"
    >
      <div className="p-5 sm:p-6">
        {/* Header */}
        <div className="ui-border flex items-start justify-between gap-3 border-b pb-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-600 text-white">
              <Compass className="h-5 w-5" />
            </div>
            <div>
              <h2 id={titleId} className="ui-text-main text-base font-bold">
                Tanya Quant: Asisten Penentu Portfolio Ideal Anda
              </h2>
              <p className="ui-text-muted text-xs">
                Jawab pilihan ganda di bawah (atau gunakan default semua instrumen)
                untuk mengestimasi pembagian bobot terbaik sesuai profil Anda:
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => dialogRef.current?.close()}
            className="ui-subtle ui-text-muted hover:ui-text-main rounded-lg p-1.5"
            aria-label="Tutup asisten rekomendasi"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Main 2-Column Layout: Left = Multiple Choice Questions, Right = Live Estimated Portfolio */}
        <div className="mt-5 grid grid-cols-1 gap-6 lg:grid-cols-12">
          {/* LEFT 7 COLS: MULTIPLE-CHOICE QUESTIONS */}
          <div className="space-y-5 lg:col-span-7">
            {/* Q1: Asset Universe Choice */}
            <div className="ui-subtle rounded-xl p-4">
              <div className="ui-text-main text-xs font-bold">
                1. Instrumen Investasi Apa Saja yang Ingin Anda Masukkan?
              </div>
              <p className="ui-text-muted mt-0.5 text-[11px]">
                Pilih paket instrumen atau centang sendiri aset yang Anda sukai:
              </p>

              <div className="mt-2.5 grid grid-cols-1 gap-2 sm:grid-cols-2">
                {[
                  {
                    id: 'all-default',
                    title: 'Semua Instrumen Ideal (Default Video)',
                    desc: '7 Aset: RDPT, Saham IDX, Emas, S&P500, Nasdaq, BTC, ETH',
                  },
                  {
                    id: 'no-crypto',
                    title: 'Tanpa Crypto (Konvensional)',
                    desc: 'Hanya Obligasi RDPT, Saham IDX, Emas (GLD), & ETF AS',
                  },
                  {
                    id: 'high-dividend-idx',
                    title: 'Fokus Dividen Tinggi & Cashflow',
                    desc: 'RDPT, PTBA, AADI, BBRI, BBCA, Emas (GLD), & SCHD',
                  },
                  {
                    id: 'custom-pick',
                    title: 'Pilih Instrumen Sendiri (Custom)',
                    desc: 'Centang bebas instrumen di bawah sesuai selera Anda',
                  },
                ].map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => {
                      const nextPreset = opt.id as typeof assetSelectionPreset;
                      setAssetSelectionPreset(nextPreset);
                      if (nextPreset === 'all-default') {
                        setSelectedAssetIds([
                          'RDPT',
                          idxEquitySlotChoice,
                          'GLD',
                          'SPY',
                          'QQQ',
                          'BTC',
                          'ETH',
                        ]);
                      } else if (nextPreset === 'no-crypto') {
                        setSelectedAssetIds([
                          'RDPU',
                          'RDPT',
                          idxEquitySlotChoice,
                          'GLD',
                          'SPY',
                          'QQQ',
                        ]);
                      } else if (nextPreset === 'high-dividend-idx') {
                        setSelectedAssetIds([
                          'RDPT',
                          'PTBA',
                          'AADI',
                          'BBRI',
                          'BBCA',
                          'GLD',
                          'SCHD',
                        ]);
                      }
                    }}
                    className={`rounded-lg border p-2.5 text-left transition ${
                      assetSelectionPreset === opt.id
                        ? 'border-emerald-500 bg-emerald-500/10'
                        : 'ui-card hover:opacity-90'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="ui-text-main text-xs font-semibold">
                        {opt.title}
                      </span>
                      {assetSelectionPreset === opt.id && (
                        <Check className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                      )}
                    </div>
                    <div className="ui-text-muted mt-0.5 text-[10px]">
                      {opt.desc}
                    </div>
                  </button>
                ))}
              </div>

              {/* Multi-Select Checkboxes for Individual Assets */}
              <div className="mt-3">
                <div className="ui-text-secondary mb-1.5 text-[11px] font-medium">
                  Centang/Hapus Instrumen Spesifik:
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {allAssets.map((a) => {
                    const isChecked =
                      assetSelectionPreset === 'all-default'
                        ? [
                            'RDPT',
                            idxEquitySlotChoice,
                            'GLD',
                            'SPY',
                            'QQQ',
                            'BTC',
                            'ETH',
                          ].includes(a.id)
                        : assetSelectionPreset === 'no-crypto'
                          ? [
                              'RDPU',
                              'RDPT',
                              idxEquitySlotChoice,
                              'GLD',
                              'SPY',
                              'QQQ',
                            ].includes(a.id)
                          : assetSelectionPreset === 'high-dividend-idx'
                            ? [
                                'RDPT',
                                'PTBA',
                                'AADI',
                                'BBRI',
                                'BBCA',
                                'GLD',
                                'SCHD',
                              ].includes(a.id)
                            : selectedAssetIds.includes(a.id);

                    return (
                      <button
                        key={a.id}
                        type="button"
                        onClick={() => toggleCustomAssetId(a.id)}
                        className={`flex items-center gap-1 rounded px-2 py-1 text-[11px] font-medium transition ${
                          isChecked
                            ? 'bg-emerald-600 font-semibold text-white'
                            : 'ui-card ui-text-muted'
                        }`}
                      >
                        {isChecked ? (
                          <CheckSquare className="h-3 w-3" />
                        ) : (
                          <Square className="h-3 w-3" />
                        )}
                        <span>{a.shortName}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* IDX Benchmark Slot Preference (BBCA vs PTBA vs AADI) */}
              <div className="ui-border mt-3 flex flex-wrap items-center justify-between gap-2 border-t pt-2.5 text-xs">
                <span className="ui-text-secondary font-medium">
                  Wakil Utama Saham Indonesia di Tabel:
                </span>
                <div className="flex gap-1.5">
                  {(
                    [
                      { id: 'BBCA', label: 'BBCA (Bank Bluechip)' },
                      { id: 'PTBA', label: 'PTBA (Dividen ~12.5%)' },
                      { id: 'AADI', label: 'AADI (Dividen Batubara)' },
                    ] as const
                  ).map((slotOpt) => (
                    <button
                      key={slotOpt.id}
                      type="button"
                      onClick={() => {
                        const oldSlot = idxEquitySlotChoice;
                        const newSlot = slotOpt.id;
                        setIdxEquitySlotChoice(newSlot);
                        // Bug 16 fix: Sync selectedAssetIds so swapping equity slot doesn't revert on checkbox click
                        setSelectedAssetIds((prev) => {
                          const filtered = prev.filter(
                            (id) => id !== oldSlot && id !== 'BBCA' && id !== 'PTBA' && id !== 'AADI'
                          );
                          return [...filtered, newSlot];
                        });
                      }}
                      className={`rounded px-2 py-1 text-[11px] font-medium ${
                        idxEquitySlotChoice === slotOpt.id
                          ? 'bg-emerald-600 font-semibold text-white'
                          : 'ui-card ui-text-secondary'
                      }`}
                    >
                      {slotOpt.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Q2: Investor Focus & Lifestyle Profile (00:59 - 03:56) */}
            <div className="ui-subtle rounded-xl p-4">
              <div className="ui-text-main text-xs font-bold">
                2. Apa Fokus Karir &amp; Target Investasi Anda (Menit 00:59)?
              </div>
              <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                {[
                  {
                    id: 'balanced-quant',
                    title: 'Seimbang: Karir + Investasi (Recommended)',
                    desc: 'Target CAGR 16%–26%/thn dengan risiko terukur',
                  },
                  {
                    id: 'proteksi-active-income',
                    title: 'Sibuk Kerja/Bisnis (Jaga Kekayaan)',
                    desc: 'Target CAGR 10%–15%/thn, fluktuasi sangat rendah',
                  },
                  {
                    id: 'aggressive-compounding',
                    title: 'Full-Time / Akselerasi Maksimal',
                    desc: 'Target CAGR 25%–38%+/thn demi compounding tercepat',
                  },
                  {
                    id: 'passive-dividend',
                    title: 'Prioritas Gaji Pasif & Dividen',
                    desc: 'Maksimalkan kupon RDPT & dividen saham tiap tahun',
                  },
                ].map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setProfile(opt.id as InvestorProfileType)}
                    className={`rounded-lg border p-2.5 text-left transition ${
                      profile === opt.id
                        ? 'border-emerald-500 bg-emerald-500/10'
                        : 'ui-card hover:opacity-90'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="ui-text-main text-xs font-semibold">
                        {opt.title}
                      </span>
                      {profile === opt.id && (
                        <Check className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                      )}
                    </div>
                    <div className="ui-text-muted mt-0.5 text-[10px]">
                      {opt.desc}
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Q3 & Q4: Crash Tolerance + Conviction Bias */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="ui-subtle rounded-xl p-4">
                <div className="ui-text-main text-xs font-bold">
                  3. Toleransi Saat Market Crash:
                </div>
                <div className="mt-2 space-y-1.5">
                  {[
                    {
                      id: 'konservatif',
                      label: 'Konservatif (Max Turun -5% s/d -8%)',
                    },
                    {
                      id: 'moderat',
                      label: 'Moderat (Max Turun -10% s/d -16%)',
                    },
                    {
                      id: 'agresif',
                      label: 'Agresif (Tahan Turun -20% s/d -40%+)',
                    },
                  ].map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => setCrashTolerance(c.id as CrashToleranceType)}
                      className={`flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left text-xs font-medium ${
                        crashTolerance === c.id
                          ? 'border-emerald-500 bg-emerald-500/10 font-semibold'
                          : 'ui-card'
                      }`}
                    >
                      <span>{c.label}</span>
                      {crashTolerance === c.id && (
                        <Check className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                      )}
                    </button>
                  ))}
                </div>
              </div>

              <div className="ui-subtle rounded-xl p-4">
                <div className="ui-text-main text-xs font-bold">
                  4. Aset Conviction Utama (Opsional):
                </div>
                <div className="mt-2 grid grid-cols-2 gap-1.5">
                  {[
                    { id: 'auto-equal', label: 'Risk Parity (Rata)' },
                    { id: 'BTC', label: 'Bullish BTC' },
                    { id: 'ETH', label: 'Bullish ETH' },
                    { id: 'US_TECH', label: 'Bullish US Tech' },
                    { id: 'IDX_EQUITY', label: 'Bullish Saham IDX' },
                    { id: 'GOLD_SAFE', label: 'Fokus Emas/RDPT' },
                  ].map((conv) => (
                    <button
                      key={conv.id}
                      type="button"
                      onClick={() =>
                        setConvictionPreference(
                          conv.id as ConvictionPreferenceType
                        )
                      }
                      className={`rounded-lg border px-2.5 py-2 text-left text-[11px] font-medium ${
                        convictionPreference === conv.id
                          ? 'border-emerald-500 bg-emerald-500/10 font-semibold'
                          : 'ui-card'
                      }`}
                    >
                      {conv.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* RIGHT 5 COLS: LIVE ESTIMATED PORTFOLIO RECOMMENDATION */}
          <div className="space-y-4 lg:col-span-5">
            <div className="ui-subtle rounded-xl border border-emerald-500/40 p-4">
              <div className="flex items-center justify-between">
                <span className="inline-flex items-center gap-1 rounded bg-emerald-600 px-2 py-0.5 text-[10px] font-bold text-white">
                  <Sparkles className="h-3 w-3" />
                  <span>{primary.badgeLabel}</span>
                </span>
                <span className="ui-text-muted font-mono text-[11px]">
                  Sharpe {primary.metrics.sharpeRatio.toFixed(2)}
                </span>
              </div>

              <h3 className="ui-text-main mt-2 text-sm font-bold">
                {primary.title}
              </h3>

              {/* KPI Metrics Grid */}
              <div className="mt-3 grid grid-cols-2 gap-2">
                <div className="ui-card rounded-lg p-2.5">
                  <div className="ui-text-muted text-[10px] uppercase">
                    Estimasi Return (CAGR)
                  </div>
                  <div className="font-mono text-lg font-bold text-emerald-600 dark:text-emerald-400">
                    {primary.metrics.cagr.toFixed(2)}% / thn
                  </div>
                </div>

                <div className="ui-card rounded-lg p-2.5">
                  <div className="ui-text-muted text-[10px] uppercase">
                    Max Drawdown (5Y)
                  </div>
                  <div className="font-mono text-lg font-bold text-rose-600 dark:text-rose-400">
                    -{primary.metrics.maxDrawdown.toFixed(2)}%
                  </div>
                </div>

                <div className="ui-card rounded-lg p-2.5">
                  <div className="ui-text-muted text-[10px] uppercase">
                    Dividen Bersih / Thn
                  </div>
                  <div className="ui-text-main font-mono text-sm font-bold">
                    {primary.netDividendYieldPercent}% (
                    {formatIdr(primary.annualNetDividendAtInitialIdr, true)})
                  </div>
                </div>

                <div className="ui-card rounded-lg p-2.5">
                  <div className="ui-text-muted text-[10px] uppercase">
                    Waktu ke {formatIdr(targetGoalIdr, true)}
                  </div>
                  <div className="ui-text-main font-mono text-sm font-bold">
                    ≈ {primary.yearsToGoalFloat} Tahun
                  </div>
                </div>
              </div>

              {/* Recommended Weight Breakdown Pills */}
              <div className="mt-3">
                <div className="ui-text-secondary text-[11px] font-semibold">
                  Pembagian Bobot Optimal (Total 100%):
                </div>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {Object.entries(primary.weights)
                    .filter(([, w]) => w > 0)
                    .sort((a, b) => b[1] - a[1])
                    .map(([assetId, w]) => {
                      const asset = allAssets.find((a) => a.id === assetId);
                      return (
                        <span
                          key={assetId}
                          className="ui-card inline-flex items-center gap-1.5 rounded-md px-2 py-1 font-mono text-xs font-semibold"
                        >
                          <span
                            className="h-2 w-2 rounded-full"
                            style={{ backgroundColor: asset?.color ?? '#10b981' }}
                          />
                          <span>
                            {assetId}: {w}%
                          </span>
                        </span>
                      );
                    })}
                </div>
              </div>

              {/* Rationale Points */}
              <div className="mt-3 space-y-1.5 text-[11px]">
                {primary.rationalePoints.map((pt, i) => (
                  <div key={i} className="ui-text-secondary flex items-start gap-1.5">
                    <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
                    <span>{pt}</span>
                  </div>
                ))}
              </div>

              {/* Action Buttons */}
              <div className="mt-4 flex flex-col gap-2">
                <button
                  type="button"
                  onClick={() => {
                    onApplyRecommendation(
                      primary,
                      recResult.recommendedSlotMap,
                      true,
                      false
                    );
                    dialogRef.current?.close();
                  }}
                  className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-500"
                >
                  <Pin className="h-3.5 w-3.5" />
                  <span>
                    Terapkan &amp; Masukkan ke Tabel Utama (+ Pin Custom Row)
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    onApplyRecommendation(
                      primary,
                      recResult.recommendedSlotMap,
                      true,
                      true
                    );
                    dialogRef.current?.close();
                  }}
                  className="ui-card ui-text-main flex w-full items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold hover:opacity-90"
                >
                  <span>Terapkan &amp; Langsung Simulasi Rebalancer</span>
                  <ArrowRight className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>

            {/* Alternative Video Preset Matches */}
            <div className="ui-subtle rounded-xl p-3.5">
              <div className="ui-text-secondary text-xs font-bold">
                Alternatif Preset dari 15 Portfolio Video Terdekat:
              </div>
              <div className="mt-2 space-y-2">
                {recResult.alternativeRecommendations.map((alt) => (
                  <div
                    key={alt.id}
                    className="ui-card flex items-center justify-between gap-2 rounded-lg p-2.5 text-xs"
                  >
                    <div>
                      <div className="ui-text-main font-semibold">
                        {alt.title}
                      </div>
                      <div className="ui-text-muted font-mono text-[11px]">
                        CAGR {alt.metrics.cagr.toFixed(2)}% • Max DD -
                        {alt.metrics.maxDrawdown.toFixed(2)}% • Target{' '}
                        {alt.yearsToGoalFloat} Thn
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        onApplyRecommendation(
                          alt,
                          recResult.recommendedSlotMap,
                          false,
                          false
                        );
                        dialogRef.current?.close();
                      }}
                      className="ui-subtle ui-text-main shrink-0 rounded px-2.5 py-1 text-[11px] font-semibold hover:opacity-80"
                    >
                      Pilih Preset
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </dialog>
  );
};
