import React, { useState, useMemo, useEffect } from 'react';
import {
  AssetDefinition,
  HoldingEntry,
  RebalanceSummaryResult,
  ValuationSentimentConfig,
} from '../../lib/quant/types';
import {
  calculateSmartDcaPlan,
  SmartDcaItemResult,
  SmartDcaOverflowMode,
  SmartDcaAllocationMode,
} from '../../lib/quant/smartDcaEngine';
import { CycleIndicatorState } from '../../lib/quant/smartDcaIndicators';
import { fetchLiveCryptoFearAndGreed } from '../../lib/quant/tacticalValuationEngine';
import { CoinMarketCapIndicatorTable } from './CoinMarketCapIndicatorTable';
import { formatIdr, formatUsd } from '../../lib/formatters';
import { FormattedNumberInput } from '../FormattedNumberInput';
import {
  Sparkles,
  Shield,
  TrendingUp,
  SlidersHorizontal,
  Lightbulb,
  CheckCircle2,
  Building2,
  Copy,
  Check,
  X,
  ArrowRight,
  Info,
  HelpCircle,
  Coins,
  Scale,
  Percent,
  Table2,
  Layers,
  Database,
  RefreshCw,
  ExternalLink,
  AlertTriangle,
} from 'lucide-react';

export interface SmartDcaAdvisorPanelProps {
  allAssets: AssetDefinition[];
  targetWeights: Record<string, number>;
  holdings: Record<string, HoldingEntry>;
  inputMode: 'nominal' | 'units';
  usdIdrRate: number;
  monthlySavingsMenu1Idr: number;
  enableIdxLotRounding?: boolean;
  filterDustTrades?: boolean;
  dustTradeThresholdIdr?: number;
  tacticalConfig?: ValuationSentimentConfig;
  cashInjectionIdr?: number;
  smartDcaMonthlyBudgetIdr?: number;
  onUpdateSmartDcaMonthlyBudgetIdr?: (val: number) => void;
  smartDcaOverflowMode?: SmartDcaOverflowMode;
  onUpdateSmartDcaOverflowMode?: (mode: SmartDcaOverflowMode) => void;
  smartDcaAllocationMode?: SmartDcaAllocationMode;
  onUpdateSmartDcaAllocationMode?: (mode: SmartDcaAllocationMode) => void;
  smartDcaIndicatorOverrides?: Record<string, Record<string, any>>;
  onUpdateSmartDcaIndicatorOverrides?: (
    overrides: Record<string, Record<string, any>>
  ) => void;
  smartDcaLastRefreshSuccessAt?: string;
  onUnifiedSync?: () => Promise<void>;
  isSyncingPrices?: boolean;
  onOpenOrderSlip?: (planOverride?: RebalanceSummaryResult) => void;
  onCommitRebalanceToHoldings?: (
    note?: string,
    planOverride?: RebalanceSummaryResult
  ) => void;
  onSwitchToStandardRebalancer?: () => void;
}

