import React, { useMemo, useState } from 'react';
import {
  AssetDefinition,
  HoldingEntry,
  RebalanceHistoryEntry,
  RebalanceMode,
  RebalanceSummaryResult,
} from '../../lib/quant/types';
import { generateCrashBuyingLadder } from '../../lib/quant/rebalancerEngine';
import { formatIdr, formatUsd } from '../../lib/formatters';
import { HoldingsTextImportModal } from './HoldingsTextImportModal';
import { RebalanceExecutionGuideModal } from './RebalanceExecutionGuideModal';
import { ParsedHoldingItem } from '../../lib/quant/textDataParser';
import { FormattedNumberInput } from '../FormattedNumberInput';
import {
  Scale,
  TrendingDown,
  TrendingUp,
  RotateCcw,
  Coins,
  Split,
  ArrowUpRight,
  ArrowDownRight,
  CheckCircle2,
  AlertCircle,
  Download,
  Zap,
  History,
  Check,
  Trash2,
  ListOrdered,
  Copy,
  LayoutGrid,
  Table2,
  Building2,
  Tag,
  FileSpreadsheet,
  Lightbulb,
  Sparkles,
  HelpCircle,
  X,
} from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  AreaChart,
  Area,
} from 'recharts';

interface PortfolioRebalancerViewProps {
  allAssets: AssetDefinition[];
  targetWeights: Record<string, number>;
  holdings: Record<string, HoldingEntry>;
  onUpdateHolding: (assetId: string, patch: Partial<HoldingEntry>) => void;
  onPopulateCapital: (capitalIdr: number) => void;
  onLoadVideo1BExample: () => void;
  onApplyShockScenario: (
    scenario: 'reset' | 'video-bull-3x' | 'video-crash-50' | 'global-crisis'
  ) => void;
  inputMode: 'nominal' | 'units';
  setInputMode: (m: 'nominal' | 'units') => void;
  rebalanceMode: RebalanceMode;
  setRebalanceMode: (m: RebalanceMode) => void;
  cashInjectionIdr: number;
  setCashInjectionIdr: (val: number) => void;
  driftThresholdPercent: number;
  setDriftThresholdPercent: (val: number) => void;
  usdIdrRate: number;
  rebalanceResult: RebalanceSummaryResult;
  onApplyPeerDiversification: () => void;
  rebalanceHistory: RebalanceHistoryEntry[];
  onCommitRebalanceToHoldings: (note?: string) => void;
  onDeleteRebalanceHistoryEntry: (id: string) => void;
  initialCapitalMenu1Idr: number;
  monthlySavingsMenu1Idr: number;
  activePortfolioName: string;
  isHoldingsSyncedWithMenu1: boolean;
  enableIdxLotRounding?: boolean;
  setEnableIdxLotRounding?: (val: boolean) => void;
  enableBrokerFees?: boolean;
  setEnableBrokerFees?: (val: boolean) => void;
  filterDustTrades?: boolean;
  setFilterDustTrades?: (val: boolean) => void;
  onClearHoldingsForManualInput: () => void;
  onResetAllAssetPrices?: () => void;
  onSetupInitialBuyFromMenu1: () => void;
  onScaleTotalHoldingsIdr: (
    newTotalIdr: number,
    distributeBy: 'current' | 'target'
  ) => void;
  onOpenOrderSlip?: () => void;
  onBatchUpdateHoldings?: (items: ParsedHoldingItem[], strategy: 'merge' | 'replace') => void;
}

