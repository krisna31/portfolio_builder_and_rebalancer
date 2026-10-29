import React, { useRef, useState, useMemo, useEffect } from 'react';
import html2canvas from 'html2canvas-pro';
import {
  AssetDefinition,
  SolvedPortfolio,
} from '../../lib/quant/types';
import {
  formatIdr,
  formatPercent,
  getRiskTierBadge,
} from '../../lib/formatters';
import { simulateWealthToGoal } from '../../lib/quant/wealthSimulator';
import {
  Printer,
  Download,
  Copy,
  Check,
  X,
  ShieldCheck,
  TrendingUp,
  Percent,
  Clock,
  Coins,
  FileSpreadsheet,
} from 'lucide-react';

export interface PortfolioFactsheetModalProps {
  isOpen: boolean;
  onClose: () => void;
  portfolioName: string;
  activeWeights: Record<string, number>;
  allAssets: AssetDefinition[];
  solvedMetrics: SolvedPortfolio;
  initialCapitalIdr: number;
  monthlySavingsIdr: number;
  targetGoalIdr: number;
  usdIdrRate: number;
  annualInflationPercent?: number;
  annualStepUpPercent?: number;
  netDividendYieldPercent?: number;
  dividendUsageMode?: 'reinvest-drip' | 'cashout-passive';
}

