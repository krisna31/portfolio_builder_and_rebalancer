import React, { useRef, useState, useMemo, useEffect } from 'react';
import { useModalAccessibility } from '../../hooks/useModalAccessibility';
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

  const containerRef = useRef<HTMLDivElement>(null);

  useModalAccessibility({
    isOpen,
    onClose,
    containerRef,
  });

  const isLight = sheetTheme === 'light';

  // Normalize activeWeights by sum before computing nominalIdr
  const totalActiveWeight =
    Object.values(activeWeights).reduce((sum, w) => sum + (w > 0 ? w : 0), 0) || 100;
  const activeAssetList = useMemo(
    () =>
      allAssets
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
        .sort((a, b) => b.weightPct - a.weightPct),
    [allAssets, activeWeights, initialCapitalIdr, totalActiveWeight]
  );

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

  if (!isOpen) return null;

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
  const factsheetRiskBadgeClasses = (() => {
    switch (solvedMetrics.riskTier) {
      case 'super-high':
        return isLight
          ? 'bg-[#FDF0F0] text-[#9E2A2B] border-[#E7B7B7]'
          : 'bg-[#361D1E] text-[#F29B9B] border-[#5C3032]';
      case 'high':
        return isLight
          ? 'bg-[#FCF5E8] text-[#8F580A] border-[#E6CE9D]'
          : 'bg-[#332917] text-[#F2C374] border-[#594624]';
      case 'medium':
        return isLight
          ? 'bg-[#E6EFEA] text-[#173D2C] border-[#BBD5C6]'
          : 'bg-[#1E3328] text-[#82C7A3] border-[#2F5240]';
      case 'low':
        return isLight
          ? 'bg-[#EDF5F8] text-[#25586B] border-[#B8D5E0]'
          : 'bg-[#1B2D36] text-[#85C4D6] border-[#2B4957]';
    }
  })();
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
        backgroundColor: isLight ? '#FFFFFF' : '#111613',
        logging: false,
        windowWidth: 960,
        onclone: (clonedDoc) => {
          const clonedSheet = clonedDoc.getElementById('quantporto-printable-factsheet');
          if (clonedSheet) {
            clonedSheet.style.width = '794px';
            clonedSheet.style.maxWidth = '794px';
          }
        },
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
        return {
          label: 'Obligasi',
          color: isLight
            ? 'bg-[#E6EFEA] text-[#173D2C] border-[#BBD5C6]'
            : 'bg-[#1E3328] text-[#82C7A3] border-[#2F5240]',
        };
      case 'money-market':
        return {
          label: 'Pasar Uang',
          color: isLight
            ? 'bg-[#EDF5F8] text-[#25586B] border-[#B8D5E0]'
            : 'bg-[#1B2D36] text-[#85C4D6] border-[#2B4957]',
        };
      case 'idx-equity':
        return {
          label: 'Saham IDX',
          color: isLight
            ? 'bg-[#F2F1EA] text-[#3B443E] border-[#DCDCD2]'
            : 'bg-[#222C26] text-[#C8D1CB] border-[#344239]',
        };
      case 'us-equity':
        return {
          label: 'Saham US',
          color: isLight
            ? 'bg-[#EDF3F8] text-[#234C73] border-[#BAD0E4]'
            : 'bg-[#1C2A38] text-[#8CBCE8] border-[#2D445C]',
        };
      case 'crypto':
        return {
          label: 'Kripto',
          color: isLight
            ? 'bg-[#FCF5E8] text-[#8F580A] border-[#E6CE9D]'
            : 'bg-[#332917] text-[#F2C374] border-[#594624]',
        };
      case 'gold':
        return {
          label: 'Emas',
          color: isLight
            ? 'bg-[#FAF4DF] text-[#7D5E08] border-[#E2CF8B]'
            : 'bg-[#312A15] text-[#EBCD6E] border-[#544721]',
        };
      default:
        return {
          label: 'Custom',
          color: isLight
            ? 'bg-[#F2F1EA] text-[#3B443E] border-[#DCDCD2]'
            : 'bg-[#222C26] text-[#C8D1CB] border-[#344239]',
        };
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="factsheet-modal-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="factsheet-modal-backdrop fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/60 overflow-y-auto"
    >
      <div ref={containerRef} tabIndex={-1} className="factsheet-modal-container relative w-full max-w-5xl my-auto ui-modal overflow-hidden flex flex-col max-h-[95vh] outline-none">
        {/* Top Control Bar (Hidden on print) */}
        <div className="print:hidden flex flex-col gap-2.5 px-4 py-3 sm:px-5 sm:py-3.5 ui-subtle border-b ui-border lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <FileSpreadsheet className="w-4 h-4 shrink-0 text-[var(--accent-primary)]" />
              <div className="min-w-0">
                <h2
                  id="factsheet-modal-title"
                  className="text-base sm:text-lg font-normal ui-text-main tracking-tight font-display truncate"
                >
                  Institutional 1-Page Factsheet
                </h2>
                <p className="text-[11px] ui-text-muted">
                  Format laporan eksekutif siap cetak A4 atau unduh PNG
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="p-1.5 ui-text-muted hover:ui-text-main hover:ui-card rounded-lg transition-colors shrink-0 lg:hidden"
              aria-label="Tutup modal"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* Factsheet Theme Selector */}
            <div className="flex items-center rounded-lg ui-card p-0.5 border ui-border">
              <button
                type="button"
                onClick={() => setSheetTheme('light')}
                className={`flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium transition ${
                  isLight
                    ? 'bg-[var(--accent-primary)] text-[var(--text-on-accent)] shadow-sm font-semibold'
                    : 'ui-text-muted hover:ui-text-main'
                }`}
                title="Gaya Putih Institusional (Bersih, Kontras Tinggi, Standar A4)"
              >
                <span>Putih (Cetak)</span>
              </button>
              <button
                type="button"
                onClick={() => setSheetTheme('dark')}
                className={`flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium transition ${
                  !isLight
                    ? 'bg-[var(--accent-primary)] text-[var(--text-on-accent)] shadow-sm font-semibold'
                    : 'ui-text-muted hover:ui-text-main'
                }`}
                title="Gaya Dark Eksekutif (Latar Gelap Modern)"
              >
                <span>Gelap</span>
              </button>
            </div>

            <button
              type="button"
              onClick={handleCopySummaryText}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium ui-text-main ui-card hover:ui-subtle rounded-lg transition-colors border ui-border"
              title="Salin ringkasan teks untuk WhatsApp atau catatan"
            >
              {copyStatus ? (
                <>
                  <Check className="w-3.5 h-3.5 text-[var(--accent-primary)]" />
                  <span className="text-[var(--accent-primary)]">{copyStatus}</span>
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
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium ui-text-main ui-card hover:ui-subtle rounded-lg transition-colors border ui-border disabled:opacity-50"
              title="Download gambar resolusi tinggi (PNG)"
            >
              <Download className="w-3.5 h-3.5 text-[var(--status-info)]" />
              <span>{isExportingPng ? 'Memproses...' : 'Download PNG'}</span>
            </button>

            <button
              type="button"
              onClick={handlePrint}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold bg-[var(--accent-primary)] text-[var(--text-on-accent)] hover:bg-[var(--accent-hover)] rounded-lg shadow-xs transition-all"
              title="Cetak langsung atau simpan sebagai dokumen PDF A4"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Cetak / Simpan PDF</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              className="hidden lg:inline-flex p-1.5 ui-text-muted hover:ui-text-main hover:ui-card rounded-lg transition-colors ml-1"
              aria-label="Tutup modal"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Scrollable Factsheet Container (items-start avoids flexing height clamp when sheet taller than viewport) */}
        <div className="factsheet-scroll-container flex-1 min-h-0 overflow-y-auto p-3 sm:p-6 ui-page flex items-start justify-center">
          {/* Printable Factsheet Sheet: Mode-locked Limestone & Moss palette, compact 1-Page A4 */}
          <div
            id="quantporto-printable-factsheet"
            data-factsheet-mode={sheetTheme}
            ref={sheetRef}
            style={{ colorScheme: isLight ? 'only light' : 'only dark' }}
            className={`w-full max-w-[794px] min-h-0 rounded-xl p-4 sm:p-5 shadow-lg space-y-3 transition-colors border ${
              isLight
                ? 'bg-[#FFFFFF] text-[#19201C] border-[#DCDCD2] shadow-black/10'
                : 'bg-[#111613] text-[#EAECE7] border-[#2D3A32] shadow-black/50'
            } print:border-none print:shadow-none print:p-0 print:m-0 print:w-full print:max-w-none print:space-y-2.5`}
          >
            {/* Header: Brand & Document Meta */}
            <div
              className={`flex flex-col sm:flex-row sm:items-start justify-between pb-3 border-b gap-2.5 ${
                isLight ? 'border-[#DCDCD2]' : 'border-[#2D3A32]'
              }`}
            >
              <div>
                <div className="flex items-center gap-2">
                  <span
                    className={`font-bold tracking-wider text-[10px] px-2 py-0.5 rounded border ${
                      isLight
                        ? 'bg-[#E6EFEA] text-[#173D2C] border-[#BBD5C6]'
                        : 'bg-[#1E3328] text-[#82C7A3] border-[#2F5240]'
                    }`}
                  >
                    QUANTPORTO INSTITUTIONAL FACTSHEET
                  </span>
                  <span className={`text-[11px] ${isLight ? 'text-[#48524B]' : 'text-[#B5BFB8]'}`}>
                    {todayStr}
                  </span>
                </div>
                <h1
                  className={`text-lg sm:text-xl font-bold tracking-tight mt-1 ${
                    isLight ? 'text-[#19201C]' : 'text-[#F4F6F3]'
                  }`}
                >
                  {portfolioName}
                </h1>
                <p className={`text-[11px] mt-0.5 max-w-lg leading-snug ${isLight ? 'text-[#48524B]' : 'text-[#B5BFB8]'}`}>
                  Portofolio multi-aset berbasis prinsip kuantitatif Risk Parity &amp; Risk Budgeting untuk optimalisasi imbal hasil jangka panjang terhadap risiko tail risk.
                </p>
              </div>

              <div className="flex flex-col items-start sm:items-end gap-1 shrink-0">
                <div
                  className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold border ${factsheetRiskBadgeClasses}`}
                >
                  <ShieldCheck className="w-3 h-3" />
                  <span>{riskTierBadge.label}</span>
                </div>
                <div className={`text-[10px] font-mono ${isLight ? 'text-[#48524B]' : 'text-[#B5BFB8]'}`}>
                  Kurs Acuan: Rp {usdIdrRate.toLocaleString('id-ID')}/USD
                </div>
              </div>
            </div>

            {/* Key Metrics Grid */}
            <div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <div
                  className={`p-2 rounded-xl border ${
                    isLight ? 'bg-[#F9F8F4] border-[#DCDCD2]' : 'bg-[#1B231E] border-[#2D3A32]'
                  }`}
                >
                  <div className={`text-[10px] font-medium ${isLight ? 'text-[#48524B]' : 'text-[#B5BFB8]'}`}>
                    Annual Return (CAGR)
                  </div>
                  <div className={`text-base font-bold font-mono tabular-nums mt-0.5 ${isLight ? 'text-[#21543D]' : 'text-[#68B68E]'}`}>
                    +{formatPercent(solvedMetrics.cagr)}
                  </div>
                  <div className={`text-[10px] ${isLight ? 'text-[#5A655D]' : 'text-[#9BA69E]'}`}>
                    Imbal hasil tahunan 5Y
                  </div>
                </div>

                <div
                  className={`p-2 rounded-xl border ${
                    isLight ? 'bg-[#F9F8F4] border-[#DCDCD2]' : 'bg-[#1B231E] border-[#2D3A32]'
                  }`}
                >
                  <div className={`text-[10px] font-medium ${isLight ? 'text-[#48524B]' : 'text-[#B5BFB8]'}`}>
                    Max Historical Drawdown
                  </div>
                  <div className={`text-base font-bold font-mono tabular-nums mt-0.5 ${isLight ? 'text-[#A62E2E]' : 'text-[#F28B82]'}`}>
                    -{formatPercent(solvedMetrics.maxDrawdown)}
                  </div>
                  <div className={`text-[10px] ${isLight ? 'text-[#5A655D]' : 'text-[#9BA69E]'}`}>
                    Koreksi terdalam 5 tahun
                  </div>
                </div>

                <div
                  className={`p-2 rounded-xl border ${
                    isLight ? 'bg-[#F9F8F4] border-[#DCDCD2]' : 'bg-[#1B231E] border-[#2D3A32]'
                  }`}
                >
                  <div className={`text-[10px] font-medium ${isLight ? 'text-[#48524B]' : 'text-[#B5BFB8]'}`}>
                    Calmar Ratio
                  </div>
                  <div className={`text-base font-bold font-mono tabular-nums mt-0.5 ${isLight ? 'text-[#21543D]' : 'text-[#68B68E]'}`}>
                    {calmarRatio}x
                  </div>
                  <div className={`text-[10px] ${isLight ? 'text-[#5A655D]' : 'text-[#9BA69E]'}`}>
                    Efisiensi return per risiko
                  </div>
                </div>

                <div
                  className={`p-2 rounded-xl border ${
                    isLight ? 'bg-[#F9F8F4] border-[#DCDCD2]' : 'bg-[#1B231E] border-[#2D3A32]'
                  }`}
                >
                  <div className={`text-[10px] font-medium ${isLight ? 'text-[#48524B]' : 'text-[#B5BFB8]'}`}>
                    Waktu Menuju Goal
                  </div>
                  <div className={`text-base font-bold font-mono tabular-nums mt-0.5 ${isLight ? 'text-[#8F580A]' : 'text-[#F2B764]'}`}>
                    {simulation.reachedGoal
                      ? `${simulation.yearsToGoal} thn ${simulation.monthsToGoal} bln`
                      : '> 45 thn'}
                  </div>
                  <div className={`text-[10px] ${isLight ? 'text-[#5A655D]' : 'text-[#9BA69E]'}`}>
                    Target {formatIdr(targetGoalIdr, true)}
                  </div>
                </div>
              </div>
            </div>

            {/* Visual Stacked Allocation Bar */}
            <div className="space-y-1">
              <div className="flex items-center justify-between text-[11px]">
                <span className={`font-semibold uppercase tracking-wider flex items-center gap-1 ${isLight ? 'text-[#2E3832]' : 'text-[#DCE2DD]'}`}>
                  <Percent className={`w-3.5 h-3.5 ${isLight ? 'text-[#21543D]' : 'text-[#68B68E]'}`} />
                  <span>Komposisi Alokasi Aset ({activeAssetList.length} Instrumen)</span>
                </span>
                <span className={`text-[10px] ${isLight ? 'text-[#48524B]' : 'text-[#B5BFB8]'}`}>
                  Modal: <strong className={isLight ? 'text-[#19201C] font-bold' : 'text-[#F4F6F3] font-bold'}>{formatIdr(initialCapitalIdr)}</strong>
                </span>
              </div>

              {/* Stacked Percentage Bar */}
              <div
                className={`flex h-2 w-full overflow-hidden rounded-full border ${
                  isLight ? 'border-[#DCDCD2] bg-[#F2F1EA]' : 'border-[#2D3A32] bg-[#1B231E]'
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
              <div className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-[10px] pt-0.5">
                {activeAssetList.map((asset) => (
                  <div key={asset.id} className="flex items-center gap-1">
                    <span
                      className="h-2 w-2 rounded-full shrink-0"
                      style={{ backgroundColor: asset.color }}
                    />
                    <span className={isLight ? 'text-[#19201C] font-semibold' : 'text-[#EAECE7] font-semibold'}>
                      {asset.symbol}
                    </span>
                    <span className={isLight ? 'text-[#48524B] font-mono text-[10px]' : 'text-[#B5BFB8] font-mono text-[10px]'}>
                      {formatPercent(asset.weightPct)}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Target Asset Allocation Table */}
            <div>
              <div className={`overflow-x-auto rounded-xl border ${isLight ? 'border-[#DCDCD2]' : 'border-[#2D3A32]'}`}>
                <table className="w-full text-left text-[11px] border-collapse">
                <caption className="sr-only">Rincian Alokasi Aset dan Bobot Risiko Portofolio Factsheet</caption>
                  <thead>
                    <tr
                      className={`border-b ${
                        isLight
                          ? 'bg-[#F2F1EA] text-[#3B443E] border-[#DCDCD2]'
                          : 'bg-[#222C26] text-[#C8D1CB] border-[#2D3A32]'
                      }`}
                    >
                      <th scope="col" className="py-1.5 px-2.5 font-semibold">Aset</th>
                      <th scope="col" className="py-1.5 px-2.5 font-semibold">Kelas</th>
                      <th scope="col" className="py-1.5 px-2.5 font-semibold text-right">Bobot</th>
                      <th scope="col" className="py-1.5 px-2.5 font-semibold text-right">Nominal Alokasi</th>
                      <th scope="col" className="py-1.5 px-2.5 font-semibold text-right">CAGR 5Y</th>
                      <th scope="col" className="py-1.5 px-2.5 font-semibold text-right">Max DD</th>
                    </tr>
                  </thead>
                  <tbody className={`divide-y ${isLight ? 'divide-[#E6E5DD]' : 'divide-[#26302A]'}`}>
                    {activeAssetList.map((asset) => {
                      const catBadge = getCategoryBadge(asset.category);
                      return (
                        <tr
                          key={asset.id}
                          className={isLight ? 'hover:bg-[#F9F8F4]' : 'hover:bg-[#1B231E]'}
                        >
                          <td className="py-1 px-2.5">
                            <div className="flex items-center gap-1.5">
                              <span
                                className="w-2 h-2 rounded-full flex-shrink-0"
                                style={{ backgroundColor: asset.color }}
                              />
                              <div>
                                <span className={`font-semibold ${isLight ? 'text-[#19201C]' : 'text-[#F4F6F3]'}`}>
                                  {asset.symbol}
                                </span>
                                <span className={`text-[10px] ml-1 hidden sm:inline ${isLight ? 'text-[#48524B]' : 'text-[#B5BFB8]'}`}>
                                  {asset.name}
                                </span>
                              </div>
                            </div>
                          </td>
                          <td className="py-1 px-2.5">
                            <span
                              className={`inline-block px-1.5 py-0.5 rounded text-[9px] font-medium border ${catBadge.color}`}
                            >
                              {catBadge.label}
                            </span>
                          </td>
                          <td className="py-1 px-2.5 text-right">
                            <span className={`font-bold font-mono ${isLight ? 'text-[#19201C]' : 'text-[#F4F6F3]'}`}>
                              {formatPercent(asset.weightPct)}
                            </span>
                          </td>
                          <td className={`py-1 px-2.5 text-right font-medium font-mono whitespace-nowrap ${isLight ? 'text-[#2E3832]' : 'text-[#DCE2DD]'}`}>
                            {formatIdr(asset.nominalIdr)}
                          </td>
                          <td className={`py-1 px-2.5 text-right font-medium font-mono whitespace-nowrap ${isLight ? 'text-[#21543D]' : 'text-[#68B68E]'}`}>
                            +{formatPercent(asset.cagr)}
                          </td>
                          <td className={`py-1 px-2.5 text-right font-medium font-mono whitespace-nowrap ${isLight ? 'text-[#A62E2E]' : 'text-[#F28B82]'}`}>
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
              <div className="flex flex-wrap items-center justify-between gap-1 mb-1">
                <span className={`text-[11px] font-semibold uppercase tracking-wider flex items-center gap-1 ${isLight ? 'text-[#2E3832]' : 'text-[#DCE2DD]'}`}>
                  <Coins className={`w-3.5 h-3.5 ${isLight ? 'text-[#21543D]' : 'text-[#68B68E]'}`} />
                  <span>Proyeksi Akumulasi Kekayaan (DCA {formatIdr(monthlySavingsIdr, true)}/Bulan)</span>
                </span>
                {dividendUsageMode === 'cashout-passive' && effectiveNetDividendYieldPercent > 0 && (
                  <span className={`text-[10px] font-medium px-2 py-0.5 rounded border ${
                    isLight
                      ? 'text-[#8F580A] bg-[#FCF5E8] border-[#E6CE9D]'
                      : 'text-[#F2C374] bg-[#332917] border-[#594624]'
                  }`}>
                    Mode Cashout Dividen ({effectiveNetDividendYieldPercent.toFixed(1)}%/thn ditarik tunai, CAGR modal: +{formatPercent(effectiveCompoundingCagr)})
                  </span>
                )}
              </div>

              <div className={`overflow-x-auto rounded-xl border ${isLight ? 'border-[#DCDCD2]' : 'border-[#2D3A32]'}`}>
                <table className="w-full text-left text-[11px] border-collapse">
                  <caption className="sr-only">Simulasi Proyeksi Portofolio Menuju Target Finansial</caption>
                  <thead>
                    <tr
                      className={`border-b ${
                        isLight
                          ? 'bg-[#F2F1EA] text-[#3B443E] border-[#DCDCD2]'
                          : 'bg-[#222C26] text-[#C8D1CB] border-[#2D3A32]'
                      }`}
                    >
                      <th scope="col" className="py-1.5 px-2.5 font-semibold">Horison</th>
                      <th scope="col" className="py-1.5 px-2.5 font-semibold text-right">Total Modal Pokok</th>
                      <th scope="col" className="py-1.5 px-2.5 font-semibold text-right">Estimasi Nilai Akhir</th>
                      {annualInflationPercent > 0 && (
                        <th scope="col" className="py-1.5 px-2.5 font-semibold text-right">Daya Beli Riil</th>
                      )}
                      <th scope="col" className="py-1.5 px-2.5 font-semibold text-right">Estimasi Keuntungan</th>
                    </tr>
                  </thead>
                  <tbody className={`divide-y ${isLight ? 'divide-[#E6E5DD]' : 'divide-[#26302A]'}`}>
                    {milestoneRows.map((row) => (
                      <tr
                        key={row.year}
                        className={isLight ? 'hover:bg-[#F9F8F4]' : 'hover:bg-[#1B231E]'}
                      >
                        <td className={`py-1 px-2.5 font-semibold ${isLight ? 'text-[#2E3832]' : 'text-[#DCE2DD]'}`}>
                          Tahun ke-{row.year}
                        </td>
                        <td className={`py-1 px-2.5 text-right font-mono whitespace-nowrap ${isLight ? 'text-[#48524B]' : 'text-[#B5BFB8]'}`}>
                          {formatIdr(row.principal)}
                        </td>
                        <td className={`py-1 px-2.5 text-right font-bold font-mono whitespace-nowrap ${isLight ? 'text-[#19201C]' : 'text-[#F4F6F3]'}`}>
                          {formatIdr(row.wealth)}
                        </td>
                        {annualInflationPercent > 0 && (
                          <td className={`py-1 px-2.5 text-right font-mono whitespace-nowrap ${isLight ? 'text-[#48524B]' : 'text-[#B5BFB8]'}`}>
                            {formatIdr(row.realPurchasingPower, true)}
                          </td>
                        )}
                        <td className={`py-1 px-2.5 text-right font-semibold font-mono whitespace-nowrap ${isLight ? 'text-[#21543D]' : 'text-[#68B68E]'}`}>
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
              className={`p-2.5 rounded-xl border text-[10px] space-y-1 ${
                isLight
                  ? 'bg-[#F9F8F4] border-[#DCDCD2] text-[#3B443E]'
                  : 'bg-[#1B231E] border-[#2D3A32] text-[#C8D1CB]'
              }`}
            >
              <div className={`font-semibold flex items-center gap-1.5 ${isLight ? 'text-[#19201C]' : 'text-[#F4F6F3]'}`}>
                <Clock className={`w-3 h-3 ${isLight ? 'text-[#21543D]' : 'text-[#68B68E]'}`} />
                <span>Pedoman Disiplin Rebalancing QuantPorto:</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 leading-snug">
                <div>
                  <strong className={isLight ? 'text-[#19201C]' : 'text-[#F4F6F3]'}>Toleransi Drift (3% - 5%):</strong> Lakukan rebalance hanya bila bobot riil melenceng lebih dari ambang toleransi.
                </div>
                <div>
                  <strong className={isLight ? 'text-[#19201C]' : 'text-[#F4F6F3]'}>Prioritas Cash Injection:</strong> Arahkan setoran DCA bulanan untuk menyerok aset tertinggal tanpa harus menjual aset untung.
                </div>
                <div>
                  <strong className={isLight ? 'text-[#19201C]' : 'text-[#F4F6F3]'}>Disiplin Jangka Panjang:</strong> Dirancang menahan volatilitas siklus pasar tanpa memerlukan spekulasi timing market.
                </div>
              </div>
            </div>

            {/* Footer Disclaimer */}
            <div
              className={`pt-2 border-t text-[10px] flex flex-col sm:flex-row items-center justify-between gap-1 ${
                isLight ? 'border-[#DCDCD2] text-[#5A655D]' : 'border-[#2D3A32] text-[#9BA69E]'
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
