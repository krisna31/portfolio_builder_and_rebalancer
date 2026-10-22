import React, { useMemo, useState } from 'react';
import { AssetDefinition, SolvedPortfolio } from '../../lib/quant/types';
import {
  simulateRebalancingFrequencyBacktest,
  simulateWealthToGoal,
} from '../../lib/quant/wealthSimulator';
import { formatIdr } from '../../lib/formatters';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ReferenceLine,
  Legend,
} from 'recharts';
import {
  TrendingUp,
  Target,
  ShieldAlert,
  Award,
  Coins,
  RefreshCw,
  Sparkles,
} from 'lucide-react';
import { FormattedNumberInput } from '../FormattedNumberInput';

interface WealthRoadmapViewProps {
  allAssets: AssetDefinition[];
  activeWeights: Record<string, number>;
  solvedMetrics: SolvedPortfolio;
  initialCapitalIdr: number;
  setInitialCapitalIdr: (v: number) => void;
  targetGoalIdr: number;
  setTargetGoalIdr: (v: number) => void;
  monthlySavingsIdr: number;
  setMonthlySavingsIdr: (v: number) => void;
}

export const WealthRoadmapView: React.FC<WealthRoadmapViewProps> = ({
  allAssets,
  activeWeights,
  solvedMetrics,
  initialCapitalIdr,
  setInitialCapitalIdr,
  targetGoalIdr,
  setTargetGoalIdr,
  monthlySavingsIdr,
  setMonthlySavingsIdr,
}) => {
  const [annualStepUpPct, setAnnualStepUpPct] = useState(0);
  const [annualInflationPercent, setAnnualInflationPercent] = useState<number>(0);
  const [monthlyLivingCostTargetIdr, setMonthlyLivingCostTargetIdr] = useState<number>(10_000_000);

  // Dividend Estimator State
  const [taxMode, setTaxMode] = useState<
    'standard-net' | 'idx-tax-exempt-reinvest' | 'gross'
  >('standard-net');
  const [dividendUsageMode, setDividendUsageMode] = useState<
    'reinvest-drip' | 'cashout-passive'
  >('reinvest-drip');
  const [customYieldOverrides, setCustomYieldOverrides] = useState<
    Record<string, number>
  >({});

  // Calculate Portfolio Weighted Gross & Net Dividend Yield
  const dividendBreakdown = useMemo(() => {
    const activeItems = allAssets
      .filter((a) => (activeWeights[a.id] ?? 0) > 0)
      .map((asset) => {
        const weightPct = activeWeights[asset.id] ?? 0;
        const grossYieldPct =
          customYieldOverrides[asset.id] !== undefined
            ? customYieldOverrides[asset.id]
            : asset.dividendYield ?? 0;

        let effectiveTaxPct = asset.dividendTaxPercent ?? 0;
        if (taxMode === 'gross') {
          effectiveTaxPct = 0;
        } else if (
          taxMode === 'idx-tax-exempt-reinvest' &&
          asset.category === 'idx-equity'
        ) {
          effectiveTaxPct = 0;
        }

        const netYieldPct = grossYieldPct * (1 - effectiveTaxPct / 100);
        const annualDividendAtInitialIdr =
          initialCapitalIdr * (weightPct / 100) * (netYieldPct / 100);
        const annualDividendAtGoalIdr =
          targetGoalIdr * (weightPct / 100) * (netYieldPct / 100);

        return {
          asset,
          weightPct,
          grossYieldPct,
          effectiveTaxPct,
          netYieldPct,
          annualDividendAtInitialIdr,
          annualDividendAtGoalIdr,
        };
      });

    const weightedGrossYieldPct = activeItems.reduce(
      (acc, i) => acc + (i.weightPct / 100) * i.grossYieldPct,
      0
    );
    const weightedNetYieldPct = activeItems.reduce(
      (acc, i) => acc + (i.weightPct / 100) * i.netYieldPct,
      0
    );
    const totalAnnualAtInitialIdr = activeItems.reduce(
      (acc, i) => acc + i.annualDividendAtInitialIdr,
      0
    );
    const totalAnnualAtGoalIdr = activeItems.reduce(
      (acc, i) => acc + i.annualDividendAtGoalIdr,
      0
    );

    return {
      activeItems,
      weightedGrossYieldPct,
      weightedNetYieldPct,
      totalAnnualAtInitialIdr,
      monthlyPassiveAtInitialIdr: totalAnnualAtInitialIdr / 12,
      totalAnnualAtGoalIdr,
      monthlyPassiveAtGoalIdr: totalAnnualAtGoalIdr / 12,
    };
  }, [
    allAssets,
    activeWeights,
    customYieldOverrides,
    taxMode,
    initialCapitalIdr,
    targetGoalIdr,
  ]);

  // If user selects "Cashout Passive Income", total return compounding reduces by the cashout dividend yield (since historical CAGR includes reinvested yield/total return)
  const effectiveCompoundingCagr =
    dividendUsageMode === 'cashout-passive'
      ? Math.max(2, solvedMetrics.cagr - dividendBreakdown.weightedNetYieldPct)
      : solvedMetrics.cagr;

  const sim = simulateWealthToGoal({
    initialCapitalIdr,
    monthlyContributionIdr: monthlySavingsIdr,
    annualCagrPercent: effectiveCompoundingCagr,
    maxDrawdownPercent: solvedMetrics.maxDrawdown,
    targetWealthIdr: targetGoalIdr,
    annualStepUpPercent: annualStepUpPct,
    maxYears: 30,
    annualInflationPercent,
    monthlyLivingCostTargetIdr,
    netDividendYieldPercent: dividendBreakdown.weightedNetYieldPct,
  });

  const sim10Pct25Y = simulateWealthToGoal({
    initialCapitalIdr,
    monthlyContributionIdr: monthlySavingsIdr,
    annualCagrPercent: 10,
    maxDrawdownPercent: 5,
    targetWealthIdr: targetGoalIdr,
    annualStepUpPercent: annualStepUpPct,
    maxYears: 25,
    annualInflationPercent,
    monthlyLivingCostTargetIdr,
  });
  const sim15Pct25Y = simulateWealthToGoal({
    initialCapitalIdr,
    monthlyContributionIdr: monthlySavingsIdr,
    annualCagrPercent: 15,
    maxDrawdownPercent: 8,
    targetWealthIdr: targetGoalIdr,
    annualStepUpPercent: annualStepUpPct,
    maxYears: 25,
    annualInflationPercent,
    monthlyLivingCostTargetIdr,
  });

  const displayYears = Math.min(30, Math.max(12, sim.yearsToGoal + 4));
  const chartTimeline = sim.timeline.slice(0, displayYears + 1).map((pt) => ({
    yearLabel: `Thn ${pt.year}`,
    ModalTabungan: Math.round(pt.totalPrincipalIdr / 1_000_000),
    NilaiPortfolio: Math.round(pt.totalValueIdr / 1_000_000),
    WorstCaseCrash: Math.round(pt.drawdownFloorIdr / 1_000_000),
    DayaBeliRiil:
      annualInflationPercent > 0
        ? Math.round((pt.realPurchasingPowerIdr ?? pt.totalValueIdr) / 1_000_000)
        : undefined,
  }));

  // 5-Year Historical Rebalancing Frequency Backtest (Monthly vs Quarterly vs Annual vs Buy & Hold)
  const freqBacktest = useMemo(
    () =>
      simulateRebalancingFrequencyBacktest({
        initialCapitalIdr: initialCapitalIdr > 0 ? initialCapitalIdr : 100_000_000,
        baseCagrPercent: solvedMetrics.cagr,
        maxDrawdownPercent: solvedMetrics.maxDrawdown,
      }),
    [initialCapitalIdr, solvedMetrics.cagr, solvedMetrics.maxDrawdown]
  );

  const freqChartData = freqBacktest.series.map((pt) => ({
    periodLabel: pt.periodLabel,
    Bulanan: pt.RebalanceBulanan,
    Kuartalan3M: pt.Rebalance3Bulan,
    Tahunan1Y: pt.RebalanceTahunan,
    BuyAndHold: pt.BuyAndHold,
  }));

  return (
    <div className="space-y-6">
      <section className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Left 5 Cols: Wealth Simulator Parameters */}
        <div className="ui-card space-y-4 rounded-xl p-5 lg:col-span-5">
          <div className="ui-border flex items-center gap-2 border-b pb-3">
            <Target className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
            <h2 className="ui-text-main text-sm font-bold">
              Kalkulator Compounding Kekayaan (Rp 1M – Rp 10M)
            </h2>
          </div>

          <p className="ui-text-muted text-xs">
            Ilustrasi menit 02:48: Dengan active income yang sama, kenaikan CAGR dari
            10% ke 15%+ membuat hasil akhir melompat berkali-kali lipat.
          </p>

          <div className="space-y-3.5">
            <div>
              <div className="flex justify-between text-xs">
                <label className="ui-text-secondary font-medium">
                  Modal Awal Saat Ini (Lump Sum):
                </label>
                <span className="ui-text-main font-mono font-semibold">
                  {formatIdr(initialCapitalIdr)}
                </span>
              </div>
              <input
                type="range"
                min={0}
                max={2_000_000_000}
                step={10_000_000}
                value={initialCapitalIdr}
                onChange={(e) => setInitialCapitalIdr(Number(e.target.value))}
                className="mt-1.5 h-1.5 w-full cursor-pointer"
              />
              <div className="mt-1 flex gap-1.5 text-[11px]">
                {[0, 50_000_000, 100_000_000, 500_000_000, 1_000_000_000].map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setInitialCapitalIdr(v)}
                    className="ui-subtle ui-text-secondary rounded px-2 py-0.5"
                  >
                    {formatIdr(v, true)}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <div className="flex justify-between text-xs">
                <label className="ui-text-secondary font-medium">
                  Investasi Rutin Bulanan (DCA):
                </label>
                <span className="font-mono font-semibold text-emerald-600 dark:text-emerald-400">
                  {formatIdr(monthlySavingsIdr)} / bln
                </span>
              </div>
              <input
                type="range"
                min={500_000}
                max={100_000_000}
                step={500_000}
                value={monthlySavingsIdr}
                onChange={(e) => setMonthlySavingsIdr(Number(e.target.value))}
                className="mt-1.5 h-1.5 w-full cursor-pointer"
              />
              <div className="mt-1 flex flex-wrap gap-1.5 text-[11px]">
                {[3_000_000, 5_000_000, 10_000_000, 20_000_000, 50_000_000].map(
                  (v) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => setMonthlySavingsIdr(v)}
                      className={`rounded px-2 py-0.5 font-mono transition ${
                        monthlySavingsIdr === v
                          ? 'bg-emerald-600 font-semibold text-white'
                          : 'ui-subtle ui-text-secondary'
                      }`}
                    >
                      {formatIdr(v, true)}/bln
                    </button>
                  )
                )}
              </div>
            </div>

            <div>
              <div className="flex justify-between text-xs">
                <label className="ui-text-secondary font-medium">
                  Kenaikan Tabungan per Tahun:
                </label>
                <span className="ui-text-main font-mono font-semibold">
                  +{annualStepUpPct}% / tahun
                </span>
              </div>
              <input
                type="range"
                min={0}
                max={25}
                step={1}
                value={annualStepUpPct}
                onChange={(e) => setAnnualStepUpPct(Number(e.target.value))}
                className="mt-1.5 h-1.5 w-full cursor-pointer"
              />
            </div>

            <div>
              <div className="flex justify-between text-xs">
                <label className="ui-text-secondary font-medium">
                  Target Kekayaan:
                </label>
                <span className="ui-text-main font-mono font-semibold">
                  {formatIdr(targetGoalIdr)}
                </span>
              </div>
              <div className="mt-1.5 flex gap-1.5 text-xs">
                {[
                  1_000_000_000,
                  5_000_000_000,
                  10_000_000_000,
                  25_000_000_000,
                  50_000_000_000,
                ].map((g) => (
                  <button
                    key={g}
                    type="button"
                    onClick={() => setTargetGoalIdr(g)}
                    className={`flex-1 rounded py-1 font-mono text-[11px] font-medium ${
                      targetGoalIdr === g
                        ? 'bg-emerald-600 font-semibold text-white'
                        : 'ui-subtle ui-text-secondary'
                    }`}
                  >
                    {formatIdr(g, true)}
                  </button>
                ))}
              </div>
            </div>

            {/* Real Purchasing Power (Inflation Toggle) */}
            <div>
              <div className="flex justify-between text-xs">
                <label className="ui-text-secondary font-medium">
                  Penyesuaian Inflasi (Daya Beli Riil):
                </label>
                <span className="font-mono font-semibold text-purple-600 dark:text-purple-400">
                  {annualInflationPercent > 0
                    ? `${annualInflationPercent}% / thn`
                    : '0% (Nominal)'}
                </span>
              </div>
              <div className="mt-1.5 flex flex-wrap gap-1 text-[11px]">
                {[
                  { label: '0% Nominal', val: 0 },
                  { label: '3.5% (BPS Historis)', val: 3.5 },
                  { label: '4.0% (Standar BI)', val: 4.0 },
                  { label: '5.0% (Konservatif)', val: 5.0 },
                ].map((inf) => (
                  <button
                    key={inf.val}
                    type="button"
                    onClick={() => setAnnualInflationPercent(inf.val)}
                    className={`rounded px-2 py-0.5 font-mono transition ${
                      annualInflationPercent === inf.val
                        ? 'bg-purple-600 font-semibold text-white'
                        : 'ui-subtle ui-text-secondary hover:opacity-80'
                    }`}
                  >
                    {inf.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="ui-subtle rounded-lg p-4">
            <div className="flex items-center justify-between">
              <span className="ui-text-secondary text-xs font-semibold uppercase">
                Estimasi Waktu Capai {formatIdr(targetGoalIdr, true)}:
              </span>
              <Award className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div className="ui-text-main mt-1 font-mono text-2xl font-bold">
              {sim.yearsToGoal} Tahun{' '}
              {sim.monthsToGoal > 0 ? `${sim.monthsToGoal} Bulan` : ''}
            </div>

            {annualInflationPercent > 0 && (
              <div className="mt-2 rounded-lg bg-purple-500/10 p-2 text-xs">
                <div className="flex justify-between text-[11px]">
                  <span className="text-purple-700 dark:text-purple-300">
                    Daya Beli Riil saat Rp {formatIdr(targetGoalIdr, true)} tercapai:
                  </span>
                  <span className="font-mono font-bold text-purple-700 dark:text-purple-300">
                    ≈{' '}
                    {formatIdr(
                      sim.realPurchasingPowerAtGoalIdr ?? targetGoalIdr,
                      true
                    )}
                  </span>
                </div>
                <div className="ui-text-muted mt-0.5 text-[10px]">
                  Waktu capai target riil penuh: <strong>{sim.realYearsToGoalFloat} Tahun</strong> (efek inflasi {annualInflationPercent}%/thn)
                </div>
              </div>
            )}

            <div className="ui-border mt-2 grid grid-cols-2 gap-2 border-t pt-2 text-xs">
              <div>
                <span className="ui-text-muted">Total Modal Pokok:</span>
                <div className="ui-text-main font-mono font-semibold">
                  {formatIdr(sim.totalPrincipalAtGoalIdr, true)}
                </div>
              </div>
              <div>
                <span className="ui-text-muted">Hasil Compounding:</span>
                <div className="font-mono font-semibold text-emerald-600 dark:text-emerald-400">
                  +{formatIdr(sim.totalGainAtGoalIdr, true)}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Right 7 Cols: Compounding Curve */}
        <div className="space-y-5 lg:col-span-7">
          <div className="ui-card rounded-xl p-5">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="ui-text-main text-sm font-bold">
                  Kurva Pertumbuhan Kekayaan vs Modal Pokok &amp; Risiko Crash
                </h3>
                <p className="ui-text-muted text-xs">
                  Proyeksi pada CAGR efektif{' '}
                  <strong className="ui-text-main">
                    {effectiveCompoundingCagr.toFixed(2)}%
                  </strong>{' '}
                  beserta batas bawah Maximum Drawdown (-{solvedMetrics.maxDrawdown}%):
                </p>
              </div>
              <TrendingUp className="ui-text-muted h-4 w-4" />
            </div>

            <div className="mt-4 h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                  data={chartTimeline}
                  margin={{ top: 10, right: 15, left: 0, bottom: 0 }}
                >
                  <XAxis dataKey="yearLabel" stroke="#71717a" fontSize={11} />
                  <YAxis
                    stroke="#71717a"
                    fontSize={11}
                    tickFormatter={(v) => `${(v / 1000).toFixed(0)}M`}
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
                    formatter={(val: number, name: string) => [
                      `Rp ${val.toLocaleString('id-ID')} Juta`,
                      name,
                    ]}
                  />
                  <Legend wrapperStyle={{ fontSize: '11px' }} />
                  <ReferenceLine
                    y={targetGoalIdr / 1_000_000}
                    stroke="#f59e0b"
                    strokeDasharray="4 4"
                    label={{
                      value: `Target ${formatIdr(targetGoalIdr, true)}`,
                      fill: '#f59e0b',
                      fontSize: 11,
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="NilaiPortfolio"
                    name="Nilai Portfolio (Compounding)"
                    stroke="#10b981"
                    fill="#10b981"
                    fillOpacity={0.2}
                  />
                  {annualInflationPercent > 0 && (
                    <Area
                      type="monotone"
                      dataKey="DayaBeliRiil"
                      name={`Daya Beli Riil (Inflasi ${annualInflationPercent}%)`}
                      stroke="#8b5cf6"
                      fill="#8b5cf6"
                      strokeDasharray="4 4"
                      fillOpacity={0.08}
                    />
                  )}
                  <Area
                    type="monotone"
                    dataKey="WorstCaseCrash"
                    name={`Saat Market Crash (-${solvedMetrics.maxDrawdown}%)`}
                    stroke="#f43f5e"
                    fill="#f43f5e"
                    fillOpacity={0.1}
                  />
                  <Area
                    type="monotone"
                    dataKey="ModalTabungan"
                    name="Akumulasi Modal Tabungan"
                    stroke="#0ea5e9"
                    fill="#0ea5e9"
                    fillOpacity={0.12}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="ui-card rounded-xl p-4">
              <div className="ui-text-muted text-xs">25 Tahun @ 10% / thn</div>
              <div className="ui-text-main mt-1 font-mono text-lg font-bold">
                {formatIdr(sim10Pct25Y.finalValueAfter25YIdr, true)}
              </div>
              <div className="ui-text-muted mt-0.5 text-[11px]">
                Benchmark Konservatif (02:55)
              </div>
            </div>

            <div className="ui-card rounded-xl p-4">
              <div className="ui-text-muted text-xs">25 Tahun @ 15% / thn</div>
              <div className="ui-text-main mt-1 font-mono text-lg font-bold">
                {formatIdr(sim15Pct25Y.finalValueAfter25YIdr, true)}
              </div>
              <div className="ui-text-muted mt-0.5 text-[11px]">
                Benchmark Medium Risk (03:10)
              </div>
            </div>

            <div className="ui-card rounded-xl p-4">
              <div className="ui-text-muted flex items-center justify-between text-xs">
                <span>
                  25 Tahun @ Porto Aktif ({effectiveCompoundingCagr.toFixed(1)}%)
                </span>
                <ShieldAlert className="h-3.5 w-3.5" />
              </div>
              <div className="mt-1 font-mono text-lg font-bold text-emerald-600 dark:text-emerald-400">
                {formatIdr(sim.finalValueAfter25YIdr, true)}
              </div>
              <div className="ui-text-muted mt-0.5 text-[11px]">
                Max Drawdown -{solvedMetrics.maxDrawdown}%
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* KALKULATOR TARGET KEBEBASAN FINANSIAL & BIAYA HIDUP PENSIUN (4% SWR VS DIVIDEN MURNI) */}
      <section className="ui-card rounded-xl p-5">
        <div className="ui-border flex flex-col gap-3 border-b pb-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
              <h3 className="ui-text-main text-sm font-bold">
                Kalkulator Kebebasan Finansial (Financial Freedom &amp; Biaya Hidup Pensiun)
              </h3>
            </div>
            <p className="ui-text-muted mt-0.5 text-xs">
              Hitung kapan portofolio Anda mampu menutup seluruh biaya hidup tanpa harus bekerja aktif, baik lewat <strong>4% Safe Withdrawal Rate</strong> (Trinity Study) maupun <strong>100% Dividen Murni</strong>:
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="ui-text-secondary font-medium">Target Biaya Hidup:</span>
            <div className="ui-card flex items-center gap-1 rounded-md border px-2 py-1">
              <span className="ui-text-muted font-mono text-[11px]">Rp</span>
              <FormattedNumberInput
                step={1_000_000}
                min={1_000_000}
                value={monthlyLivingCostTargetIdr}
                onChange={(val) => setMonthlyLivingCostTargetIdr(val)}
                className="ui-text-main w-24 bg-transparent font-mono text-xs font-bold focus:outline-none"
                ariaLabel="Monthly Living Cost Target in IDR"
              />
              <span className="ui-text-muted text-[10px]">/bln</span>
            </div>
            <div className="flex flex-wrap gap-1 text-[10px]">
              {[5_000_000, 10_000_000, 15_000_000, 25_000_000, 50_000_000].map(
                (costPreset) => (
                  <button
                    key={costPreset}
                    type="button"
                    onClick={() => setMonthlyLivingCostTargetIdr(costPreset)}
                    className={`rounded px-1.5 py-0.5 font-mono ${
                      monthlyLivingCostTargetIdr === costPreset
                        ? 'bg-emerald-600 font-semibold text-white'
                        : 'ui-subtle ui-text-secondary hover:opacity-80'
                    }`}
                  >
                    {formatIdr(costPreset, true)}
                  </button>
                )
              )}
            </div>
          </div>
        </div>

        {/* Financial Freedom KPI Cards */}
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {/* SWR 4% Card */}
          <div className="ui-subtle rounded-xl p-4">
            <div className="flex items-center justify-between">
              <span className="ui-text-muted text-xs font-semibold uppercase">
                Metode 1: 4% Rule (Safe Withdrawal)
              </span>
              <ShieldAlert className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div className="ui-text-main mt-1 font-mono text-lg font-bold">
              Target Pokok:{' '}
              {formatIdr(
                sim.requiredNestEggSWRIdr ?? monthlyLivingCostTargetIdr * 12 * 25,
                true
              )}
            </div>
            <p className="ui-text-muted mt-0.5 text-[11px]">
              Tarik 4% per tahun (≈ {formatIdr(monthlyLivingCostTargetIdr, true)}/bln). Modal pokok tetap bertahan puluhan tahun menurut Trinity Study.
            </p>
            <div className="mt-3 rounded-lg bg-emerald-500/10 p-2.5">
              <div className="text-[11px] text-emerald-700 dark:text-emerald-300">
                Estimasi Waktu Tercapai:
              </div>
              <div className="font-mono text-base font-bold text-emerald-700 dark:text-emerald-300">
                {sim.monthsToFinancialFreedomSWR === 0
                  ? 'Sudah Tercapai Sekarang! 🎉'
                  : sim.monthsToFinancialFreedomSWR
                    ? `${Math.floor(sim.monthsToFinancialFreedomSWR / 12)} Tahun ${
                        sim.monthsToFinancialFreedomSWR % 12 > 0
                          ? (sim.monthsToFinancialFreedomSWR % 12) + ' Bulan'
                          : ''
                      }`
                    : '> 30 Tahun (Tingkatkan Tabungan Bulanan)'}
              </div>
            </div>
          </div>

          {/* 100% Pure Dividend Card */}
          <div className="ui-subtle rounded-xl p-4">
            <div className="flex items-center justify-between">
              <span className="ui-text-muted text-xs font-semibold uppercase">
                Metode 2: 100% Dividen Murni
              </span>
              <Coins className="h-4 w-4 text-purple-600 dark:text-purple-400" />
            </div>
            <div className="ui-text-main mt-1 font-mono text-lg font-bold">
              Target Pokok:{' '}
              {dividendBreakdown.weightedNetYieldPct > 0
                ? formatIdr(
                    (monthlyLivingCostTargetIdr * 12) /
                      (dividendBreakdown.weightedNetYieldPct / 100),
                    true
                  )
                : 'N/A (Yield 0%)'}
            </div>
            <p className="ui-text-muted mt-0.5 text-[11px]">
              Biaya hidup ditutup 100% dari kupon/dividen bersih (Yield saat ini {dividendBreakdown.weightedNetYieldPct.toFixed(2)}%) tanpa pernah menjual aset pokok sama sekali.
            </p>
            <div className="mt-3 rounded-lg bg-purple-500/10 p-2.5">
              <div className="text-[11px] text-purple-700 dark:text-purple-300">
                Estimasi Waktu Tercapai:
              </div>
              <div className="font-mono text-base font-bold text-purple-700 dark:text-purple-300">
                {sim.monthsToFinancialFreedomDividends === 0
                  ? 'Sudah Tercapai Sekarang! 🎉'
                  : sim.monthsToFinancialFreedomDividends
                    ? `${Math.floor(sim.monthsToFinancialFreedomDividends / 12)} Tahun ${
                        sim.monthsToFinancialFreedomDividends % 12 > 0
                          ? (sim.monthsToFinancialFreedomDividends % 12) + ' Bulan'
                          : ''
                      }`
                    : '> 30 Tahun (Tingkatkan Tabungan Bulanan)'}
              </div>
            </div>
          </div>

          {/* Living Cost Progress Meter */}
          <div className="ui-subtle flex flex-col justify-between rounded-xl p-4">
            <div>
              <span className="ui-text-muted text-xs font-semibold uppercase">
                Status Coverage Biaya Hidup Saat Ini
              </span>
              <div className="ui-text-main mt-1 text-xs">
                Modal Awal ({formatIdr(initialCapitalIdr, true)}) menghasilkan:
              </div>
              <div className="mt-2 space-y-1.5 text-xs">
                <div className="flex justify-between font-mono">
                  <span className="ui-text-muted">Dividen Bersih:</span>
                  <span className="font-bold text-emerald-600 dark:text-emerald-400">
                    {formatIdr(dividendBreakdown.monthlyPassiveAtInitialIdr)} / bln
                  </span>
                </div>
                <div className="flex justify-between font-mono">
                  <span className="ui-text-muted">Safe Withdrawal (4%):</span>
                  <span className="ui-text-main font-bold">
                    {formatIdr((initialCapitalIdr * 0.04) / 12)} / bln
                  </span>
                </div>
              </div>
            </div>

            <div className="ui-border mt-3 border-t pt-2">
              <div className="flex justify-between text-[11px]">
                <span className="ui-text-muted">Coverage Biaya Hidup (4% SWR):</span>
                <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400">
                  {Math.min(
                    100,
                    Math.round(
                      (((initialCapitalIdr * 0.04) / 12) /
                        Math.max(1, monthlyLivingCostTargetIdr)) *
                        100
                    )
                  )}%
                </span>
              </div>
              <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
                <div
                  className="h-full rounded-full bg-emerald-500 transition-all duration-500"
                  style={{
                    width: `${Math.min(
                      100,
                      Math.max(
                        0,
                        (((initialCapitalIdr * 0.04) / 12) /
                          Math.max(1, monthlyLivingCostTargetIdr)) *
                          100
                      )
                    )}%`,
                  }}
                />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* DIVIDEND YIELD & PASSIVE CASHFLOW ESTIMATOR */}
      <section className="ui-card rounded-xl p-5">
        <div className="ui-border flex flex-col gap-3 border-b pb-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <Coins className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
              <h3 className="ui-text-main text-sm font-bold">
                Kalkulator Dividen &amp; Arus Kas Pasif (Passive Income Estimator)
              </h3>
            </div>
            <p className="ui-text-muted mt-0.5 text-xs">
              Hitung arus kas pasif dari kupon RDPT, dividen saham IDX (mis. PTBA,
              BBCA, BBRI, AADI), dan ETF US beserta simulasi pajak bersih &amp; DRIP:
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Tax Mode Selector */}
            <div className="ui-subtle flex rounded-lg p-0.5 text-xs">
              <button
                type="button"
                onClick={() => setTaxMode('standard-net')}
                className={`rounded-md px-2.5 py-1 font-medium ${
                  taxMode === 'standard-net'
                    ? 'ui-card ui-text-main font-semibold shadow-2xs'
                    : 'ui-text-muted'
                }`}
              >
                Net Pajak (IDX 10% / US 15%)
              </button>
              <button
                type="button"
                onClick={() => setTaxMode('idx-tax-exempt-reinvest')}
                className={`rounded-md px-2.5 py-1 font-medium ${
                  taxMode === 'idx-tax-exempt-reinvest'
                    ? 'ui-card ui-text-main font-semibold shadow-2xs'
                    : 'ui-text-muted'
                }`}
              >
                Bebas Pajak IDX (Reinvest)
              </button>
              <button
                type="button"
                onClick={() => setTaxMode('gross')}
                className={`rounded-md px-2.5 py-1 font-medium ${
                  taxMode === 'gross'
                    ? 'ui-card ui-text-main font-semibold shadow-2xs'
                    : 'ui-text-muted'
                }`}
              >
                Gross (0%)
              </button>
            </div>

            {/* Reinvest vs Cashout Selector */}
            <div className="ui-subtle flex rounded-lg p-0.5 text-xs">
              <button
                type="button"
                onClick={() => setDividendUsageMode('reinvest-drip')}
                className={`rounded-md px-2.5 py-1 font-medium ${
                  dividendUsageMode === 'reinvest-drip'
                    ? 'bg-emerald-600 font-semibold text-white'
                    : 'ui-text-muted'
                }`}
              >
                Reinvest ke Compounding
              </button>
              <button
                type="button"
                onClick={() => setDividendUsageMode('cashout-passive')}
                className={`rounded-md px-2.5 py-1 font-medium ${
                  dividendUsageMode === 'cashout-passive'
                    ? 'bg-emerald-600 font-semibold text-white'
                    : 'ui-text-muted'
                }`}
              >
                Tarik Tunai (Living Cost)
              </button>
            </div>
          </div>
        </div>

        {/* Summary KPI Cards for Passive Income */}
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="ui-subtle rounded-lg p-3.5">
            <div className="ui-text-muted text-xs">
              Weighted Net Dividend Yield
            </div>
            <div className="mt-1 font-mono text-xl font-bold text-emerald-600 dark:text-emerald-400">
              {dividendBreakdown.weightedNetYieldPct.toFixed(2)}% / thn
            </div>
            <div className="ui-text-muted mt-0.5 text-[11px]">
              Gross Yield: {dividendBreakdown.weightedGrossYieldPct.toFixed(2)}%
            </div>
          </div>

          <div className="ui-subtle rounded-lg p-3.5">
            <div className="ui-text-muted text-xs">
              Dividen Bersih @ Modal Awal ({formatIdr(initialCapitalIdr, true)})
            </div>
            <div className="ui-text-main mt-1 font-mono text-xl font-bold">
              {formatIdr(dividendBreakdown.totalAnnualAtInitialIdr)} / thn
            </div>
            <div className="ui-text-secondary mt-0.5 font-mono text-[11px] font-medium">
              ≈ {formatIdr(dividendBreakdown.monthlyPassiveAtInitialIdr)} / bulan
            </div>
          </div>

          <div className="ui-subtle rounded-lg p-3.5">
            <div className="ui-text-muted text-xs">
              Dividen Bersih Saat Capai Target ({formatIdr(targetGoalIdr, true)})
            </div>
            <div className="mt-1 font-mono text-xl font-bold text-emerald-600 dark:text-emerald-400">
              {formatIdr(dividendBreakdown.totalAnnualAtGoalIdr)} / thn
            </div>
            <div className="ui-text-secondary mt-0.5 font-mono text-[11px] font-medium">
              ≈ {formatIdr(dividendBreakdown.monthlyPassiveAtGoalIdr)} / bulan
            </div>
          </div>

          <div className="ui-subtle rounded-lg p-3.5">
            <div className="ui-text-muted text-xs">Status Penggunaan Dividen</div>
            <div className="ui-text-main mt-1 text-sm font-bold">
              {dividendUsageMode === 'reinvest-drip'
                ? 'DRIP (Gulung ke Pokok)'
                : 'Cashout (Passive Income)'}
            </div>
            <div className="ui-text-muted mt-0.5 text-[11px]">
              {dividendUsageMode === 'reinvest-drip'
                ? `CAGR penuh ${solvedMetrics.cagr.toFixed(2)}% bekerja maksimal.`
                : `CAGR harga murni menjadi ${effectiveCompoundingCagr.toFixed(2)}%/thn.`}
            </div>
          </div>
        </div>

        {/* Per-Asset Dividend Yield Table */}
        <div
          tabIndex={0}
          role="region"
          aria-label="Per-Asset Dividend and Passive Income Table"
          className="ui-border mt-4 overflow-x-auto rounded-lg border"
        >
          <table className="w-full border-separate border-spacing-0 text-left text-xs">
            <thead className="ui-subtle text-[11px] font-semibold uppercase">
              <tr>
                <th className="ui-subtle ui-border sticky left-0 z-20 border-b border-r px-3 py-2 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.18)]">
                  Instrumen
                </th>
                <th className="ui-border border-b px-3 py-2 text-right">
                  Bobot Target
                </th>
                <th className="ui-border border-b px-3 py-2 text-right">
                  Gross Dividend / Kupon (%)
                </th>
                <th className="ui-border border-b px-3 py-2 text-right">Pajak</th>
                <th className="ui-border border-b px-3 py-2 text-right">
                  Net Yield (%)
                </th>
                <th className="ui-border border-b px-3 py-2 text-right">
                  Dividen/Thn (@ {formatIdr(initialCapitalIdr, true)})
                </th>
                <th className="ui-border border-b px-3 py-2 text-right">
                  Dividen/Thn (@ {formatIdr(targetGoalIdr, true)})
                </th>
              </tr>
            </thead>
            <tbody>
              {dividendBreakdown.activeItems.map((row) => (
                <tr key={row.asset.id} className="hover:bg-zinc-500/5">
                  <th
                    scope="row"
                    className="ui-card ui-border sticky left-0 z-10 border-b border-r px-3 py-2 font-normal shadow-[2px_0_5px_-2px_rgba(0,0,0,0.18)]"
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className="h-2.5 w-2.5 shrink-0 rounded-full"
                        style={{ backgroundColor: row.asset.color }}
                      />
                      <span className="ui-text-main font-semibold">
                        {row.asset.symbol}
                      </span>
                      <span className="ui-text-muted hidden text-[11px] sm:inline">
                        ({row.asset.name})
                      </span>
                    </div>
                  </th>
                  <td className="ui-border ui-text-main border-b px-3 py-2 text-right font-mono font-semibold">
                    {row.weightPct.toFixed(1)}%
                  </td>
                  <td className="ui-border border-b px-3 py-2 text-right">
                    <div className="inline-flex items-center gap-1">
                      <input
                        type="number"
                        step={0.1}
                        min={0}
                        max={50}
                        value={row.grossYieldPct}
                        onChange={(e) =>
                          setCustomYieldOverrides((prev) => ({
                            ...prev,
                            [row.asset.id]: Math.max(0, Number(e.target.value)),
                          }))
                        }
                        className="ui-input w-16 rounded px-1.5 py-0.5 text-right font-mono text-xs"
                        aria-label={`Gross dividend yield for ${row.asset.symbol}`}
                      />
                      <span className="ui-text-muted font-mono">%</span>
                    </div>
                  </td>
                  <td className="ui-border ui-text-muted border-b px-3 py-2 text-right font-mono">
                    {row.effectiveTaxPct}%
                  </td>
                  <td className="ui-border border-b px-3 py-2 text-right font-mono font-semibold text-emerald-600 dark:text-emerald-400">
                    {row.netYieldPct.toFixed(2)}%
                  </td>
                  <td className="ui-border ui-text-main border-b px-3 py-2 text-right font-mono">
                    {formatIdr(row.annualDividendAtInitialIdr)}
                  </td>
                  <td className="ui-border border-b px-3 py-2 text-right font-mono font-semibold text-emerald-600 dark:text-emerald-400">
                    {formatIdr(row.annualDividendAtGoalIdr)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* 5-YEAR HISTORICAL BACKTEST: REBALANCING FREQUENCY SIMULATOR (16:08) */}
      <section className="ui-card rounded-xl p-5">
        <div className="ui-border flex flex-col gap-2 border-b pb-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <RefreshCw className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
              <h3 className="ui-text-main text-sm font-bold">
                Backtest 5 Tahun: Rebalance Bulanan vs Kuartalan (3 Bulan) vs Tahunan
                vs Buy &amp; Hold
              </h3>
            </div>
            <p className="ui-text-muted mt-0.5 text-xs">
              Pembuktian klaim menit 16:08 (Sander &amp; Leon): Rebalancing rutin tiap
              kuartal/bulan memanen volatilitas saat Bull Run (2020–2021), melindungi
              modal saat Crash (2022), dan mempercepat recovery (2023–2024):
            </p>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="ui-subtle rounded-lg p-3.5">
            <div className="ui-text-muted text-xs">
              Rebalance Kuartalan (3 Bulan - Standar Video)
            </div>
            <div className="mt-1 font-mono text-lg font-bold text-emerald-600 dark:text-emerald-400">
              {formatIdr(freqBacktest.finalQuarterlyIdr)}
            </div>
            <div className="ui-text-muted mt-0.5 text-[11px]">
              Max Drawdown: -{solvedMetrics.maxDrawdown}%
            </div>
          </div>

          <div className="ui-subtle rounded-lg p-3.5">
            <div className="ui-text-muted text-xs">Rebalance Bulanan (1 Bulan)</div>
            <div className="ui-text-main mt-1 font-mono text-lg font-bold">
              {formatIdr(freqBacktest.finalMonthlyIdr)}
            </div>
            <div className="ui-text-muted mt-0.5 text-[11px]">
              Frekuensi tinggi (biaya transaksi lebih sering)
            </div>
          </div>

          <div className="ui-subtle rounded-lg p-3.5">
            <div className="ui-text-muted text-xs">Rebalance Tahunan (1 Tahun)</div>
            <div className="ui-text-main mt-1 font-mono text-lg font-bold">
              {formatIdr(freqBacktest.finalAnnualIdr)}
            </div>
            <div className="ui-text-muted mt-0.5 text-[11px]">
              Disiplin minimal (1x per tahun)
            </div>
          </div>

          <div className="ui-subtle rounded-lg p-3.5">
            <div className="ui-text-muted text-xs">
              Buy &amp; Hold (Tidak Pernah Rebalance)
            </div>
            <div className="ui-text-secondary mt-1 font-mono text-lg font-bold">
              {formatIdr(freqBacktest.finalBuyHoldIdr)}
            </div>
            <div className=" mt-0.5 font-mono text-[11px] text-rose-600 dark:text-rose-400">
              Max Drawdown: -{freqBacktest.buyHoldMaxDdPercent}%
            </div>
          </div>
        </div>

        <div className="mt-4 h-72 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={freqChartData}
              margin={{ top: 10, right: 15, left: 0, bottom: 0 }}
            >
              <XAxis dataKey="periodLabel" stroke="#71717a" fontSize={11} />
              <YAxis
                stroke="#71717a"
                fontSize={11}
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
                formatter={(val: number, name: string) => [
                  `Rp ${val.toLocaleString('id-ID')} Juta`,
                  name,
                ]}
              />
              <Legend wrapperStyle={{ fontSize: '11px' }} />
              <Line
                type="monotone"
                dataKey="Kuartalan3M"
                name="Rebalance 3 Bulan (Kuartalan)"
                stroke="#10b981"
                strokeWidth={2.5}
                dot={false}
              />
              <Line
                type="monotone"
                dataKey="Bulanan"
                name="Rebalance Bulanan"
                stroke="#0ea5e9"
                strokeWidth={1.8}
                dot={false}
              />
              <Line
                type="monotone"
                dataKey="Tahunan1Y"
                name="Rebalance Tahunan"
                stroke="#f59e0b"
                strokeWidth={1.8}
                dot={false}
              />
              <Line
                type="monotone"
                dataKey="BuyAndHold"
                name="Buy & Hold (Tanpa Rebalance)"
                stroke="#f43f5e"
                strokeDasharray="4 4"
                strokeWidth={1.8}
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </section>
    </div>
  );
};
