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
}) => {
  const [showShockSliders, setShowShockSliders] = useState(true);
  const [rebalanceNoteInput, setRebalanceNoteInput] = useState('');
  const [committedBanner, setCommittedBanner] = useState(false);

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
      {/* TOP CONTROL BAR & VIDEO SCENARIO PRESETS */}
      <section className="ui-card rounded-xl p-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <Scale className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
              <h2 className="ui-text-main text-sm font-bold sm:text-base">
                Portfolio Rebalancer &amp; Market Crash Simulator
              </h2>
            </div>
            <p className="ui-text-muted mt-0.5 text-xs">
              Jual porto yang bobotnya kelebihan, pindahkan ke yang kekurangan (Menit
              15:55).
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => onPopulateCapital(100_000_000)}
              className="ui-subtle ui-text-main flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium hover:opacity-80"
            >
              <Coins className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
              <span>Set Modal Awal Rp 100 Juta (Sesuai Target Aktif)</span>
            </button>

            <button
              type="button"
              onClick={onLoadVideo1BExample}
              className="ui-subtle ui-text-main flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium hover:opacity-80"
            >
              <Coins className="h-3.5 w-3.5" />
              <span>Contoh Video Rp 1M (BTC 90%)</span>
            </button>

            <button
              type="button"
              onClick={onApplyPeerDiversification}
              className="ui-subtle ui-text-main flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium hover:opacity-80"
            >
              <Split className="h-3.5 w-3.5" />
              <span>Split Sub-Bank (BBCA/BMRI/BBRI/NISP)</span>
            </button>
          </div>
        </div>

        {/* Market Crash / Bull Run Stress-Test Bar */}
        <div className="ui-subtle mt-4 rounded-lg p-3.5">
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
          <div className="mt-1.5 flex gap-1 text-[11px]">
            {[0, 5_000_000, 10_000_000, 50_000_000].map((presetCash) => (
              <button
                key={presetCash}
                type="button"
                onClick={() => setCashInjectionIdr(presetCash)}
                className="ui-subtle ui-text-secondary rounded px-1.5 py-0.5"
              >
                +{presetCash === 0 ? '0' : `${presetCash / 1_000_000}Jt`}
              </button>
            ))}
          </div>
        </div>

        <div className="ui-card rounded-xl p-4">
          <div className="ui-text-muted text-xs font-medium">
            Mode Eksekusi Rebalancing
          </div>
          <div className="ui-subtle mt-1.5 flex gap-1 rounded p-0.5">
            <button
              type="button"
              onClick={() => setRebalanceMode('sell-and-buy')}
              className={`flex-1 rounded px-2 py-1 text-xs font-medium transition ${
                rebalanceMode === 'sell-and-buy'
                  ? 'ui-card ui-text-main font-semibold shadow-2xs'
                  : 'ui-text-muted'
              }`}
            >
              Sell + Buy
            </button>
            <button
              type="button"
              onClick={() => setRebalanceMode('buy-only-dca')}
              className={`flex-1 rounded px-2 py-1 text-xs font-medium transition ${
                rebalanceMode === 'buy-only-dca'
                  ? 'ui-card ui-text-main font-semibold shadow-2xs'
                  : 'ui-text-muted'
              }`}
            >
              Buy-Only (DCA)
            </button>
          </div>
          <div className="ui-text-muted mt-1.5 text-[11px]">
            {rebalanceMode === 'sell-and-buy'
              ? 'Jual aset overweight & beli aset underweight.'
              : 'Tanpa jual aset; alokasikan kas baru ke aset underweight.'}
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
        <div className="ui-card rounded-xl p-5 lg:col-span-8">
          <div className="ui-border flex flex-wrap items-center justify-between gap-2 border-b pb-3">
            <div>
              <h3 className="ui-text-main text-sm font-bold">
                Tabel Instruksi Jual / Beli Rebalancing
              </h3>
              <p className="ui-text-muted text-xs">
                Ubah nilai Rupiah saat ini atau jumlah Unit/Lot untuk menghitung order:
              </p>
            </div>

            <div className="flex items-center gap-2">
              <div className="ui-subtle flex rounded-md p-0.5 text-xs">
                <button
                  type="button"
                  onClick={() => setInputMode('nominal')}
                  className={`rounded px-2.5 py-1 font-medium ${
                    inputMode === 'nominal'
                      ? 'ui-card ui-text-main font-semibold shadow-2xs'
                      : 'ui-text-muted'
                  }`}
                >
                  Nominal (Rp)
                </button>
                <button
                  type="button"
                  onClick={() => setInputMode('units')}
                  className={`rounded px-2.5 py-1 font-medium ${
                    inputMode === 'units'
                      ? 'ui-card ui-text-main font-semibold shadow-2xs'
                      : 'ui-text-muted'
                  }`}
                >
                  Unit / Lot
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

          <div
            tabIndex={0}
            role="region"
            aria-label="Rebalancing Trade Execution Table"
            className="ui-border mt-4 overflow-x-auto rounded-lg border"
          >
            <table className="w-full border-separate border-spacing-0 text-left text-xs">
              <thead className="ui-subtle text-[11px] font-semibold uppercase">
                <tr>
                  <th className="ui-border border-b px-3 py-2">Instrumen</th>
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
                      <td className="ui-border border-b px-3 py-2.5">
                        <div className="flex items-center gap-2">
                          <span
                            className="h-2.5 w-2.5 shrink-0 rounded-full"
                            style={{ backgroundColor: item.color }}
                          />
                          <div>
                            <div className="ui-text-main font-semibold">
                              {item.symbol}
                            </div>
                            <div className="ui-text-muted text-[10px]">
                              {asset?.currency === 'USD'
                                ? `$${h.currentPrice.toLocaleString()}`
                                : `Rp ${h.currentPrice.toLocaleString('id-ID')}`}
                            </div>
                          </div>
                        </div>
                      </td>

                      <td className="ui-border border-b px-3 py-2.5 text-right">
                        {inputMode === 'nominal' ? (
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
                              {asset?.currency === 'USD'
                                ? `${formatUsd(item.tradeAmountUsd)} (${item.tradeUnits} u)`
                                : item.tradeLots !== undefined
                                  ? `≈ ${item.tradeLots} Lot (${item.tradeUnits} lbr)`
                                  : `≈ ${item.tradeUnits} unit`}
                            </div>
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
                              {asset?.currency === 'USD'
                                ? `${formatUsd(Math.abs(item.tradeAmountUsd))} (${Math.abs(item.tradeUnits)} u)`
                                : item.tradeLots !== undefined
                                  ? `≈ ${Math.abs(item.tradeLots)} Lot (${Math.abs(item.tradeUnits)} lbr)`
                                  : `≈ ${Math.abs(item.tradeUnits)} unit`}
                            </div>
                          </div>
                        ) : (
                          <span className="ui-subtle ui-text-muted rounded px-2 py-0.5 font-mono text-xs">
                            HOLD
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

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
      <section className="ui-card rounded-xl p-5">
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

        <div className="ui-border mt-4 overflow-x-auto rounded-lg border">
          <table className="w-full border-separate border-spacing-0 text-left text-xs">
            <thead className="ui-subtle text-[11px] font-semibold uppercase">
              <tr>
                <th className="ui-border border-b px-3 py-2">Tier Koreksi</th>
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
                  <td className="ui-border border-b px-3 py-2.5 font-mono font-bold text-rose-600 dark:text-rose-400">
                    Crash {step.dropPercent}%
                  </td>
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
      <section className="ui-card rounded-xl p-5">
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
    </div>
  );
};
