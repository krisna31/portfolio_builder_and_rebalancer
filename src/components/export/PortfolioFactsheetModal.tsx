import React, { useRef, useState } from 'react';
import html2canvas from 'html2canvas';
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
}) => {
  const sheetRef = useRef<HTMLDivElement>(null);
  const [isExportingPng, setIsExportingPng] = useState(false);
  const [copyStatus, setCopyStatus] = useState<string | null>(null);

  if (!isOpen) return null;

  // Active asset allocations with weight > 0
  const activeAssetList = allAssets
    .filter((a) => (activeWeights[a.id] ?? 0) > 0)
    .map((a) => {
      const weightPct = activeWeights[a.id] ?? 0;
      const nominalIdr = Math.round(initialCapitalIdr * (weightPct / 100));
      return {
        ...a,
        weightPct,
        nominalIdr,
      };
    })
    .sort((a, b) => b.weightPct - a.weightPct);

  // Wealth Simulation for milestones
  const simulation = simulateWealthToGoal({
    initialCapitalIdr,
    monthlyContributionIdr: monthlySavingsIdr,
    annualCagrPercent: solvedMetrics.cagr,
    maxDrawdownPercent: solvedMetrics.maxDrawdown,
    targetWealthIdr: targetGoalIdr,
  });

  // Calculate milestone projections for 1, 3, 5, 10, 15, 20, 25 years
  const annualRate = Math.max(0, solvedMetrics.cagr) / 100;
  const monthlyRate = Math.pow(1 + annualRate, 1 / 12) - 1;

  const milestoneYears = [1, 3, 5, 10, 15, 20];
  const milestoneRows = milestoneYears.map((yr) => {
    const totalMonths = yr * 12;
    let wealth = initialCapitalIdr;
    let principal = initialCapitalIdr;

    for (let m = 1; m <= totalMonths; m++) {
      wealth = wealth * (1 + monthlyRate) + monthlySavingsIdr;
      principal += monthlySavingsIdr;
    }

    const gain = wealth - principal;
    return {
      year: yr,
      principal,
      wealth,
      gain,
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

  // Handle PNG Image Download via html2canvas
  const handleDownloadPng = async () => {
    if (!sheetRef.current) return;
    try {
      setIsExportingPng(true);
      const canvas = await html2canvas(sheetRef.current, {
        scale: 2, // High resolution (retina display 2x)
        useCORS: true,
        backgroundColor: '#0f172a', // Solid background for dark theme crispness
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
      `• CAGR (Return Tahunan): +${formatPercent(solvedMetrics.cagr)}`,
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
        return { label: 'Obligasi', color: 'bg-emerald-500/15 text-emerald-500 border-emerald-500/30' };
      case 'money-market':
        return { label: 'Pasar Uang', color: 'bg-sky-500/15 text-sky-500 border-sky-500/30' };
      case 'idx-equity':
        return { label: 'Saham IDX', color: 'bg-indigo-500/15 text-indigo-500 border-indigo-500/30' };
      case 'us-equity':
        return { label: 'Saham US', color: 'bg-blue-500/15 text-blue-500 border-blue-500/30' };
      case 'crypto':
        return { label: 'Kripto', color: 'bg-amber-500/15 text-amber-500 border-amber-500/30' };
      case 'gold':
        return { label: 'Emas', color: 'bg-yellow-500/15 text-yellow-500 border-yellow-500/30' };
      default:
        return { label: 'Custom', color: 'bg-purple-500/15 text-purple-500 border-purple-500/30' };
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/80 backdrop-blur-md overflow-y-auto">
      <div className="relative w-full max-w-5xl my-auto bg-slate-950 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[95vh]">
        {/* Top Control Bar (Hidden on print) */}
        <div className="print:hidden flex flex-wrap items-center justify-between gap-3 px-6 py-4 bg-slate-900 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <FileSpreadsheet className="w-5 h-5 text-indigo-400" />
            <div>
              <h2 className="text-base font-semibold text-slate-100">
                Institutional 1-Page Factsheet
              </h2>
              <p className="text-xs text-slate-400">
                Format laporan eksekutif siap cetak A4 atau unduh PNG
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <button
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
              onClick={handleDownloadPng}
              disabled={isExportingPng}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-200 bg-slate-800 hover:bg-slate-700 hover:text-white rounded-lg transition-colors border border-slate-700 disabled:opacity-50"
              title="Download gambar resolusi tinggi (PNG)"
            >
              <Download className="w-3.5 h-3.5 text-sky-400" />
              <span>{isExportingPng ? 'Memproses...' : 'Download PNG'}</span>
            </button>

            <button
              onClick={handlePrint}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg shadow-sm transition-all shadow-indigo-500/20"
              title="Cetak langsung atau simpan sebagai dokumen PDF A4"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Cetak / Simpan PDF</span>
            </button>

            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-lg transition-colors ml-1"
              aria-label="Tutup modal"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Scrollable Factsheet Container */}
        <div className="overflow-y-auto p-4 sm:p-8 bg-slate-950 flex justify-center">
          {/* Printable Factsheet Sheet */}
          <div
            id="quantporto-printable-factsheet"
            ref={sheetRef}
            className="w-full max-w-[800px] bg-slate-900 border border-slate-800 rounded-2xl p-6 sm:p-8 text-slate-100 shadow-xl space-y-6 print:border-none print:shadow-none print:p-6 print:bg-white print:text-slate-900 print:w-full print:max-w-none"
          >
            {/* Header: Brand & Document Meta */}
            <div className="flex flex-col sm:flex-row sm:items-start justify-between pb-6 border-b border-slate-800 print:border-slate-300 gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-bold tracking-wider text-xs px-2.5 py-0.5 rounded bg-indigo-500/20 text-indigo-400 border border-indigo-500/30 print:bg-slate-100 print:text-indigo-800 print:border-indigo-300">
                    QUANTPORTO INSTITUTIONAL FACTSHEET
                  </span>
                  <span className="text-xs text-slate-400 print:text-slate-600">
                    {todayStr}
                  </span>
                </div>
                <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-white print:text-slate-900 mt-2">
                  {portfolioName}
                </h1>
                <p className="text-xs text-slate-400 print:text-slate-600 mt-1 max-w-md">
                  Portofolio multi-aset berbasis prinsip matematis Risk Parity & Risk Budgeting untuk optimalisasi return asimetris terhadap tail risk.
                </p>
              </div>

              <div className="flex flex-col items-start sm:items-end gap-1.5">
                <div
                  className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border ${riskTierBadge.bgClass} ${riskTierBadge.textClass} ${riskTierBadge.borderClass} print:border-slate-400`}
                >
                  <ShieldCheck className="w-3.5 h-3.5" />
                  <span>{riskTierBadge.label}</span>
                </div>
                <div className="text-[11px] text-slate-400 print:text-slate-600">
                  Kurs Acuan: Rp {usdIdrRate.toLocaleString('id-ID')}/USD
                </div>
              </div>
            </div>

            {/* Key Metrics Grid */}
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 print:text-slate-700 mb-3 flex items-center gap-1.5">
                <TrendingUp className="w-4 h-4 text-indigo-400 print:text-indigo-600" />
                <span>Executive Metrics & Risk Profile (5Y Lookback)</span>
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800/80 print:bg-slate-50 print:border-slate-200">
                  <div className="text-[11px] text-slate-400 print:text-slate-600">
                    Annual Return (CAGR)
                  </div>
                  <div className="text-lg font-bold text-emerald-400 print:text-emerald-700 mt-0.5">
                    +{formatPercent(solvedMetrics.cagr)}
                  </div>
                  <div className="text-[10px] text-slate-500 print:text-slate-500 mt-0.5">
                    Tingkat pertumbuhan tahunan
                  </div>
                </div>

                <div className="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800/80 print:bg-slate-50 print:border-slate-200">
                  <div className="text-[11px] text-slate-400 print:text-slate-600">
                    Max Historical Drawdown
                  </div>
                  <div className="text-lg font-bold text-rose-400 print:text-rose-700 mt-0.5">
                    -{formatPercent(solvedMetrics.maxDrawdown)}
                  </div>
                  <div className="text-[10px] text-slate-500 print:text-slate-500 mt-0.5">
                    Koreksi terdalam 5 tahun
                  </div>
                </div>

                <div className="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800/80 print:bg-slate-50 print:border-slate-200">
                  <div className="text-[11px] text-slate-400 print:text-slate-600">
                    Calmar Ratio
                  </div>
                  <div className="text-lg font-bold text-indigo-400 print:text-indigo-700 mt-0.5">
                    {calmarRatio}x
                  </div>
                  <div className="text-[10px] text-slate-500 print:text-slate-500 mt-0.5">
                    Return per unit drawdown
                  </div>
                </div>

                <div className="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800/80 print:bg-slate-50 print:border-slate-200">
                  <div className="text-[11px] text-slate-400 print:text-slate-600">
                    Waktu Menuju Goal
                  </div>
                  <div className="text-lg font-bold text-amber-400 print:text-amber-700 mt-0.5">
                    {simulation.reachedGoal
                      ? `${simulation.yearsToGoal} thn ${simulation.monthsToGoal} bln`
                      : '> 45 thn'}
                  </div>
                  <div className="text-[10px] text-slate-500 print:text-slate-500 mt-0.5">
                    Target {formatIdr(targetGoalIdr, true)}
                  </div>
                </div>
              </div>
            </div>

            {/* Target Asset Allocation Table */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 print:text-slate-700 flex items-center gap-1.5">
                  <Percent className="w-4 h-4 text-indigo-400 print:text-indigo-600" />
                  <span>Komposisi Alokasi Aset & Nilai Pokok</span>
                </h3>
                <span className="text-xs text-slate-400 print:text-slate-600">
                  Modal: <strong className="text-white print:text-slate-900">{formatIdr(initialCapitalIdr)}</strong>
                </span>
              </div>

              <div className="overflow-x-auto rounded-xl border border-slate-800 print:border-slate-300">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-950/80 text-slate-400 print:bg-slate-100 print:text-slate-700 border-b border-slate-800 print:border-slate-300">
                      <th className="py-2.5 px-3 font-semibold">Aset</th>
                      <th className="py-2.5 px-3 font-semibold">Kelas</th>
                      <th className="py-2.5 px-3 font-semibold text-right">Bobot</th>
                      <th className="py-2.5 px-3 font-semibold text-right">Nominal Alokasi</th>
                      <th className="py-2.5 px-3 font-semibold text-right">CAGR 5Y</th>
                      <th className="py-2.5 px-3 font-semibold text-right">Max DD</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 print:divide-slate-200">
                    {activeAssetList.map((asset) => {
                      const catBadge = getCategoryBadge(asset.category);
                      return (
                        <tr
                          key={asset.id}
                          className="hover:bg-slate-800/30 print:hover:bg-transparent"
                        >
                          <td className="py-2 px-3">
                            <div className="flex items-center gap-2">
                              <span
                                className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                                style={{ backgroundColor: asset.color }}
                              />
                              <div>
                                <span className="font-semibold text-white print:text-slate-900">
                                  {asset.symbol}
                                </span>
                                <span className="text-[11px] text-slate-400 print:text-slate-600 ml-1.5 hidden sm:inline">
                                  {asset.name}
                                </span>
                              </div>
                            </div>
                          </td>
                          <td className="py-2 px-3">
                            <span
                              className={`inline-block px-2 py-0.5 rounded text-[10px] font-medium border ${catBadge.color} print:border-slate-300 print:text-slate-800`}
                            >
                              {catBadge.label}
                            </span>
                          </td>
                          <td className="py-2 px-3 text-right">
                            <div className="font-bold text-white print:text-slate-900">
                              {formatPercent(asset.weightPct)}
                            </div>
                            <div className="w-16 h-1 bg-slate-800 print:bg-slate-200 rounded-full ml-auto mt-1 overflow-hidden">
                              <div
                                className="h-full rounded-full"
                                style={{
                                  width: `${Math.min(100, asset.weightPct)}%`,
                                  backgroundColor: asset.color,
                                }}
                              />
                            </div>
                          </td>
                          <td className="py-2 px-3 text-right font-medium text-slate-200 print:text-slate-800">
                            {formatIdr(asset.nominalIdr)}
                          </td>
                          <td className="py-2 px-3 text-right text-emerald-400 print:text-emerald-700 font-medium">
                            +{formatPercent(asset.cagr)}
                          </td>
                          <td className="py-2 px-3 text-right text-rose-400 print:text-rose-700 font-medium">
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
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 print:text-slate-700 flex items-center gap-1.5">
                  <Coins className="w-4 h-4 text-indigo-400 print:text-indigo-600" />
                  <span>Proyeksi Pertumbuhan Portofolio (DCA {formatIdr(monthlySavingsIdr, true)}/Bulan)</span>
                </h3>
              </div>

              <div className="overflow-x-auto rounded-xl border border-slate-800 print:border-slate-300">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-950/80 text-slate-400 print:bg-slate-100 print:text-slate-700 border-b border-slate-800 print:border-slate-300">
                      <th className="py-2 px-3 font-semibold">Horison</th>
                      <th className="py-2 px-3 font-semibold text-right">Total Modal (Principal)</th>
                      <th className="py-2 px-3 font-semibold text-right">Estimasi Nilai Akhir</th>
                      <th className="py-2 px-3 font-semibold text-right">Total Keuntungan</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 print:divide-slate-200">
                    {milestoneRows.map((row) => (
                      <tr
                        key={row.year}
                        className="hover:bg-slate-800/30 print:hover:bg-transparent"
                      >
                        <td className="py-1.5 px-3 font-semibold text-slate-300 print:text-slate-800">
                          Tahun ke-{row.year}
                        </td>
                        <td className="py-1.5 px-3 text-right text-slate-400 print:text-slate-600">
                          {formatIdr(row.principal)}
                        </td>
                        <td className="py-1.5 px-3 text-right font-bold text-white print:text-slate-900">
                          {formatIdr(row.wealth)}
                        </td>
                        <td className="py-1.5 px-3 text-right font-semibold text-emerald-400 print:text-emerald-700">
                          +{formatIdr(row.gain)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Rebalancing Strategy & Guidelines */}
            <div className="p-4 rounded-xl bg-slate-950/70 border border-slate-800/80 print:bg-slate-50 print:border-slate-200 text-xs space-y-2">
              <div className="font-semibold text-slate-200 print:text-slate-900 flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-indigo-400 print:text-indigo-600" />
                <span>Pedoman Rebalancing QuantPorto:</span>
              </div>
              <ul className="list-disc list-inside text-slate-400 print:text-slate-600 space-y-1 text-[11px] leading-relaxed">
                <li>
                  <strong>Batas Toleransi Drift (3% - 5%):</strong> Lakukan penyesuaian hanya ketika bobot aset riil melenceng lebih dari 3% - 5% dari target.
                </li>
                <li>
                  <strong>Metode Cash Injection (Disarankan):</strong> Gunakan dana DCA bulanan untuk membeli aset yang sedang tertinggal tanpa perlu menjual aset yang sedang tumbuh untuk efisiensi pajak & biaya transaksi.
                </li>
                <li>
                  <strong>Disiplin Jangka Panjang:</strong> Portofolio ini dirancang agar tahan terhadap volatilitas siklus pasar dan tidak memerlukan spekulasi timing market harian.
                </li>
              </ul>
            </div>

            {/* Footer Disclaimer */}
            <div className="pt-4 border-t border-slate-800 print:border-slate-300 text-[10px] text-slate-500 print:text-slate-500 flex flex-col sm:flex-row items-center justify-between gap-2">
              <div>
                Dihasilkan oleh QuantPorto Engine • Berbasis Data Historis 5 Tahun
              </div>
              <div className="text-center sm:text-right">
                Bukan nasihat keuangan resmi. Keputusan investasi menjadi tanggung jawab penuh investor.
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