export const SmartDcaAdvisorPanel: React.FC<SmartDcaAdvisorPanelProps> = ({
  allAssets,
  targetWeights,
  holdings,
  inputMode,
  usdIdrRate,
  monthlySavingsMenu1Idr,
  enableIdxLotRounding = true,
  filterDustTrades = true,
  dustTradeThresholdIdr = 25_000,
  tacticalConfig,
  cashInjectionIdr = 0,
  smartDcaMonthlyBudgetIdr,
  onUpdateSmartDcaMonthlyBudgetIdr,
  smartDcaOverflowMode,
  onUpdateSmartDcaOverflowMode,
  smartDcaAllocationMode,
  onUpdateSmartDcaAllocationMode,
  smartDcaIndicatorOverrides,
  onUpdateSmartDcaIndicatorOverrides,
  smartDcaLastRefreshSuccessAt,
  onUnifiedSync,
  isSyncingPrices = false,
  onOpenOrderSlip,
  onCommitRebalanceToHoldings,
  onSwitchToStandardRebalancer,
}) => {
  // Monthly DCA budget state (synchronized with App persistence)
  const [localMonthlyBudgetIdr, setLocalMonthlyBudgetIdr] = useState<number>(
    smartDcaMonthlyBudgetIdr ?? (monthlySavingsMenu1Idr > 0 ? monthlySavingsMenu1Idr : 3_000_000)
  );
  const monthlyBudgetIdr = smartDcaMonthlyBudgetIdr ?? localMonthlyBudgetIdr;

  const handleSetMonthlyBudgetIdr = (val: number) => {
    setLocalMonthlyBudgetIdr(val);
    onUpdateSmartDcaMonthlyBudgetIdr?.(val);
  };

  // Bug 11 fix: Synchronize DCA monthly budget whenever Menu 1 savings change if no explicit custom override
  useEffect(() => {
    if (monthlySavingsMenu1Idr > 0 && smartDcaMonthlyBudgetIdr === undefined) {
      setLocalMonthlyBudgetIdr(monthlySavingsMenu1Idr);
    }
  }, [monthlySavingsMenu1Idr, smartDcaMonthlyBudgetIdr]);

  // Overflow parking mode: 'park-rdpu' (default) vs 'boost-discount'
  const [localOverflowMode, setLocalOverflowMode] =
    useState<SmartDcaOverflowMode>(smartDcaOverflowMode ?? 'park-rdpu');
  const overflowMode = smartDcaOverflowMode ?? localOverflowMode;

  const handleSetOverflowMode = (mode: SmartDcaOverflowMode) => {
    setLocalOverflowMode(mode);
    onUpdateSmartDcaOverflowMode?.(mode);
  };

  // Allocation mode: 'target-weight-multiplier' (default) vs 'pure-confluence-rank'
  const [localAllocationMode, setLocalAllocationMode] =
    useState<SmartDcaAllocationMode>(
      smartDcaAllocationMode ?? 'target-weight-multiplier'
    );
  const allocationMode = smartDcaAllocationMode ?? localAllocationMode;

  const handleSetAllocationMode = (mode: SmartDcaAllocationMode) => {
    setLocalAllocationMode(mode);
    onUpdateSmartDcaAllocationMode?.(mode);
  };

  // Indicator overrides state
  const [localIndicatorOverrides, setLocalIndicatorOverrides] = useState<
    Record<string, Record<string, any>>
  >(smartDcaIndicatorOverrides ?? {});
  const indicatorOverrides =
    smartDcaIndicatorOverrides ?? localIndicatorOverrides;

  const handleUpdateIndicatorOverride = (
    assetId: string,
    indicatorId: string,
    override: { currentValue?: number; referenceThreshold?: number } | null
  ) => {
    const next = { ...indicatorOverrides };
    if (!next[assetId]) next[assetId] = {};
    if (override === null) {
      delete next[assetId][indicatorId];
      if (Object.keys(next[assetId]).length === 0) delete next[assetId];
    } else {
      next[assetId][indicatorId] = {
        ...next[assetId][indicatorId],
        ...override,
      };
    }
    setLocalIndicatorOverrides(next);
    onUpdateSmartDcaIndicatorOverrides?.(next);
  };

  const handleResetAssetOverrides = (assetId: string) => {
    const next = { ...indicatorOverrides };
    delete next[assetId];
    setLocalIndicatorOverrides(next);
    onUpdateSmartDcaIndicatorOverrides?.(next);
  };

  // Selected tab for CoinMarketCap Indicators Board
  const [activeCmcAssetId, setActiveCmcAssetId] = useState<string | null>(null);

  // Live Refresh & Data Source Transparency state
  const [localLastRefreshSuccessAt, setLocalLastRefreshSuccessAt] = useState<string>(
    () => smartDcaLastRefreshSuccessAt || 'Snapshot Pasar (Klik Sinkronkan)'
  );
  const lastRefreshSuccessAt =
    smartDcaLastRefreshSuccessAt || localLastRefreshSuccessAt;

  const [isRefreshingData, setIsRefreshingData] = useState<boolean>(false);
  const [refreshToast, setRefreshToast] = useState<{
    message: string;
    isError?: boolean;
  } | null>(null);

  const isRefreshing = isSyncingPrices || isRefreshingData;

  // Live indicator sync handler
  const handleRefreshData = async () => {
    setIsRefreshingData(true);
    try {
      if (onUnifiedSync) {
        await onUnifiedSync();
        setRefreshToast({
          message:
            '✅ Seluruh harga pasar portofolio, kurs USD/IDR, dan sentimen siklus pasar berhasil disinkronkan!',
          isError: false,
        });
      } else {
        const liveFng = await fetchLiveCryptoFearAndGreed();
        const nowStr =
          new Date().toLocaleDateString('id-ID', {
            day: '2-digit',
            month: 'short',
            year: 'numeric',
          }) +
          ', ' +
          new Date().toLocaleTimeString('id-ID', {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
          }) +
          ' WIB';

        if (liveFng && liveFng.score !== undefined) {
          setLocalLastRefreshSuccessAt(nowStr);
          // Apply live score to crypto asset override so it triggers the indicator table
          const cryptoAsset = allAssets.find((a) => a.category === 'crypto');
          if (cryptoAsset) {
            handleUpdateIndicatorOverride(cryptoAsset.id, 'fear_greed_crypto', {
              currentValue: liveFng.score,
            });
          }
          setRefreshToast({
            message: `✅ Data indikator Alternative.me (Fear & Greed ${liveFng.score}/100 - ${liveFng.classification}) berhasil disinkronkan pukul ${nowStr}!`,
            isError: false,
          });
        } else {
          setRefreshToast({
            message:
              '⚠️ Gagal terhubung ke feed Alternative.me (koneksi offline atau kuota). Menggunakan snapshot tersimpan.',
            isError: true,
          });
        }
      }
    } catch {
      setRefreshToast({
        message:
          '⚠️ Terjadi gangguan koneksi saat sinkronisasi data live. Menggunakan snapshot data tersimpan.',
        isError: true,
      });
    } finally {
      setIsRefreshingData(false);
      setTimeout(() => setRefreshToast(null), 4500);
    }
  };

  // Modal / Drawer state for "Mengapa Direkomendasikan?"
  const [selectedAssetForWhy, setSelectedAssetForWhy] =
    useState<SmartDcaItemResult | null>(null);

  // Close modal on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setSelectedAssetForWhy(null);
      }
    };
    if (selectedAssetForWhy) {
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedAssetForWhy]);

  // Copy status
  const [copiedSummary, setCopiedSummary] = useState(false);
  const [copiedWhyExplanation, setCopiedWhyExplanation] = useState(false);
  const [commitSuccessMessage, setCommitSuccessMessage] = useState<string | null>(
    null
  );

  // Calculate Smart DCA Plan (100% Indicator-Driven CMC Rules)
  const smartDcaResult = useMemo(() => {
    return calculateSmartDcaPlan({
      assets: allAssets,
      targetWeights,
      holdings,
      monthlyBudgetIdr,
      inputMode,
      usdIdrRate,
      overflowMode,
      allocationMode,
      enableIdxLotRounding,
      filterDustTrades,
      dustTradeThresholdIdr,
      tacticalConfig,
      indicatorOverrides,
      lastRefreshSuccessAt,
    });
  }, [
    allAssets,
    targetWeights,
    holdings,
    monthlyBudgetIdr,
    inputMode,
    usdIdrRate,
    overflowMode,
    allocationMode,
    enableIdxLotRounding,
    filterDustTrades,
    dustTradeThresholdIdr,
    tacticalConfig,
    indicatorOverrides,
    lastRefreshSuccessAt,
  ]);

  // Active item for CMC Indicator Table board
  const activeCmcItem = useMemo(() => {
    if (smartDcaResult.items.length === 0) return null;
    if (activeCmcAssetId) {
      const found = smartDcaResult.items.find((i) => i.assetId === activeCmcAssetId);
      if (found) return found;
    }
    return smartDcaResult.items[0];
  }, [smartDcaResult.items, activeCmcAssetId]);

  // Copy summary to clipboard
  const handleCopySummary = () => {
    const today = new Date().toLocaleDateString('id-ID', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });

    const lines: string[] = [
      `🧠 *RENCANA SMART DCA — QUANTPORTO*`,
      `📅 Tanggal: ${today}`,
      `💰 Budget DCA Bulanan: ${formatIdr(monthlyBudgetIdr)}`,
      `⚙️ Mode Sisa Dana: ${
        overflowMode === 'park-rdpu'
          ? 'Parkir ke War Chest (RDPU / Kas)'
          : 'Perbesar Aset Diskon'
      }`,
      `📦 Belanja Aktif: ${formatIdr(smartDcaResult.totalAllocatedAssetsIdr)}`,
      `🕒 Status Pembaruan: ${lastRefreshSuccessAt} (Live Sync Sukses)`,
      `🔍 Transparansi: 100% Indicator-Driven Rules (CMC Style)`,
    ];

    if (smartDcaResult.warChestParkedIdr > 0) {
      lines.push(
        `🛡️ Parkir War Chest: ${formatIdr(smartDcaResult.warChestParkedIdr)}`
      );
    }

    if (smartDcaResult.unallocatedCashRemainderIdr > 0) {
      lines.push(
        `💵 Sisa Kas Pecahan Lot: ${formatIdr(smartDcaResult.unallocatedCashRemainderIdr)}`
      );
    }

    lines.push('');
    lines.push(`📋 *RINCIAN ALOKASI ASET:*`);

    for (const item of smartDcaResult.items) {
      const unitsStr =
        item.recommendedLotsInteger !== undefined
          ? `(${item.recommendedLotsInteger} Lot / ${item.recommendedLotsInteger * 100} lbr)`
          : item.isNominalOnly
            ? `(Nominal Rp ${item.recommendedAmountIdr.toLocaleString('id-ID')})`
            : item.recommendedUnits > 0
              ? `(${item.recommendedUnits} unit)`
              : '';

      lines.push(
        `• ${item.symbol} [${item.actionLabel} - ${item.multiplier}x]: ${formatIdr(
          item.recommendedAmountIdr
        )} ${unitsStr}`
      );
    }

    navigator.clipboard?.writeText(lines.join('\n'));
    setCopiedSummary(true);
    setTimeout(() => setCopiedSummary(false), 2500);
  };

  const handleCommit = () => {
    if (!onCommitRebalanceToHoldings) return;
    onCommitRebalanceToHoldings(
      `Smart DCA Execution: ${formatIdr(monthlyBudgetIdr)}`,
      smartDcaResult.asRebalanceSummary
    );
    setCommitSuccessMessage('✅ Alokasi Smart DCA berhasil dicatat ke saldo portofolio!');
    setTimeout(() => setCommitSuccessMessage(null), 3500);
  };

  const formatUnitDisplay = (item: SmartDcaItemResult) => {
    if (item.recommendedAmountIdr <= 0) return '—';
    if (item.isNominalOnly) return `Nominal (${formatIdr(item.recommendedAmountIdr, true)})`;
    if (item.recommendedLotsInteger !== undefined) {
      return `${item.recommendedLotsInteger} Lot (${item.recommendedLotsInteger * 100} lbr)`;
    }
    const asset = allAssets.find((a) => a.id === item.assetId);
    if (asset?.currency === 'USD') {
      const usdVal = usdIdrRate > 0 ? item.recommendedAmountIdr / usdIdrRate : 0;
      return `${formatUsd(usdVal)} (${item.recommendedUnits} unit)`;
    }
    return `${item.recommendedUnits} unit`;
  };

  return (
    <div className="space-y-6">
      {/* HERO BANNER & INTRO */}
      <div className="relative overflow-hidden rounded-xl border ui-border ui-card p-4 sm:p-5 shadow-sm">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 shadow-xs">
              <Sparkles className="h-5 w-5" />
            </div>
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-sm sm:text-base font-bold ui-text-main flex items-center gap-1.5">
                  <span>Smart DCA Advisor</span>
                  <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                    CMC Cycle Rules (100% Indicator Driven)
                  </span>
                </h3>
              </div>
              <p className="text-xs ui-text-muted max-w-3xl leading-relaxed">
                Akumulasi cerdas berbasis aturan konfluensi indikator siklus pasar ala <strong>CoinMarketCap Market Cycle Indicators</strong>. Multiplier belanja (0.0x–2.0x) ditentukan 100% oleh sinyal teknikal &amp; valuasi pasar murni tanpa intervensi defisit portofolio.
              </p>
            </div>
          </div>

          {onSwitchToStandardRebalancer && (
            <button
              type="button"
              onClick={onSwitchToStandardRebalancer}
              className="flex items-center gap-1.5 rounded-lg border ui-border ui-subtle hover:bg-zinc-200 dark:hover:bg-zinc-800 ui-text-secondary text-xs px-3 py-2 transition shrink-0"
              title="Kembali ke Rebalancer Reguler"
            >
              <Scale className="h-3.5 w-3.5 text-slate-400" />
              <span>Mode Rebalancer Reguler</span>
            </button>
          )}
        </div>
      </div>

      {/* LIVE SYNC REFRESH TOAST NOTIFICATION */}
      {refreshToast && (
        <div
          className={`flex items-center justify-between gap-2 p-3 rounded-xl border text-xs animate-in fade-in ${
            refreshToast.isError
              ? 'bg-amber-500/10 border-amber-500/30 text-amber-700 dark:text-amber-300'
              : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-700 dark:text-emerald-300'
          }`}
        >
          <div className="flex items-center gap-2">
            {refreshToast.isError ? (
              <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
            ) : (
              <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
            )}
            <span className="font-medium">{refreshToast.message}</span>
          </div>
          <button
            type="button"
            onClick={() => setRefreshToast(null)}
            className={`p-0.5 ${
              refreshToast.isError
                ? 'text-amber-600 hover:text-amber-800 dark:hover:text-amber-100'
                : 'text-emerald-600 hover:text-emerald-800 dark:hover:text-emerald-100'
            }`}
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* ACTIVE MARKET SENTIMENT BAR (PILAR 1 INPUTS) */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-xl bg-black/5 dark:bg-white/5 border ui-border text-xs">
        <div className="flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-emerald-500" />
          <span className="font-bold ui-text-main">Sentimen Valuasi Pasar Aktif (Pilar 1):</span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-zinc-200 dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700">
            <span className="text-slate-500 dark:text-slate-400">Kripto (Fear&amp;Greed):</span>
            <span
              className={`font-mono font-bold ${
                (tacticalConfig?.cryptoScore ?? 50) <= 44
                  ? 'text-emerald-600 dark:text-emerald-400'
                  : (tacticalConfig?.cryptoScore ?? 50) >= 56
                    ? 'text-rose-600 dark:text-rose-400'
                    : 'text-slate-700 dark:text-slate-200'
              }`}
            >
              {tacticalConfig?.cryptoScore ?? 50}/100
            </span>
          </div>
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-zinc-200 dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700">
            <span className="text-slate-500 dark:text-slate-400">Saham AS (S&amp;P 500):</span>
            <span
              className={`font-mono font-bold ${
                (tacticalConfig?.usEquityScore ?? 50) <= 44
                  ? 'text-emerald-600 dark:text-emerald-400'
                  : (tacticalConfig?.usEquityScore ?? 50) >= 56
                    ? 'text-rose-600 dark:text-rose-400'
                    : 'text-slate-700 dark:text-slate-200'
              }`}
            >
              {tacticalConfig?.usEquityScore ?? 50}/100
            </span>
          </div>
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-zinc-200 dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700">
            <span className="text-slate-500 dark:text-slate-400">IHSG (Domestik):</span>
            <span
              className={`font-mono font-bold ${
                (tacticalConfig?.idxEquityScore ?? 50) <= 44
                  ? 'text-emerald-600 dark:text-emerald-400'
                  : (tacticalConfig?.idxEquityScore ?? 50) >= 56
                    ? 'text-rose-600 dark:text-rose-400'
                    : 'text-slate-700 dark:text-slate-200'
              }`}
            >
              {tacticalConfig?.idxEquityScore ?? 50}/100
            </span>
          </div>

          <button
            type="button"
            onClick={handleRefreshData}
            disabled={isRefreshingData}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/20 border border-emerald-500/30 transition disabled:opacity-50"
            title="Sinkronkan data live indikator siklus pasar dan sentimen terkini"
          >
            <RefreshCw
              className={`w-3.5 h-3.5 ${isRefreshingData ? 'animate-spin' : ''}`}
            />
            <span>{isRefreshingData ? 'Sinkronisasi...' : 'Live Sync'}</span>
          </button>
        </div>
      </div>

      {/* DCA CONTROLS & OVERFLOW CONFIG */}
      <section className="ui-card rounded-xl p-4 sm:p-5 border ui-border space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-5 items-center">
          {/* Monthly Budget Input */}
          <div className="md:col-span-6 space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold ui-text-main flex items-center gap-1.5">
                <Coins className="h-4 w-4 text-emerald-500" />
                <span>Budget DCA Bulan Ini</span>
              </label>
              <span className="text-[11px] font-mono ui-text-muted">
                {formatIdr(monthlyBudgetIdr, true)}
              </span>
            </div>

            <div className="flex items-center gap-2">
              <div className="ui-subtle flex flex-1 items-center gap-1.5 rounded-lg border ui-border px-3 py-2">
                <span className="ui-text-muted font-mono text-xs font-bold">Rp</span>
                <FormattedNumberInput
                  step={500_000}
                  min={0}
                  value={monthlyBudgetIdr}
                  onChange={(val) => handleSetMonthlyBudgetIdr(val)}
                  className="ui-text-main w-full bg-transparent font-mono text-sm font-bold focus:outline-none"
                  ariaLabel="Monthly DCA Budget in IDR"
                />
              </div>
            </div>

            {/* Quick Chips */}
            <div className="flex flex-wrap gap-1.5 pt-0.5">
              {monthlySavingsMenu1Idr > 0 && (
                <button
                  type="button"
                  onClick={() => handleSetMonthlyBudgetIdr(monthlySavingsMenu1Idr)}
                  className={`rounded px-2 py-1 text-[11px] font-mono font-semibold transition ${
                    monthlyBudgetIdr === monthlySavingsMenu1Idr
                      ? 'bg-emerald-600 text-white'
                      : 'border border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/20'
                  }`}
                  title="Gunakan target DCA bulanan dari racikan Menu 1"
                >
                  DCA Menu 1 ({formatIdr(monthlySavingsMenu1Idr, true)})
                </button>
              )}
              {cashInjectionIdr > 0 && cashInjectionIdr !== monthlyBudgetIdr && (
                <button
                  type="button"
                  onClick={() => handleSetMonthlyBudgetIdr(cashInjectionIdr)}
                  className="rounded px-2 py-1 text-[11px] font-mono font-semibold border border-indigo-500/40 bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-500/20 transition"
                  title="Gunakan nominal kas masuk / cash injection dari Rebalancer"
                >
                  Kas Rebalance ({formatIdr(cashInjectionIdr, true)})
                </button>
              )}
              {[1_000_000, 3_000_000, 5_000_000, 10_000_000].map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => handleSetMonthlyBudgetIdr(preset)}
                  className={`ui-subtle rounded px-2 py-1 text-[11px] font-mono transition hover:ui-text-main ${
                    monthlyBudgetIdr === preset
                      ? 'bg-zinc-300 dark:bg-zinc-700 font-bold ui-text-main'
                      : 'ui-text-secondary'
                  }`}
                >
                  {preset / 1_000_000} Juta
                </button>
              ))}
            </div>
          </div>

          {/* Overflow Handling Strategy Switcher & Allocation Mode */}
          <div className="md:col-span-6 space-y-3.5 border-t md:border-t-0 md:border-l ui-border pt-4 md:pt-0 md:pl-5">
            {/* Mode 1: Sisa Dana Aset Hold */}
            <div className="space-y-1.5">
              <span className="text-xs font-bold ui-text-main flex items-center gap-1.5">
                <SlidersHorizontal className="h-3.5 w-3.5 text-indigo-500" />
                <span>Strategi Sisa Dana Aset yang di-Hold / Diskon:</span>
              </span>

              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => handleSetOverflowMode('park-rdpu')}
                  className={`flex flex-col items-start p-2.5 rounded-lg border text-left transition ${
                    overflowMode === 'park-rdpu'
                      ? 'border-emerald-500 bg-emerald-500/10 ring-1 ring-emerald-500/30'
                      : 'ui-border ui-subtle hover:bg-zinc-200 dark:hover:bg-zinc-800'
                  }`}
                >
                  <div className="flex items-center gap-1.5">
                    <Shield className="h-3.5 w-3.5 text-emerald-500" />
                    <span className="text-xs font-bold ui-text-main">
                      Parkir War Chest
                    </span>
                  </div>
                  <p className="text-[10px] ui-text-muted mt-0.5 leading-tight">
                    Sisa dana diparkir ke RDPU kas siaga untuk serok crash.
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => handleSetOverflowMode('boost-discount')}
                  className={`flex flex-col items-start p-2.5 rounded-lg border text-left transition ${
                    overflowMode === 'boost-discount'
                      ? 'border-indigo-500 bg-indigo-500/10 ring-1 ring-indigo-500/30'
                      : 'ui-border ui-subtle hover:bg-zinc-200 dark:hover:bg-zinc-800'
                  }`}
                >
                  <div className="flex items-center gap-1.5">
                    <TrendingUp className="h-3.5 w-3.5 text-indigo-500" />
                    <span className="text-xs font-bold ui-text-main">
                      Perbesar Diskon
                    </span>
                  </div>
                  <p className="text-[10px] ui-text-muted mt-0.5 leading-tight">
                    Sisa dana mendongkrak porsi belanja aset terdiskon.
                  </p>
                </button>
              </div>
            </div>

            {/* Mode 2: Toggle Alokasi Rupiah (Bobot Target vs Murni Ranking Konfluensi) */}
            <div className="space-y-1.5 pt-2 border-t ui-border">
              <span className="text-xs font-bold ui-text-main flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <Scale className="h-3.5 w-3.5 text-emerald-500" />
                  <span>Mode Alokasi Budget DCA:</span>
                </span>
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-zinc-200 dark:bg-zinc-800 text-slate-400">
                  {allocationMode === 'pure-confluence-rank'
                    ? 'Murni Ranking Konfluensi'
                    : 'Target Weight × Multiplier'}
                </span>
              </span>

              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => handleSetAllocationMode('target-weight-multiplier')}
                  className={`flex flex-col items-start p-2.5 rounded-lg border text-left transition ${
                    allocationMode === 'target-weight-multiplier'
                      ? 'border-emerald-500 bg-emerald-500/10 ring-1 ring-emerald-500/30'
                      : 'ui-border ui-subtle hover:bg-zinc-200 dark:hover:bg-zinc-800'
                  }`}
                >
                  <span className="text-xs font-bold ui-text-main">
                    Target Weight × Multiplier
                  </span>
                  <p className="text-[10px] ui-text-muted mt-0.5 leading-tight">
                    Mengikuti bobot racikan Menu 1, diskalakan murni oleh konfluensi indikator.
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => handleSetAllocationMode('pure-confluence-rank')}
                  className={`flex flex-col items-start p-2.5 rounded-lg border text-left transition ${
                    allocationMode === 'pure-confluence-rank'
                      ? 'border-indigo-500 bg-indigo-500/10 ring-1 ring-indigo-500/30'
                      : 'ui-border ui-subtle hover:bg-zinc-200 dark:hover:bg-zinc-800'
                  }`}
                >
                  <span className="text-xs font-bold ui-text-main">
                    Murni Ranking Konfluensi
                  </span>
                  <p className="text-[10px] ui-text-muted mt-0.5 leading-tight">
                    100% budget difokuskan hanya ke aset dengan sinyal serok tertinggi.
                  </p>
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* SUMMARY METRIC CARDS */}
      <section className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="ui-card rounded-xl p-4 border ui-border space-y-1">
          <div className="flex items-center justify-between text-xs ui-text-muted">
            <span>Total Budget DCA</span>
            <Coins className="h-4 w-4 text-slate-400" />
          </div>
          <div className="text-lg font-bold font-mono ui-text-main">
            {formatIdr(monthlyBudgetIdr)}
          </div>
          <p className="text-[10px] ui-text-muted">
            Budget dana segar yang dialokasikan bulan ini
          </p>
        </div>

        <div className="ui-card rounded-xl p-4 border ui-border space-y-1">
          <div className="flex items-center justify-between text-xs text-emerald-600 dark:text-emerald-400 font-medium">
            <span>Total Belanja Aset</span>
            <TrendingUp className="h-4 w-4" />
          </div>
          <div className="text-lg font-bold font-mono text-emerald-600 dark:text-emerald-400">
            {formatIdr(smartDcaResult.totalAllocatedAssetsIdr)}
          </div>
          <p className="text-[10px] ui-text-muted">
            {smartDcaResult.items.filter((i) => i.recommendedAmountIdr > 0).length} aset aktif dieksekusi akumulasi
          </p>
        </div>

        <div className="ui-card rounded-xl p-4 border ui-border space-y-1">
          <div className="flex items-center justify-between text-xs text-indigo-600 dark:text-indigo-400 font-medium">
            <span>Parkir War Chest &amp; Kas Siaga</span>
            <Shield className="h-4 w-4" />
          </div>
          <div className="text-lg font-bold font-mono text-indigo-600 dark:text-indigo-400">
            {formatIdr(
              smartDcaResult.warChestParkedIdr +
                smartDcaResult.unallocatedCashRemainderIdr
            )}
          </div>
          <p className="text-[10px] ui-text-muted">
            {smartDcaResult.warChestParkedIdr > 0 &&
            smartDcaResult.unallocatedCashRemainderIdr > 0
              ? `${formatIdr(smartDcaResult.warChestParkedIdr, true)} war chest + ${formatIdr(smartDcaResult.unallocatedCashRemainderIdr, true)} sisa lot`
              : smartDcaResult.warChestParkedIdr > 0
                ? 'Dana siaga dari aset yang di-Hold untuk serok nanti'
                : smartDcaResult.unallocatedCashRemainderIdr > 0
                  ? 'Sisa kas pecahan lot BEI disimpan di kas siaga'
                  : 'Seluruh budget teralokasi optimal ke aset belanja'}
          </p>
        </div>
      </section>

      {/* COINMARKETCAP-STYLE MARKET CYCLE INDICATORS BOARD */}
      {smartDcaResult.items.length > 0 && activeCmcItem && (
        <section className="ui-card rounded-xl border ui-border p-4 sm:p-5 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b ui-border pb-3">
            <div className="space-y-0.5">
              <div className="flex items-center gap-2">
                <Table2 className="h-4 w-4 text-emerald-500" />
                <h4 className="text-sm font-bold ui-text-main">
                  Market Cycle Indicators Board (CMC Style)
                </h4>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30">
                  100% Indicator Driven
                </span>
              </div>
              <p className="text-xs ui-text-muted">
                Pilih aset untuk memeriksa daftar indikator siklus pasar. Klik nilai Current atau Reference untuk melakukan override simulasi.
              </p>
            </div>

            {/* Indicator Overrides status */}
            {Object.keys(indicatorOverrides).length > 0 && (
              <button
                type="button"
                onClick={() => {
                  setLocalIndicatorOverrides({});
                  onUpdateSmartDcaIndicatorOverrides?.({});
                }}
                className="flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-semibold rounded-lg border border-amber-500/30 bg-amber-500/10 text-amber-500 hover:bg-amber-500/20 transition self-start sm:self-auto"
                title="Reset seluruh simulasi override indikator ke nilai default pasar"
              >
                <span>Reset Semua Override</span>
              </button>
            )}
          </div>

          {/* Asset Tabs */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
            {smartDcaResult.items.map((item) => {
              const isActive = (activeCmcAssetId ?? smartDcaResult.items[0]?.assetId) === item.assetId;
              const conf = item.explanation.indicatorConfluence;
              const hasOverride = Boolean(indicatorOverrides[item.assetId] && Object.keys(indicatorOverrides[item.assetId]).length > 0);

              return (
                <button
                  key={item.assetId}
                  type="button"
                  onClick={() => setActiveCmcAssetId(item.assetId)}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition border ${
                    isActive
                      ? 'bg-emerald-500/15 border-emerald-500/50 text-emerald-600 dark:text-emerald-400 shadow-2xs'
                      : 'ui-subtle border-transparent hover:border-zinc-300 dark:hover:border-zinc-700 ui-text-secondary'
                  }`}
                >
                  <span
                    className="h-2 w-2 rounded-full shrink-0"
                    style={{ backgroundColor: item.color }}
                  />
                  <span>{item.symbol}</span>
                  <span
                    className={`font-mono text-[10px] px-1.5 py-0.2 rounded-full ${
                      conf.confluencePercent >= 80
                        ? 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400'
                        : conf.confluencePercent >= 60
                          ? 'bg-teal-500/20 text-teal-600 dark:text-teal-400'
                          : conf.confluencePercent < 20
                            ? 'bg-rose-500/20 text-rose-600 dark:text-rose-400'
                            : 'bg-zinc-200 dark:bg-zinc-800 text-slate-400'
                    }`}
                  >
                    {conf.triggeredCount}/{conf.totalIndicators} ({conf.confluencePercent}%)
                  </span>
                  {hasOverride && (
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500" title="Ada nilai override manual" />
                  )}
                </button>
              );
            })}
          </div>

          {/* Table for active item */}
          <div className="pt-1">
            <CoinMarketCapIndicatorTable
              confluence={activeCmcItem.explanation.indicatorConfluence}
              onUpdateIndicatorOverride={handleUpdateIndicatorOverride}
              onResetAssetOverrides={handleResetAssetOverrides}
              onRefreshData={handleRefreshData}
              isRefreshing={isRefreshingData}
              lastRefreshedAt={lastRefreshSuccessAt}
            />
          </div>
        </section>
      )}

      {/* MAIN ALLOCATION TABLE */}
      <section className="ui-card rounded-xl border ui-border p-4 sm:p-5 space-y-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b ui-border pb-3">
          <div>
            <h4 className="text-sm font-bold ui-text-main flex items-center gap-2">
              <span>Rekomendasi Alokasi Smart DCA</span>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-zinc-200 dark:bg-zinc-800 text-slate-700 dark:text-slate-300">
                {smartDcaResult.items.length} Aset
              </span>
            </h4>
            <p className="text-xs ui-text-muted mt-0.5">
              Klik tombol <strong>Mengapa?</strong> pada setiap aset untuk memeriksa rumus, indikator pasar, dan alur perhitungannya.
            </p>
          </div>

          {/* Quick Action Buttons */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleCopySummary}
              className="flex items-center gap-1.5 rounded-lg border ui-border ui-subtle px-3 py-1.5 text-xs font-semibold hover:ui-text-main transition"
              title="Salin rencana Smart DCA ke Clipboard"
            >
              {copiedSummary ? (
                <>
                  <Check className="h-3.5 w-3.5 text-emerald-500" />
                  <span className="text-emerald-500">Tersalin</span>
                </>
              ) : (
                <>
                  <Copy className="h-3.5 w-3.5" />
                  <span>Salin Ringkasan</span>
                </>
              )}
            </button>

            {onOpenOrderSlip && (
              <button
                type="button"
                onClick={() => onOpenOrderSlip(smartDcaResult.asRebalanceSummary)}
                className="flex items-center gap-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white px-3.5 py-1.5 text-xs font-semibold shadow-xs transition"
                title="Buka slip eksekusi order broker dengan alokasi Smart DCA"
              >
                <Building2 className="h-3.5 w-3.5" />
                <span>Buka Slip Order Broker</span>
              </button>
            )}

            {onCommitRebalanceToHoldings && (
              <button
                type="button"
                onClick={handleCommit}
                className="flex items-center gap-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white px-3.5 py-1.5 text-xs font-semibold shadow-xs transition"
                title="Simpan alokasi Smart DCA ini ke saldo portofolio"
              >
                <CheckCircle2 className="h-3.5 w-3.5" />
                <span>Eksekusi ke Portofolio</span>
              </button>
            )}
          </div>
        </div>

        {commitSuccessMessage && (
          <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-600 dark:text-emerald-400 text-xs font-semibold flex items-center justify-between">
            <span>{commitSuccessMessage}</span>
            <button
              type="button"
              onClick={() => setCommitSuccessMessage(null)}
              className="text-slate-400 hover:text-slate-200"
            >
              ✕
            </button>
          </div>
        )}

        {/* Table View (Desktop & Tablet) */}
        <div className="overflow-x-auto hidden md:block">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b ui-border text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                <th className="py-2.5 px-3">Aset &amp; Bobot</th>
                <th className="py-2.5 px-3">Rekomendasi Tindakan</th>
                <th className="py-2.5 px-3 text-center">Konfluensi Indikator</th>
                <th className="py-2.5 px-3 text-right">Rekomendasi Alokasi</th>
                <th className="py-2.5 px-3 text-right">Estimasi Unit / Lot</th>
                <th className="py-2.5 px-3 text-center">Transparansi</th>
              </tr>
            </thead>
            <tbody className="divide-y ui-border">
              {smartDcaResult.items.map((item) => {
                const isHold = item.action === 'HOLD_SKIP';
                const isAggressive = item.action === 'AGGRESSIVE_BUY';
                const isModerate = item.action === 'MODERATE_BUY';

                return (
                  <tr
                    key={item.assetId}
                    className="hover:bg-black/5 dark:hover:bg-white/5 transition"
                  >
                    {/* Asset & Weight */}
                    <td className="py-3 px-3">
                      <div className="flex items-center gap-2">
                        <span
                          className="h-2.5 w-2.5 rounded-full shrink-0"
                          style={{ backgroundColor: item.color }}
                        />
                        <div>
                          <div className="font-bold ui-text-main flex items-center gap-1">
                            <span>{item.symbol}</span>
                            <span className="text-[10px] font-normal text-slate-400 truncate max-w-[120px]">
                              {item.name}
                            </span>
                          </div>
                          <div className="text-[10px] text-slate-400 flex items-center gap-1.5 mt-0.5">
                            <span>Target {item.targetWeightPercent.toFixed(1)}%</span>
                            <span>•</span>
                            <span
                              className={
                                item.currentWeightPercent < item.targetWeightPercent
                                  ? 'text-amber-500'
                                  : 'text-slate-400'
                              }
                            >
                              Saat ini {item.currentWeightPercent.toFixed(1)}%
                            </span>
                          </div>
                        </div>
                      </div>
                    </td>

                    {/* Recommendation Badge */}
                    <td className="py-3 px-3">
                      <div className="flex flex-col gap-1 items-start">
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                            isAggressive
                              ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30'
                              : isModerate
                                ? 'bg-teal-500/15 text-teal-600 dark:text-teal-400 border-teal-500/30'
                                : isHold
                                  ? 'bg-rose-500/15 text-rose-600 dark:text-rose-400 border-rose-500/30'
                                  : item.action === 'SMALL_BUY'
                                    ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30'
                                    : 'bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/30'
                          }`}
                        >
                          {item.actionLabel}
                        </span>
                        <span className="text-[10px] font-mono font-semibold text-slate-400">
                          Multiplier: {item.multiplier}x
                        </span>
                      </div>
                    </td>

                    {/* CMC Indicator Confluence */}
                    <td className="py-3 px-3 text-center">
                      <div className="inline-flex flex-col items-center">
                        <span
                          className={`font-mono font-bold text-xs ${
                            item.explanation.indicatorConfluence.confluencePercent >= 80
                              ? 'text-emerald-600 dark:text-emerald-400'
                              : item.explanation.indicatorConfluence.confluencePercent >= 60
                                ? 'text-teal-600 dark:text-teal-400'
                                : item.explanation.indicatorConfluence.confluencePercent < 20
                                  ? 'text-rose-600 dark:text-rose-400'
                                  : 'ui-text-main'
                          }`}
                        >
                          {item.explanation.indicatorConfluence.triggeredCount}/
                          {item.explanation.indicatorConfluence.totalIndicators} Triggered ({item.explanation.indicatorConfluence.confluencePercent}%)
                        </span>
                        <div className="w-20 bg-black/10 dark:bg-white/10 h-1.5 rounded-full overflow-hidden mt-1">
                          <div
                            className={`h-full rounded-full ${
                              item.explanation.indicatorConfluence.confluencePercent >= 80
                                ? 'bg-emerald-500'
                                : item.explanation.indicatorConfluence.confluencePercent >= 60
                                  ? 'bg-teal-500'
                                  : item.explanation.indicatorConfluence.confluencePercent < 20
                                    ? 'bg-rose-500'
                                    : 'bg-blue-500'
                            }`}
                            style={{
                              width: `${Math.max(
                                5,
                                item.explanation.indicatorConfluence.confluencePercent
                              )}%`,
                            }}
                          />
                        </div>
                      </div>
                    </td>

                    {/* Recommended Amount IDR */}
                    <td className="py-3 px-3 text-right">
                      <div className="font-mono font-bold text-xs ui-text-main">
                        {formatIdr(item.recommendedAmountIdr)}
                      </div>
                      <div className="text-[10px] text-slate-400 font-mono">
                        Base: {formatIdr(item.baseAllocationIdr, true)}
                      </div>
                    </td>

                    {/* Unit / Lot */}
                    <td className="py-3 px-3 text-right font-mono text-xs ui-text-secondary">
                      {formatUnitDisplay(item)}
                    </td>

                    {/* Transparency Button */}
                    <td className="py-3 px-3 text-center">
                      <button
                        type="button"
                        onClick={() => setSelectedAssetForWhy(item)}
                        className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-semibold border ui-border ui-subtle hover:bg-emerald-500/10 hover:text-emerald-600 dark:hover:text-emerald-400 hover:border-emerald-500/40 transition"
                        title="Buka rincian metrik, rumus, dan alasan alokasi ini"
                      >
                        <Lightbulb className="h-3 w-3 text-amber-500" />
                        <span>Mengapa?</span>
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Mobile Responsive Cards (Screens < 768px) */}
        <div className="space-y-3 md:hidden">
          {smartDcaResult.items.map((item) => {
            const isHold = item.action === 'HOLD_SKIP';
            const isAggressive = item.action === 'AGGRESSIVE_BUY';
            const isModerate = item.action === 'MODERATE_BUY';
            const deficitPct = item.explanation.driftBreakdown.relativeDeficitPercent;

            return (
              <div
                key={item.assetId}
                className="rounded-xl border ui-border p-3.5 space-y-3 ui-subtle"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span
                      className="h-3 w-3 rounded-full shrink-0"
                      style={{ backgroundColor: item.color }}
                    />
                    <div>
                      <div className="font-bold ui-text-main text-xs flex items-center gap-1.5">
                        <span>{item.symbol}</span>
                        <span className="text-[10px] font-normal text-slate-400 truncate max-w-[120px]">
                          {item.name}
                        </span>
                      </div>
                      <div className="text-[10px] text-slate-400 flex items-center gap-1.5 mt-0.5">
                        <span>Target {item.targetWeightPercent.toFixed(1)}%</span>
                        <span>•</span>
                        <span
                          className={
                            item.currentWeightPercent < item.targetWeightPercent
                              ? 'text-amber-500 font-semibold'
                              : 'text-slate-400'
                          }
                        >
                          Saat ini {item.currentWeightPercent.toFixed(1)}%
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-col items-end gap-0.5">
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                        isAggressive
                          ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30'
                          : isModerate
                            ? 'bg-teal-500/15 text-teal-600 dark:text-teal-400 border-teal-500/30'
                            : isHold
                              ? 'bg-rose-500/15 text-rose-600 dark:text-rose-400 border-rose-500/30'
                              : item.action === 'SMALL_BUY'
                                ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30'
                                : 'bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/30'
                      }`}
                    >
                      {item.actionLabel} ({item.multiplier}x)
                    </span>
                  </div>
                </div>

                {/* Indicator Confluence Score Bar */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="ui-text-muted">Konfluensi Indikator Siklus:</span>
                    <span className="font-mono font-bold ui-text-main">
                      {item.explanation.indicatorConfluence.triggeredCount}/
                      {item.explanation.indicatorConfluence.totalIndicators} (
                      {item.explanation.indicatorConfluence.confluencePercent}%)
                    </span>
                  </div>
                  <div className="w-full bg-black/10 dark:bg-white/10 h-1.5 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full ${
                        item.explanation.indicatorConfluence.confluencePercent >= 80
                          ? 'bg-emerald-500'
                          : item.explanation.indicatorConfluence.confluencePercent >= 60
                            ? 'bg-teal-500'
                            : item.explanation.indicatorConfluence.confluencePercent < 20
                              ? 'bg-rose-500'
                              : 'bg-blue-500'
                      }`}
                      style={{
                        width: `${Math.max(
                          5,
                          item.explanation.indicatorConfluence.confluencePercent
                        )}%`,
                      }}
                    />
                  </div>
                </div>

                {/* Weight & Allocation Grid */}
                <div className="grid grid-cols-2 gap-2 text-xs pt-1 border-t ui-border">
                  <div>
                    <span className="text-[10px] ui-text-muted block">Alokasi Smart DCA</span>
                    <span className="font-mono font-bold ui-text-main text-xs">
                      {formatIdr(item.recommendedAmountIdr)}
                    </span>
                    <span className="text-[10px] ui-text-muted block">
                      Base: {formatIdr(item.baseAllocationIdr, true)}
                    </span>
                  </div>

                  <div>
                    <span className="text-[10px] ui-text-muted block">Estimasi Lot/Unit</span>
                    <span className="font-mono font-semibold ui-text-secondary text-xs">
                      {formatUnitDisplay(item)}
                    </span>
                    <span
                      className={`text-[10px] font-semibold block ${
                        deficitPct > 0 ? 'text-amber-500' : 'text-slate-400'
                      }`}
                    >
                      {deficitPct > 0 ? `Defisit ${deficitPct}%` : 'Sesuai Target'}
                    </span>
                  </div>
                </div>

                {/* Action Button: Mengapa? */}
                <button
                  type="button"
                  onClick={() => setSelectedAssetForWhy(item)}
                  className="w-full flex items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs font-semibold border ui-border ui-card hover:bg-emerald-500/10 hover:text-emerald-600 dark:hover:text-emerald-400 hover:border-emerald-500/30 transition shadow-2xs"
                >
                  <Lightbulb className="h-3.5 w-3.5 text-amber-500" />
                  <span>Lihat Analisis &amp; Rumus Mengapa Direkomendasikan</span>
                </button>
              </div>
            );
          })}
        </div>

        {/* Remainder Cash Notice */}
        {smartDcaResult.unallocatedCashRemainderIdr > 0 && (
          <div className="flex items-center justify-between text-xs p-3 rounded-lg bg-black/5 dark:bg-white/5 ui-border border text-slate-400">
            <span className="flex items-center gap-1.5">
              <Info className="h-3.5 w-3.5 text-slate-400" />
              <span>
                Sisa Kas Pecahan Lot BEI:{' '}
                <strong className="text-emerald-600 dark:text-emerald-400 font-mono">
                  {formatIdr(smartDcaResult.unallocatedCashRemainderIdr)}
                </strong>{' '}
                (disimpan di kas siaga / RDPU untuk top-up berikutnya).
              </span>
            </span>
          </div>
        )}
      </section>

      {/* INTERACTIVE "MENGAPA DIREKOMENDASIKAN?" MODAL / DRAWER */}
      {selectedAssetForWhy && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs animate-in fade-in"
          onClick={() => setSelectedAssetForWhy(null)}
        >
          <div
            className="ui-card w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-xl border ui-border shadow-2xl p-5 sm:p-6 space-y-5"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-start justify-between border-b ui-border pb-3">
              <div className="flex items-center gap-3">
                <span
                  className="h-4 w-4 rounded-full"
                  style={{ backgroundColor: selectedAssetForWhy.color }}
                />
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-base font-bold ui-text-main">
                      {selectedAssetForWhy.symbol} — {selectedAssetForWhy.name}
                    </h3>
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                        selectedAssetForWhy.action === 'AGGRESSIVE_BUY'
                          ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30'
                          : selectedAssetForWhy.action === 'HOLD_SKIP'
                            ? 'bg-rose-500/15 text-rose-600 dark:text-rose-400 border-rose-500/30'
                            : 'bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/30'
                      }`}
                    >
                      {selectedAssetForWhy.actionLabel} ({selectedAssetForWhy.multiplier}x)
                    </span>
                  </div>
                  <p className="text-xs ui-text-muted mt-0.5">
                    Transparansi Kuantitatif: Mengapa &amp; Bagaimana Angka Dihasilkan
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setSelectedAssetForWhy(null)}
                className="rounded-lg p-1.5 text-slate-400 hover:ui-text-main hover:bg-black/10 dark:hover:bg-white/10 transition"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Narrative Why */}
            <div className="p-3.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-xs leading-relaxed ui-text-main">
              <div className="flex items-center gap-1.5 font-bold text-emerald-600 dark:text-emerald-400 mb-1">
                <Lightbulb className="h-4 w-4" />
                <span>Analisis Rationale:</span>
              </div>
              <p>{selectedAssetForWhy.explanation.narrativeWhy}</p>
            </div>

            {/* CMC Market Cycle Indicators Checklist Table */}
            <div className="space-y-2 border-t ui-border pt-3">
              <div className="flex items-center gap-2">
                <Table2 className="h-4 w-4 text-emerald-500" />
                <h4 className="text-xs font-bold ui-text-main">
                  Daftar Indikator Siklus Pasar (CoinMarketCap Table):
                </h4>
              </div>
              <CoinMarketCapIndicatorTable
                confluence={selectedAssetForWhy.explanation.indicatorConfluence}
                onUpdateIndicatorOverride={handleUpdateIndicatorOverride}
                onResetAssetOverrides={handleResetAssetOverrides}
                onRefreshData={handleRefreshData}
                isRefreshing={isRefreshingData}
                lastRefreshedAt={lastRefreshSuccessAt}
              />
            </div>

            {/* 2-Pillar Metrics Breakdown Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Pillar 1: Market Valuation & Discount Score */}
              <div className="rounded-xl border ui-border p-3.5 space-y-2.5 bg-black/5 dark:bg-white/5">
                <div className="flex items-center justify-between border-b ui-border pb-2">
                  <span className="text-xs font-bold ui-text-main flex items-center gap-1">
                    <TrendingUp className="h-3.5 w-3.5 text-emerald-500" />
                    <span>Pilar 1: Diskon Valuasi Pasar</span>
                  </span>
                  <span className="font-mono font-bold text-xs text-emerald-600 dark:text-emerald-400">
                    {selectedAssetForWhy.explanation.valuationScore}/100
                  </span>
                </div>

                <div className="space-y-2 text-xs">
                  {selectedAssetForWhy.explanation.valuationBreakdown.metrics.map(
                    (m, idx) => (
                      <div key={idx} className="space-y-0.5">
                        <div className="flex items-center justify-between">
                          <span className="font-medium ui-text-main">{m.name}</span>
                          <span className="font-mono font-bold text-slate-300">
                            {m.value}
                          </span>
                        </div>
                        <div className="flex items-center justify-between text-[11px] text-slate-400">
                          <span>Bobot: {m.weightPercent}%</span>
                          <span className="font-mono">Skor: {m.score}/100</span>
                        </div>
                        <p className="text-[10px] ui-text-muted">{m.description}</p>
                      </div>
                    )
                  )}
                </div>
              </div>

              {/* Pillar 2: Portfolio Deficit & Drift Gap */}
              <div className="rounded-xl border ui-border p-3.5 space-y-2.5 bg-black/5 dark:bg-white/5">
                <div className="flex items-center justify-between border-b ui-border pb-2">
                  <span className="text-xs font-bold ui-text-main flex items-center gap-1">
                    <Percent className="h-3.5 w-3.5 text-indigo-500" />
                    <span>Pilar 2: Defisit Portofolio</span>
                  </span>
                  <span className="font-mono font-bold text-xs text-indigo-600 dark:text-indigo-400">
                    {selectedAssetForWhy.explanation.driftScore}/100
                  </span>
                </div>

                <div className="space-y-2 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400">Target Alokasi:</span>
                    <span className="font-mono font-bold ui-text-main">
                      {selectedAssetForWhy.targetWeightPercent.toFixed(1)}%
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400">Porsi Saat Ini:</span>
                    <span className="font-mono font-bold ui-text-main">
                      {selectedAssetForWhy.currentWeightPercent.toFixed(1)}%
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400">Selisih Defisit:</span>
                    <span
                      className={`font-mono font-bold ${
                        selectedAssetForWhy.explanation.driftBreakdown.relativeDeficitPercent > 0
                          ? 'text-amber-500'
                          : 'text-emerald-500'
                      }`}
                    >
                      {selectedAssetForWhy.explanation.driftBreakdown.relativeDeficitPercent > 0
                        ? `Defisit -${selectedAssetForWhy.explanation.driftBreakdown.relativeDeficitPercent}%`
                        : `Surplus +${Math.abs(selectedAssetForWhy.explanation.driftBreakdown.relativeDeficitPercent)}%`}
                    </span>
                  </div>
                  <p className="text-[10px] ui-text-muted pt-1">
                    {selectedAssetForWhy.explanation.driftBreakdown.summary}
                  </p>
                </div>
              </div>
            </div>

            {/* Budget Math Arithmetic */}
            <div className="rounded-xl border ui-border p-3.5 space-y-2 bg-black/5 dark:bg-white/5">
              <div className="flex items-center justify-between border-b ui-border pb-1.5 text-xs font-bold ui-text-main">
                <span>Alur Matematika Alokasi Rupiah</span>
                <span className="font-mono font-semibold text-emerald-500">
                  {formatIdr(selectedAssetForWhy.recommendedAmountIdr)}
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                <div className="p-2 rounded bg-black/10 dark:bg-white/5 space-y-0.5">
                  <span className="text-[10px] text-slate-400 block">Base DCA</span>
                  <span className="font-mono font-bold">
                    {formatIdr(selectedAssetForWhy.explanation.budgetMath.baseAllocationIdr, true)}
                  </span>
                </div>
                <div className="p-2 rounded bg-black/10 dark:bg-white/5 space-y-0.5">
                  <span className="text-[10px] text-slate-400 block">Multiplier</span>
                  <span className="font-mono font-bold text-indigo-400">
                    {selectedAssetForWhy.multiplier}x
                  </span>
                </div>
                <div className="p-2 rounded bg-black/10 dark:bg-white/5 space-y-0.5">
                  <span className="text-[10px] text-slate-400 block">Alokasi Final</span>
                  <span className="font-mono font-bold text-emerald-400">
                    {formatIdr(selectedAssetForWhy.recommendedAmountIdr, true)}
                  </span>
                </div>
                <div className="p-2 rounded bg-black/10 dark:bg-white/5 space-y-0.5">
                  <span className="text-[10px] text-slate-400 block">War Chest / Parkir</span>
                  <span className="font-mono font-bold text-slate-300">
                    {formatIdr(selectedAssetForWhy.explanation.budgetMath.warChestShareIdr, true)}
                  </span>
                </div>
              </div>
            </div>

            {/* Step-by-Step Code / Formula */}
            <div className="space-y-1.5">
              <span className="text-xs font-bold ui-text-main block">
                Rumus Lengkap Step-by-Step:
              </span>
              <pre className="p-3 rounded-lg bg-zinc-950 text-emerald-400 font-mono text-[11px] overflow-x-auto whitespace-pre-wrap leading-relaxed border border-zinc-800">
                {selectedAssetForWhy.explanation.formulaHow}
              </pre>
            </div>

            {/* Data Source Transparency & Verification Banner */}
            <div className="rounded-xl border ui-border p-3.5 space-y-2 bg-emerald-500/5 text-xs">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b ui-border pb-2">
                <span className="font-bold ui-text-main flex items-center gap-1.5">
                  <Database className="w-3.5 h-3.5 text-emerald-500" />
                  <span>Transparansi Sumber Data &amp; Verifikasi Metrik</span>
                </span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 font-semibold border border-emerald-500/30">
                  Live Sync Terakhir: {lastRefreshSuccessAt}
                </span>
              </div>
              <p className="text-[11px] ui-text-muted leading-relaxed">
                Indikator siklus dan valuasi di atas divalidasi silang dari:{' '}
                <strong className="ui-text-main">
                  {(selectedAssetForWhy.explanation.indicatorConfluence.dataSources || [])
                    .map((s) => s.sourceName)
                    .join(', ')}
                </strong>
                . Sinyal beli Smart DCA dihasilkan 100% dari ambang batas indikator pasar tanpa kalkulasi tersembunyi.
              </p>
            </div>

            {/* Modal Footer */}
            <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-between gap-2 pt-3 border-t ui-border">
              <button
                type="button"
                onClick={() => {
                  if (!selectedAssetForWhy) return;
                  const unitsLabel =
                    selectedAssetForWhy.recommendedLotsInteger !== undefined
                      ? `${selectedAssetForWhy.recommendedLotsInteger} Lot (${selectedAssetForWhy.recommendedUnits} lembar)`
                      : selectedAssetForWhy.isNominalOnly
                      ? formatIdr(selectedAssetForWhy.recommendedAmountIdr)
                      : `${selectedAssetForWhy.recommendedUnits} unit`;

                  const conf = selectedAssetForWhy.explanation.indicatorConfluence;
                  const indicatorLines = conf.indicators.map(
                    (ind, idx) =>
                      `  ${ind.isTriggered ? '✅' : '❌'} #${idx + 1} ${ind.name}: ${ind.formattedCurrent} (Ref: ${ind.comparisonOperator} ${ind.formattedReference}) [${ind.isTriggered ? 'TRIGGERED' : 'UNTRIGGERED'}] — Sumber: ${ind.sourceName}`
                  );

                  const sourceLines = (conf.dataSources || []).map(
                    (s) => `  • ${s.sourceName} (${s.sourceUrl}) [${s.sourceType}]`
                  );

                  const text = [
                    `=== RATIONALE SMART DCA: ${selectedAssetForWhy.symbol} ===`,
                    `Keputusan: ${selectedAssetForWhy.actionLabel} (${selectedAssetForWhy.multiplier}x Multiplier)`,
                    `Konfluensi Indikator: ${conf.triggeredCount}/${conf.totalIndicators} Triggered (${conf.confluencePercent}%)`,
                    `Alokasi: ${formatIdr(selectedAssetForWhy.recommendedAmountIdr)} (${unitsLabel})`,
                    ``,
                    `[1] Analisis Rationale:`,
                    selectedAssetForWhy.explanation.narrativeWhy,
                    ``,
                    `[2] Konfluensi Indikator Siklus Pasar (CMC Style Table):`,
                    `- Rasio Terpicu: ${conf.triggeredCount} dari ${conf.totalIndicators} (${conf.confluencePercent}%)`,
                    ...indicatorLines,
                    ``,
                    `[3] Diskon Valuasi Pasar & Defisit Portofolio (Konteks Informasional):`,
                    `- Skor Valuasi Pasar: ${selectedAssetForWhy.explanation.valuationScore}/100`,
                    `- Skor Defisit Portofolio: ${selectedAssetForWhy.explanation.driftScore}/100`,
                    `- Status Bobot: ${selectedAssetForWhy.explanation.driftBreakdown.summary}`,
                    ``,
                    `[4] Matematika Alokasi Rupiah:`,
                    `- Base DCA: ${formatIdr(selectedAssetForWhy.explanation.budgetMath.baseAllocationIdr)}`,
                    `- Multiplier: ${selectedAssetForWhy.multiplier}x`,
                    `- Alokasi Final: ${formatIdr(selectedAssetForWhy.recommendedAmountIdr)}`,
                    `- War Chest / Parkir: ${formatIdr(selectedAssetForWhy.explanation.budgetMath.warChestShareIdr)}`,
                    ``,
                    `[5] Rumus Perhitungan Step-by-Step:`,
                    selectedAssetForWhy.explanation.formulaHow,
                    ``,
                    `[6] Transparansi Sumber Data & Pembaruan Terakhir:`,
                    `- Status Pembaruan: ${lastRefreshSuccessAt} (Live Sync Sukses)`,
                    `- Sumber Data Terverifikasi:`,
                    ...sourceLines,
                  ].join('\n');
                  navigator.clipboard.writeText(text);
                  setCopiedWhyExplanation(true);
                  setTimeout(() => setCopiedWhyExplanation(false), 2500);
                }}
                className="inline-flex items-center justify-center gap-1.5 rounded-lg border ui-border px-3.5 py-2 text-xs font-semibold ui-text-main hover:bg-black/5 dark:hover:bg-white/5 transition"
              >
                {copiedWhyExplanation ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-500" />
                    <span className="text-emerald-500 font-medium">Tersalin ke Clipboard!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5 ui-text-muted" />
                    <span>Salin Analisis Lengkap</span>
                  </>
                )}
              </button>
              <button
                type="button"
                onClick={() => setSelectedAssetForWhy(null)}
                className="rounded-lg bg-zinc-200 dark:bg-zinc-800 px-4 py-2 text-xs font-semibold ui-text-main hover:bg-zinc-300 dark:hover:bg-zinc-700 transition text-center"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
