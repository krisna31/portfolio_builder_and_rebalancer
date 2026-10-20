import React, { useState } from 'react';
import {
  AssetDefinition,
  HoldingEntry,
  RebalanceMode,
  RebalanceSummaryResult,
} from '../../lib/quant/types';
import { formatIdr, formatUsd } from '../../lib/formatters';
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
} from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
} from 'recharts';

interface PortfolioRebalancerViewProps {
  allAssets: AssetDefinition[];
  targetWeights: Record<string, number>;
  holdings: Record<string, HoldingEntry>;
  onUpdateHolding: (assetId: string, patch: Partial<HoldingEntry>) => void;
  onLoadVideo1BExample: () => void;
  onApplyShockScenario: (scenario: 'reset' | 'video-bull-3x' | 'video-crash-50' | 'global-crisis') => void;
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
}

export const PortfolioRebalancerView: React.FC<PortfolioRebalancerViewProps> = ({
  allAssets,
  targetWeights,
  holdings,
  onUpdateHolding,
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
}) => {
  const [showShockSliders, setShowShockSliders] = useState(true);

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

  return (
    <div className="space-y-6">
      {/* TOP CONTROL BAR & VIDEO SCENARIO PRESETS (14:58 - 16:08) */}
      <section className="rounded-2xl border border-slate-800 bg-slate-900/90 p-5 shadow-xl">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <Scale className="h-5 w-5 text-emerald-400" />
              <h2 className="text-base font-extrabold text-white sm:text-lg">
                Portfolio Rebalancer &amp; Market Crash Simulator
              </h2>
            </div>
            <p className="mt-1 text-xs text-slate-400">
              &ldquo;Jual porto yang bobotnya kelebihan, pindahin ke yang kekurangan. Pas
              market crash kita otomatis Buy the Dip, pas bull run kita Take Profit.&rdquo;
              (Menit 15:55)
            </p>
          </div>

          {/* One-Click Video Presets */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={onLoadVideo1BExample}
              className="flex items-center gap-1.5 rounded-xl border border-emerald-500/40 bg-emerald-500/15 px-3 py-2 text-xs font-bold text-emerald-300 transition hover:bg-emerald-500/25"
            >
              <Coins className="h-3.5 w-3.5" />
              <span>Load Contoh Video Rp 1 Miliar (BTC 90%)</span>
            </button>

            <button
              type="button"
              onClick={onApplyPeerDiversification}
              title="Menit 14:17: Pecah porsi BBCA ke saham perbankan lain yang sejenis (BMRI, BBRI, BBNI, NISP)"
              className="flex items-center gap-1.5 rounded-xl border border-sky-500/40 bg-sky-500/15 px-3 py-2 text-xs font-bold text-sky-300 transition hover:bg-sky-500/25"
            >
              <Split className="h-3.5 w-3.5" />
              <span>Diversifikasi Sub-Bank (BBCA/BMRI/BBRI/NISP)</span>
            </button>
          </div>
        </div>

        {/* Market Crash / Bull Run Stress-Test Bar */}
        <div className="mt-4 rounded-xl border border-slate-800 bg-slate-950/90 p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2">
              <Zap className="h-4 w-4 text-amber-400" />
              <span className="text-xs font-bold uppercase tracking-wider text-slate-200">
                Simulasi Stress-Test Market Crash &amp; Bull Run (Menit 15:18 – 16:05):
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={() => onApplyShockScenario('video-bull-3x')}
                className="flex items-center gap-1 rounded-lg bg-emerald-500/20 px-2.5 py-1.5 text-xs font-bold text-emerald-300 hover:bg-emerald-500/30"
              >
                <TrendingUp className="h-3.5 w-3.5" />
                <span>Skenario Video 1: BTC &amp; ETH 3x (+200%), BBCA -10%</span>
              </button>

              <button
                type="button"
                onClick={() => onApplyShockScenario('video-crash-50')}
                className="flex items-center gap-1 rounded-lg bg-rose-500/20 px-2.5 py-1.5 text-xs font-bold text-rose-300 hover:bg-rose-500/30"
              >
                <TrendingDown className="h-3.5 w-3.5" />
                <span>Skenario Video 2: Crypto Crash -50% (Buy The Dip)</span>
              </button>

              <button
                type="button"
                onClick={() => onApplyShockScenario('global-crisis')}
                className="rounded-lg bg-amber-500/20 px-2.5 py-1.5 text-xs font-bold text-amber-300 hover:bg-amber-500/30"
              >
                Krisis Global (Saham -35%, Crypto -60%, Emas +12%)
              </button>

              <button
                type="button"
                onClick={() => onApplyShockScenario('reset')}
                className="flex items-center gap-1 rounded-lg border border-slate-700 bg-slate-800 px-2.5 py-1.5 text-xs font-semibold text-slate-300 hover:bg-slate-700"
              >
                <RotateCcw className="h-3 w-3" />
                <span>Reset Shock (0%)</span>
              </button>

              <button
                type="button"
                onClick={() => setShowShockSliders(!showShockSliders)}
                className="text-xs font-semibold text-sky-400 underline ml-1"
              >
                {showShockSliders ? 'Sembunyikan Slider' : 'Custom Shock'}
              </button>
            </div>
          </div>

          {showShockSliders && (
            <div className="mt-3 grid grid-cols-2 gap-2.5 sm:grid-cols-4 lg:grid-cols-8">
              {rebalanceResult.items.map((item) => {
                const shock = holdings[item.assetId]?.shockPercent ?? 0;
                return (
                  <div
                    key={item.assetId}
                    className="rounded-lg border border-slate-800/80 bg-slate-900/90 p-2.5"
                  >
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-bold text-white">{item.assetId}</span>
                      <span
                        className={`font-mono font-bold ${
                          shock > 0
                            ? 'text-emerald-400'
                            : shock < 0
                              ? 'text-rose-400'
                              : 'text-slate-400'
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
                      className="mt-1.5 h-1.5 w-full cursor-pointer appearance-none rounded bg-slate-800 accent-amber-400"
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
        <div className="rounded-2xl border border-slate-800 bg-slate-900/90 p-4">
          <div className="text-xs font-medium text-slate-400">
            Nilai Porto Saat Ini (Post-Shock)
          </div>
          <div className="mt-1 font-mono text-xl font-extrabold text-white">
            {formatIdr(rebalanceResult.postShockTotalIdr)}
          </div>
          <div className="mt-1 flex items-center gap-1.5 text-xs">
            <span className="text-slate-500">Awal: {formatIdr(rebalanceResult.initialTotalIdr, true)}</span>
            {pnlFromShockIdr !== 0 && (
              <span
                className={`font-mono font-bold ${
                  pnlFromShockIdr > 0 ? 'text-emerald-400' : 'text-rose-400'
                }`}
              >
                ({pnlFromShockIdr > 0 ? '+' : ''}
                {pnlPercent.toFixed(1)}%)
              </span>
            )}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-900/90 p-4">
          <div className="text-xs font-medium text-slate-400">
            Top-Up Kas Baru (DCA Injection)
          </div>
          <div className="mt-1 flex items-center gap-2">
            <span className="font-mono text-sm font-bold text-emerald-400">Rp</span>
            <input
              type="number"
              step={1_000_000}
              value={cashInjectionIdr}
              onChange={(e) => setCashInjectionIdr(Math.max(0, Number(e.target.value)))}
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-1 font-mono text-base font-bold text-emerald-400 focus:border-emerald-500 focus:outline-none"
              aria-label="Top-up Cash Injection in IDR"
            />
          </div>
          <div className="mt-1 flex gap-1.5 text-[11px]">
            {[0, 5_000_000, 10_000_000, 50_000_000].map((presetCash) => (
              <button
                key={presetCash}
                type="button"
                onClick={() => setCashInjectionIdr(presetCash)}
                className="rounded bg-slate-800 px-1.5 py-0.5 text-slate-300 hover:bg-slate-700"
              >
                +{presetCash === 0 ? '0' : `${presetCash / 1_000_000}Jt`}
              </button>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-900/90 p-4">
          <div className="text-xs font-medium text-slate-400">
            Mode Eksekusi Rebalancing
          </div>
          <div className="mt-1.5 flex gap-1.5">
            <button
              type="button"
              onClick={() => setRebalanceMode('sell-and-buy')}
              className={`flex-1 rounded-lg px-2.5 py-1.5 text-xs font-bold transition ${
                rebalanceMode === 'sell-and-buy'
                  ? 'bg-emerald-500 text-slate-950'
                  : 'bg-slate-800 text-slate-300'
              }`}
            >
              Sell + Buy (Full)
            </button>
            <button
              type="button"
              onClick={() => setRebalanceMode('buy-only-dca')}
              className={`flex-1 rounded-lg px-2.5 py-1.5 text-xs font-bold transition ${
                rebalanceMode === 'buy-only-dca'
                  ? 'bg-sky-500 text-slate-950'
                  : 'bg-slate-800 text-slate-300'
              }`}
            >
              Buy-Only (DCA)
            </button>
          </div>
          <div className="mt-1.5 text-[11px] text-slate-400">
            {rebalanceMode === 'sell-and-buy'
              ? 'Jual aset yang overweight & beli aset yang underweight.'
              : 'Tanpa jual aset; gunakan kas baru untuk beli aset yang paling turun.'}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-900/90 p-4">
          <div className="flex items-center justify-between text-xs font-medium text-slate-400">
            <span>Status Drift Bobot</span>
            <span>Threshold: ±{driftThresholdPercent}%</span>
          </div>
          <div className="mt-1 flex items-center gap-2">
            {rebalanceResult.breachedCount > 0 ? (
              <>
                <AlertCircle className="h-5 w-5 text-amber-400" />
                <span className="font-mono text-lg font-extrabold text-amber-300">
                  {rebalanceResult.breachedCount} Aset Perlu Rebalance
                </span>
              </>
            ) : (
              <>
                <CheckCircle2 className="h-5 w-5 text-emerald-400" />
                <span className="font-mono text-lg font-extrabold text-emerald-400">
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
            className="mt-2 h-1.5 w-full cursor-pointer appearance-none rounded bg-slate-800 accent-sky-400"
            aria-label="Drift tolerance threshold percentage"
          />
        </div>
      </section>

      {/* MAIN REBALANCING TABLE & DRIFT CHART */}
      <section className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Left 8 Cols: Interactive Holdings & Trade Ticket Table */}
        <div className="rounded-2xl border border-slate-800 bg-slate-900/90 p-5 shadow-xl lg:col-span-8">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-3">
            <div>
              <h3 className="text-base font-extrabold text-white">
                Tabel Instruksi Jual / Beli Rebalancing
              </h3>
              <p className="text-xs text-slate-400">
                Ubah nilai Rupiah saat ini atau jumlah Unit/Lot untuk menghitung
                instruksi order secara instan:
              </p>
            </div>

            <div className="flex items-center gap-2">
              {/* Toggle Input Mode: Nominal Rp vs Units x Price */}
              <div className="flex rounded-lg border border-slate-800 bg-slate-950 p-0.5 text-xs">
                <button
                  type="button"
                  onClick={() => setInputMode('nominal')}
                  className={`rounded-md px-2.5 py-1 font-semibold ${
                    inputMode === 'nominal'
                      ? 'bg-emerald-500 text-slate-950'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Input Nominal (Rp)
                </button>
                <button
                  type="button"
                  onClick={() => setInputMode('units')}
                  className={`rounded-md px-2.5 py-1 font-semibold ${
                    inputMode === 'units'
                      ? 'bg-emerald-500 text-slate-950'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Input Unit / Lot
                </button>
              </div>

              <button
                type="button"
                onClick={exportCsvTrades}
                className="flex items-center gap-1 rounded-lg border border-slate-700 bg-slate-800 px-2.5 py-1.5 text-xs font-semibold text-slate-200 hover:bg-slate-700"
              >
                <Download className="h-3.5 w-3.5 text-emerald-400" />
                <span>CSV</span>
              </button>
            </div>
          </div>

          <div
            tabIndex={0}
            role="region"
            aria-label="Rebalancing Trade Execution Table"
            className="mt-4 overflow-x-auto rounded-xl border border-slate-800"
          >
            <table className="w-full border-separate border-spacing-0 text-left text-xs">
              <thead className="bg-slate-950 text-[11px] font-bold uppercase text-slate-300">
                <tr>
                  <th className="border-b border-slate-800 px-3 py-2.5">Instrumen</th>
                  <th className="border-b border-slate-800 px-3 py-2.5 text-right">
                    Input Posisi Awal
                  </th>
                  <th className="border-b border-slate-800 px-3 py-2.5 text-right">
                    Nilai Saat Ini
                  </th>
                  <th className="border-b border-slate-800 px-2.5 py-2.5 text-right">
                    Bobot Now vs Target
                  </th>
                  <th className="border-b border-slate-800 px-3 py-2.5 text-right">
                    Target (Rp)
                  </th>
                  <th className="border-b border-slate-800 px-3 py-2.5 text-right">
                    Action (Jual / Beli)
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/70">
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
                        item.isDriftBreached ? 'bg-amber-500/5' : 'hover:bg-slate-800/50'
                      }
                    >
                      {/* Asset Name & Live Price */}
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-2">
                          <span
                            className="h-2.5 w-2.5 shrink-0 rounded-full"
                            style={{ backgroundColor: item.color }}
                          />
                          <div>
                            <div className="font-bold text-white">{item.symbol}</div>
                            <div className="text-[10px] text-slate-400">
                              Harga:{' '}
                              {asset?.currency === 'USD'
                                ? `$${h.currentPrice.toLocaleString()}`
                                : `Rp ${h.currentPrice.toLocaleString('id-ID')}`}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Editable Holding Input (Nominal IDR or Units + Price) */}
                      <td className="px-3 py-2.5 text-right">
                        {inputMode === 'nominal' ? (
                          <input
                            type="number"
                            step={1_000_000}
                            value={h.currentValueIdr}
                            onChange={(e) =>
                              onUpdateHolding(item.assetId, {
                                currentValueIdr: Math.max(0, Number(e.target.value)),
                              })
                            }
                            className="w-32 rounded-lg border border-slate-700 bg-slate-950 px-2 py-1 text-right font-mono text-xs font-semibold text-white focus:border-emerald-500 focus:outline-none"
                            aria-label={`Nominal value in IDR for ${item.symbol}`}
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
                                className="w-20 rounded border border-slate-700 bg-slate-950 px-1.5 py-0.5 text-right font-mono text-xs text-white"
                                aria-label={`Units held for ${item.symbol}`}
                              />
                              <span className="text-[10px] text-slate-400">unit</span>
                            </div>
                            <div className="flex items-center gap-1">
                              <span className="text-[10px] text-slate-500">@</span>
                              <input
                                type="number"
                                step="any"
                                value={h.currentPrice}
                                onChange={(e) =>
                                  onUpdateHolding(item.assetId, {
                                    currentPrice: Math.max(0.01, Number(e.target.value)),
                                  })
                                }
                                className="w-20 rounded border border-slate-800 bg-slate-950 px-1.5 py-0.5 text-right font-mono text-[10px] text-slate-300"
                                aria-label={`Current unit price for ${item.symbol}`}
                              />
                            </div>
                          </div>
                        )}
                      </td>

                      {/* Post-Shock Value */}
                      <td className="px-3 py-2.5 text-right font-mono text-slate-200">
                        <div>{formatIdr(item.postShockValueIdr)}</div>
                        {h.shockPercent !== 0 && (
                          <div
                            className={`text-[10px] ${
                              h.shockPercent > 0 ? 'text-emerald-400' : 'text-rose-400'
                            }`}
                          >
                            Shock {h.shockPercent > 0 ? `+${h.shockPercent}%` : `${h.shockPercent}%`}
                          </div>
                        )}
                      </td>

                      {/* Current vs Target Weight & Drift */}
                      <td className="px-2.5 py-2.5 text-right font-mono">
                        <div className="font-bold text-white">
                          {item.currentWeightPercent.toFixed(1)}%{' '}
                          <span className="font-normal text-slate-400">
                            / {item.targetWeightPercent.toFixed(1)}%
                          </span>
                        </div>
                        <div
                          className={`text-[10px] font-semibold ${
                            item.isDriftBreached
                              ? 'text-amber-400'
                              : 'text-slate-500'
                          }`}
                        >
                          Drift: {item.absoluteDriftPercent > 0 ? '+' : ''}
                          {item.absoluteDriftPercent.toFixed(1)}%
                        </div>
                      </td>

                      {/* Target Value IDR */}
                      <td className="px-3 py-2.5 text-right font-mono font-semibold text-sky-300">
                        {formatIdr(item.targetValueIdr)}
                      </td>

                      {/* Action Ticket (BUY / SELL + Units/Lots) */}
                      <td className="px-3 py-2.5 text-right">
                        {item.action === 'BUY' ? (
                          <div className="inline-flex flex-col items-end rounded-lg border border-emerald-500/40 bg-emerald-500/15 px-2.5 py-1">
                            <div className="flex items-center gap-1 font-mono text-xs font-extrabold text-emerald-300">
                              <ArrowUpRight className="h-3.5 w-3.5" />
                              <span>BUY {formatIdr(item.tradeAmountIdr)}</span>
                            </div>
                            <div className="font-mono text-[10px] text-emerald-200/80">
                              {asset?.currency === 'USD'
                                ? `${formatUsd(item.tradeAmountUsd)} (${item.tradeUnits} unit)`
                                : item.tradeLots !== undefined
                                  ? `≈ ${item.tradeLots} Lot (${item.tradeUnits} lbr)`
                                  : `≈ ${item.tradeUnits} unit`}
                            </div>
                          </div>
                        ) : item.action === 'SELL' ? (
                          <div className="inline-flex flex-col items-end rounded-lg border border-rose-500/40 bg-rose-500/15 px-2.5 py-1">
                            <div className="flex items-center gap-1 font-mono text-xs font-extrabold text-rose-300">
                              <ArrowDownRight className="h-3.5 w-3.5" />
                              <span>SELL {formatIdr(Math.abs(item.tradeAmountIdr))}</span>
                            </div>
                            <div className="font-mono text-[10px] text-rose-200/80">
                              {asset?.currency === 'USD'
                                ? `${formatUsd(Math.abs(item.tradeAmountUsd))} (${Math.abs(item.tradeUnits)} unit)`
                                : item.tradeLots !== undefined
                                  ? `≈ ${Math.abs(item.tradeLots)} Lot (${Math.abs(item.tradeUnits)} lbr)`
                                  : `≈ ${Math.abs(item.tradeUnits)} unit`}
                            </div>
                          </div>
                        ) : (
                          <span className="rounded bg-slate-800 px-2 py-1 font-mono text-xs text-slate-400">
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
        </div>

        {/* Right 4 Cols: Current vs Target Weight Drift Chart & Execution Summary */}
        <div className="space-y-5 lg:col-span-4">
          <div className="rounded-2xl border border-slate-800 bg-slate-900/90 p-5 shadow-xl">
            <h3 className="text-sm font-extrabold text-white">
              Visualisasi Bobot Saat Ini vs Target Optimal
            </h3>
            <p className="mt-1 text-xs text-slate-400">
              Bandingkan pergeseran bobot (drift) akibat pergerakan market dengan target
              ideal:
            </p>

            <div className="mt-4 h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={chartData}
                  margin={{ top: 8, right: 8, left: -18, bottom: 0 }}
                >
                  <XAxis dataKey="symbol" stroke="#94a3b8" fontSize={11} />
                  <YAxis
                    stroke="#64748b"
                    fontSize={11}
                    tickFormatter={(v) => `${v}%`}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#0f172a',
                      borderColor: '#1e293b',
                      borderRadius: '0.75rem',
                      fontSize: '12px',
                    }}
                    formatter={(val: number, name: string) => [`${val}%`, name]}
                  />
                  <Legend wrapperStyle={{ fontSize: '11px' }} />
                  <Bar
                    dataKey="Current"
                    name="Bobot Saat Ini (%)"
                    fill="#f59e0b"
                    radius={[4, 4, 0, 0]}
                  />
                  <Bar
                    dataKey="Target"
                    name="Bobot Target (%)"
                    fill="#10b981"
                    radius={[4, 4, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Ringkasan Eksekusi Order */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900/90 p-5 shadow-xl">
            <h3 className="text-sm font-extrabold text-white">
              Ringkasan Arus Kas Rebalancing
            </h3>
            <div className="mt-3 space-y-2.5 text-xs">
              <div className="flex justify-between border-b border-slate-800/80 pb-2">
                <span className="text-slate-400">Total Aset Dijual (Take Profit):</span>
                <span className="font-mono font-bold text-rose-400">
                  {formatIdr(rebalanceResult.totalSellIdr)}
                </span>
              </div>
              <div className="flex justify-between border-b border-slate-800/80 pb-2">
                <span className="text-slate-400">Tambahan Top-Up Kas (DCA):</span>
                <span className="font-mono font-bold text-sky-400">
                  {formatIdr(rebalanceResult.cashInjectionIdr)}
                </span>
              </div>
              <div className="flex justify-between border-b border-slate-800/80 pb-2">
                <span className="text-slate-400">Total Aset Dibeli (Buy the Dip):</span>
                <span className="font-mono font-bold text-emerald-400">
                  {formatIdr(rebalanceResult.totalBuyIdr)}
                </span>
              </div>
              <div className="flex justify-between pt-1 text-sm font-extrabold">
                <span className="text-white">Nilai Akhir Portfolio:</span>
                <span className="font-mono text-emerald-400">
                  {formatIdr(rebalanceResult.finalTargetTotalIdr)}
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};