export const PortfolioRebalancerView: React.FC<PortfolioRebalancerViewProps> = ({
  allAssets,
  targetWeights,
  holdings,
  onUpdateHolding,
  onPopulateCapital,
  onLoadVideo1BExample,
  onApplyShockScenario,
  inputMode,
  setInputMode,
  rebalanceMode,
  setRebalanceMode,
  cashInjectionIdr,
  setCashInjectionIdr,
  driftThresholdPercent,
  setDriftThresholdPercent,
  usdIdrRate,
  rebalanceResult,
  onApplyPeerDiversification,
  rebalanceHistory,
  onCommitRebalanceToHoldings,
  onDeleteRebalanceHistoryEntry,
  initialCapitalMenu1Idr,
  monthlySavingsMenu1Idr,
  activePortfolioName,
  isHoldingsSyncedWithMenu1,
  enableIdxLotRounding = true,
  setEnableIdxLotRounding,
  enableBrokerFees = false,
  setEnableBrokerFees,
  filterDustTrades = true,
  setFilterDustTrades,
  onClearHoldingsForManualInput,
  onResetAllAssetPrices,
  onSetupInitialBuyFromMenu1,
  onScaleTotalHoldingsIdr,
  onOpenOrderSlip,
  onBatchUpdateHoldings,
}) => {
  const [showShockSliders, setShowShockSliders] = useState(true);
  const [isHoldingsTextModalOpen, setIsHoldingsTextModalOpen] = useState(false);
  const [isGuideModalOpen, setIsGuideModalOpen] = useState(false);
  const [isWelcomeBannerDismissed, setIsWelcomeBannerDismissed] = useState(false);
  const [rebalanceNoteInput, setRebalanceNoteInput] = useState('');
  const [committedBanner, setCommittedBanner] = useState(false);
  const [rebalanceViewMode, setRebalanceViewMode] = useState<'table' | 'cards'>(() => {
    if (typeof window !== 'undefined' && window.innerWidth < 768) {
      return 'cards';
    }
    return 'table';
  });
  const [slipCopied, setSlipCopied] = useState(false);
  const [holdingEntryMode, setHoldingEntryMode] = useState<
    'nominal' | 'units' | 'percent'
  >(inputMode);
  const [quickTotalIdr, setQuickTotalIdr] = useState<number>(initialCapitalMenu1Idr);

  const anyPriceModified = useMemo(() => {
    return allAssets.some((a) => {
      const h = holdings[a.id];
      if (!h || !h.currentPrice) return false;
      const isNominal =
        h.isNominalOnly ?? (a.category === 'bonds' || a.category === 'money-market');
      if (isNominal) return false;
      return Math.abs(h.currentPrice - a.defaultPrice) > 0.0001;
    });
  }, [allAssets, holdings]);

  const formatPriceDisplay = (price: number, currency?: string) => {
    if (currency === 'USD') {
      return price < 10 ? `$${price.toFixed(4)}` : `$${price.toLocaleString()}`;
    }
    return `Rp ${price.toLocaleString('id-ID')}`;
  };

  // Active assets for the Crash Limit Order Ladder
  const activeCandidateAssets = useMemo(() => {
    const list = allAssets.filter(
      (a) =>
        (targetWeights[a.id] ?? 0) > 0 &&
        a.category !== 'money-market' &&
        a.category !== 'bonds'
    );
    return list.length > 0 ? list : allAssets.filter((a) => a.id !== 'RDPU');
  }, [allAssets, targetWeights]);

  const [ladderAssetId, setLadderAssetId] = useState<string>(() => {
    return (
      activeCandidateAssets.find((a) => a.id === 'BTC')?.id ??
      activeCandidateAssets[0]?.id ??
      'BTC'
    );
  });

  const effectiveLadderAssetId = activeCandidateAssets.some(
    (a) => a.id === ladderAssetId
  )
    ? ladderAssetId
    : activeCandidateAssets[0]?.id ?? 'BTC';

  const selectedLadderAsset =
    allAssets.find((a) => a.id === effectiveLadderAssetId) ?? allAssets[0];

  const crashLadderSteps = useMemo(
    () =>
      generateCrashBuyingLadder({
        targetAsset: selectedLadderAsset,
        allAssets,
        targetWeights,
        holdings,
        inputMode,
        usdIdrRate,
        extraCashIdr: cashInjectionIdr,
        dropTiers: [-10, -20, -35, -50],
      }),
    [
      selectedLadderAsset,
      allAssets,
      targetWeights,
      holdings,
      inputMode,
      usdIdrRate,
      cashInjectionIdr,
    ]
  );

  const handleApplyHoldingsFromText = (
    items: ParsedHoldingItem[],
    strategy: 'merge' | 'replace'
  ) => {
    if (onBatchUpdateHoldings) {
      onBatchUpdateHoldings(items, strategy);
    } else {
      if (strategy === 'replace') {
        onClearHoldingsForManualInput();
      }
      for (const item of items) {
        if (!item.assetId || !item.isRecognized) continue;
        onUpdateHolding(item.assetId, {
          currentValueIdr: item.nominalIdr,
          units: item.units,
          currentPrice: item.priceNative,
          shockPercent: 0,
        });
      }
    }
  };

  const handleApplyAndRecord = () => {
    onCommitRebalanceToHoldings(rebalanceNoteInput.trim() || undefined);
    setRebalanceNoteInput('');
    setCommittedBanner(true);
    setTimeout(() => setCommittedBanner(false), 2500);
  };

  const exportCsvTrades = () => {
    const headers = [
      'Symbol',
      'Asset Name',
      'Target Weight (%)',
      'Current Weight (%)',
      'Drift (%)',
      'Current Value (IDR)',
      'Target Value (IDR)',
      'Action',
      'Trade Amount (IDR)',
      'Trade Amount (USD)',
      'Trade Units',
      'Trade IDX Lots',
      'Trade Lots Integer',
      'Lot Remainder (IDR)',
      'Estimated Fee (IDR)',
    ];
    const rows = rebalanceResult.items.map((i) => [
      i.symbol,
      `"${i.name}"`,
      i.targetWeightPercent,
      i.currentWeightPercent,
      i.absoluteDriftPercent,
      i.postShockValueIdr,
      i.targetValueIdr,
      i.action,
      i.tradeAmountIdr,
      i.tradeAmountUsd,
      i.tradeUnits,
      i.tradeLots ?? '',
      i.tradeLotsInteger ?? '',
      i.tradeLotsRemainderIdr ?? 0,
      i.estimatedFeeIdr ?? 0,
    ]);
    const csvContent =
      'data:text/csv;charset=utf-8,' +
      [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute(
      'download',
      `quantporto-rebalance-${new Date().toISOString().slice(0, 10)}.csv`
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Format and copy an actionable WhatsApp / Telegram / Notes Order Slip
  const copyWhatsAppOrderSlip = () => {
    const today = new Date().toLocaleDateString('id-ID', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });

    const sells = rebalanceResult.items.filter(
      (i) => i.action === 'SELL' && Math.abs(i.tradeAmountIdr) >= 1000
    );
    const buys = rebalanceResult.items.filter(
      (i) => i.action === 'BUY' && Math.abs(i.tradeAmountIdr) >= 1000
    );

    const formatOrderUnit = (item: (typeof rebalanceResult.items)[number]) => {
      if (item.isNominalOnly) {
        return 'Nominal Murni';
      }
      const asset = allAssets.find((a) => a.id === item.assetId);
      if (asset?.currency === 'USD') {
        return `${formatUsd(Math.abs(item.tradeAmountUsd))} / ${Math.abs(item.tradeUnits)} unit`;
      }
      if (item.tradeLotsInteger !== undefined) {
        return `≈ ${Math.abs(item.tradeLotsInteger)} Lot (${Math.abs(item.tradeLotsInteger * 100)} lbr)`;
      }
      if (item.tradeLots !== undefined) {
        return `≈ ${Math.abs(item.tradeLots)} Lot (${Math.abs(item.tradeUnits)} lbr)`;
      }
      return `≈ ${Math.abs(item.tradeUnits)} unit`;
    };

    const lines: string[] = [
      `📋 *SLIP EKSEKUSI ORDER — QUANTPORTO*`,
      `📅 Tanggal: ${today}`,
      `💰 Total Portfolio: ${formatIdr(rebalanceResult.finalTargetTotalIdr)}${
        rebalanceResult.cashInjectionIdr > 0
          ? ` (Termasuk Top-Up Kas ${formatIdr(rebalanceResult.cashInjectionIdr)})`
          : ''
      }`,
      `⚙️ Mode: ${
        rebalanceMode === 'sell-and-buy'
          ? 'Full Sell + Buy (Jual Rata)'
          : rebalanceMode === 'selective-profit-trim'
            ? 'Jual Untung Saja (Selective Trim 🎯)'
            : rebalanceMode === 'trim-defensive-first'
              ? 'Prioritas RDPT Dulu 🛡️'
              : 'Buy-Only DCA 💰'
      }`,
      enableIdxLotRounding ? `📦 Pembulatan: Lot Bulat BEI (1 Lot = 100 lbr)` : '',
      filterDustTrades &&
      rebalanceResult.suppressedDustTradesCount !== undefined &&
      rebalanceResult.suppressedDustTradesCount > 0
        ? `🧹 Anti-Dust: ${rebalanceResult.suppressedDustTradesCount} order receh disaring jadi HOLD`
        : '',
      enableBrokerFees &&
      rebalanceResult.totalEstimatedFeeIdr !== undefined &&
      rebalanceResult.totalEstimatedFeeIdr > 0
        ? `💸 Estimasi Fee Broker & Pajak: ≈ ${formatIdr(rebalanceResult.totalEstimatedFeeIdr)}`
        : '',
      rebalanceResult.unallocatedCashRemainderIdr && Math.abs(rebalanceResult.unallocatedCashRemainderIdr) > 100
        ? `🪙 Sisa Kas Pecahan Lot (ke RDPT/Kas): ${formatIdr(rebalanceResult.unallocatedCashRemainderIdr)}`
        : '',
      '',
    ].filter(Boolean);

    if (sells.length > 0) {
      lines.push(`🔴 *INSTRUKSI JUAL (TAKE PROFIT):*`);
      for (const s of sells) {
        lines.push(
          `• *${s.symbol}*: JUAL *${formatIdr(Math.abs(s.tradeAmountIdr))}* (${formatOrderUnit(
            s
          )}) ➔ Target ${s.targetWeightPercent.toFixed(1)}%`
        );
      }
      lines.push('');
    }

    if (buys.length > 0) {
      lines.push(`🟢 *INSTRUKSI BELI (TOP UP / REBALANCE):*`);
      for (const b of buys) {
        lines.push(
          `• *${b.symbol}*: BELI *${formatIdr(b.tradeAmountIdr)}* (${formatOrderUnit(
            b
          )}) ➔ Target ${b.targetWeightPercent.toFixed(1)}%`
        );
      }
      lines.push('');
    }

    if (sells.length === 0 && buys.length === 0) {
      lines.push(`✅ *Seluruh bobot aset sudah seimbang (Tidak ada order).*`);
      lines.push('');
    }

    if (crashLadderSteps.length > 0 && selectedLadderAsset) {
      lines.push(
        `🎯 *JARING LIMIT ORDER CRASH (${selectedLadderAsset.shortName}):*`
      );
      for (const step of crashLadderSteps) {
        const triggerStr =
          selectedLadderAsset.currency === 'USD'
            ? `$${step.limitPriceNative.toLocaleString()}`
            : `Rp ${Math.round(step.limitPriceNative).toLocaleString('id-ID')}`;
        lines.push(
          `• Crash ${step.dropPercent}% (@ ${triggerStr}): Pasang BELI *${formatIdr(
            step.rebalanceBuyAmountIdr
          )}*`
        );
      }
    }

    navigator.clipboard?.writeText(lines.join('\n'));
    setSlipCopied(true);
    setTimeout(() => setSlipCopied(false), 2500);
  };

  const chartData = rebalanceResult.items.map((item) => ({
    symbol: item.assetId,
    Target: item.targetWeightPercent,
    Current: item.currentWeightPercent,
  }));

  const pnlFromShockIdr =
    rebalanceResult.postShockTotalIdr - rebalanceResult.initialTotalIdr;
  const pnlPercent =
    rebalanceResult.initialTotalIdr > 0
      ? (pnlFromShockIdr / rebalanceResult.initialTotalIdr) * 100
      : 0;

  const historyChartData = [...rebalanceHistory]
    .reverse()
    .map((entry, idx) => ({
      step: `#${idx + 1} (${entry.timestamp})`,
      NetWorthJuta: Math.round(entry.totalValueAfterIdr / 1_000_000),
    }));

  return (
    <div className="space-y-6">
      {/* SMART WELCOME BANNER (For New Users with Rp 0 Portfolio) */}
      {rebalanceResult.initialTotalIdr === 0 && !isWelcomeBannerDismissed && (
        <div className="relative overflow-hidden rounded-2xl border border-emerald-500/40 bg-gradient-to-r from-emerald-950/70 via-slate-900 to-sky-950/70 p-4 sm:p-5 shadow-lg backdrop-blur animate-in fade-in duration-200">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-start gap-3.5">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 shadow-inner">
                <Sparkles className="h-5 w-5" />
              </div>
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-bold text-white">
                    Baru Pertama Kali Masuk ke Rebalancer?
                  </h3>
                  <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] font-bold text-emerald-300 border border-emerald-500/40">
                    Mulai Belanja Perdana
                  </span>
                </div>
                <p className="text-xs text-slate-300 max-w-2xl leading-relaxed">
                  Saldo portofolio Anda saat ini masih <strong className="text-white">Rp 0</strong>.
                  Apakah Anda ingin merinci order belanja perdana dari Modal Awal Menu 1 (
                  <strong className="text-emerald-400">{formatIdr(initialCapitalMenu1Idr, true)}</strong>)
                  sesuai racikan <strong className="text-white">{activePortfolioName}</strong>, atau membaca panduan cara kerjanya?
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 self-stretch sm:self-auto shrink-0">
              <button
                type="button"
                onClick={onSetupInitialBuyFromMenu1}
                className="flex-1 sm:flex-initial flex items-center justify-center gap-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs px-3.5 py-2.5 shadow-md shadow-emerald-950/50 transition active:scale-[0.98]"
              >
                <ArrowUpRight className="h-4 w-4" />
                <span>Siapkan Beli Perdana</span>
              </button>

              <button
                type="button"
                onClick={() => setIsGuideModalOpen(true)}
                className="flex items-center justify-center gap-1.5 rounded-xl border border-slate-700 bg-slate-800/80 hover:bg-slate-700 text-slate-200 font-medium text-xs px-3 py-2.5 transition"
              >
                <HelpCircle className="h-4 w-4 text-emerald-400" />
                <span>Buka Panduan</span>
              </button>

              <button
                type="button"
                onClick={() => setIsWelcomeBannerDismissed(true)}
                className="rounded-lg p-2 text-slate-400 hover:text-slate-200 hover:bg-slate-800/60 transition"
                title="Tutup banner ini"
                aria-label="Tutup banner sambutan"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* TOP CONTROL BAR & MENU 1 SYNC / MANUAL ENTRY HUB */}
      <section className="ui-card rounded-xl p-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <Scale className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
              <h2 className="ui-text-main text-sm font-bold sm:text-base">
                Portfolio Rebalancer &amp; Market Crash Simulator
              </h2>
              <span
                className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${
                  isHoldingsSyncedWithMenu1
                    ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                    : 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300'
                }`}
              >
                {isHoldingsSyncedWithMenu1
                  ? `🟢 Auto-Sync Menu 1 (${formatIdr(initialCapitalMenu1Idr, true)})`
                  : '🔒 Mode Posisi Manual (Terkunci)'}
              </span>
            </div>
            <p className="ui-text-muted mt-0.5 text-xs">
              Target Aktif: <strong className="ui-text-main">{activePortfolioName}</strong>{' '}
              — Pilih ambil nilai default dari Menu 1, simulasi beli perdana dari Rp 0,
              atau ketik saldo nyata Anda saat ini per aset.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => setIsGuideModalOpen(true)}
              className="ui-subtle ui-text-main flex items-center gap-1.5 rounded-lg border border-indigo-500/40 bg-indigo-500/10 px-3 py-1.5 text-xs font-semibold hover:bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 transition"
              title="Buka buku panduan lengkap cara belanja perdana vs rebalancing portofolio"
            >
              <Lightbulb className="h-3.5 w-3.5 text-indigo-500 dark:text-indigo-400" />
              <span>Panduan & SOP Eksekusi</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setQuickTotalIdr(initialCapitalMenu1Idr);
                onPopulateCapital(initialCapitalMenu1Idr);
              }}
              className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition ${
                isHoldingsSyncedWithMenu1
                  ? 'border-emerald-500 bg-emerald-600 text-white'
                  : 'ui-subtle ui-text-main hover:opacity-80'
              }`}
            >
              <Coins className="h-3.5 w-3.5" />
              <span>
                Ambil Default Menu 1 ({formatIdr(initialCapitalMenu1Idr, true)})
              </span>
            </button>

            <button
              type="button"
              onClick={onSetupInitialBuyFromMenu1}
              title="Set posisi aset saat ini ke Rp 0 dan masukkan Modal Awal Menu 1 sebagai Kas Baru untuk merinci daftar order BELI perdana"
              className="ui-subtle ui-text-main flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold hover:border-emerald-500/50"
            >
              <ArrowUpRight className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
              <span>
                Beli Perdana dari Rp 0 ({formatIdr(initialCapitalMenu1Idr, true)})
              </span>
            </button>

            <button
              type="button"
              onClick={() => setIsHoldingsTextModalOpen(true)}
              className="ui-subtle ui-text-main flex items-center gap-1.5 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-1.5 text-xs font-semibold hover:opacity-80 transition"
              title="Import atau Export saldo holding melalui teks (Excel / TSV / CSV / format bebas)"
            >
              <FileSpreadsheet className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
              <span>Import / Export Teks (Excel)</span>
            </button>

            <button
              type="button"
              onClick={onClearHoldingsForManualInput}
              title="Kosongkan seluruh posisi aset ke Rp 0 untuk mengetik nilai saldo nyata Anda satu per satu"
              className="ui-subtle ui-text-main flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium hover:opacity-80"
            >
              <RotateCcw className="h-3.5 w-3.5 text-amber-500" />
              <span>Isi Manual (Reset Rp 0)</span>
            </button>

            <button
              type="button"
              onClick={onLoadVideo1BExample}
              className="ui-subtle ui-text-main flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium hover:opacity-80"
            >
              <Coins className="h-3.5 w-3.5" />
              <span>Contoh Video Rp 1M</span>
            </button>

            <button
              type="button"
              onClick={onApplyPeerDiversification}
              className="ui-subtle ui-text-main flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium hover:opacity-80"
            >
              <Split className="h-3.5 w-3.5" />
              <span>Split Sub-Bank</span>
            </button>
          </div>
        </div>

        {/* Quick What-If Total Portfolio Value Allocator */}
        <div className="ui-subtle mt-3 flex flex-col gap-2.5 rounded-lg p-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="ui-text-main font-semibold">
              Kalkulator Cepat Total Posisi Saat Ini:
            </span>
            <div className="ui-card flex items-center gap-1 rounded-md border px-2 py-1">
              <span className="ui-text-muted font-mono text-[11px]">Rp</span>
              <FormattedNumberInput
                step={10_000_000}
                min={0}
                value={quickTotalIdr}
                onChange={(val) => setQuickTotalIdr(val)}
                className="ui-text-main w-32 bg-transparent font-mono text-xs font-bold focus:outline-none"
                ariaLabel="Quick Total Portfolio Value in IDR"
              />
            </div>
            <div className="flex flex-wrap gap-1 text-[10px]">
              {[50_000_000, 100_000_000, 250_000_000, 500_000_000, 1_000_000_000].map(
                (presetTotal) => (
                  <button
                    key={presetTotal}
                    type="button"
                    onClick={() => {
                      setQuickTotalIdr(presetTotal);
                      onScaleTotalHoldingsIdr(presetTotal, 'target');
                    }}
                    className="ui-card ui-text-secondary rounded px-1.5 py-0.5 font-mono hover:opacity-80"
                  >
                    {formatIdr(presetTotal, true)}
                  </button>
                )
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => onScaleTotalHoldingsIdr(quickTotalIdr, 'target')}
              className="rounded-md bg-emerald-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-emerald-500"
            >
              Bagi Sesuai Target Menu 1
            </button>
            <button
              type="button"
              onClick={() => onScaleTotalHoldingsIdr(quickTotalIdr, 'current')}
              title="Ubah total nilai portofolio dengan mempertahankan proporsi persentase posisi saat ini"
              className="ui-card ui-text-main rounded-md border px-2.5 py-1 text-xs font-medium hover:opacity-80"
            >
              Skalakan Proporsi Saat Ini
            </button>
          </div>
        </div>

        {/* Market Crash / Bull Run Stress-Test Bar */}
        <div id="tour-stress-scenarios" className="ui-subtle mt-4 rounded-lg p-3.5">
          <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-1.5">
              <Zap className="h-3.5 w-3.5 text-amber-500" />
              <span className="ui-text-main text-xs font-semibold">
                Simulasi Market Crash &amp; Bull Run (15:18 – 16:05):
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={() => onApplyShockScenario('video-bull-3x')}
                className="ui-card ui-text-main flex items-center gap-1 rounded px-2.5 py-1 text-xs font-medium hover:opacity-80"
              >
                <TrendingUp className="h-3 w-3 text-emerald-600" />
                <span>Skenario 1: BTC &amp; ETH 3x (+200%), BBCA -10%</span>
              </button>

              <button
                type="button"
                onClick={() => onApplyShockScenario('video-crash-50')}
                className="ui-card ui-text-main flex items-center gap-1 rounded px-2.5 py-1 text-xs font-medium hover:opacity-80"
              >
                <TrendingDown className="h-3 w-3 text-rose-600" />
                <span>Skenario 2: Crypto Crash -50% (Buy Dip)</span>
              </button>

              <button
                type="button"
                onClick={() => onApplyShockScenario('global-crisis')}
                className="ui-card ui-text-main rounded px-2.5 py-1 text-xs font-medium hover:opacity-80"
              >
                Krisis Global (Saham -35%, Crypto -60%)
              </button>

              <button
                type="button"
                onClick={() => onApplyShockScenario('reset')}
                className="ui-card ui-text-muted flex items-center gap-1 rounded px-2 py-1 text-xs font-medium hover:opacity-80"
              >
                <RotateCcw className="h-3 w-3" />
                <span>Reset (0%)</span>
              </button>

              <button
                type="button"
                onClick={() => setShowShockSliders(!showShockSliders)}
                className="ui-text-secondary ml-1 text-xs underline"
              >
                {showShockSliders ? 'Tutup Slider' : 'Custom Shock'}
              </button>
            </div>
          </div>

          {showShockSliders && (
            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-8">
              {rebalanceResult.items.map((item) => {
                const shock = holdings[item.assetId]?.shockPercent ?? 0;
                return (
                  <div key={item.assetId} className="ui-card rounded p-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="ui-text-main font-semibold">
                        {item.assetId}
                      </span>
                      <span
                        className={`font-mono font-semibold ${
                          shock > 0
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : shock < 0
                              ? 'text-rose-600 dark:text-rose-400'
                              : 'ui-text-muted'
                        }`}
                      >
                        {shock > 0 ? `+${shock}%` : `${shock}%`}
                      </span>
                    </div>
                    <input
                      type="range"
                      min={-80}
                      max={300}
                      step={5}
                      value={shock}
                      onChange={(e) =>
                        onUpdateHolding(item.assetId, {
                          shockPercent: Number(e.target.value),
                        })
                      }
                      className="mt-1.5 h-1 w-full cursor-pointer"
                      aria-label={`Price shock percent for ${item.assetId}`}
                    />
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>

      {/* KPI SUMMARY CARDS */}
      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="ui-card rounded-xl p-4">
          <div className="ui-text-muted text-xs font-medium">
            Nilai Porto Saat Ini (Post-Shock)
          </div>
          <div className="ui-text-main mt-1 font-mono text-xl font-bold">
            {formatIdr(rebalanceResult.postShockTotalIdr)}
          </div>
          <div className="mt-1 flex items-center gap-1.5 text-xs">
            <span className="ui-text-muted">
              Awal: {formatIdr(rebalanceResult.initialTotalIdr, true)}
            </span>
            {pnlFromShockIdr !== 0 && (
              <span
                className={`font-mono font-semibold ${
                  pnlFromShockIdr > 0
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : 'text-rose-600 dark:text-rose-400'
                }`}
              >
                ({pnlFromShockIdr > 0 ? '+' : ''}
                {pnlPercent.toFixed(1)}%)
              </span>
            )}
          </div>
        </div>

        <div className="ui-card rounded-xl p-4">
          <div className="flex items-center justify-between">
            <span className="ui-text-muted text-xs font-medium">
              Top-Up Kas Baru (DCA Injection)
            </span>
            <span className="font-mono text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">
              {formatIdr(cashInjectionIdr, true)}
            </span>
          </div>
          <div className="mt-1 flex items-center gap-1.5">
            <span className="ui-text-muted font-mono text-xs font-semibold">Rp</span>
            <FormattedNumberInput
              step={1_000_000}
              min={0}
              value={cashInjectionIdr}
              onChange={(val) => setCashInjectionIdr(val)}
              className="ui-input w-full rounded px-2 py-1 font-mono text-sm font-semibold"
              ariaLabel="Top-up Cash Injection in IDR"
            />
          </div>
          <div className="mt-1.5 flex flex-wrap gap-1 text-[10px]">
            <button
              type="button"
              onClick={() => setCashInjectionIdr(monthlySavingsMenu1Idr)}
              title="Ambil nilai Custom DCA Bulanan dari Menu 1"
              className={`rounded px-1.5 py-0.5 font-mono font-semibold ${
                cashInjectionIdr === monthlySavingsMenu1Idr
                  ? 'bg-emerald-600 text-white'
                  : 'border border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
              }`}
            >
              +DCA Menu 1 ({formatIdr(monthlySavingsMenu1Idr, true)})
            </button>
            {[0, 5_000_000, 10_000_000, 50_000_000].map((presetCash) => (
              <button
                key={presetCash}
                type="button"
                onClick={() => setCashInjectionIdr(presetCash)}
                className="ui-subtle ui-text-secondary rounded px-1.5 py-0.5 font-mono"
              >
                {presetCash === 0 ? 'Reset 0' : `+${presetCash / 1_000_000}Jt`}
              </button>
            ))}
          </div>
        </div>

        <div className="ui-card rounded-xl p-4">
          <div className="flex items-center justify-between">
            <span className="ui-text-muted text-xs font-medium">
              Mode Eksekusi Rebalancing
            </span>
            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-indigo-500/10 text-indigo-600 dark:text-indigo-400">
              {rebalanceMode === 'selective-profit-trim'
                ? 'Selective Trim'
                : rebalanceMode === 'trim-defensive-first'
                  ? 'Defensive First'
                  : rebalanceMode === 'buy-only-dca'
                    ? 'Buy-Only DCA'
                    : 'Full Rebalance'}
            </span>
          </div>

          <div className="mt-2 grid grid-cols-2 gap-1.5">
            <button
              type="button"
              onClick={() => setRebalanceMode('selective-profit-trim')}
              className={`flex items-center justify-between rounded-lg px-2.5 py-1.5 text-xs font-medium transition ${
                rebalanceMode === 'selective-profit-trim'
                  ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 font-bold ring-1 ring-emerald-500/30 shadow-2xs'
                  : 'ui-subtle ui-text-secondary hover:ui-text-main'
              }`}
              title="Hanya jual aset yang surplus/kelebihan bobot signifikan. Aset dengan drift kecil di-HOLD tanpa penjualan receh."
            >
              <span>🎯 Untung Saja</span>
              {rebalanceMode === 'selective-profit-trim' && (
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              )}
            </button>

            <button
              type="button"
              onClick={() => setRebalanceMode('trim-defensive-first')}
              className={`flex items-center justify-between rounded-lg px-2.5 py-1.5 text-xs font-medium transition ${
                rebalanceMode === 'trim-defensive-first'
                  ? 'bg-blue-500/15 text-blue-700 dark:text-blue-300 font-bold ring-1 ring-blue-500/30 shadow-2xs'
                  : 'ui-subtle ui-text-secondary hover:ui-text-main'
              }`}
              title="Cairkan dana dari aset defensif (RDPT/RDPU/Kas) untuk membeli aset diskon, tanpa menjual saham/kripto."
            >
              <span>🛡️ RDPT Dulu</span>
              {rebalanceMode === 'trim-defensive-first' && (
                <span className="h-1.5 w-1.5 rounded-full bg-blue-500" />
              )}
            </button>

            <button
              type="button"
              onClick={() => setRebalanceMode('sell-and-buy')}
              className={`flex items-center justify-between rounded-lg px-2.5 py-1.5 text-xs font-medium transition ${
                rebalanceMode === 'sell-and-buy'
                  ? 'bg-purple-500/15 text-purple-700 dark:text-purple-300 font-bold ring-1 ring-purple-500/30 shadow-2xs'
                  : 'ui-subtle ui-text-secondary hover:ui-text-main'
              }`}
              title="Jual rata seluruh aset yang kelebihan bobot secara proporsional (rumus modern portfolio theory standar)."
            >
              <span>⚖️ Jual Rata</span>
              {rebalanceMode === 'sell-and-buy' && (
                <span className="h-1.5 w-1.5 rounded-full bg-purple-500" />
              )}
            </button>

            <button
              type="button"
              onClick={() => setRebalanceMode('buy-only-dca')}
              className={`flex items-center justify-between rounded-lg px-2.5 py-1.5 text-xs font-medium transition ${
                rebalanceMode === 'buy-only-dca'
                  ? 'bg-amber-500/15 text-amber-700 dark:text-amber-300 font-bold ring-1 ring-amber-500/30 shadow-2xs'
                  : 'ui-subtle ui-text-secondary hover:ui-text-main'
              }`}
              title="Tanpa jual aset ($0 jual). Alokasikan suntikan kas baru ke aset yang paling underweight."
            >
              <span>💰 DCA Saja</span>
              {rebalanceMode === 'buy-only-dca' && (
                <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
              )}
            </button>
          </div>

          <div className="ui-text-muted mt-2 text-[11px] leading-snug">
            {rebalanceMode === 'selective-profit-trim' && (
              <span className="text-emerald-600 dark:text-emerald-400">
                Pangkas hanya pemenang terbesar (overweight) untuk mendanai aset diskon. Aset netral tetap <strong>HOLD</strong>.
              </span>
            )}
            {rebalanceMode === 'trim-defensive-first' && (
              <span className="text-blue-600 dark:text-blue-400">
                Cairkan buffer kas / RDPT untuk beli aset diskon. Aset pertumbuhan (SPY, QQQ, BTC) aman dari aksi jual.
              </span>
            )}
            {rebalanceMode === 'sell-and-buy' && (
              <span>
                Jual seluruh aset overweight dan beli underweight secara proporsional (standar textbook).
              </span>
            )}
            {rebalanceMode === 'buy-only-dca' && (
              <span className="text-amber-600 dark:text-amber-400">
                Tanpa jual aset sama sekali. Alokasikan kas baru untuk mengakumulasi aset diskon.
              </span>
            )}
          </div>
        </div>

        <div className="ui-card rounded-xl p-4">
          <div className="ui-text-muted flex items-center justify-between text-xs font-medium">
            <span>Status Drift Bobot</span>
            <span>±{driftThresholdPercent}%</span>
          </div>
          <div className="mt-1 flex items-center gap-1.5">
            {rebalanceResult.breachedCount > 0 ? (
              <>
                <AlertCircle className="h-4 w-4 text-amber-500" />
                <span className="ui-text-main font-mono text-base font-bold">
                  {rebalanceResult.breachedCount} Aset Perlu Rebalance
                </span>
              </>
            ) : (
              <>
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                <span className="font-mono text-base font-bold text-emerald-600 dark:text-emerald-400">
                  Seimbang (Optimal)
                </span>
              </>
            )}
          </div>
          <input
            type="range"
            min={1}
            max={10}
            step={0.5}
            value={driftThresholdPercent}
            onChange={(e) => setDriftThresholdPercent(Number(e.target.value))}
            className="mt-2 h-1.5 w-full cursor-pointer"
            aria-label="Drift tolerance threshold percentage"
          />
        </div>
      </section>

      {/* MAIN REBALANCING TABLE & DRIFT CHART */}
      <section className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <div id="tour-rebalance-table-container" className="ui-card rounded-xl p-5 lg:col-span-8">
          <div className="ui-border flex flex-wrap items-center justify-between gap-2 border-b pb-3">
            <div>
              <h3 className="ui-text-main text-sm font-bold">
                Tabel Instruksi Jual / Beli Rebalancing
              </h3>
              <p className="ui-text-muted text-xs">
                Ubah nilai Rupiah saat ini atau jumlah Unit/Lot untuk menghitung order:
              </p>
            </div>

            <div id="tour-rebalance-actions" className="flex flex-wrap items-center gap-1.5">
              {/* Unified Broker Slip & Quick Copy Button Group */}
              {onOpenOrderSlip ? (
                <div className="inline-flex rounded-md shadow-xs">
                  <button
                    type="button"
                    onClick={onOpenOrderSlip}
                    className="inline-flex items-center gap-1.5 rounded-l-md bg-indigo-600 hover:bg-indigo-500 text-white px-2.5 py-1 text-xs font-semibold transition"
                    title="Buka Slip Order Broker Interaktif (Stockbit / Pluang / Reku / Makmur)"
                  >
                    <Building2 className="h-3.5 w-3.5" />
                    <span>Slip Order Broker</span>
                  </button>
                  <button
                    type="button"
                    onClick={copyWhatsAppOrderSlip}
                    title="Salin Cepat Format WhatsApp / Catatan ke Clipboard"
                    className="inline-flex items-center gap-1 rounded-r-md bg-indigo-700 hover:bg-indigo-600 text-white px-2 py-1 text-xs border-l border-indigo-500/40 transition"
                  >
                    {slipCopied ? (
                      <>
                        <Check className="h-3.5 w-3.5 text-emerald-300" />
                        <span className="hidden sm:inline">Tersalin!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="h-3.5 w-3.5" />
                        <span className="hidden sm:inline">Salin Cepat</span>
                      </>
                    )}
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={copyWhatsAppOrderSlip}
                  title="Salin daftar order Jual/Beli & Limit Order Crash untuk ditempel ke WhatsApp atau aplikasi Catatan"
                  className="flex items-center gap-1 rounded-md bg-emerald-600 px-2.5 py-1 text-xs font-semibold text-white transition hover:bg-emerald-500"
                >
                  {slipCopied ? (
                    <>
                      <Check className="h-3.5 w-3.5" />
                      <span>Slip Tersalin!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="h-3.5 w-3.5" />
                      <span>Salin Slip Order (WA/Notes)</span>
                    </>
                  )}
                </button>
              )}

              <div className="ui-subtle flex rounded-md p-0.5 text-xs">
                <button
                  type="button"
                  onClick={() => {
                    setHoldingEntryMode('nominal');
                    setInputMode('nominal');
                  }}
                  className={`rounded px-2 py-1 font-medium ${
                    holdingEntryMode === 'nominal'
                      ? 'ui-card ui-text-main font-semibold shadow-2xs'
                      : 'ui-text-muted'
                  }`}
                >
                  Nominal (Rp)
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setHoldingEntryMode('percent');
                    setInputMode('nominal');
                  }}
                  className={`rounded px-2 py-1 font-medium ${
                    holdingEntryMode === 'percent'
                      ? 'ui-card ui-text-main font-semibold shadow-2xs'
                      : 'ui-text-muted'
                  }`}
                >
                  % Saat Ini
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setHoldingEntryMode('units');
                    setInputMode('units');
                  }}
                  className={`rounded px-2 py-1 font-medium ${
                    holdingEntryMode === 'units'
                      ? 'ui-card ui-text-main font-semibold shadow-2xs'
                      : 'ui-text-muted'
                  }`}
                >
                  Unit / Lot
                </button>
              </div>

              {/* Hybrid Table vs Mobile Card View Toggle */}
              <div className="ui-subtle flex items-center gap-0.5 rounded-md p-0.5 text-xs">
                <button
                  type="button"
                  onClick={() => setRebalanceViewMode('table')}
                  className={`flex items-center gap-1 rounded px-2 py-1 font-medium ${
                    rebalanceViewMode === 'table'
                      ? 'ui-card ui-text-main font-semibold shadow-2xs'
                      : 'ui-text-muted'
                  }`}
                >
                  <Table2 className="h-3 w-3" />
                  <span>Tabel</span>
                </button>
                <button
                  type="button"
                  onClick={() => setRebalanceViewMode('cards')}
                  className={`flex items-center gap-1 rounded px-2 py-1 font-medium ${
                    rebalanceViewMode === 'cards'
                      ? 'ui-card ui-text-main font-semibold shadow-2xs'
                      : 'ui-text-muted'
                  }`}
                >
                  <LayoutGrid className="h-3 w-3" />
                  <span>Kartu</span>
                </button>
              </div>

              <button
                type="button"
                onClick={exportCsvTrades}
                className="ui-subtle ui-text-main flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium"
              >
                <Download className="h-3.5 w-3.5" />
                <span>CSV</span>
              </button>
            </div>
          </div>

          {/* Practical Execution Settings: Lot Rounding & Broker Fee Toggles */}
          <div className="ui-subtle mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg px-3 py-2 text-xs">
            <div className="flex flex-wrap items-center gap-2">
              <span className="ui-text-muted font-medium">Pengaturan Eksekusi:</span>

              {setEnableIdxLotRounding && (
                <button
                  type="button"
                  onClick={() => setEnableIdxLotRounding(!enableIdxLotRounding)}
                  className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 font-medium transition ${
                    enableIdxLotRounding
                      ? 'bg-emerald-600 font-semibold text-white'
                      : 'ui-card ui-text-secondary hover:opacity-80'
                  }`}
                  title="Bulatkan order saham Indonesia ke kelipatan 100 lembar (1 Lot BEI). Sisa receh otomatis dialihkan ke RDPT/RDPU."
                >
                  <span>📦 Bulatkan Lot BEI (1 Lot = 100 lbr)</span>
                  <span className="rounded bg-black/20 px-1 text-[10px]">
                    {enableIdxLotRounding ? 'ON' : 'OFF'}
                  </span>
                </button>
              )}

              {setEnableBrokerFees && (
                <button
                  type="button"
                  onClick={() => setEnableBrokerFees(!enableBrokerFees)}
                  className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 font-medium transition ${
                    enableBrokerFees
                      ? 'bg-amber-600 font-semibold text-white'
                      : 'ui-card ui-text-secondary hover:opacity-80'
                  }`}
                  title="Hitung estimasi fee broker & pajak final (IDX beli 0.15%, jual 0.25%, US 0.1%, Crypto 0.15%, Reksadana 0%)"
                >
                  <span>💸 Fee Broker &amp; Pajak</span>
                  <span className="rounded bg-black/20 px-1 text-[10px]">
                    {enableBrokerFees ? 'ON' : 'OFF'}
                  </span>
                </button>
              )}

              {setFilterDustTrades && (
                <button
                  type="button"
                  onClick={() => setFilterDustTrades(!filterDustTrades)}
                  className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 font-medium transition ${
                    filterDustTrades
                      ? 'bg-indigo-600 font-semibold text-white'
                      : 'ui-card ui-text-secondary hover:opacity-80'
                  }`}
                  title="Saring otomatis transaksi mikro di bawah Rp 25.000 (~$1.5) menjadi HOLD agar slip order bersih dan bebas biaya transaksi receh."
                >
                  <span>🧹 Saring Receh (&lt; 25rb)</span>
                  <span className="rounded bg-black/20 px-1 text-[10px]">
                    {filterDustTrades ? 'ON' : 'OFF'}
                  </span>
                </button>
              )}

              {rebalanceResult.suppressedDustTradesCount !== undefined &&
                rebalanceResult.suppressedDustTradesCount > 0 && (
                  <span className="inline-flex items-center gap-1 rounded bg-indigo-500/15 px-2 py-0.5 text-[11px] font-semibold text-indigo-700 dark:text-indigo-300">
                    ✨ {rebalanceResult.suppressedDustTradesCount} order receh disaring
                  </span>
                )}

              {anyPriceModified && onResetAllAssetPrices && (
                <button
                  type="button"
                  onClick={onResetAllAssetPrices}
                  className="flex items-center gap-1.5 rounded-md bg-rose-500/15 px-2.5 py-1 text-xs font-semibold text-rose-600 dark:text-rose-400 hover:bg-rose-500/25 transition"
                  title="Kembalikan semua harga spot aset ke harga pasar default"
                >
                  <RotateCcw className="h-3 w-3" />
                  <span>Reset Semua Harga Pasar</span>
                </button>
              )}
            </div>

            {rebalanceResult.unallocatedCashRemainderIdr &&
            Math.abs(rebalanceResult.unallocatedCashRemainderIdr) > 100 ? (
              <div className="flex items-center gap-1 font-mono text-[11px] text-emerald-600 dark:text-emerald-400">
                <span>Sisa Pecahan Lot:</span>
                <strong className="font-bold">
                  {formatIdr(rebalanceResult.unallocatedCashRemainderIdr)}
                </strong>
                <span className="ui-text-muted font-sans text-[10px]">
                  (dialihkan ke RDPT)
                </span>
              </div>
            ) : null}
          </div>

          {rebalanceViewMode === 'table' ? (
            <div
              id="tour-rebalance-table"
              tabIndex={0}
              role="region"
              aria-labelledby="rebalancer-table-caption"
              className="ui-border mt-4 overflow-x-auto rounded-lg border"
            >
              <table className="w-full border-separate border-spacing-0 text-left text-xs">
                <caption id="rebalancer-table-caption" className="sr-only">
                  Tabel Instruksi Jual dan Beli Rebalancing berdasarkan Posisi Saat Ini
                  dan Bobot Target
                </caption>
                <thead className="ui-subtle text-[11px] font-semibold uppercase">
                  <tr>
                    <th className="ui-subtle ui-border sticky left-0 z-20 border-b border-r px-3 py-2 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.18)]">
                      Instrumen
                    </th>
                    <th className="ui-border border-b px-3 py-2 text-right">
                      Input Posisi Awal
                    </th>
                    <th className="ui-border border-b px-3 py-2 text-right">
                      Nilai Saat Ini
                    </th>
                    <th className="ui-border border-b px-2.5 py-2 text-right">
                      Now vs Target
                    </th>
                    <th className="ui-border border-b px-3 py-2 text-right">
                      Target (Rp)
                    </th>
                    <th className="ui-border border-b px-3 py-2 text-right">
                      Action (Jual / Beli)
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rebalanceResult.items.map((item) => {
                    const asset = allAssets.find((a) => a.id === item.assetId)!;
                    const h = holdings[item.assetId] ?? {
                      assetId: item.assetId,
                      currentValueIdr: 0,
                      units: 0,
                      currentPrice: asset?.defaultPrice ?? 1,
                      shockPercent: 0,
                    };

                    return (
                      <tr
                        key={item.assetId}
                        className={
                          item.isDriftBreached
                            ? 'bg-amber-500/5'
                            : 'hover:bg-zinc-500/5'
                        }
                      >
                        <th
                          scope="row"
                          className="ui-card ui-border sticky left-0 z-10 border-b border-r px-3 py-2.5 font-normal shadow-[2px_0_5px_-2px_rgba(0,0,0,0.18)] min-w-[170px]"
                        >
                          {(() => {
                            const isNominal =
                              h.isNominalOnly ??
                              (asset?.category === 'bonds' || asset?.category === 'money-market');

                            if (isNominal) {
                              return (
                                <div className="flex items-start gap-2">
                                  <span
                                    className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full"
                                    style={{ backgroundColor: item.color }}
                                  />
                                  <div className="flex-1 space-y-1">
                                    <div className="flex items-center justify-between gap-1">
                                      <span className="ui-text-main font-bold text-xs">{item.symbol}</span>
                                    </div>

                                    <div className="flex items-center gap-1.5 pt-0.5">
                                      <span
                                        className="inline-flex items-center gap-1 rounded bg-sky-500/10 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-sky-600 dark:text-sky-400 border border-sky-500/20 select-none"
                                        title="Aset bebas harga pasar. Dikelola murni berdasarkan saldo nominal Rupiah."
                                      >
                                        🏷️ Nominal Murni
                                      </span>
                                      <button
                                        type="button"
                                        onClick={() =>
                                          onUpdateHolding(item.assetId, {
                                            isNominalOnly: false,
                                            currentPrice: asset?.defaultPrice ?? 1,
                                          })
                                        }
                                        className="ui-text-muted hover:ui-text-main text-[9px] underline decoration-dotted transition"
                                        title="Ubah ke mode input harga pasar per unit"
                                      >
                                        Atur Harga
                                      </button>
                                    </div>
                                  </div>
                                </div>
                              );
                            }

                            const priceDiffPct = asset?.defaultPrice
                              ? ((h.currentPrice - asset.defaultPrice) / asset.defaultPrice) * 100
                              : 0;
                            const isPriceCustom = Math.abs(priceDiffPct) >= 0.1;

                            return (
                              <div className="flex items-start gap-2">
                                <span
                                  className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full"
                                  style={{ backgroundColor: item.color }}
                                />
                                <div className="flex-1 space-y-1">
                                  <div className="flex items-center justify-between gap-1">
                                    <span className="ui-text-main font-bold text-xs">{item.symbol}</span>
                                    {isPriceCustom && (
                                      <span
                                        className={`rounded px-1 py-0.2 font-mono text-[9px] font-bold ${
                                          priceDiffPct < 0
                                            ? 'bg-rose-500/15 text-rose-600 dark:text-rose-400'
                                            : 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                                        }`}
                                        title={`Perubahan harga: ${priceDiffPct > 0 ? '+' : ''}${priceDiffPct.toFixed(1)}% dari harga normal (${formatPriceDisplay(asset?.defaultPrice ?? 1, asset?.currency)})`}
                                      >
                                        {priceDiffPct < 0 ? '▼' : '▲'} {Math.abs(priceDiffPct).toFixed(1)}%
                                      </span>
                                    )}
                                  </div>

                                  {/* Editable Spot Price Input */}
                                  <div className="flex items-center gap-1">
                                    <span className="ui-text-muted font-mono text-[10px] select-none">
                                      {asset?.currency === 'USD' ? '$' : 'Rp'}
                                    </span>
                                    <input
                                      type="number"
                                      step={asset?.currency === 'USD' ? (h.currentPrice < 10 ? '0.01' : '1') : '25'}
                                      min={0.0001}
                                      value={h.currentPrice}
                                      onChange={(e) =>
                                        onUpdateHolding(item.assetId, {
                                          currentPrice: Math.max(0.000001, Number(e.target.value)),
                                        })
                                      }
                                      className={`ui-input rounded px-1.5 py-0.5 font-mono text-[11px] font-semibold text-right ${
                                        isPriceCustom ? 'border-amber-500 text-amber-600 dark:text-amber-400' : ''
                                      }`}
                                      style={{ width: asset?.currency === 'USD' ? '5.5rem' : '6.5rem' }}
                                      title={`Ketik harga pasar untuk simulasi. Normal: ${formatPriceDisplay(asset?.defaultPrice ?? 1, asset?.currency)}`}
                                      aria-label={`Harga pasar ${item.symbol}`}
                                    />
                                    {isPriceCustom && (
                                      <button
                                        type="button"
                                        onClick={() =>
                                          onUpdateHolding(item.assetId, {
                                            currentPrice: asset?.defaultPrice ?? 1,
                                          })
                                        }
                                        className="ui-text-muted hover:text-emerald-500 p-0.5 rounded transition"
                                        title={`Reset ke harga pasar normal (${formatPriceDisplay(asset?.defaultPrice ?? 1, asset?.currency)})`}
                                      >
                                        <RotateCcw className="h-2.5 w-2.5" />
                                      </button>
                                    )}
                                    <button
                                      type="button"
                                      onClick={() =>
                                        onUpdateHolding(item.assetId, {
                                          isNominalOnly: true,
                                          currentPrice: 1,
                                        })
                                      }
                                      className="ui-text-muted hover:text-sky-500 p-0.5 rounded transition"
                                      title="Jadikan Aset Nominal Murni (Abaikan harga pasar unit)"
                                    >
                                      <Tag className="h-2.5 w-2.5" />
                                    </button>
                                  </div>

                                  {/* Quick Drop Chips: [-10%] [-20%] [-35%] [-50%] */}
                                  <div className="flex items-center gap-1 pt-0.5">
                                    <span className="ui-text-muted text-[9px] select-none">Drop:</span>
                                    {[10, 20, 35, 50].map((dropPct) => {
                                      const defaultP = asset?.defaultPrice ?? 1;
                                      const discountedPrice = Number(
                                        (defaultP * (1 - dropPct / 100)).toFixed(asset?.currency === 'USD' && defaultP < 10 ? 4 : 2)
                                      );
                                      const isActive = Math.abs(h.currentPrice - discountedPrice) < 0.01;
                                      return (
                                        <button
                                          key={dropPct}
                                          type="button"
                                          onClick={() =>
                                            onUpdateHolding(item.assetId, {
                                              currentPrice: discountedPrice,
                                            })
                                          }
                                          className={`rounded px-1 py-0.2 font-mono text-[9px] transition ${
                                            isActive
                                              ? 'bg-rose-500 text-white font-bold'
                                              : 'ui-subtle ui-text-muted hover:text-rose-500'
                                          }`}
                                          title={`Simulasi harga anjlok -${dropPct}% menjadi ${formatPriceDisplay(discountedPrice, asset?.currency)}`}
                                        >
                                          -{dropPct}%
                                        </button>
                                      );
                                    })}
                                  </div>
                                </div>
                              </div>
                            );
                          })()}
                        </th>

                        <td className="ui-border border-b px-3 py-2.5 text-right">
                          {holdingEntryMode === 'nominal' ? (
                            <div className="flex flex-col items-end gap-1">
                              <FormattedNumberInput
                                step={1_000_000}
                                min={0}
                                value={h.currentValueIdr}
                                onChange={(val) =>
                                  onUpdateHolding(item.assetId, {
                                    currentValueIdr: val,
                                  })
                                }
                                className="ui-input w-32 rounded px-2 py-1 text-right font-mono text-xs font-medium"
                                ariaLabel={`Nominal value in IDR for ${item.symbol}`}
                              />
                              <div className="flex items-center gap-1 text-[9px]">
                                <button
                                  type="button"
                                  onClick={() =>
                                    onUpdateHolding(item.assetId, {
                                      currentValueIdr: Math.round(
                                        initialCapitalMenu1Idr *
                                          ((targetWeights[item.assetId] ?? 0) / 100)
                                      ),
                                    })
                                  }
                                  title="Isi otomatis sesuai porsi Modal Awal Menu 1"
                                  className="ui-subtle ui-text-muted rounded px-1 py-0.5 hover:text-emerald-600"
                                >
                                  =Default M1
                                </button>
                                <button
                                  type="button"
                                  onClick={() =>
                                    onUpdateHolding(item.assetId, {
                                      currentValueIdr: 0,
                                    })
                                  }
                                  className="ui-subtle ui-text-muted rounded px-1 py-0.5 hover:text-rose-500"
                                >
                                  Rp 0
                                </button>
                              </div>
                            </div>
                          ) : holdingEntryMode === 'percent' ? (
                            <div className="flex flex-col items-end gap-1">
                              <div className="flex items-center gap-1">
                                <input
                                  type="number"
                                  step={0.5}
                                  min={0}
                                  max={100}
                                  value={Number(item.currentWeightPercent.toFixed(1))}
                                  onChange={(e) => {
                                    const pct = Math.max(
                                      0,
                                      Math.min(100, Number(e.target.value))
                                    );
                                    const baseTotal =
                                      rebalanceResult.initialTotalIdr > 0
                                        ? rebalanceResult.initialTotalIdr
                                        : initialCapitalMenu1Idr;
                                    onUpdateHolding(item.assetId, {
                                      currentValueIdr: Math.round(
                                        baseTotal * (pct / 100)
                                      ),
                                    });
                                  }}
                                  className="ui-input w-20 rounded px-2 py-1 text-right font-mono text-xs font-semibold"
                                  aria-label={`Current weight percentage for ${item.symbol}`}
                                />
                                <span className="ui-text-muted font-mono text-xs">
                                  %
                                </span>
                              </div>
                              <span className="ui-text-muted font-mono text-[10px]">
                                ≈ {formatIdr(h.currentValueIdr, true)}
                              </span>
                            </div>
                          ) : (
                            <div className="flex flex-col items-end gap-1">
                              <div className="flex items-center gap-1">
                                <input
                                  type="number"
                                  step="any"
                                  value={h.units}
                                  onChange={(e) =>
                                    onUpdateHolding(item.assetId, {
                                      units: Math.max(0, Number(e.target.value)),
                                    })
                                  }
                                  className="ui-input w-20 rounded px-1.5 py-0.5 text-right font-mono text-xs"
                                  aria-label={`Units held for ${item.symbol}`}
                                />
                                <span className="ui-text-muted text-[10px]">unit</span>
                              </div>
                              <div className="flex items-center gap-1">
                                <span className="ui-text-muted text-[10px]">@</span>
                                <input
                                  type="number"
                                  step="any"
                                  value={h.currentPrice}
                                  onChange={(e) =>
                                    onUpdateHolding(item.assetId, {
                                      currentPrice: Math.max(
                                        0.01,
                                        Number(e.target.value)
                                      ),
                                    })
                                  }
                                  className="ui-input w-20 rounded px-1.5 py-0.5 text-right font-mono text-[10px]"
                                  aria-label={`Current unit price for ${item.symbol}`}
                                />
                              </div>
                            </div>
                          )}
                        </td>

                        <td className="ui-border ui-text-secondary border-b px-3 py-2.5 text-right font-mono">
                          <div>{formatIdr(item.postShockValueIdr)}</div>
                          {h.shockPercent !== 0 && (
                            <div
                              className={`text-[10px] ${
                                h.shockPercent > 0
                                  ? 'text-emerald-600 dark:text-emerald-400'
                                  : 'text-rose-600 dark:text-rose-400'
                              }`}
                            >
                              Shock{' '}
                              {h.shockPercent > 0
                                ? `+${h.shockPercent}%`
                                : `${h.shockPercent}%`}
                            </div>
                          )}
                        </td>

                        <td className="ui-border border-b px-2.5 py-2.5 text-right font-mono">
                          <div className="ui-text-main font-semibold">
                            {item.currentWeightPercent.toFixed(1)}%{' '}
                            <span className="ui-text-muted font-normal">
                              / {item.targetWeightPercent.toFixed(1)}%
                            </span>
                          </div>
                          <div
                            className={`text-[10px] font-medium ${
                              item.isDriftBreached
                                ? 'text-amber-600 dark:text-amber-400'
                                : 'ui-text-muted'
                            }`}
                          >
                            Drift: {item.absoluteDriftPercent > 0 ? '+' : ''}
                            {item.absoluteDriftPercent.toFixed(1)}%
                          </div>
                        </td>

                        <td className="ui-border ui-text-main border-b px-3 py-2.5 text-right font-mono font-semibold">
                          {formatIdr(item.targetValueIdr)}
                        </td>

                        <td className="ui-border border-b px-3 py-2.5 text-right">
                          {item.action === 'BUY' ? (
                            <div className="inline-flex flex-col items-end rounded border border-emerald-500/30 bg-emerald-500/10 px-2 py-1">
                              <div className="flex items-center gap-1 font-mono text-xs font-bold text-emerald-700 dark:text-emerald-300">
                                <ArrowUpRight className="h-3.5 w-3.5" />
                                <span>BUY {formatIdr(item.tradeAmountIdr)}</span>
                              </div>
                              <div className="ui-text-muted font-mono text-[10px]">
                                {item.isNominalOnly
                                  ? '🏷️ Nominal Murni'
                                  : asset?.currency === 'USD'
                                    ? `${formatUsd(item.tradeAmountUsd)} (${item.tradeUnits} u)`
                                    : item.tradeLotsInteger !== undefined
                                      ? `≈ ${item.tradeLotsInteger} Lot (${item.tradeLotsInteger * 100} lbr)`
                                      : item.tradeLots !== undefined
                                        ? `≈ ${item.tradeLots} Lot (${item.tradeUnits} lbr)`
                                        : `≈ ${item.tradeUnits} unit`}
                              </div>
                              {enableBrokerFees &&
                                item.estimatedFeeIdr !== undefined &&
                                item.estimatedFeeIdr > 0 && (
                                  <div className="font-mono text-[9px] text-amber-600 dark:text-amber-400">
                                    Fee: ≈ {formatIdr(item.estimatedFeeIdr)}
                                  </div>
                                )}
                              {item.tradeLotsRemainderIdr !== undefined &&
                                Math.abs(item.tradeLotsRemainderIdr) > 100 && (
                                  <div className="ui-text-muted font-mono text-[9px]">
                                    Sisa: {formatIdr(item.tradeLotsRemainderIdr)}
                                  </div>
                                )}
                            </div>
                          ) : item.action === 'SELL' ? (
                            <div className="inline-flex flex-col items-end rounded border border-rose-500/30 bg-rose-500/10 px-2 py-1">
                              <div className="flex items-center gap-1 font-mono text-xs font-bold text-rose-700 dark:text-rose-300">
                                <ArrowDownRight className="h-3.5 w-3.5" />
                                <span>
                                  SELL {formatIdr(Math.abs(item.tradeAmountIdr))}
                                </span>
                              </div>
                              <div className="ui-text-muted font-mono text-[10px]">
                                {item.isNominalOnly
                                  ? '🏷️ Nominal Murni'
                                  : asset?.currency === 'USD'
                                    ? `${formatUsd(Math.abs(item.tradeAmountUsd))} (${Math.abs(item.tradeUnits)} u)`
                                    : item.tradeLotsInteger !== undefined
                                      ? `≈ ${Math.abs(item.tradeLotsInteger)} Lot (${Math.abs(item.tradeLotsInteger * 100)} lbr)`
                                      : item.tradeLots !== undefined
                                        ? `≈ ${Math.abs(item.tradeLots)} Lot (${Math.abs(item.tradeUnits)} lbr)`
                                        : `≈ ${Math.abs(item.tradeUnits)} unit`}
                              </div>
                              {enableBrokerFees &&
                                item.estimatedFeeIdr !== undefined &&
                                item.estimatedFeeIdr > 0 && (
                                  <div className="font-mono text-[9px] text-amber-600 dark:text-amber-400">
                                    Fee &amp; Pajak: ≈{' '}
                                    {formatIdr(item.estimatedFeeIdr)}
                                  </div>
                                )}
                            </div>
                          ) : (
                            <div className="inline-flex flex-col items-end">
                              <span className="ui-subtle ui-text-muted rounded px-2 py-0.5 font-mono text-xs">
                                HOLD
                              </span>
                              {item.isDustFiltered && (
                                <span className="text-[9px] text-indigo-500 font-sans font-medium">
                                  Anti-Dust (&lt; 25rb)
                                </span>
                              )}
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            /* Mode 2: Zero-Horizontal-Scroll Mobile Card View for Rebalancer */
            <div id="tour-rebalance-cards" className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
              {rebalanceResult.items.map((item) => {
                const asset = allAssets.find((a) => a.id === item.assetId)!;
                const h = holdings[item.assetId] ?? {
                  assetId: item.assetId,
                  currentValueIdr: 0,
                  units: 0,
                  currentPrice: asset?.defaultPrice ?? 1,
                  shockPercent: 0,
                };

                return (
                  <div
                    key={item.assetId}
                    className={`rounded-xl border p-3.5 ${
                      item.isDriftBreached
                        ? 'border-amber-500/40 bg-amber-500/5'
                        : 'ui-subtle ui-border'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span
                          className="h-3 w-3 shrink-0 rounded-full"
                          style={{ backgroundColor: item.color }}
                        />
                        <div>
                          <div className="ui-text-main text-xs font-bold">
                            {item.symbol}{' '}
                            <span className="ui-text-muted font-normal">
                              • {item.name}
                            </span>
                          </div>
                          {(() => {
                            const isNominal =
                              h.isNominalOnly ??
                              (asset?.category === 'bonds' || asset?.category === 'money-market');

                            if (isNominal) {
                              return (
                                <div className="flex items-center gap-1.5 pt-1">
                                  <span
                                    className="inline-flex items-center gap-1 rounded bg-sky-500/10 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-sky-600 dark:text-sky-400 border border-sky-500/20 select-none"
                                    title="Aset bebas harga pasar. Dikelola murni berdasarkan saldo nominal Rupiah."
                                  >
                                    🏷️ Nominal Murni
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      onUpdateHolding(item.assetId, {
                                        isNominalOnly: false,
                                        currentPrice: asset?.defaultPrice ?? 1,
                                      })
                                    }
                                    className="ui-text-muted hover:ui-text-main text-[9px] underline decoration-dotted transition"
                                    title="Ubah ke mode input harga pasar per unit"
                                  >
                                    Atur Harga
                                  </button>
                                </div>
                              );
                            }

                            const priceDiffPct = asset?.defaultPrice
                              ? ((h.currentPrice - asset.defaultPrice) / asset.defaultPrice) * 100
                              : 0;
                            const isPriceCustom = Math.abs(priceDiffPct) >= 0.1;

                            return (
                              <div className="space-y-1 pt-1">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <span className="ui-text-muted text-[10px]">Harga:</span>
                                  <span className="ui-text-muted font-mono text-[10px]">
                                    {asset?.currency === 'USD' ? '$' : 'Rp'}
                                  </span>
                                  <input
                                    type="number"
                                    step={asset?.currency === 'USD' ? (h.currentPrice < 10 ? '0.01' : '1') : '25'}
                                    min={0.0001}
                                    value={h.currentPrice}
                                    onChange={(e) =>
                                      onUpdateHolding(item.assetId, {
                                        currentPrice: Math.max(0.000001, Number(e.target.value)),
                                      })
                                    }
                                    className={`ui-input w-24 rounded px-1.5 py-0.5 font-mono text-[11px] font-semibold text-right ${
                                      isPriceCustom ? 'border-amber-500 text-amber-600 dark:text-amber-400' : ''
                                    }`}
                                  />
                                  {isPriceCustom && (
                                    <span
                                      className={`rounded px-1 py-0.2 font-mono text-[9px] font-bold ${
                                        priceDiffPct < 0
                                          ? 'bg-rose-500/15 text-rose-600 dark:text-rose-400'
                                          : 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                                      }`}
                                    >
                                      {priceDiffPct < 0 ? '▼' : '▲'} {Math.abs(priceDiffPct).toFixed(1)}%
                                    </span>
                                  )}
                                  {isPriceCustom && (
                                    <button
                                      type="button"
                                      onClick={() =>
                                        onUpdateHolding(item.assetId, {
                                          currentPrice: asset?.defaultPrice ?? 1,
                                        })
                                      }
                                      className="ui-text-muted hover:text-emerald-500 p-0.5 rounded transition"
                                      title="Reset ke harga pasar normal"
                                    >
                                      <RotateCcw className="h-2.5 w-2.5" />
                                    </button>
                                  )}
                                  <button
                                    type="button"
                                    onClick={() =>
                                      onUpdateHolding(item.assetId, {
                                        isNominalOnly: true,
                                        currentPrice: 1,
                                      })
                                    }
                                    className="ui-text-muted hover:text-sky-500 p-0.5 rounded transition"
                                    title="Jadikan Aset Nominal Murni (Abaikan harga pasar unit)"
                                  >
                                    <Tag className="h-2.5 w-2.5" />
                                  </button>
                                </div>

                                {/* Quick Drop Chips */}
                                <div className="flex items-center gap-1">
                                  <span className="ui-text-muted text-[9px]">Drop:</span>
                                  {[10, 20, 35, 50].map((dropPct) => {
                                    const defaultP = asset?.defaultPrice ?? 1;
                                    const discountedPrice = Number(
                                      (defaultP * (1 - dropPct / 100)).toFixed(asset?.currency === 'USD' && defaultP < 10 ? 4 : 2)
                                    );
                                    const isActive = Math.abs(h.currentPrice - discountedPrice) < 0.01;
                                    return (
                                      <button
                                        key={dropPct}
                                        type="button"
                                        onClick={() =>
                                          onUpdateHolding(item.assetId, {
                                            currentPrice: discountedPrice,
                                          })
                                        }
                                        className={`rounded px-1.5 py-0.2 font-mono text-[9px] transition ${
                                          isActive
                                            ? 'bg-rose-500 text-white font-bold'
                                            : 'ui-subtle ui-text-muted hover:text-rose-500'
                                        }`}
                                      >
                                        -{dropPct}%
                                      </button>
                                    );
                                  })}
                                </div>
                              </div>
                            );
                          })()}
                        </div>
                      </div>

                      {item.action === 'BUY' ? (
                        <span className="rounded border border-emerald-500/40 bg-emerald-500/15 px-2 py-0.5 font-mono text-xs font-bold text-emerald-700 dark:text-emerald-300">
                          BUY {formatIdr(item.tradeAmountIdr, true)}
                        </span>
                      ) : item.action === 'SELL' ? (
                        <span className="rounded border border-rose-500/40 bg-rose-500/15 px-2 py-0.5 font-mono text-xs font-bold text-rose-700 dark:text-rose-300">
                          SELL {formatIdr(Math.abs(item.tradeAmountIdr), true)}
                        </span>
                      ) : (
                        <div className="flex flex-col items-end">
                          <span className="ui-card ui-text-muted rounded px-2 py-0.5 font-mono text-xs">
                            HOLD
                          </span>
                          {item.isDustFiltered && (
                            <span className="text-[9px] text-indigo-500 font-sans font-medium">
                              Anti-Dust (&lt; 25rb)
                            </span>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Editable Input Row inside Card */}
                    <div className="ui-card mt-3 rounded-lg p-2.5 text-xs">
                      <div className="flex items-center justify-between gap-2">
                        <span className="ui-text-secondary font-medium">
                          {holdingEntryMode === 'nominal'
                            ? 'Nilai Saat Ini (Rp):'
                            : holdingEntryMode === 'percent'
                              ? 'Porsi Saat Ini (%):'
                              : 'Jumlah Unit:'}
                        </span>
                        {holdingEntryMode === 'nominal' ? (
                          <FormattedNumberInput
                            step={1_000_000}
                            min={0}
                            value={h.currentValueIdr}
                            onChange={(val) =>
                              onUpdateHolding(item.assetId, {
                                currentValueIdr: val,
                              })
                            }
                            className="ui-input w-36 rounded px-2 py-1 text-right font-mono text-xs font-bold"
                            ariaLabel={`Nominal value in IDR for ${item.symbol}`}
                          />
                        ) : holdingEntryMode === 'percent' ? (
                          <div className="flex items-center gap-1">
                            <input
                              type="number"
                              step={0.5}
                              min={0}
                              max={100}
                              value={Number(item.currentWeightPercent.toFixed(1))}
                              onChange={(e) => {
                                const pct = Math.max(
                                  0,
                                  Math.min(100, Number(e.target.value))
                                );
                                const baseTotal =
                                  rebalanceResult.initialTotalIdr > 0
                                    ? rebalanceResult.initialTotalIdr
                                    : initialCapitalMenu1Idr;
                                onUpdateHolding(item.assetId, {
                                  currentValueIdr: Math.round(
                                    baseTotal * (pct / 100)
                                  ),
                                });
                              }}
                              className="ui-input w-24 rounded px-2 py-1 text-right font-mono text-xs font-bold"
                              aria-label={`Current weight percentage for ${item.symbol}`}
                            />
                            <span className="ui-text-muted font-mono">%</span>
                          </div>
                        ) : (
                          <input
                            type="number"
                            step="any"
                            value={h.units}
                            onChange={(e) =>
                              onUpdateHolding(item.assetId, {
                                units: Math.max(0, Number(e.target.value)),
                              })
                            }
                            className="ui-input w-28 rounded px-2 py-1 text-right font-mono text-xs font-bold"
                            aria-label={`Units held for ${item.symbol}`}
                          />
                        )}
                      </div>
                      <div className="mt-1.5 flex items-center justify-end gap-1.5 text-[10px]">
                        <button
                          type="button"
                          onClick={() =>
                            onUpdateHolding(item.assetId, {
                              currentValueIdr: Math.round(
                                initialCapitalMenu1Idr *
                                  ((targetWeights[item.assetId] ?? 0) / 100)
                              ),
                            })
                          }
                          className="ui-subtle ui-text-secondary rounded px-1.5 py-0.5 font-mono hover:text-emerald-600"
                        >
                          =Default Menu 1 (
                          {formatIdr(
                            Math.round(
                              initialCapitalMenu1Idr *
                                ((targetWeights[item.assetId] ?? 0) / 100)
                            ),
                            true
                          )}
                          )
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            onUpdateHolding(item.assetId, {
                              currentValueIdr: 0,
                              units: 0,
                            })
                          }
                          className="ui-subtle ui-text-muted rounded px-1.5 py-0.5 font-mono hover:text-rose-500"
                        >
                          Reset Rp 0
                        </button>
                      </div>
                    </div>

                    {/* Weight & Target Comparison Row */}
                    <div className="mt-2.5 grid grid-cols-3 gap-2 text-center font-mono text-[11px]">
                      <div className="ui-card rounded p-1.5">
                        <div className="ui-text-muted text-[9px] uppercase">
                          Bobot Kini
                        </div>
                        <div className="ui-text-main font-bold">
                          {item.currentWeightPercent.toFixed(1)}%
                        </div>
                      </div>
                      <div className="ui-card rounded p-1.5">
                        <div className="ui-text-muted text-[9px] uppercase">
                          Target
                        </div>
                        <div className="font-bold text-emerald-600 dark:text-emerald-400">
                          {item.targetWeightPercent.toFixed(1)}%
                        </div>
                      </div>
                      <div className="ui-card rounded p-1.5">
                        <div className="ui-text-muted text-[9px] uppercase">
                          Target Rp
                        </div>
                        <div className="ui-text-main font-bold">
                          {formatIdr(item.targetValueIdr, true)}
                        </div>
                      </div>
                    </div>

                    {item.action !== 'HOLD' && (
                      <div
                        className={`mt-2.5 flex flex-col gap-1 rounded-lg px-2.5 py-1.5 font-mono text-xs ${
                          item.action === 'BUY'
                            ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                            : 'bg-rose-500/10 text-rose-700 dark:text-rose-300'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-bold">
                            {item.action === 'BUY' ? 'Beli:' : 'Jual:'}{' '}
                            {formatIdr(Math.abs(item.tradeAmountIdr))}
                          </span>
                          <span className="text-[10px]">
                            {asset?.currency === 'USD'
                              ? `${formatUsd(Math.abs(item.tradeAmountUsd))} (${Math.abs(item.tradeUnits)} u)`
                              : item.tradeLotsInteger !== undefined
                                ? `≈ ${Math.abs(item.tradeLotsInteger)} Lot (${Math.abs(item.tradeLotsInteger * 100)} lbr)`
                                : item.tradeLots !== undefined
                                  ? `≈ ${Math.abs(item.tradeLots)} Lot`
                                  : `≈ ${Math.abs(item.tradeUnits)} unit`}
                          </span>
                        </div>
                        {enableBrokerFees &&
                          item.estimatedFeeIdr !== undefined &&
                          item.estimatedFeeIdr > 0 && (
                            <div className="flex justify-between text-[10px] text-amber-600 dark:text-amber-400">
                              <span>Fee &amp; Pajak:</span>
                              <span>≈ {formatIdr(item.estimatedFeeIdr)}</span>
                            </div>
                          )}
                        {item.tradeLotsRemainderIdr !== undefined &&
                          Math.abs(item.tradeLotsRemainderIdr) > 100 && (
                            <div className="ui-text-muted flex justify-between text-[10px]">
                              <span>Sisa kas pecahan:</span>
                              <span>{formatIdr(item.tradeLotsRemainderIdr)}</span>
                            </div>
                          )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* 1-CLICK COMMIT REBALANCE TO HOLDINGS & RECORD SNAPSHOT */}
          <div className="ui-subtle mt-4 flex flex-col gap-2.5 rounded-lg p-3.5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex-1">
              <div className="ui-text-main text-xs font-semibold">
                Sudah Eksekusi Order di Broker/Exchange?
              </div>
              <p className="ui-text-muted text-[11px]">
                Klik tombol di kanan untuk otomatis memperbarui nilai posisi awal ke
                Target (Rp), mereset shock ke 0%, dan mencatat ke Jurnal Rebalancing.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {onOpenOrderSlip && (
                <button
                  type="button"
                  onClick={onOpenOrderSlip}
                  className="flex items-center gap-1.5 rounded-lg border border-indigo-500/40 bg-indigo-500/10 px-3 py-1.5 text-xs font-semibold text-indigo-400 hover:bg-indigo-500/20 transition"
                  title="Buka slip instruksi order yang dikelompokkan berdasarkan aplikasi broker"
                >
                  <Building2 className="h-3.5 w-3.5" />
                  <span>Buka Slip Order Broker</span>
                </button>
              )}
              <input
                type="text"
                value={rebalanceNoteInput}
                onChange={(e) => setRebalanceNoteInput(e.target.value)}
                placeholder="Catatan (mis. Rebalance Q4 / Buy Dip)"
                className="ui-input rounded-lg px-2.5 py-1.5 text-xs sm:w-52"
                aria-label="Rebalance journal note"
              />
              <button
                type="button"
                onClick={handleApplyAndRecord}
                className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-emerald-500"
              >
                <Check className="h-3.5 w-3.5" />
                <span>
                  {committedBanner
                    ? 'Tersimpan ke Jurnal!'
                    : 'Catat & Terapkan Rebalance Ini'}
                </span>
              </button>
            </div>
          </div>
        </div>

        {/* Right 4 Cols: Drift Chart & Cashflow Summary */}
        <div className="space-y-5 lg:col-span-4">
          <div className="ui-card rounded-xl p-5">
            <h3 className="ui-text-main text-sm font-bold">
              Bobot Saat Ini vs Target Optimal
            </h3>
            <p className="ui-text-muted mt-1 text-xs">
              Pergeseran bobot (drift) dibandingkan target:
            </p>

            <div className="mt-4 h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={chartData}
                  margin={{ top: 8, right: 8, left: -18, bottom: 0 }}
                >
                  <XAxis dataKey="symbol" stroke="#71717a" fontSize={11} />
                  <YAxis
                    stroke="#71717a"
                    fontSize={11}
                    tickFormatter={(v) => `${v}%`}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'var(--bg-card)',
                      borderColor: 'var(--border-subtle)',
                      color: 'var(--text-main)',
                      borderRadius: '0.5rem',
                      fontSize: '12px',
                    }}
                    itemStyle={{ color: 'var(--text-main)' }}
                    labelStyle={{ color: 'var(--text-main)', fontWeight: 600 }}
                    formatter={(val: number, name: string) => [`${val}%`, name]}
                  />
                  <Legend wrapperStyle={{ fontSize: '11px' }} />
                  <Bar
                    dataKey="Current"
                    name="Saat Ini (%)"
                    fill="#f59e0b"
                    radius={[3, 3, 0, 0]}
                  />
                  <Bar
                    dataKey="Target"
                    name="Target (%)"
                    fill="#10b981"
                    radius={[3, 3, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="ui-card rounded-xl p-5">
            <h3 className="ui-text-main text-sm font-bold">
              Ringkasan Arus Kas Rebalancing
            </h3>
            <div className="mt-3 space-y-2.5 text-xs">
              <div className="ui-border flex justify-between border-b pb-2">
                <span className="ui-text-muted">Total Aset Dijual:</span>
                <span className="font-mono font-semibold text-rose-600 dark:text-rose-400">
                  {formatIdr(rebalanceResult.totalSellIdr)}
                </span>
              </div>
              <div className="ui-border flex justify-between border-b pb-2">
                <span className="ui-text-muted">Top-Up Kas (DCA):</span>
                <span className="ui-text-main font-mono font-semibold">
                  {formatIdr(rebalanceResult.cashInjectionIdr)}
                </span>
              </div>
              <div className="ui-border flex justify-between border-b pb-2">
                <span className="ui-text-muted">Total Aset Dibeli:</span>
                <span className="font-mono font-semibold text-emerald-600 dark:text-emerald-400">
                  {formatIdr(rebalanceResult.totalBuyIdr)}
                </span>
              </div>
              {enableBrokerFees &&
                rebalanceResult.totalEstimatedFeeIdr !== undefined &&
                rebalanceResult.totalEstimatedFeeIdr > 0 && (
                  <div className="ui-border flex justify-between border-b pb-2 text-amber-600 dark:text-amber-400">
                    <span>Estimasi Fee Broker &amp; Pajak:</span>
                    <span className="font-mono font-semibold">
                      ≈ {formatIdr(rebalanceResult.totalEstimatedFeeIdr)}
                    </span>
                  </div>
                )}
              {rebalanceResult.unallocatedCashRemainderIdr !== undefined &&
                Math.abs(rebalanceResult.unallocatedCashRemainderIdr) > 100 && (
                  <div className="ui-border flex justify-between border-b pb-2 text-emerald-600 dark:text-emerald-400">
                    <span>Sisa Kas Pecahan Lot (ke RDPT):</span>
                    <span className="font-mono font-semibold">
                      {formatIdr(rebalanceResult.unallocatedCashRemainderIdr)}
                    </span>
                  </div>
                )}
              <div className="flex justify-between pt-1 text-sm font-bold">
                <span className="ui-text-main">Nilai Akhir Portfolio:</span>
                <span className="font-mono text-emerald-600 dark:text-emerald-400">
                  {formatIdr(rebalanceResult.finalTargetTotalIdr)}
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* PRE-PLANNED LIMIT ORDER & CRASH BUYING LADDER (-10%, -20%, -35%, -50%) */}
      <section id="tour-crash-ladder" className="ui-card rounded-xl p-5">
        <div className="ui-border flex flex-col gap-3 border-b pb-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <ListOrdered className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
              <h3 className="ui-text-main text-sm font-bold">
                Pre-Planned Limit Order &amp; Crash Buying Ladder (-10%, -20%, -35%,
                -50%)
              </h3>
            </div>
            <p className="ui-text-muted mt-0.5 text-xs">
              Siapkan antrean Limit Order dari sekarang agar saat market crash (Menit
              15:48) kamu tinggal serok sesuai rumus Rebalancing tanpa panik:
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <span className="ui-text-muted text-xs">Pilih Aset:</span>
            {activeCandidateAssets.map((a) => (
              <button
                key={a.id}
                type="button"
                onClick={() => setLadderAssetId(a.id)}
                className={`rounded-md px-2.5 py-1 text-xs font-medium transition ${
                  effectiveLadderAssetId === a.id
                    ? 'bg-emerald-600 font-semibold text-white'
                    : 'ui-subtle ui-text-secondary hover:opacity-80'
                }`}
              >
                {a.id} ({targetWeights[a.id] ?? 0}%)
              </button>
            ))}
          </div>
        </div>

        <div
          tabIndex={0}
          role="region"
          aria-label="Pre-Planned Limit Order Crash Buying Ladder"
          className="ui-border mt-4 overflow-x-auto rounded-lg border"
        >
          <table className="w-full border-separate border-spacing-0 text-left text-xs">
            <thead className="ui-subtle text-[11px] font-semibold uppercase">
              <tr>
                <th className="ui-subtle ui-border sticky left-0 z-20 border-b border-r px-3 py-2 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.18)]">
                  Tier Koreksi
                </th>
                <th className="ui-border border-b px-3 py-2 text-right">
                  Harga Limit Order ({selectedLadderAsset?.currency ?? 'IDR'})
                </th>
                <th className="ui-border border-b px-3 py-2 text-right">
                  Harga Limit (Rp)
                </th>
                <th className="ui-border border-b px-3 py-2 text-right">
                  Total Porto Saat Crash
                </th>
                <th className="ui-border border-b px-3 py-2 text-right">
                  Nominal BUY Rebalance
                </th>
                <th className="ui-border border-b px-3 py-2 text-right">
                  Jumlah Unit / Lot IDX
                </th>
                <th className="ui-border border-b px-3 py-2 text-right">
                  Sumber Dana (Jual RDPT / GLD)
                </th>
              </tr>
            </thead>
            <tbody>
              {crashLadderSteps.map((step) => (
                <tr key={step.dropPercent} className="hover:bg-zinc-500/5">
                  <th
                    scope="row"
                    className="ui-card ui-border sticky left-0 z-10 border-b border-r px-3 py-2.5 font-mono font-bold text-rose-600 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.18)] dark:text-rose-400"
                  >
                    Crash {step.dropPercent}%
                  </th>
                  <td className="ui-border ui-text-main border-b px-3 py-2.5 text-right font-mono font-semibold">
                    {selectedLadderAsset?.currency === 'USD'
                      ? `$${step.limitPriceNative.toLocaleString()}`
                      : `Rp ${step.limitPriceNative.toLocaleString('id-ID')}`}
                  </td>
                  <td className="ui-border ui-text-muted border-b px-3 py-2.5 text-right font-mono">
                    {formatIdr(step.limitPriceIdr)}
                  </td>
                  <td className="ui-border ui-text-main border-b px-3 py-2.5 text-right font-mono font-semibold">
                    {formatIdr(step.postCrashPortfolioIdr, true)}
                  </td>
                  <td className="ui-border border-b px-3 py-2.5 text-right font-mono font-bold text-emerald-600 dark:text-emerald-400">
                    BUY {formatIdr(step.rebalanceBuyAmountIdr)}
                    {selectedLadderAsset?.currency === 'USD' && (
                      <div className="ui-text-muted text-[10px] font-normal">
                        ({formatUsd(step.rebalanceBuyAmountIdr / Math.max(1, usdIdrRate))})
                      </div>
                    )}
                  </td>
                  <td className="ui-border ui-text-main border-b px-3 py-2.5 text-right font-mono">
                    {step.rebalanceBuyLots !== undefined
                      ? `${step.rebalanceBuyLots} Lot (${step.rebalanceBuyUnits} lbr)`
                      : `${step.rebalanceBuyUnits} unit`}
                  </td>
                  <td className="ui-border ui-text-secondary border-b px-3 py-2.5 text-right font-mono">
                    {formatIdr(step.fundingFromDefensiveIdr)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* REBALANCING HISTORY JOURNAL & NET WORTH TRACKER */}
      <section id="tour-rebalance-journal" className="ui-card rounded-xl p-5">
        <div className="ui-border flex flex-wrap items-center justify-between gap-2 border-b pb-3">
          <div className="flex items-center gap-2">
            <History className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
            <div>
              <h3 className="ui-text-main text-sm font-bold">
                Jurnal Riwayat Rebalancing &amp; Pertumbuhan Net Worth
              </h3>
              <p className="ui-text-muted text-xs">
                Rekam jejak disiplin rebalancing kamu dari waktu ke waktu (tersimpan di
                browser):
              </p>
            </div>
          </div>
          <span className="ui-subtle ui-text-secondary rounded-md px-2.5 py-1 font-mono text-xs font-semibold">
            {rebalanceHistory.length} Snapshot Tersimpan
          </span>
        </div>

        {rebalanceHistory.length === 0 ? (
          <div className="ui-subtle ui-text-muted mt-4 rounded-lg p-6 text-center text-xs">
            Belum ada riwayat rebalancing. Klik tombol{' '}
            <strong className="ui-text-main">
              &ldquo;Catat &amp; Terapkan Rebalance Ini&rdquo;
            </strong>{' '}
            di atas setelah menyesuaikan posisi untuk merekam snapshot pertama.
          </div>
        ) : (
          <div className="mt-4 grid grid-cols-1 gap-6 lg:grid-cols-12">
            {historyChartData.length > 1 && (
              <div className="ui-subtle rounded-lg p-4 lg:col-span-5">
                <div className="ui-text-main mb-2 text-xs font-semibold">
                  Kurva Net Worth Riwayat Rebalance (Juta Rp)
                </div>
                <div className="h-48 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart
                      data={historyChartData}
                      margin={{ top: 6, right: 10, left: -10, bottom: 0 }}
                    >
                      <XAxis dataKey="step" stroke="#71717a" fontSize={10} />
                      <YAxis
                        stroke="#71717a"
                        fontSize={10}
                        tickFormatter={(v) => `${v}Jt`}
                      />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: 'var(--bg-card)',
                          borderColor: 'var(--border-subtle)',
                          color: 'var(--text-main)',
                          borderRadius: '0.5rem',
                          fontSize: '12px',
                        }}
                        itemStyle={{ color: 'var(--text-main)' }}
                        labelStyle={{ color: 'var(--text-main)', fontWeight: 600 }}
                        formatter={(val: number) => [
                          `Rp ${val.toLocaleString('id-ID')} Juta`,
                          'Total Portfolio',
                        ]}
                      />
                      <Area
                        type="monotone"
                        dataKey="NetWorthJuta"
                        stroke="#10b981"
                        fill="#10b981"
                        fillOpacity={0.2}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}

            <div
              className={
                historyChartData.length > 1 ? 'lg:col-span-7' : 'lg:col-span-12'
              }
            >
              <div className="ui-border overflow-x-auto rounded-lg border">
                <table className="w-full border-separate border-spacing-0 text-left text-xs">
                  <thead className="ui-subtle text-[11px] font-semibold uppercase">
                    <tr>
                      <th className="ui-border border-b px-3 py-2">Tanggal</th>
                      <th className="ui-border border-b px-3 py-2">Catatan</th>
                      <th className="ui-border border-b px-3 py-2 text-right">
                        Total Portfolio
                      </th>
                      <th className="ui-border border-b px-3 py-2">
                        Ringkasan Eksekusi
                      </th>
                      <th className="ui-border border-b px-2 py-2 text-center">
                        Hapus
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {rebalanceHistory.map((h) => (
                      <tr key={h.id} className="hover:bg-zinc-500/5">
                        <td className="ui-border ui-text-secondary border-b px-3 py-2 font-mono whitespace-nowrap">
                          {h.timestamp}
                        </td>
                        <td className="ui-border border-b px-3 py-2">
                          <div className="ui-text-main font-semibold">{h.note}</div>
                          <div className="ui-text-muted text-[10px]">
                            Top-Up: {formatIdr(h.cashInjectedIdr, true)} • Beli:{' '}
                            {formatIdr(h.totalBuyIdr, true)}
                          </div>
                        </td>
                        <td className="ui-border border-b px-3 py-2 text-right font-mono font-bold text-emerald-600 dark:text-emerald-400">
                          {formatIdr(h.totalValueAfterIdr)}
                        </td>
                        <td className="ui-border border-b px-3 py-2">
                          <div className="flex flex-wrap gap-1">
                            {h.tradesSummary.slice(0, 4).map((t, idx) => (
                              <span
                                key={idx}
                                className={`rounded px-1.5 py-0.5 font-mono text-[10px] font-medium ${
                                  t.startsWith('BUY')
                                    ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                                    : 'bg-rose-500/10 text-rose-700 dark:text-rose-300'
                                }`}
                              >
                                {t}
                              </span>
                            ))}
                            {h.tradesSummary.length === 0 && (
                              <span className="ui-text-muted text-[10px]">
                                Posisi sudah seimbang (Hold)
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="ui-border border-b px-2 py-2 text-center">
                          <button
                            type="button"
                            onClick={() => onDeleteRebalanceHistoryEntry(h.id)}
                            className="ui-text-muted hover:text-rose-600"
                            title="Hapus log ini"
                          >
                            <Trash2 className="mx-auto h-3.5 w-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </section>

      {/* Holdings Text Import & Export Modal */}
      <HoldingsTextImportModal
        isOpen={isHoldingsTextModalOpen}
        onClose={() => setIsHoldingsTextModalOpen(false)}
        allAssets={allAssets}
        currentHoldings={holdings}
        usdIdrRate={usdIdrRate}
        onApplyHoldings={handleApplyHoldingsFromText}
      />

      {/* Rebalancer Onboarding & Execution Guide Modal */}
      <RebalanceExecutionGuideModal
        isOpen={isGuideModalOpen}
        onClose={() => setIsGuideModalOpen(false)}
        initialCapitalMenu1Idr={initialCapitalMenu1Idr}
        activePortfolioName={activePortfolioName}
        onSetupInitialBuy={onSetupInitialBuyFromMenu1}
        onOpenOrderSlip={onOpenOrderSlip}
        onOpenTextImport={() => setIsHoldingsTextModalOpen(true)}
      />
    </div>
  );
};
