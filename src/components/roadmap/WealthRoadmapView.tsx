import React, { useEffect, useMemo, useState } from 'react';
import { AssetDefinition, SolvedPortfolio } from '../../lib/quant/types';
import {
  simulateMonteCarloPaths,
  simulateRebalancingFrequencyBacktest,
  simulateWealthToGoal,
  solveRequiredMonthlySavings,
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
  Activity,
  CheckCircle2,
  Calculator,
  Share2,
  Copy,
  Check,
  RotateCcw,
  Banknote,
  ChevronDown,
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

const ROADMAP_SETTINGS_STORAGE_KEY = 'quantporto_roadmap_settings_v1';

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
  // Bug 18: Hydrate local settings from localStorage to persist across tab unmounts
  const [initialRoadmapSettings] = useState(() => {
    try {
      const raw = localStorage.getItem(ROADMAP_SETTINGS_STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  });

  const [annualStepUpPct, setAnnualStepUpPct] = useState<number>(
    () => initialRoadmapSettings?.annualStepUpPct ?? 0
  );
  const [annualInflationPercent, setAnnualInflationPercent] = useState<number>(
    () => initialRoadmapSettings?.annualInflationPercent ?? 0
  );
  const [monthlyLivingCostTargetIdr, setMonthlyLivingCostTargetIdr] = useState<number>(
    () => initialRoadmapSettings?.monthlyLivingCostTargetIdr ?? 10_000_000
  );
  const [simulationViewMode, setSimulationViewMode] = useState<
    'deterministic' | 'monte-carlo'
  >(() => initialRoadmapSettings?.simulationViewMode ?? 'deterministic');
  const [monteCarloDisplayMode, setMonteCarloDisplayMode] = useState<
    'nominal' | 'real'
  >(() => initialRoadmapSettings?.monteCarloDisplayMode ?? 'real');

  // Dividend Estimator State
  const [taxMode, setTaxMode] = useState<
    'standard-net' | 'idx-tax-exempt-reinvest' | 'gross'
  >(() => initialRoadmapSettings?.taxMode ?? 'standard-net');
  const [dividendUsageMode, setDividendUsageMode] = useState<
    'reinvest-drip' | 'cashout-passive'
  >(() => initialRoadmapSettings?.dividendUsageMode ?? 'reinvest-drip');
  const [customYieldOverrides, setCustomYieldOverrides] = useState<
    Record<string, number>
  >(() => initialRoadmapSettings?.customYieldOverrides ?? {});

  // Feature 3: Reverse DCA Goal Solver State
  const [reverseDcaTargetYears, setReverseDcaTargetYears] = useState<number>(
    () => initialRoadmapSettings?.reverseDcaTargetYears ?? 10
  );

  // Collapsible cards state
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>(() => {
    try {
      const stored = localStorage.getItem('quantporto_roadmap_collapsed_v1');
      return stored ? JSON.parse(stored) : {};
    } catch {
      return {};
    }
  });

  const toggleSectionCollapse = (key: string) => {
    setCollapsedSections((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      try {
        localStorage.setItem('quantporto_roadmap_collapsed_v1', JSON.stringify(next));
      } catch {
        // Ignore
      }
      return next;
    });
  };

  const areAllSectionsCollapsed = useMemo(() => {
    return !!(
      collapsedSections.calc &&
      collapsedSections.curve &&
      collapsedSections.swr &&
      collapsedSections.reverseDca &&
      collapsedSections.dividends &&
      collapsedSections.backtest
    );
  }, [collapsedSections]);

  const toggleAllSections = () => {
    setCollapsedSections((prev) => {
      const allCollapsed = !!(
        prev.calc &&
        prev.curve &&
        prev.swr &&
        prev.reverseDca &&
        prev.dividends &&
        prev.backtest
      );
      const next = {
        ...prev,
        calc: !allCollapsed,
        curve: !allCollapsed,
        swr: !allCollapsed,
        reverseDca: !allCollapsed,
        dividends: !allCollapsed,
        backtest: !allCollapsed,
      };
      try {
        localStorage.setItem('quantporto_roadmap_collapsed_v1', JSON.stringify(next));
      } catch {
        // Ignore
      }
      return next;
    });
  };

  // Bug 18: Save settings whenever changed
  useEffect(() => {
    try {
      localStorage.setItem(
        ROADMAP_SETTINGS_STORAGE_KEY,
        JSON.stringify({
          annualStepUpPct,
          annualInflationPercent,
          monthlyLivingCostTargetIdr,
          simulationViewMode,
          monteCarloDisplayMode,
          taxMode,
          dividendUsageMode,
          customYieldOverrides,
          reverseDcaTargetYears,
        })
      );
    } catch {
      // Ignore storage errors
    }
  }, [
    annualStepUpPct,
    annualInflationPercent,
    monthlyLivingCostTargetIdr,
    simulationViewMode,
    monteCarloDisplayMode,
    taxMode,
    dividendUsageMode,
    customYieldOverrides,
    reverseDcaTargetYears,
  ]);

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

  const [dividendFilter, setDividendFilter] = useState<'all' | 'paying' | 'stocks' | 'bonds'>('all');

  const dividendCounts = useMemo(() => {
    const items = dividendBreakdown.activeItems ?? [];
    return {
      all: items.length,
      paying: items.filter((i) => i.netYieldPct > 0).length,
      stocks: items.filter((i) => i.asset.category === 'idx-equity' || i.asset.category === 'us-equity').length,
      bonds: items.filter((i) => i.asset.category === 'bonds' || i.asset.category === 'money-market').length,
    };
  }, [dividendBreakdown.activeItems]);

  const filteredDividendItems = useMemo(() => {
    const items = dividendBreakdown.activeItems ?? [];
    if (dividendFilter === 'paying') {
      return items.filter((i) => i.netYieldPct > 0);
    }
    if (dividendFilter === 'stocks') {
      return items.filter((i) => i.asset.category === 'idx-equity' || i.asset.category === 'us-equity');
    }
    if (dividendFilter === 'bonds') {
      return items.filter((i) => i.asset.category === 'bonds' || i.asset.category === 'money-market');
    }
    return items;
  }, [dividendBreakdown.activeItems, dividendFilter]);

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

  // 500-Run Stochastic Monte Carlo Simulation
  const monteCarloResult = useMemo(
    () =>
      simulateMonteCarloPaths({
        initialCapitalIdr: initialCapitalIdr >= 0 ? initialCapitalIdr : 100_000_000,
        monthlyContributionIdr: monthlySavingsIdr,
        annualCagrPercent: effectiveCompoundingCagr,
        annualVolatilityPercent: solvedMetrics.volatility || 18,
        targetGoalIdr,
        maxYears: displayYears,
        numSimulations: 500,
        annualStepUpPercent: annualStepUpPct,
        annualInflationPercent,
      }),
    [
      initialCapitalIdr,
      monthlySavingsIdr,
      effectiveCompoundingCagr,
      solvedMetrics.volatility,
      targetGoalIdr,
      displayYears,
      annualStepUpPct,
      annualInflationPercent,
    ]
  );

  // Feature 3: Reverse DCA Goal Solver
  const reverseDcaSolution = useMemo(() => {
    return solveRequiredMonthlySavings({
      initialCapitalIdr: initialCapitalIdr >= 0 ? initialCapitalIdr : 0,
      targetGoalIdr,
      targetYears: reverseDcaTargetYears,
      annualCagrPercent: effectiveCompoundingCagr,
      annualVolatilityPercent: solvedMetrics.volatility || 18,
      annualStepUpPercent: annualStepUpPct,
      annualInflationPercent,
    });
  }, [
    initialCapitalIdr,
    targetGoalIdr,
    reverseDcaTargetYears,
    effectiveCompoundingCagr,
    solvedMetrics.volatility,
    annualStepUpPct,
    annualInflationPercent,
  ]);

  const isRealMonteCarlo =
    simulationViewMode === 'monte-carlo' &&
    monteCarloDisplayMode === 'real' &&
    annualInflationPercent > 0;

  const monteCarloChartData = useMemo(() => {
    const isReal = monteCarloDisplayMode === 'real' && annualInflationPercent > 0;
    return monteCarloResult.series.map((pt) => ({
      yearLabel: `Thn ${pt.year}`,
      ModalPokok: Math.round(
        (isReal ? (pt.principalReal ?? pt.principal) : pt.principal) / 1_000_000
      ),
      P90Bull: Math.round(
        (isReal ? (pt.p90Real ?? pt.p90) : pt.p90) / 1_000_000
      ),
      P75: Math.round(
        (isReal ? (pt.p75Real ?? pt.p75) : pt.p75) / 1_000_000
      ),
      P50Median: Math.round(
        (isReal ? (pt.p50Real ?? pt.p50) : pt.p50) / 1_000_000
      ),
      P25: Math.round(
        (isReal ? (pt.p25Real ?? pt.p25) : pt.p25) / 1_000_000
      ),
      P10Bear: Math.round(
        (isReal ? (pt.p10Real ?? pt.p10) : pt.p10) / 1_000_000
      ),
    }));
  }, [monteCarloResult, monteCarloDisplayMode, annualInflationPercent]);

  const [copiedSummary, setCopiedSummary] = useState(false);

  const handleCopyRoadmapSummary = async () => {
    const todayStr = new Intl.DateTimeFormat('id-ID', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }).format(new Date());

    const yearsToGoalStr = sim.reachedGoal
      ? `${sim.yearsToGoal} thn ${sim.monthsToGoal} bln`
      : '> 30 tahun';

    const realGoalStr =
      annualInflationPercent > 0
        ? ` (Daya beli riil setara ${formatIdr(sim.realPurchasingPowerAtGoalIdr ?? targetGoalIdr, true)} saat ini)`
        : '';

    const freedomSwrStr =
      sim.monthsToFinancialFreedomSWR !== null && sim.monthsToFinancialFreedomSWR !== undefined
        ? `${Math.floor(sim.monthsToFinancialFreedomSWR / 12)} thn ${sim.monthsToFinancialFreedomSWR % 12} bln`
        : '> 30 tahun';

    const freedomDivStr =
      sim.monthsToFinancialFreedomDividends !== null && sim.monthsToFinancialFreedomDividends !== undefined
        ? `${Math.floor(sim.monthsToFinancialFreedomDividends / 12)} thn ${sim.monthsToFinancialFreedomDividends % 12} bln`
        : '> 30 tahun';

    const lines = [
      '🎯 *QUANTPORTO WEALTH ROADMAP SUMMARY*',
      `Tanggal: ${todayStr}`,
      `Target Dana: ${formatIdr(targetGoalIdr)}`,
      `Modal Awal: ${formatIdr(initialCapitalIdr)} | Tabungan Rutin: ${formatIdr(monthlySavingsIdr)}/bln${
        annualStepUpPct > 0 ? ` (+${annualStepUpPct}% step-up/thn)` : ''
      }`,
      `CAGR Portfolio: +${solvedMetrics.cagr.toFixed(2)}%/thn (Max DD: -${solvedMetrics.maxDrawdown.toFixed(1)}%)`,
      annualInflationPercent > 0 ? `Asumsi Inflasi: ${annualInflationPercent}%/thn` : '',
      '',
      '📈 *PROYEKSI MENUJU TARGET:*',
      `• Estimasi Capai Target: ${yearsToGoalStr}${realGoalStr}`,
      `• Total Modal Disetor: ${formatIdr(sim.totalPrincipalAtGoalIdr)}`,
      `• Akumulasi Imbal Hasil (Gain): ${formatIdr(sim.totalGainAtGoalIdr)}`,
      '',
      `🌴 *MILESTONE PENSIUN & FINANCIAL FREEDOM (Living Cost: ${formatIdr(monthlyLivingCostTargetIdr, true)}/bln):*`,
      `• Bebas Finansial via SWR 4%: ${freedomSwrStr}`,
      `• Bebas Finansial via Dividen: ${freedomDivStr} (Pasif income saat target: ${formatIdr(dividendBreakdown.monthlyPassiveAtGoalIdr, true)}/bln)`,
      `• Strategi Dividen: ${dividendUsageMode === 'reinvest-drip' ? 'DRIP (Gulung ke Pokok)' : 'Tarik Tunai (Cashout Living Cost)'}`,
      '',
      '🎲 *SIMULASI STOKASTIK MONTE CARLO (500 Skenario Pasar):*',
      `• Probabilitas Sukses Capai Target: ${monteCarloResult.successProbabilityPercent.toFixed(1)}%`,
      `• Median Skenario Pasar (P50): ${formatIdr(monteCarloResult.medianFinalWealthIdr)}`,
      `• Skenario Pasar Lesu / Bear (P10): ${formatIdr(monteCarloResult.bearFinalWealthIdr)}`,
      `• Skenario Pasar Bullish (P90): ${formatIdr(monteCarloResult.bullFinalWealthIdr)}`,
      '',
      'Dibuat dengan QuantPorto Portfolio Builder & Rebalancer',
    ].filter(Boolean);

    try {
      await navigator.clipboard.writeText(lines.join('\n'));
      setCopiedSummary(true);
      setTimeout(() => setCopiedSummary(false), 2500);
    } catch {
      // Ignore clipboard error
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header Action Bar with 1-Click WhatsApp / Notion Summary Copy */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b ui-border pb-3">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30">
            <TrendingUp className="h-4 w-4" />
          </div>
          <div>
            <h1 className="text-base font-bold ui-text-main flex items-center gap-2">
              <span>Simulator Kekayaan &amp; Kemandirian Finansial</span>
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-mono">
                CAGR +{solvedMetrics.cagr.toFixed(2)}%
              </span>
            </h1>
            <p className="text-xs ui-text-muted mt-0.5">
              Peta jalan compounding eksponensial menuju target {formatIdr(targetGoalIdr, true)} &amp; pensiun mandiri
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={handleCopyRoadmapSummary}
          className="flex items-center gap-1.5 rounded-lg border ui-border ui-subtle px-3 py-1.5 text-xs font-semibold hover:ui-text-main transition shadow-xs"
          title="Salin ringkasan proyeksi kekayaan dan milestone pensiun ke Clipboard"
        >
          {copiedSummary ? (
            <>
              <Check className="h-3.5 w-3.5 text-emerald-500" />
              <span className="text-emerald-500 font-medium">Tersalin ke Clipboard!</span>
            </>
          ) : (
            <>
              <Share2 className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
              <span>Salin Ringkasan Roadmap</span>
            </>
          )}
        </button>
      </div>

      {/* In-Page Quick Jump Sub-Navigation Pills */}
      <nav
        aria-label="Navigasi Bagian Roadmap"
        className="sticky top-14 z-20 -mx-1 px-1 py-1.5 sm:px-2 rounded-xl ui-card border ui-border shadow-xs"
      >
        <div className="flex items-center gap-1.5 text-xs whitespace-nowrap overflow-x-auto pb-0.5">
          <span className="ui-text-muted text-[10px] font-bold uppercase tracking-wider px-1">
            Lompat ke:
          </span>
          <button
            type="button"
            onClick={() => {
              document.getElementById('tour-roadmap-calculator')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }}
            className="flex items-center gap-1.5 rounded-lg border ui-border ui-subtle px-2.5 py-1 text-xs font-semibold ui-text-secondary hover:ui-text-main transition"
          >
            <Target className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
            <span>1. Proyeksi Rp10M</span>
          </button>
          <button
            type="button"
            onClick={() => {
              document.getElementById('tour-dividend-retirement')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }}
            className="flex items-center gap-1.5 rounded-lg border ui-border ui-subtle px-2.5 py-1 text-xs font-semibold ui-text-secondary hover:ui-text-main transition"
          >
            <Calculator className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
            <span>2. Pensiun 4% SWR</span>
          </button>
          <button
            type="button"
            onClick={() => {
              document.getElementById('roadmap-reverse-dca')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }}
            className="flex items-center gap-1.5 rounded-lg border ui-border ui-subtle px-2.5 py-1 text-xs font-semibold ui-text-secondary hover:ui-text-main transition"
          >
            <Coins className="h-3.5 w-3.5 text-amber-500" />
            <span>3. Reverse DCA</span>
          </button>
          <button
            type="button"
            onClick={() => {
              document.getElementById('roadmap-dividends')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }}
            className="flex items-center gap-1.5 rounded-lg border ui-border ui-subtle px-2.5 py-1 text-xs font-semibold ui-text-secondary hover:ui-text-main transition"
          >
            <Banknote className="h-3.5 w-3.5 text-emerald-500" />
            <span>4. Dividen Pasif</span>
          </button>
          <button
            type="button"
            onClick={() => {
              document.getElementById('tour-backtest-frequency')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }}
            className="flex items-center gap-1.5 rounded-lg border ui-border ui-subtle px-2.5 py-1 text-xs font-semibold ui-text-secondary hover:ui-text-main transition"
          >
            <RotateCcw className="h-3.5 w-3.5 text-sky-500" />
            <span>5. Backtest 5Y</span>
          </button>
        </div>
      </nav>

      <section id="tour-roadmap-calculator" className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Left 5 Cols: Wealth Simulator Parameters */}
        <div className="ui-card space-y-4 rounded-xl p-5 lg:col-span-5">
          <div className="ui-border flex items-center justify-between border-b pb-2.5">
            <div className="flex items-center gap-2">
              <Target className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
              <h2 className="ui-text-main text-sm font-bold">
                Kalkulator Compounding
              </h2>
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-semibold">
                {formatIdr(targetGoalIdr, true)}
              </span>
            </div>
            <button
              type="button"
              onClick={() => toggleSectionCollapse('calc')}
              className="flex items-center gap-1 text-[11px] font-medium ui-subtle border ui-border px-2 py-0.5 rounded-lg ui-text-secondary hover:ui-text-main transition"
              title={collapsedSections.calc ? 'Buka form kalkulator' : 'Ciutkan kalkulator'}
            >
              <ChevronDown className={`h-3.5 w-3.5 transition-transform ${collapsedSections.calc ? '-rotate-90' : ''}`} />
              <span>{collapsedSections.calc ? 'Buka' : 'Ciutkan'}</span>
            </button>
          </div>

          {collapsedSections.calc ? (
            <div className="py-1 flex flex-col gap-1.5">
              <div className="flex items-center justify-between text-xs font-mono">
                <span className="ui-text-muted">
                  Modal: <strong className="ui-text-main">{formatIdr(initialCapitalIdr, true)}</strong> • DCA: <strong className="text-emerald-600 dark:text-emerald-400">{formatIdr(monthlySavingsIdr, true)}/bln</strong>
                </span>
                <span className="font-bold text-emerald-600 dark:text-emerald-400">
                  {sim.reachedGoal ? `${sim.yearsToGoal} Thn` : '> 30 Thn'}
                </span>
              </div>
              <div className="text-[11px] ui-text-secondary flex justify-between">
                <span>Target: {formatIdr(targetGoalIdr, true)}</span>
                <span className="ui-text-muted">Compounding: +{formatIdr(sim.totalGainAtGoalIdr, true)}</span>
              </div>
            </div>
          ) : (
          <>

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
                aria-label="Modal awal (lump sum)"
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
                aria-label="Investasi rutin bulanan"
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
                aria-label="Kenaikan tabungan per tahun"
                className="mt-1.5 h-1.5 w-full cursor-pointer"
              />
            </div>

            <div>
              <div className="flex justify-between items-center text-xs">
                <label className="ui-text-secondary font-medium">
                  Target Kekayaan Pokok:
                </label>
                <div className="ui-subtle flex items-center gap-1 rounded-md border ui-border px-2 py-0.5">
                  <span className="ui-text-muted font-mono text-[11px]">Rp</span>
                  <FormattedNumberInput
                    step={500_000_000}
                    min={100_000_000}
                    value={targetGoalIdr}
                    onChange={(val) => setTargetGoalIdr(val)}
                    className="ui-text-main w-28 bg-transparent font-mono text-xs font-bold focus:outline-none text-right"
                    ariaLabel="Target Kekayaan Pokok in IDR"
                  />
                </div>
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5 text-xs">
                {[
                  1_000_000_000,
                  2_500_000_000,
                  5_000_000_000,
                  10_000_000_000,
                  25_000_000_000,
                  50_000_000_000,
                ].map((g) => (
                  <button
                    key={g}
                    type="button"
                    onClick={() => setTargetGoalIdr(g)}
                    className={`flex-1 rounded px-2 py-1 font-mono text-[11px] font-medium transition shadow-2xs ${
                      targetGoalIdr === g
                        ? 'bg-emerald-600 font-semibold text-white ring-1 ring-emerald-500'
                        : 'ui-subtle border ui-border ui-text-secondary hover:ui-text-main hover:border-emerald-500/40'
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
                <span className="font-mono font-semibold text-emerald-600 dark:text-emerald-400">
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
                        ? 'bg-emerald-600 font-semibold text-white'
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
              {sim.reachedGoal ? (
                <>
                  {sim.yearsToGoal} Tahun{' '}
                  {sim.monthsToGoal > 0 ? `${sim.monthsToGoal} Bulan` : ''}
                </>
              ) : (
                <span className="text-base text-amber-600 dark:text-amber-400 font-sans font-semibold">
                  Belum Tercapai (&gt; 30 Thn)
                </span>
              )}
            </div>

            {annualInflationPercent > 0 && (
              <div className="mt-2 rounded-lg bg-emerald-500/10 p-2 text-xs">
                <div className="flex justify-between text-[11px]">
                  <span className="text-emerald-700 dark:text-emerald-300">
                    Daya Beli Riil saat {formatIdr(targetGoalIdr, true)} tercapai:
                  </span>
                  <span className="font-mono font-bold text-emerald-700 dark:text-emerald-300">
                    ≈{' '}
                    {formatIdr(
                      sim.realPurchasingPowerAtGoalIdr ?? targetGoalIdr,
                      true
                    )}
                  </span>
                </div>
                <div className="ui-text-muted mt-0.5 text-[10px]">
                  {sim.realYearsToGoalFloat !== undefined ? (
                    <>
                      Waktu capai target riil penuh: <strong>{sim.realYearsToGoalFloat} Tahun</strong> (efek inflasi {annualInflationPercent}%/thn)
                    </>
                  ) : (
                    <>Target riil belum tercapai dalam horizon 30 tahun (efek inflasi {annualInflationPercent}%/thn)</>
                  )}
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
          </>
          )}
        </div>

        {/* Right 7 Cols: Compounding Curve */}
        <div className="space-y-5 lg:col-span-7">
          <div className="ui-card rounded-xl p-4 sm:p-5">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b ui-border pb-2.5">
              <div className="flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-emerald-500" />
                <h3 className="ui-text-main text-sm font-bold">
                  {simulationViewMode === 'deterministic'
                    ? 'Kurva Compounding'
                    : 'Simulasi Monte Carlo (500x)'}
                </h3>
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-semibold">
                  {simulationViewMode === 'deterministic'
                    ? `CAGR ${effectiveCompoundingCagr.toFixed(1)}%`
                    : `\u03c3 ${(solvedMetrics.volatility || 18).toFixed(1)}%`}
                </span>
              </div>

              {/* Controls: Mode toggles + Collapse Button */}
              <div className="flex items-center gap-1.5">
                {simulationViewMode === 'monte-carlo' && annualInflationPercent > 0 && (
                  <div className="ui-subtle flex rounded-lg p-0.5 text-xs">
                    <button
                      type="button"
                      onClick={() => setMonteCarloDisplayMode('real')}
                      className={`px-2 py-0.5 rounded text-[11px] font-medium transition ${
                        monteCarloDisplayMode === 'real'
                          ? 'bg-emerald-600 font-semibold text-white shadow-2xs'
                          : 'ui-text-muted hover:opacity-80'
                      }`}
                      title="Tampilkan proyeksi dalam daya beli riil yang didiskonto inflasi"
                    >
                      Riil
                    </button>
                    <button
                      type="button"
                      onClick={() => setMonteCarloDisplayMode('nominal')}
                      className={`px-2 py-0.5 rounded text-[11px] font-medium transition ${
                        monteCarloDisplayMode === 'nominal'
                          ? 'ui-card ui-text-main font-semibold shadow-2xs'
                          : 'ui-text-muted hover:opacity-80'
                      }`}
                      title="Tampilkan proyeksi dalam nilai nominal pasar"
                    >
                      Nominal
                    </button>
                  </div>
                )}

                <div className="ui-subtle flex rounded-lg p-0.5 text-xs shrink-0">
                  <button
                    type="button"
                    onClick={() => setSimulationViewMode('deterministic')}
                    className={`px-2 py-0.5 rounded text-[11px] font-medium transition ${
                      simulationViewMode === 'deterministic'
                        ? 'ui-card ui-text-main font-semibold shadow-2xs'
                        : 'ui-text-muted hover:opacity-80'
                    }`}
                  >
                    Deterministik
                  </button>
                  <button
                    type="button"
                    onClick={() => setSimulationViewMode('monte-carlo')}
                    className={`flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium transition ${
                      simulationViewMode === 'monte-carlo'
                        ? 'bg-emerald-600 font-semibold text-white shadow-2xs'
                        : 'ui-text-muted hover:opacity-80'
                    }`}
                  >
                    <Activity className="h-3 w-3" />
                    <span>Monte Carlo</span>
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => toggleSectionCollapse('curve')}
                  className="flex items-center gap-1 text-[11px] font-medium ui-subtle border ui-border px-2 py-0.5 rounded-lg ui-text-secondary hover:ui-text-main transition"
                  title={collapsedSections.curve ? 'Buka grafik kurva' : 'Ciutkan grafik kurva'}
                >
                  <ChevronDown className={`h-3.5 w-3.5 transition-transform ${collapsedSections.curve ? '-rotate-90' : ''}`} />
                  <span>{collapsedSections.curve ? 'Buka' : 'Ciutkan'}</span>
                </button>
              </div>
            </div>

            {collapsedSections.curve ? (
              <div className="py-2.5 flex flex-wrap items-center justify-between gap-3 text-xs font-mono">
                {simulationViewMode === 'monte-carlo' ? (
                  <>
                    <span className="ui-text-muted">
                      Peluang: <strong className="text-emerald-600 dark:text-emerald-400">{monteCarloResult.successProbabilityPercent}%</strong> • Median: <strong className="ui-text-main">{monteCarloResult.medianYearsToGoal !== null ? `${monteCarloResult.medianYearsToGoal} Thn` : '> 30 Thn'}</strong>
                    </span>
                    <span className="ui-text-secondary">
                      Bear P10: <strong className="text-rose-500">{formatIdr(monteCarloResult.bearFinalWealthIdr, true)}</strong> | Bull P90: <strong className="text-emerald-500">{formatIdr(monteCarloResult.bullFinalWealthIdr, true)}</strong>
                    </span>
                  </>
                ) : (
                  <>
                    <span className="ui-text-muted">
                      CAGR: <strong className="text-emerald-600 dark:text-emerald-400">{effectiveCompoundingCagr.toFixed(1)}%</strong> • Max DD: <strong className="text-rose-500">-{solvedMetrics.maxDrawdown}%</strong>
                    </span>
                    <span className="ui-text-secondary">
                      Target {formatIdr(targetGoalIdr, true)}: <strong className="ui-text-main">{sim.reachedGoal ? `${sim.yearsToGoal} Thn` : '> 30 Thn'}</strong>
                    </span>
                  </>
                )}
              </div>
            ) : (
            <>
            <div className="mt-4 h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                {simulationViewMode === 'deterministic' ? (
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
                      stroke="#8F580A"
                      strokeDasharray="4 4"
                      label={{
                        value: `Target ${formatIdr(targetGoalIdr, true)}`,
                        fill: '#8F580A',
                        fontSize: 11,
                      }}
                    />
                    <Area
                      type="monotone"
                      dataKey="NilaiPortfolio"
                      name="Nilai Portfolio (Compounding)"
                      stroke="#21543D"
                      fill="#21543D"
                      fillOpacity={0.2}
                    />
                    {annualInflationPercent > 0 && (
                      <Area
                        type="monotone"
                        dataKey="DayaBeliRiil"
                        name={`Daya Beli Riil (Inflasi ${annualInflationPercent}%)`}
                        stroke="#25586B"
                        fill="#25586B"
                        strokeDasharray="4 4"
                        fillOpacity={0.08}
                      />
                    )}
                    <Area
                      type="monotone"
                      dataKey="WorstCaseCrash"
                      name={`Saat Market Crash (-${solvedMetrics.maxDrawdown}%)`}
                      stroke="#9E472A"
                      fill="#9E472A"
                      fillOpacity={0.12}
                    />
                    <Area
                      type="monotone"
                      dataKey="ModalTabungan"
                      name="Akumulasi Modal Tabungan"
                      stroke="#606E65"
                      fill="#606E65"
                      fillOpacity={0.12}
                    />
                  </AreaChart>
                ) : (
                  <AreaChart
                    data={monteCarloChartData}
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
                      stroke="#8F580A"
                      strokeDasharray="4 4"
                      label={{
                        value: `Target ${formatIdr(targetGoalIdr, true)}`,
                        fill: '#8F580A',
                        fontSize: 11,
                      }}
                    />
                    <Area
                      type="monotone"
                      dataKey="P90Bull"
                      name={isRealMonteCarlo ? 'P90: Optimis (Daya Beli Riil)' : 'P90: Skenario Optimis (Bull 10%)'}
                      stroke="#3D8B66"
                      fill="#3D8B66"
                      fillOpacity={0.16}
                    />
                    <Area
                      type="monotone"
                      dataKey="P50Median"
                      name={
                        isRealMonteCarlo
                          ? `P50: Ekspektasi Riil (Inflasi ${annualInflationPercent}%)`
                          : 'P50: Ekspektasi Median (Realistis)'
                      }
                      stroke="#21543D"
                      fill="#21543D"
                      fillOpacity={0.25}
                      strokeWidth={2}
                    />
                    <Area
                      type="monotone"
                      dataKey="P10Bear"
                      name={isRealMonteCarlo ? 'P10: Ujian Krisis (Daya Beli Riil)' : 'P10: Ujian Krisis (Bear 10%)'}
                      stroke="#9E472A"
                      fill="#9E472A"
                      fillOpacity={0.14}
                    />
                    <Area
                      type="monotone"
                      dataKey="ModalPokok"
                      name={isRealMonteCarlo ? 'Modal Pokok Disimpan (Riil)' : 'Modal Pokok Disimpan'}
                      stroke="#606E65"
                      fill="#606E65"
                      fillOpacity={0.10}
                      strokeDasharray="3 3"
                    />
                  </AreaChart>
                )}
              </ResponsiveContainer>
            </div>

            {/* Monte Carlo Statistical Probability Summary Cards */}
            {simulationViewMode === 'monte-carlo' && (
              <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-3 border-t ui-border">
                <div className="p-3 rounded-lg ui-card border ui-border">
                  <div className="text-[11px] ui-text-muted">Peluang Capai Target</div>
                  <div
                    className={`mt-0.5 text-base font-bold font-mono ${
                      monteCarloResult.successProbabilityPercent >= 75
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : monteCarloResult.successProbabilityPercent >= 50
                        ? 'text-amber-600 dark:text-amber-400'
                        : 'text-rose-600 dark:text-rose-400'
                    }`}
                  >
                    {monteCarloResult.successProbabilityPercent}%
                  </div>
                  <div className="text-[10px] ui-text-muted mt-0.5">
                    Target {formatIdr(targetGoalIdr, true)}
                  </div>
                </div>

                <div className="p-3 rounded-lg ui-card border ui-border">
                  <div className="text-[11px] ui-text-muted">Median Waktu ke Goal</div>
                  <div className="mt-0.5 text-base font-bold font-mono text-emerald-600 dark:text-emerald-400">
                    {monteCarloResult.medianYearsToGoal !== null
                      ? `${monteCarloResult.medianYearsToGoal} Tahun`
                      : `> ${displayYears} Tahun`}
                  </div>
                  <div className="text-[10px] ui-text-muted mt-0.5">
                    {monteCarloResult.successProbabilityPercent < 50
                      ? `Median dari jalur sukses (${monteCarloResult.successProbabilityPercent}%)`
                      : '50% jalur simulasi'}
                  </div>
                </div>

                <div className="p-3 rounded-lg ui-card border ui-border">
                  <div className="text-[11px] ui-text-muted">Hasil P10 (Ujian Bear)</div>
                  <div className="mt-0.5 text-base font-bold font-mono text-rose-600 dark:text-rose-400">
                    {formatIdr(monteCarloResult.bearFinalWealthIdr, true)}
                  </div>
                  <div className="text-[10px] ui-text-muted mt-0.5">
                    10% terburuk
                  </div>
                </div>

                <div className="p-3 rounded-lg ui-card border ui-border">
                  <div className="text-[11px] ui-text-muted">Hasil P90 (Kondisi Bull)</div>
                  <div className="mt-0.5 text-base font-bold font-mono text-emerald-600 dark:text-emerald-400">
                    {formatIdr(monteCarloResult.bullFinalWealthIdr, true)}
                  </div>
                  <div className="text-[10px] ui-text-muted mt-0.5">
                    10% terbaik
                  </div>
                </div>
              </div>
            )}
            </>
            )}
          </div>

          {!collapsedSections.curve && (
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
          )}
        </div>
      </section>

      {/* KALKULATOR TARGET KEBEBASAN FINANSIAL & BIAYA HIDUP PENSIUN (4% SWR VS DIVIDEN MURNI) */}
      <section id="tour-dividend-retirement" className="ui-card rounded-xl p-4 sm:p-5">
        <div className="ui-border flex flex-wrap items-center justify-between gap-2.5 border-b pb-2.5">
          <div className="flex items-center gap-2">
            <Calculator className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
            <h3 className="ui-text-main text-sm font-bold">
              Kebebasan Finansial &amp; Pensiun (4% SWR &amp; Dividen)
            </h3>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="ui-text-secondary font-medium hidden sm:inline">Biaya Hidup:</span>
            <div className="ui-card flex items-center gap-1 rounded-md border ui-border px-2 py-0.5">
              <span className="ui-text-muted font-mono text-[11px]">Rp</span>
              <FormattedNumberInput
                step={1_000_000}
                min={1_000_000}
                value={monthlyLivingCostTargetIdr}
                onChange={(val) => setMonthlyLivingCostTargetIdr(val)}
                className="ui-text-main w-20 bg-transparent font-mono text-xs font-bold focus:outline-none"
                ariaLabel="Monthly Living Cost Target in IDR"
              />
              <span className="ui-text-muted text-[10px]">/bln</span>
            </div>
            <div className="flex flex-wrap gap-1 text-[10px]">
              {[5_000_000, 10_000_000, 15_000_000, 25_000_000].map(
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

            <button
              type="button"
              onClick={() => toggleSectionCollapse('swr')}
              className="flex items-center gap-1 text-[11px] font-medium ui-subtle border ui-border px-2 py-0.5 rounded-lg ui-text-secondary hover:ui-text-main transition ml-1"
              title={collapsedSections.swr ? 'Buka simulasi pensiun' : 'Ciutkan simulasi pensiun'}
            >
              <ChevronDown className={`h-3.5 w-3.5 transition-transform ${collapsedSections.swr ? '-rotate-90' : ''}`} />
              <span>{collapsedSections.swr ? 'Buka' : 'Ciutkan'}</span>
            </button>
          </div>
        </div>

        {collapsedSections.swr ? (
          <div className="py-2.5 flex flex-wrap items-center justify-between gap-3 text-xs font-mono">
            <span className="ui-text-muted">
              Biaya Hidup: <strong className="ui-text-main">{formatIdr(monthlyLivingCostTargetIdr, true)}/bln</strong> • Target Nest Egg 4%: <strong className="text-emerald-600 dark:text-emerald-400">{formatIdr(monthlyLivingCostTargetIdr * 12 * 25, true)}</strong>
            </span>
            <span className="ui-text-secondary">
              Estimasi 4% SWR: <strong className="ui-text-main">{sim.monthsToFinancialFreedomSWR === 0 ? 'Tercapai' : sim.monthsToFinancialFreedomSWR ? `${Math.floor(sim.monthsToFinancialFreedomSWR / 12)} Thn` : '> 30 Thn'}</strong>
            </span>
          </div>
        ) : (
        <>
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
            <div className="ui-text-main mt-1 font-mono text-base font-bold">
              Target Riil:{' '}
              {formatIdr(monthlyLivingCostTargetIdr * 12 * 25, true)}
            </div>
            {annualInflationPercent > 0 && (
              <div className="text-[11px] font-mono text-emerald-600 dark:text-emerald-400 font-semibold">
                Nominal Masa Depan:{' '}
                {formatIdr(
                  sim.requiredNestEggSWRIdr ?? monthlyLivingCostTargetIdr * 12 * 25,
                  true
                )}
              </div>
            )}
            <p className="ui-text-muted mt-0.5 text-[11px]">
              Tarik 4% per tahun (≈ {formatIdr(monthlyLivingCostTargetIdr, true)}/bln). Modal pokok tetap bertahan puluhan tahun menurut Trinity Study.
            </p>
            <div className="mt-3 rounded-lg bg-emerald-500/10 p-2.5">
              <div className="text-[11px] text-emerald-700 dark:text-emerald-300">
                Estimasi Waktu Tercapai:
              </div>
              <div className="font-mono text-base font-bold text-emerald-700 dark:text-emerald-300">
                {sim.monthsToFinancialFreedomSWR === 0
                  ? 'Sudah Tercapai Sekarang'
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
              <Coins className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
            </div>
            {(() => {
              const divRealTarget =
                dividendBreakdown.weightedNetYieldPct > 0
                  ? (monthlyLivingCostTargetIdr * 12) /
                    (dividendBreakdown.weightedNetYieldPct / 100)
                  : 0;
              const divNominalTarget =
                annualInflationPercent > 0 &&
                divRealTarget > 0 &&
                sim.monthsToFinancialFreedomDividends
                  ? divRealTarget *
                    Math.pow(
                      1 + annualInflationPercent / 100,
                      sim.monthsToFinancialFreedomDividends / 12
                    )
                  : divRealTarget;

              return (
                <>
                  <div className="ui-text-main mt-1 font-mono text-base font-bold">
                    Target Riil:{' '}
                    {divRealTarget > 0
                      ? formatIdr(divRealTarget, true)
                      : 'N/A (Yield 0%)'}
                  </div>
                  {annualInflationPercent > 0 && divRealTarget > 0 && (
                    <div className="text-[11px] font-mono text-emerald-600 dark:text-emerald-400 font-semibold">
                      Nominal Masa Depan:{' '}
                      {formatIdr(divNominalTarget, true)}
                    </div>
                  )}
                </>
              );
            })()}
            <p className="ui-text-muted mt-0.5 text-[11px]">
              Biaya hidup ditutup 100% dari kupon/dividen bersih (Yield saat ini {dividendBreakdown.weightedNetYieldPct.toFixed(2)}%) tanpa pernah menjual aset pokok sama sekali.
            </p>
            <div className="mt-3 rounded-lg bg-emerald-500/10 p-2.5">
              <div className="text-[11px] text-emerald-700 dark:text-emerald-300">
                Estimasi Waktu Tercapai:
              </div>
              <div className="font-mono text-base font-bold text-emerald-700 dark:text-emerald-300">
                {sim.monthsToFinancialFreedomDividends === 0
                  ? 'Sudah Tercapai Sekarang'
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
        </>
        )}
      </section>

      {/* FEATURE 3: REVERSE DCA GOAL SOLVER */}
      <section id="roadmap-reverse-dca" className="ui-card rounded-xl p-4 sm:p-5 border border-zinc-500/20">
        <div className="ui-border flex flex-wrap items-center justify-between gap-2.5 border-b border-zinc-500/20 pb-2.5">
          <div className="flex items-center gap-2">
            <Calculator className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
            <h3 className="ui-text-main text-sm font-bold">
              Reverse DCA Goal Solver
            </h3>
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-semibold">
              {reverseDcaTargetYears} Tahun
            </span>
          </div>

          <div className="flex items-center gap-2 text-xs">
            <span className="ui-text-secondary font-medium hidden sm:inline">Target:</span>
            <div className="flex gap-1">
              {[3, 5, 10, 15, 20, 25].map((yr) => (
                <button
                  key={yr}
                  type="button"
                  onClick={() => setReverseDcaTargetYears(yr)}
                  className={`rounded px-2 py-0.5 font-mono text-xs font-semibold transition ${
                    reverseDcaTargetYears === yr
                      ? 'bg-emerald-600 text-white shadow-sm'
                      : 'ui-subtle ui-text-secondary hover:opacity-80'
                  }`}
                >
                  {yr}T
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={() => toggleSectionCollapse('reverseDca')}
              className="flex items-center gap-1 text-[11px] font-medium ui-subtle border ui-border px-2 py-0.5 rounded-lg ui-text-secondary hover:ui-text-main transition ml-1"
              title={collapsedSections.reverseDca ? 'Buka Reverse DCA' : 'Ciutkan Reverse DCA'}
            >
              <ChevronDown className={`h-3.5 w-3.5 transition-transform ${collapsedSections.reverseDca ? '-rotate-90' : ''}`} />
              <span>{collapsedSections.reverseDca ? 'Buka' : 'Ciutkan'}</span>
            </button>
          </div>
        </div>

        {collapsedSections.reverseDca ? (
          <div className="py-2.5 flex flex-wrap items-center justify-between gap-3 text-xs font-mono">
            <span className="ui-text-muted">
              Target: <strong className="ui-text-main">{formatIdr(targetGoalIdr, true)}</strong> dalam <strong className="ui-text-main">{reverseDcaTargetYears} Thn</strong>
            </span>
            <span className="ui-text-secondary">
              DCA Bulanan: <strong className="text-emerald-600 dark:text-emerald-400">{formatIdr(reverseDcaSolution.deterministicMonthlyDcaIdr, true)}</strong> (CAGR {effectiveCompoundingCagr.toFixed(1)}%) | Konservatif 75%: <strong className="text-emerald-600 dark:text-emerald-400">{formatIdr(reverseDcaSolution.monteCarlo75MonthlyDcaIdr, true)}</strong>
            </span>
          </div>
        ) : (
        <>
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          {/* Deterministic compounding solution */}
          <div className="ui-subtle rounded-xl p-4 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between">
                <span className="ui-text-muted text-xs font-semibold uppercase">
                  Estimasi Deterministik (CAGR {effectiveCompoundingCagr.toFixed(1)}%)
                </span>
                <TrendingUp className="h-4 w-4 text-emerald-500" />
              </div>
              <div className="ui-text-main mt-2 font-mono text-xl font-bold text-emerald-600 dark:text-emerald-400">
                {formatIdr(reverseDcaSolution.deterministicMonthlyDcaIdr)} / bln
              </div>
              <p className="ui-text-muted mt-1 text-[11px]">
                Diperlukan menabung {formatIdr(reverseDcaSolution.deterministicMonthlyDcaIdr)} setiap bulan selama {reverseDcaTargetYears} tahun dengan asumsi return stabil dan inflasi {annualInflationPercent}%.
              </p>
            </div>
            <div className="mt-3 pt-2 ui-border border-t flex justify-end">
              <button
                type="button"
                onClick={() => setMonthlySavingsIdr(reverseDcaSolution.deterministicMonthlyDcaIdr)}
                className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-500 transition shadow-sm"
              >
                <CheckCircle2 className="h-3.5 w-3.5" />
                <span>Terapkan DCA Ini ({formatIdr(reverseDcaSolution.deterministicMonthlyDcaIdr, true)})</span>
              </button>
            </div>
          </div>

          {/* Monte Carlo 75% confidence solution */}
          <div className="ui-subtle rounded-xl p-4 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between">
                <span className="ui-text-muted text-xs font-semibold uppercase">
                  Konservatif Monte Carlo (Tingkat Keyakinan 75%)
                </span>
                <ShieldAlert className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
              </div>
              <div className="ui-text-main mt-2 font-mono text-xl font-bold text-emerald-600 dark:text-emerald-400">
                {formatIdr(reverseDcaSolution.monteCarlo75MonthlyDcaIdr)} / bln
              </div>
              <p className="ui-text-muted mt-1 text-[11px]">
                Memperhitungkan volatilitas pasar (75% kemungkinan sukses mencapai atau melampaui {formatIdr(targetGoalIdr, true)} bahkan jika kondisi pasar kurang bersahabat).
              </p>
            </div>
            <div className="mt-3 pt-2 ui-border border-t flex justify-end">
              <button
                type="button"
                onClick={() => setMonthlySavingsIdr(reverseDcaSolution.monteCarlo75MonthlyDcaIdr)}
                className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-500 transition shadow-sm"
              >
                <CheckCircle2 className="h-3.5 w-3.5" />
                <span>Terapkan DCA Konservatif ({formatIdr(reverseDcaSolution.monteCarlo75MonthlyDcaIdr, true)})</span>
              </button>
            </div>
          </div>
        </div>
        </>
        )}
      </section>

      {/* DIVIDEND YIELD & PASSIVE CASHFLOW ESTIMATOR */}
      <section id="roadmap-dividends" className="ui-card rounded-xl p-4 sm:p-5">
        <div className="ui-border flex flex-wrap items-center justify-between gap-2.5 border-b pb-2.5">
          <div className="flex items-center gap-2">
            <Coins className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
            <h3 className="ui-text-main text-sm font-bold">
              Dividen &amp; Arus Kas Pasif
            </h3>
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-semibold">
              Net {dividendBreakdown.weightedNetYieldPct.toFixed(2)}%/thn
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Tax Mode Selector */}
            <div className="ui-subtle flex rounded-lg p-0.5 text-xs">
              <button
                type="button"
                onClick={() => setTaxMode('standard-net')}
                className={`rounded-md px-2 py-0.5 text-[11px] font-medium transition ${
                  taxMode === 'standard-net'
                    ? 'ui-card ui-text-main font-semibold shadow-2xs'
                    : 'ui-text-muted hover:ui-text-main'
                }`}
              >
                Net Pajak
              </button>
              <button
                type="button"
                onClick={() => setTaxMode('idx-tax-exempt-reinvest')}
                className={`rounded-md px-2 py-0.5 text-[11px] font-medium transition ${
                  taxMode === 'idx-tax-exempt-reinvest'
                    ? 'ui-card ui-text-main font-semibold shadow-2xs'
                    : 'ui-text-muted hover:ui-text-main'
                }`}
              >
                Bebas Pajak
              </button>
              <button
                type="button"
                onClick={() => setTaxMode('gross')}
                className={`rounded-md px-2 py-0.5 text-[11px] font-medium transition ${
                  taxMode === 'gross'
                    ? 'ui-card ui-text-main font-semibold shadow-2xs'
                    : 'ui-text-muted hover:ui-text-main'
                }`}
              >
                Gross
              </button>
            </div>

            {/* Reinvest vs Cashout Selector */}
            <div className="ui-subtle flex rounded-lg p-0.5 text-xs">
              <button
                type="button"
                onClick={() => setDividendUsageMode('reinvest-drip')}
                className={`rounded-md px-2 py-0.5 text-[11px] font-medium transition ${
                  dividendUsageMode === 'reinvest-drip'
                    ? 'bg-emerald-600 font-semibold text-white shadow-2xs'
                    : 'ui-text-muted hover:ui-text-main'
                }`}
              >
                DRIP
              </button>
              <button
                type="button"
                onClick={() => setDividendUsageMode('cashout-passive')}
                className={`rounded-md px-2 py-0.5 text-[11px] font-medium transition ${
                  dividendUsageMode === 'cashout-passive'
                    ? 'bg-emerald-600 font-semibold text-white shadow-2xs'
                    : 'ui-text-muted hover:ui-text-main'
                }`}
              >
                Tarik Tunai
              </button>
            </div>

            <button
              type="button"
              onClick={() => toggleSectionCollapse('dividends')}
              className="flex items-center gap-1 text-[11px] font-medium ui-subtle border ui-border px-2 py-0.5 rounded-lg ui-text-secondary hover:ui-text-main transition ml-1"
              title={collapsedSections.dividends ? 'Buka rincian dividen' : 'Ciutkan rincian dividen'}
            >
              <ChevronDown className={`h-3.5 w-3.5 transition-transform ${collapsedSections.dividends ? '-rotate-90' : ''}`} />
              <span>{collapsedSections.dividends ? 'Buka' : 'Ciutkan'}</span>
            </button>
          </div>
        </div>

        {collapsedSections.dividends ? (
          <div className="py-2.5 flex flex-wrap items-center justify-between gap-3 text-xs font-mono">
            <span className="ui-text-muted">
              Net Yield: <strong className="text-emerald-600 dark:text-emerald-400">{dividendBreakdown.weightedNetYieldPct.toFixed(2)}%</strong> • Gross: <strong className="ui-text-main">{dividendBreakdown.weightedGrossYieldPct.toFixed(2)}%</strong>
            </span>
            <span className="ui-text-secondary">
              Pasif Awal: <strong className="ui-text-main">{formatIdr(dividendBreakdown.monthlyPassiveAtInitialIdr)}/bln</strong> → Target: <strong className="text-emerald-600 dark:text-emerald-400">{formatIdr(dividendBreakdown.monthlyPassiveAtGoalIdr)}/bln</strong>
            </span>
          </div>
        ) : (
        <>
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
        {/* Dividend Table Filter Sub-Toolbar */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-b ui-border pb-2.5 text-xs">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="ui-text-muted text-[10px] font-bold uppercase tracking-wider mr-1">
              Filter Dividen:
            </span>
            <div className="ui-subtle inline-flex rounded-lg p-0.5 border text-xs">
              <button
                type="button"
                onClick={() => setDividendFilter('all')}
                className={`rounded-md px-2.5 py-1 font-medium transition ${
                  dividendFilter === 'all'
                    ? 'ui-card ui-text-main font-semibold shadow-2xs'
                    : 'ui-text-muted hover:ui-text-main'
                }`}
              >
                Semua ({dividendCounts.all})
              </button>
              <button
                type="button"
                onClick={() => setDividendFilter('paying')}
                className={`flex items-center gap-1 rounded-md px-2.5 py-1 font-medium transition ${
                  dividendFilter === 'paying'
                    ? 'ui-card text-emerald-600 dark:text-emerald-400 font-bold shadow-2xs'
                    : 'ui-text-muted hover:ui-text-main'
                }`}
                title="Hanya tampilkan instrumen yang memiliki yield dividen / kupon > 0%"
              >
                <Banknote className="h-3 w-3 text-emerald-500" />
                <span>Ada Dividen/Kupon ({dividendCounts.paying})</span>
              </button>
              <button
                type="button"
                onClick={() => setDividendFilter('stocks')}
                className={`rounded-md px-2.5 py-1 font-medium transition ${
                  dividendFilter === 'stocks'
                    ? 'ui-card ui-text-main font-semibold shadow-2xs'
                    : 'ui-text-muted hover:ui-text-main'
                }`}
              >
                Saham &amp; ETF ({dividendCounts.stocks})
              </button>
              <button
                type="button"
                onClick={() => setDividendFilter('bonds')}
                className={`rounded-md px-2.5 py-1 font-medium transition ${
                  dividendFilter === 'bonds'
                    ? 'ui-card ui-text-main font-semibold shadow-2xs'
                    : 'ui-text-muted hover:ui-text-main'
                }`}
              >
                Obligasi &amp; Pasar Uang ({dividendCounts.bonds})
              </button>
            </div>
          </div>

          {dividendFilter !== 'all' && (
            <button
              type="button"
              onClick={() => setDividendFilter('all')}
              className="text-[11px] text-emerald-600 dark:text-emerald-400 hover:underline"
            >
              Tampilkan Semua ({dividendCounts.all} Aset)
            </button>
          )}
        </div>

        <div
          tabIndex={0}
          role="region"
          aria-label="Per-Asset Dividend and Passive Income Table"
          className="ui-border mt-3 overflow-x-auto rounded-lg border"
        >
          <table className="w-full border-separate border-spacing-0 text-left text-xs">
            <caption className="sr-only">Tabel Rincian Dividen dan Passive Income Per-Instrumen Portofolio</caption>
            <thead className="ui-subtle text-[11px] font-semibold uppercase">
              <tr>
                <th scope="col" className="ui-subtle ui-border sticky left-0 z-20 border-b border-r px-3 py-2 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.18)]">
                  Instrumen
                </th>
                <th scope="col" className="ui-border border-b px-3 py-2 text-right">
                  Bobot Target
                </th>
                <th scope="col" className="ui-border border-b px-3 py-2 text-right">
                  Gross Dividend / Kupon (%)
                </th>
                <th scope="col" className="ui-border border-b px-3 py-2 text-right">Pajak</th>
                <th scope="col" className="ui-border border-b px-3 py-2 text-right">
                  Net Yield (%)
                </th>
                <th scope="col" className="ui-border border-b px-3 py-2 text-right">
                  Dividen/Thn (@ {formatIdr(initialCapitalIdr, true)})
                </th>
                <th scope="col" className="ui-border border-b px-3 py-2 text-right">
                  Dividen/Thn (@ {formatIdr(targetGoalIdr, true)})
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredDividendItems.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-xs ui-text-muted">
                    Tidak ada instrumen yang sesuai dengan filter "{dividendFilter}".
                    <button
                      type="button"
                      onClick={() => setDividendFilter('all')}
                      className="ml-2 font-semibold text-emerald-600 dark:text-emerald-400 hover:underline"
                    >
                      Tampilkan Semua
                    </button>
                  </td>
                </tr>
              ) : (
                filteredDividendItems.map((row) => (
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
              )))}
            </tbody>
          </table>
        </div>
        </>
        )}
      </section>

      {/* 5-YEAR HISTORICAL BACKTEST: REBALANCING FREQUENCY SIMULATOR (16:08) */}
      <section id="tour-backtest-frequency" className="ui-card rounded-xl p-4 sm:p-5">
        <div className="ui-border flex flex-wrap items-center justify-between gap-2.5 border-b pb-2.5">
          <div className="flex items-center gap-2">
            <RefreshCw className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
            <h3 className="ui-text-main text-sm font-bold">
              Backtest 5 Tahun: Frekuensi Rebalancing
            </h3>
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-semibold">
              Kuartalan: {formatIdr(freqBacktest.finalQuarterlyIdr)}
            </span>
          </div>

          <button
            type="button"
            onClick={() => toggleSectionCollapse('backtest')}
            className="flex items-center gap-1 text-[11px] font-medium ui-subtle border ui-border px-2 py-0.5 rounded-lg ui-text-secondary hover:ui-text-main transition"
            title={collapsedSections.backtest ? 'Buka backtest' : 'Ciutkan backtest'}
          >
            <ChevronDown className={`h-3.5 w-3.5 transition-transform ${collapsedSections.backtest ? '-rotate-90' : ''}`} />
            <span>{collapsedSections.backtest ? 'Buka' : 'Ciutkan'}</span>
          </button>
        </div>

        {collapsedSections.backtest ? (
          <div className="py-2.5 flex flex-wrap items-center justify-between gap-3 text-xs font-mono">
            <span className="ui-text-muted">
              Kuartalan (3M): <strong className="text-emerald-600 dark:text-emerald-400">{formatIdr(freqBacktest.finalQuarterlyIdr)}</strong> (DD -{solvedMetrics.maxDrawdown}%)
            </span>
            <span className="ui-text-secondary">
              Bulanan: <strong className="ui-text-main">{formatIdr(freqBacktest.finalMonthlyIdr)}</strong> | Tahunan: <strong className="ui-text-main">{formatIdr(freqBacktest.finalAnnualIdr)}</strong> | Buy&amp;Hold: <strong className="text-rose-500">{formatIdr(freqBacktest.finalBuyHoldIdr)}</strong>
            </span>
          </div>
        ) : (
        <>
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
                stroke="#21543D"
                strokeWidth={2.5}
                dot={false}
              />
              <Line
                type="monotone"
                dataKey="Bulanan"
                name="Rebalance Bulanan"
                stroke="#25586B"
                strokeWidth={1.8}
                dot={false}
              />
              <Line
                type="monotone"
                dataKey="Tahunan1Y"
                name="Rebalance Tahunan"
                stroke="#8F580A"
                strokeWidth={1.8}
                dot={false}
              />
              <Line
                type="monotone"
                dataKey="BuyAndHold"
                name="Buy & Hold (Tanpa Rebalance)"
                stroke="#9E472A"
                strokeDasharray="4 4"
                strokeWidth={1.8}
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
        </>
        )}
      </section>
    </div>
  );
};