export const PortfolioFactsheetModal: React.FC<PortfolioFactsheetModalProps> = ({
  isOpen,
  onClose,
  portfolioName,
  activeWeights = {},
  allAssets = [],
  solvedMetrics,
  initialCapitalIdr,
  monthlySavingsIdr,
  targetGoalIdr,
  usdIdrRate,
  annualInflationPercent = 0,
  annualStepUpPercent = 0,
  netDividendYieldPercent = 0,
  dividendUsageMode = 'reinvest-drip',
}) => {
  const sheetRef = useRef<HTMLDivElement>(null);
  const [isExportingPng, setIsExportingPng] = useState(false);
  const [copyStatus, setCopyStatus] = useState<string | null>(null);
  const [sheetTheme, setSheetTheme] = useState<'light' | 'dark'>('light');

  // Accessibility: Close modal on Escape key press
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const isLight = sheetTheme === 'light';

  // Bug 18 fix: Normalize activeWeights by sum before computing nominalIdr
  const totalActiveWeight =
    Object.values(activeWeights).reduce((sum, w) => sum + (w > 0 ? w : 0), 0) || 100;
  const activeAssetList = allAssets
    .filter((a) => (activeWeights[a.id] ?? 0) > 0)
    .map((a) => {
      const rawWeight = activeWeights[a.id] ?? 0;
      const weightPct = Number(((rawWeight / totalActiveWeight) * 100).toFixed(2));
      const nominalIdr = Math.round(initialCapitalIdr * (rawWeight / totalActiveWeight));
      return {
        ...a,
        weightPct,
        nominalIdr,
      };
    })
    .sort((a, b) => b.weightPct - a.weightPct);

  // Weighted net dividend yield calculation (fallback if not supplied explicitly)
  const effectiveNetDividendYieldPercent = useMemo(() => {
    if (netDividendYieldPercent && netDividendYieldPercent > 0) return netDividendYieldPercent;
    let weighted = 0;
    for (const a of activeAssetList) {
      const grossYield = a.dividendYield ?? 0;
      const taxRate =
        a.dividendTaxPercent !== undefined
          ? a.dividendTaxPercent / 100
          : a.category === 'idx-equity'
            ? 0.1
            : a.category === 'bonds'
              ? 0.1
              : 0;
      const netYield = grossYield * (1 - taxRate);
      weighted += (a.weightPct / 100) * netYield;
    }
    return Number(weighted.toFixed(2));
  }, [activeAssetList, netDividendYieldPercent]);

  // If user selected "Cashout Passive Income", total return compounding reduces by the cashout dividend yield
  const effectiveCompoundingCagr =
    dividendUsageMode === 'cashout-passive' && effectiveNetDividendYieldPercent > 0
      ? Math.max(2, solvedMetrics.cagr - effectiveNetDividendYieldPercent)
      : solvedMetrics.cagr;

  // Wealth Simulation for milestones with inflation & step-up forward
  const simulation = simulateWealthToGoal({
    initialCapitalIdr,
    monthlyContributionIdr: monthlySavingsIdr,
    annualCagrPercent: effectiveCompoundingCagr,
    maxDrawdownPercent: solvedMetrics.maxDrawdown,
    targetWealthIdr: targetGoalIdr,
    annualInflationPercent,
    annualStepUpPercent,
    netDividendYieldPercent: effectiveNetDividendYieldPercent,
  });

  // Calculate milestone projections for 1, 3, 5, 10, 15, 20 years
  const annualRate = Math.max(0, effectiveCompoundingCagr) / 100;
  const monthlyRate = Math.pow(1 + annualRate, 1 / 12) - 1;
  const inflationDec = Math.max(0, annualInflationPercent) / 100;
  const monthlyInflationRate = Math.pow(1 + inflationDec, 1 / 12) - 1;

  const milestoneYears = [1, 3, 5, 10, 15, 20];
  const milestoneRows = milestoneYears.map((yr) => {
    const totalMonths = yr * 12;
    let wealth = initialCapitalIdr;
    let principal = initialCapitalIdr;
    let currentMonthlyPmt = monthlySavingsIdr;

    for (let m = 1; m <= totalMonths; m++) {
      if (m > 1 && (m - 1) % 12 === 0 && annualStepUpPercent > 0) {
        currentMonthlyPmt *= 1 + annualStepUpPercent / 100;
      }
      wealth = wealth * (1 + monthlyRate) + currentMonthlyPmt;
      principal += currentMonthlyPmt;
    }

    const inflationDiscount = Math.pow(1 + monthlyInflationRate, totalMonths);
    const realPurchasingPower = wealth / inflationDiscount;
    const gain = wealth - principal;
    return {
      year: yr,
      principal: Math.round(principal),
      wealth: Math.round(wealth),
      realPurchasingPower: Math.round(realPurchasingPower),
      gain: Math.round(gain),
    };
  });

  const riskTierBadge = getRiskTierBadge(solvedMetrics.riskTier);
  const calmarRatio =
    solvedMetrics.maxDrawdown > 0
      ? (solvedMetrics.cagr / solvedMetrics.maxDrawdown).toFixed(2)
      : 'N/A';

  const todayStr = new Intl.DateTimeFormat('id-ID', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date());

  // Handle Browser Native Print (Save as PDF)
  const handlePrint = () => {
    window.print();
  };

  // Handle PNG Image Download via html2canvas-pro (full support for Tailwind CSS v4 oklch colors)
  const handleDownloadPng = async () => {
    if (!sheetRef.current) return;
    try {
      setIsExportingPng(true);
      const canvas = await html2canvas(sheetRef.current, {
        scale: 2, // High resolution (retina display 2x)
        useCORS: true,
        backgroundColor: isLight ? '#ffffff' : '#0f172a',
        logging: false,
      });

      const image = canvas.toDataURL('image/png');
      const link = document.createElement('a');
      const safeName = portfolioName
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .slice(0, 30);
      link.download = `QuantPorto_Factsheet_${safeName}.png`;
      link.href = image;
      link.click();
    } catch (err) {
      console.error('Failed to export PNG:', err);
      alert('Gagal mengekspor gambar. Silakan gunakan opsi Cetak / Simpan PDF.');
    } finally {
      setIsExportingPng(false);
    }
  };

  // Handle Copy Text Summary for WhatsApp / Notion
  const handleCopySummaryText = async () => {
    const lines = [
      `📊 *QUANTPORTO INSTITUTIONAL FACTSHEET*`,
      `Portofolio: ${portfolioName}`,
      `Tanggal: ${todayStr}`,
      `Profil Risiko: ${riskTierBadge.label}`,
      ``,
      `📈 *METRIK UTAMA 5 TAHUN:*`,
      `• CAGR (Return Tahunan): +${formatPercent(solvedMetrics.cagr)}${
        dividendUsageMode === 'cashout-passive' && effectiveNetDividendYieldPercent > 0
          ? ` (Cashout Yield: ${effectiveNetDividendYieldPercent.toFixed(1)}%, CAGR Modal: +${formatPercent(effectiveCompoundingCagr)})`
          : ''
      }`,
      `• Max Drawdown (Penurunan Terbesar): -${formatPercent(solvedMetrics.maxDrawdown)}`,
      `• Calmar Ratio: ${calmarRatio}x`,
      `• Volatilitas Tahunan: ${formatPercent(solvedMetrics.volatility)}`,
      ``,
      `💼 *ALOKASI ASET & TARGET DANA:*`,
      `Modal Awal: ${formatIdr(initialCapitalIdr)} | DCA: ${formatIdr(monthlySavingsIdr)}/bln`,
      ...activeAssetList.map(
        (a) =>
          `• ${a.symbol} (${a.name}): ${formatPercent(a.weightPct)} -> ${formatIdr(a.nominalIdr)}`
      ),
      ``,
      `🎯 *SIMULASI MENUJU GOAL (${formatIdr(targetGoalIdr)}):*`,
      `• Estimasi Waktu: ${
        simulation.reachedGoal
          ? `${simulation.yearsToGoal} thn ${simulation.monthsToGoal} bln`
          : '> 45 tahun'
      }`,
      `• Nilai Portofolio 10 Tahun: ${formatIdr(milestoneRows.find((r) => r.year === 10)?.wealth ?? 0)}`,
      ``,
      `Dibuat dengan QuantPorto Portfolio Builder & Rebalancer`,
    ];

    try {
      await navigator.clipboard.writeText(lines.join('\n'));
      setCopyStatus('Disalin ke Clipboard!');
      setTimeout(() => setCopyStatus(null), 2500);
    } catch {
      setCopyStatus('Gagal menyalin');
      setTimeout(() => setCopyStatus(null), 2000);
    }
  };

  const getCategoryBadge = (category: string) => {
    switch (category) {
      case 'bonds':
        return { label: 'Obligasi', color: isLight ? 'bg-emerald-50 text-emerald-700 border-emerald-300' : 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' };
      case 'money-market':
        return { label: 'Pasar Uang', color: isLight ? 'bg-sky-50 text-sky-700 border-sky-300' : 'bg-sky-500/15 text-sky-400 border-sky-500/30' };
      case 'idx-equity':
        return { label: 'Saham IDX', color: isLight ? 'bg-indigo-50 text-indigo-700 border-indigo-300' : 'bg-indigo-500/15 text-indigo-400 border-indigo-500/30' };
      case 'us-equity':
        return { label: 'Saham US', color: isLight ? 'bg-blue-50 text-blue-700 border-blue-300' : 'bg-blue-500/15 text-blue-400 border-blue-500/30' };
      case 'crypto':
        return { label: 'Kripto', color: isLight ? 'bg-amber-50 text-amber-700 border-amber-300' : 'bg-amber-500/15 text-amber-400 border-amber-500/30' };
      case 'gold':
        return { label: 'Emas', color: isLight ? 'bg-yellow-50 text-yellow-800 border-yellow-300' : 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30' };
      default:
        return { label: 'Custom', color: isLight ? 'bg-purple-50 text-purple-700 border-purple-300' : 'bg-purple-500/15 text-purple-400 border-purple-500/30' };
    }
  };

  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="factsheet-modal-backdrop fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/80 backdrop-blur-md overflow-y-auto"
    >
      <div className="factsheet-modal-container relative w-full max-w-5xl my-auto bg-slate-950 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[95vh]">
        {/* Top Control Bar (Hidden on print) */}
        <div className="print:hidden flex flex-wrap items-center justify-between gap-3 px-5 py-3.5 bg-slate-900 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <FileSpreadsheet className="w-5 h-5 text-indigo-400" />
            <div>
              <h2 className="text-sm sm:text-base font-semibold text-slate-100">
                Institutional 1-Page Factsheet
              </h2>
              <p className="text-[11px] text-slate-400">
                Format laporan eksekutif siap cetak A4 atau unduh PNG
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* Factsheet Theme Selector */}
            <div className="flex items-center rounded-lg bg-slate-800 p-0.5 border border-slate-700">
              <button
                type="button"
                onClick={() => setSheetTheme('light')}
                className={`flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium transition ${
                  isLight
                    ? 'bg-white text-slate-900 shadow-sm font-semibold'
                    : 'text-slate-400 hover:text-white'
                }`}
                title="Gaya Putih Institusional (Bersih, Kontras Tinggi, Standar A4)"
              >
                <span>⚪ Putih</span>
              </button>
              <button
                type="button"
                onClick={() => setSheetTheme('dark')}
                className={`flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium transition ${
                  !isLight
                    ? 'bg-slate-950 text-white shadow-sm font-semibold border border-slate-700'
                    : 'text-slate-400 hover:text-white'
                }`}
                title="Gaya Dark Eksekutif (Latar Gelap Modern)"
              >
                <span>⚫ Dark</span>
              </button>
            </div>

            <button
              type="button"
              onClick={handleCopySummaryText}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-300 bg-slate-800 hover:bg-slate-700 hover:text-white rounded-lg transition-colors border border-slate-700"
              title="Salin ringkasan teks untuk WhatsApp atau catatan"
            >
              {copyStatus ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="text-emerald-400">{copyStatus}</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  <span>Salin Teks</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={handleDownloadPng}
              disabled={isExportingPng}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-200 bg-slate-800 hover:bg-slate-700 hover:text-white rounded-lg transition-colors border border-slate-700 disabled:opacity-50"
              title="Download gambar resolusi tinggi (PNG)"
            >
              <Download className="w-3.5 h-3.5 text-sky-400" />
              <span>{isExportingPng ? 'Memproses...' : 'Download PNG'}</span>
            </button>

            <button
              type="button"
              onClick={handlePrint}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg shadow-sm transition-all shadow-indigo-500/20"
              title="Cetak langsung atau simpan sebagai dokumen PDF A4"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Cetak / Simpan PDF</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-lg transition-colors ml-1"
              aria-label="Tutup modal"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Scrollable Factsheet Container */}
        <div className="factsheet-scroll-container overflow-y-auto p-4 sm:p-6 bg-slate-950 flex justify-center">
          {/* Printable Factsheet Sheet: Designed to fit exactly 1 Page A4 */}
          <div
            id="quantporto-printable-factsheet"
            ref={sheetRef}
            className={`w-full max-w-[800px] rounded-2xl p-5 sm:p-6 shadow-xl space-y-3.5 transition-colors border ${
              isLight
                ? 'bg-white text-slate-900 border-slate-200 shadow-slate-200/50'
                : 'bg-slate-900 text-slate-100 border-slate-800 shadow-black/50'
            } print:border-none print:shadow-none print:p-0 print:m-0 print:w-full print:max-w-none`}
          >
            {/* Header: Brand & Document Meta */}
            <div
              className={`flex flex-col sm:flex-row sm:items-start justify-between pb-3.5 border-b gap-3 ${
                isLight ? 'border-slate-200' : 'border-slate-800'
              }`}
            >
              <div>
                <div className="flex items-center gap-2">
                  <span
                    className={`font-bold tracking-wider text-[10px] px-2 py-0.5 rounded border ${
                      isLight
                        ? 'bg-indigo-50 text-indigo-700 border-indigo-200'
                        : 'bg-indigo-500/20 text-indigo-400 border-indigo-500/30'
                    }`}
                  >
                    QUANTPORTO INSTITUTIONAL FACTSHEET
                  </span>
                  <span className={`text-[11px] ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                    {todayStr}
                  </span>
                </div>
                <h1
                  className={`text-lg sm:text-xl font-bold tracking-tight mt-1.5 ${
                    isLight ? 'text-slate-900' : 'text-white'
                  }`}
                >
                  {portfolioName}
                </h1>
                <p className={`text-[11px] mt-0.5 max-w-lg leading-relaxed ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>
                  Portofolio multi-aset berbasis prinsip kuantitatif Risk Parity &amp; Risk Budgeting untuk optimalisasi imbal hasil jangka panjang terhadap risiko tail risk.
                </p>
              </div>

              <div className="flex flex-col items-start sm:items-end gap-1 shrink-0">
                <div
                  className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold border ${riskTierBadge.bgClass} ${riskTierBadge.textClass} ${riskTierBadge.borderClass}`}
                >
                  <ShieldCheck className="w-3 h-3" />
                  <span>{riskTierBadge.label}</span>
                </div>
                <div className={`text-[10px] font-mono ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                  Kurs Acuan: Rp {usdIdrRate.toLocaleString('id-ID')}/USD
                </div>
              </div>
            </div>

            {/* Key Metrics Grid */}
            <div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                <div
                  className={`p-2.5 rounded-xl border ${
                    isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-950/60 border-slate-800/80'
                  }`}
                >
                  <div className={`text-[10px] font-medium ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                    Annual Return (CAGR)
                  </div>
                  <div className="text-base font-bold text-emerald-600 dark:text-emerald-400 mt-0.5">
                    +{formatPercent(solvedMetrics.cagr)}
                  </div>
                  <div className={`text-[9px] ${isLight ? 'text-slate-500' : 'text-slate-500'} mt-0.5`}>
                    Imbal hasil tahunan 5Y
                  </div>
                </div>

                <div
                  className={`p-2.5 rounded-xl border ${
                    isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-950/60 border-slate-800/80'
                  }`}
                >
                  <div className={`text-[10px] font-medium ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                    Max Historical Drawdown
                  </div>
                  <div className="text-base font-bold text-rose-600 dark:text-rose-400 mt-0.5">
                    -{formatPercent(solvedMetrics.maxDrawdown)}
                  </div>
                  <div className={`text-[9px] ${isLight ? 'text-slate-500' : 'text-slate-500'} mt-0.5`}>
                    Koreksi terdalam 5 tahun
                  </div>
                </div>

                <div
                  className={`p-2.5 rounded-xl border ${
                    isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-950/60 border-slate-800/80'
                  }`}
                >
                  <div className={`text-[10px] font-medium ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                    Calmar Ratio
                  </div>
                  <div className="text-base font-bold text-indigo-600 dark:text-indigo-400 mt-0.5">
                    {calmarRatio}x
                  </div>
                  <div className={`text-[9px] ${isLight ? 'text-slate-500' : 'text-slate-500'} mt-0.5`}>
                    Efisiensi return per risiko
                  </div>
                </div>

                <div
                  className={`p-2.5 rounded-xl border ${
                    isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-950/60 border-slate-800/80'
                  }`}
                >
                  <div className={`text-[10px] font-medium ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                    Waktu Menuju Goal
                  </div>
                  <div className="text-base font-bold text-amber-600 dark:text-amber-400 mt-0.5">
                    {simulation.reachedGoal
                      ? `${simulation.yearsToGoal} thn ${simulation.monthsToGoal} bln`
                      : '> 45 thn'}
                  </div>
                  <div className={`text-[9px] ${isLight ? 'text-slate-500' : 'text-slate-500'} mt-0.5`}>
                    Target {formatIdr(targetGoalIdr, true)}
                  </div>
                </div>
              </div>
            </div>

            {/* Visual Stacked Allocation Bar */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-[11px]">
                <span className={`font-semibold uppercase tracking-wider flex items-center gap-1 ${isLight ? 'text-slate-700' : 'text-slate-300'}`}>
                  <Percent className="w-3.5 h-3.5 text-indigo-500" />
                  <span>Komposisi Alokasi Aset ({activeAssetList.length} Instrumen)</span>
                </span>
                <span className={`text-[10px] ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                  Modal: <strong className={isLight ? 'text-slate-900 font-bold' : 'text-white font-bold'}>{formatIdr(initialCapitalIdr)}</strong>
                </span>
              </div>

              {/* Stacked Percentage Bar */}
              <div
                className={`flex h-2.5 w-full overflow-hidden rounded-full border ${
                  isLight ? 'border-slate-200 bg-slate-100' : 'border-slate-800 bg-slate-950'
                }`}
              >
                {activeAssetList.map((asset) => (
                  <div
                    key={asset.id}
                    style={{
                      width: `${asset.weightPct}%`,
                      backgroundColor: asset.color,
                    }}
                    title={`${asset.symbol}: ${formatPercent(asset.weightPct)}`}
                    className="h-full transition-all"
                  />
                ))}
              </div>

              {/* Asset Chips Row */}
              <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[10px] pt-0.5">
                {activeAssetList.map((asset) => (
                  <div key={asset.id} className="flex items-center gap-1">
                    <span
                      className="h-2 w-2 rounded-full shrink-0"
                      style={{ backgroundColor: asset.color }}
                    />
                    <span className={isLight ? 'text-slate-900 font-semibold' : 'text-slate-200 font-semibold'}>
                      {asset.symbol}
                    </span>
                    <span className={isLight ? 'text-slate-500 font-mono text-[9px]' : 'text-slate-400 font-mono text-[9px]'}>
                      {formatPercent(asset.weightPct)}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Target Asset Allocation Table */}
            <div>
              <div className={`overflow-x-auto rounded-xl border ${isLight ? 'border-slate-200' : 'border-slate-800'}`}>
                <table className="w-full text-left text-[11px] border-collapse">
                  <thead>
                    <tr
                      className={`border-b ${
                        isLight
                          ? 'bg-slate-100 text-slate-700 border-slate-200'
                          : 'bg-slate-950/80 text-slate-400 border-slate-800'
                      }`}
                    >
                      <th className="py-1.5 px-3 font-semibold">Aset</th>
                      <th className="py-1.5 px-3 font-semibold">Kelas</th>
                      <th className="py-1.5 px-3 font-semibold text-right">Bobot</th>
                      <th className="py-1.5 px-3 font-semibold text-right">Nominal Alokasi</th>
                      <th className="py-1.5 px-3 font-semibold text-right">CAGR 5Y</th>
                      <th className="py-1.5 px-3 font-semibold text-right">Max DD</th>
                    </tr>
                  </thead>
                  <tbody className={`divide-y ${isLight ? 'divide-slate-200' : 'divide-slate-800/60'}`}>
                    {activeAssetList.map((asset) => {
                      const catBadge = getCategoryBadge(asset.category);
                      return (
                        <tr
                          key={asset.id}
                          className={isLight ? 'hover:bg-slate-50/80' : 'hover:bg-slate-800/30'}
                        >
                          <td className="py-1.5 px-3">
                            <div className="flex items-center gap-1.5">
                              <span
                                className="w-2 h-2 rounded-full flex-shrink-0"
                                style={{ backgroundColor: asset.color }}
                              />
                              <div>
                                <span className={`font-semibold ${isLight ? 'text-slate-900' : 'text-white'}`}>
                                  {asset.symbol}
                                </span>
                                <span className={`text-[10px] ml-1 hidden sm:inline ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                                  {asset.name}
                                </span>
                              </div>
                            </div>
                          </td>
                          <td className="py-1.5 px-3">
                            <span
                              className={`inline-block px-1.5 py-0.2 rounded text-[9px] font-medium border ${catBadge.color}`}
                            >
                              {catBadge.label}
                            </span>
                          </td>
                          <td className="py-1.5 px-3 text-right">
                            <span className={`font-bold font-mono ${isLight ? 'text-slate-900' : 'text-white'}`}>
                              {formatPercent(asset.weightPct)}
                            </span>
                          </td>
                          <td className={`py-1.5 px-3 text-right font-medium font-mono ${isLight ? 'text-slate-800' : 'text-slate-200'}`}>
                            {formatIdr(asset.nominalIdr)}
                          </td>
                          <td className="py-1.5 px-3 text-right text-emerald-600 dark:text-emerald-400 font-medium font-mono">
                            +{formatPercent(asset.cagr)}
                          </td>
                          <td className="py-1.5 px-3 text-right text-rose-600 dark:text-rose-400 font-medium font-mono">
                            -{formatPercent(asset.maxDrawdown)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Wealth Accumulation Milestones Table */}
            <div>
              <div className="flex flex-wrap items-center justify-between gap-1 mb-1.5">
                <span className={`text-[11px] font-semibold uppercase tracking-wider flex items-center gap-1 ${isLight ? 'text-slate-700' : 'text-slate-300'}`}>
                  <Coins className="w-3.5 h-3.5 text-indigo-500" />
                  <span>Proyeksi Akumulasi Kekayaan (DCA {formatIdr(monthlySavingsIdr, true)}/Bulan)</span>
                </span>
                {dividendUsageMode === 'cashout-passive' && effectiveNetDividendYieldPercent > 0 && (
                  <span className="text-[10px] text-amber-500 font-medium bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/30">
                    Mode Cashout Dividen ({effectiveNetDividendYieldPercent.toFixed(1)}%/thn ditarik tunai, CAGR modal: +{formatPercent(effectiveCompoundingCagr)})
                  </span>
                )}
              </div>

              <div className={`overflow-x-auto rounded-xl border ${isLight ? 'border-slate-200' : 'border-slate-800'}`}>
                <table className="w-full text-left text-[11px] border-collapse">
                  <thead>
                    <tr
                      className={`border-b ${
                        isLight
                          ? 'bg-slate-100 text-slate-700 border-slate-200'
                          : 'bg-slate-950/80 text-slate-400 border-slate-800'
                      }`}
                    >
                      <th className="py-1.5 px-3 font-semibold">Horison</th>
                      <th className="py-1.5 px-3 font-semibold text-right">Total Modal Pokok</th>
                      <th className="py-1.5 px-3 font-semibold text-right">Estimasi Nilai Akhir</th>
                      <th className="py-1.5 px-3 font-semibold text-right">Estimasi Keuntungan</th>
                    </tr>
                  </thead>
                  <tbody className={`divide-y ${isLight ? 'divide-slate-200' : 'divide-slate-800/60'}`}>
                    {milestoneRows.map((row) => (
                      <tr
                        key={row.year}
                        className={isLight ? 'hover:bg-slate-50/80' : 'hover:bg-slate-800/30'}
                      >
                        <td className={`py-1 px-3 font-semibold ${isLight ? 'text-slate-800' : 'text-slate-300'}`}>
                          Tahun ke-{row.year}
                        </td>
                        <td className={`py-1 px-3 text-right font-mono ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>
                          {formatIdr(row.principal)}
                        </td>
                        <td className={`py-1 px-3 text-right font-bold font-mono ${isLight ? 'text-slate-900' : 'text-white'}`}>
                          {formatIdr(row.wealth)}
                          {annualInflationPercent > 0 && (
                            <span className={`block text-[9px] font-normal ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                              Riil: {formatIdr(row.realPurchasingPower, true)}
                            </span>
                          )}
                        </td>
                        <td className="py-1 px-3 text-right font-semibold font-mono text-emerald-600 dark:text-emerald-400">
                          +{formatIdr(row.gain)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Rebalancing Strategy & Guidelines */}
            <div
              className={`p-3 rounded-xl border text-[10px] space-y-1 ${
                isLight
                  ? 'bg-slate-50 border-slate-200 text-slate-700'
                  : 'bg-slate-950/70 border-slate-800/80 text-slate-400'
              }`}
            >
              <div className={`font-semibold flex items-center gap-1.5 ${isLight ? 'text-slate-900' : 'text-slate-200'}`}>
                <Clock className="w-3 h-3 text-indigo-500" />
                <span>Pedoman Disiplin Rebalancing QuantPorto:</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-0.5 leading-relaxed">
                <div>
                  <strong className={isLight ? 'text-slate-900' : 'text-slate-200'}>Toleransi Drift (3% - 5%):</strong> Lakukan rebalance hanya bila bobot riil melenceng lebih dari ambang toleransi.
                </div>
                <div>
                  <strong className={isLight ? 'text-slate-900' : 'text-slate-200'}>Prioritas Cash Injection:</strong> Arahkan setoran DCA bulanan untuk menyerok aset tertinggal tanpa harus menjual aset untung.
                </div>
                <div>
                  <strong className={isLight ? 'text-slate-900' : 'text-slate-200'}>Disiplin Jangka Panjang:</strong> Dirancang menahan volatilitas siklus pasar tanpa memerlukan spekulasi timing market.
                </div>
              </div>
            </div>

            {/* Footer Disclaimer */}
            <div
              className={`pt-2.5 border-t text-[9px] flex flex-col sm:flex-row items-center justify-between gap-1.5 ${
                isLight ? 'border-slate-200 text-slate-500' : 'border-slate-800 text-slate-500'
              }`}
            >
              <div>
                Dihasilkan oleh QuantPorto Engine • Berbasis Data Historis 5 Tahun
              </div>
              <div className="text-center sm:text-right">
                Bukan nasihat keuangan resmi. Keputusan investasi menjadi tanggung jawab penuh masing-masing investor.
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
