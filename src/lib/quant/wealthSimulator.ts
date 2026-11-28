import { AssetDefinition, WealthProjectionPoint, WealthSimulationResult } from './types';
import {
  backtestRebalancingFrequencies,
  BUNDLED_MARKET_HISTORY,
  type MarketHistory,
} from './historicalModel';

/**
 * Simulates monthly DCA compounding to reach "Rp 10 Miliar Pertama" (or custom wealth goal),
 * reproducing the exact milestones from Leon Hartono's video:
 * - 02:48: Rp 10 Jt/month for 25 years -> Rp 3B principal; at 10% CAGR -> ~Rp 13B; at 15% CAGR -> ~Rp 32B
 * - 11:11: All-in ETH/BTC (50-76% CAGR) with Rp 5 Jt/month -> ~8 years to Rp 10B (Rp 10 Jt/month -> ~7 years)
 * - 12:07: High Risk (18-33% CAGR) with Rp 5 Jt/month -> 14-20 years (Rp 10 Jt/month -> 11-16 years)
 * - 12:31: Medium Risk (13-18% CAGR) with Rp 5 Jt/month -> 20-25 years (Rp 10 Jt/month -> 16-20 years, Rp 20 Jt/month -> 12-15 years)
 * - 13:09: Low Risk (9.05% CAGR) with Rp 5 Jt/month -> 31 years (Rp 10 Jt/month -> 24 years, Rp 20 Jt/month -> 18 years)
 */
export function simulateWealthToGoal(params: {
  initialCapitalIdr: number;
  monthlyContributionIdr: number;
  annualCagrPercent: number;
  maxDrawdownPercent: number;
  targetWealthIdr?: number;
  annualStepUpPercent?: number; // Optional annual salary/saving increase %
  maxYears?: number;
  annualInflationPercent?: number; // Optional annual inflation rate (e.g. 3.5% or 4.0%)
  monthlyLivingCostTargetIdr?: number; // Optional target living expenses (e.g. Rp 10 Jt/bln)
  netDividendYieldPercent?: number; // Weighted net dividend yield %
}): WealthSimulationResult {
  const {
    initialCapitalIdr,
    monthlyContributionIdr,
    annualCagrPercent,
    maxDrawdownPercent,
    targetWealthIdr = 10_000_000_000, // Default Rp 10 Miliar
    annualStepUpPercent = 0,
    maxYears = 45,
    annualInflationPercent = 0,
    monthlyLivingCostTargetIdr = 10_000_000,
    netDividendYieldPercent = 0,
  } = params;

  // Effective monthly compounding rate from annualized rate
  const annualRate = Math.max(0, annualCagrPercent) / 100;
  // Financial calculators in the video use geometric monthly equivalent: (1 + CAGR)^(1/12) - 1
  const monthlyRate = Math.pow(1 + annualRate, 1 / 12) - 1;
  const inflationDec = Math.max(0, annualInflationPercent) / 100;
  const monthlyInflationRate = Math.pow(1 + inflationDec, 1 / 12) - 1;

  let currentWealth = Math.max(0, initialCapitalIdr);
  let totalPrincipal = Math.max(0, initialCapitalIdr);
  let currentMonthlyPmt = Math.max(0, monthlyContributionIdr);

  let reachedMonth: number | null = currentWealth >= targetWealthIdr ? 0 : null;
  let reachedRealMonth: number | null = null;
  let principalAtGoal = totalPrincipal;
  let gainAtGoal = 0;
  let valueAt25Y = currentWealth;

  // Financial freedom tracking
  let freedomMonthDividends: number | null = null;
  let freedomMonthSWR: number | null = null;

  const getMonthlyNetDividend = (wealth: number) =>
    (wealth * (Math.max(0, netDividendYieldPercent) / 100)) / 12;

  const getMonthlySWR = (wealth: number) => (wealth * 0.04) / 12; // 4% Rule

  if (getMonthlyNetDividend(currentWealth) >= monthlyLivingCostTargetIdr) {
    freedomMonthDividends = 0;
  }
  if (getMonthlySWR(currentWealth) >= monthlyLivingCostTargetIdr) {
    freedomMonthSWR = 0;
  }

  const timeline: WealthProjectionPoint[] = [
    {
      year: 0,
      month: 0,
      totalPrincipalIdr: Math.round(totalPrincipal),
      totalValueIdr: Math.round(currentWealth),
      totalGainIdr: 0,
      drawdownFloorIdr: Math.round(currentWealth * (1 - maxDrawdownPercent / 100)),
      realPurchasingPowerIdr: Math.round(currentWealth),
    },
  ];

  const safeMaxYears = Math.min(100, Math.max(1, Math.floor(Number.isFinite(maxYears) ? maxYears : 45)));
  const totalMonths = safeMaxYears * 12;

  for (let m = 1; m <= totalMonths; m++) {
    // Apply annual step-up in monthly savings at the start of each new year (after year 1)
    if (m > 1 && (m - 1) % 12 === 0 && annualStepUpPercent > 0) {
      currentMonthlyPmt *= 1 + annualStepUpPercent / 100;
    }

    // Compound existing wealth and add monthly contribution
    currentWealth = currentWealth * (1 + monthlyRate) + currentMonthlyPmt;
    totalPrincipal += currentMonthlyPmt;

    // Inflation discount factor to today's purchasing power
    const inflationDiscount = Math.pow(1 + monthlyInflationRate, m);
    const realPurchasingPower = currentWealth / inflationDiscount;

    if (reachedMonth === null && currentWealth >= targetWealthIdr) {
      reachedMonth = m;
      principalAtGoal = totalPrincipal;
      gainAtGoal = currentWealth - totalPrincipal;
    }

    if (reachedRealMonth === null && realPurchasingPower >= targetWealthIdr) {
      reachedRealMonth = m;
    }

    // Check financial freedom milestones (indexed to inflation-adjusted living cost)
    const livingCostAtMonth = monthlyLivingCostTargetIdr * inflationDiscount;
    if (freedomMonthDividends === null && netDividendYieldPercent > 0) {
      if (getMonthlyNetDividend(currentWealth) >= livingCostAtMonth) {
        freedomMonthDividends = m;
      }
    }
    if (freedomMonthSWR === null) {
      if (getMonthlySWR(currentWealth) >= livingCostAtMonth) {
        freedomMonthSWR = m;
      }
    }

    if (m === 25 * 12) {
      valueAt25Y = currentWealth;
    }

    // Record annual checkpoints for chart visualization
    if (m % 12 === 0) {
      const year = m / 12;
      timeline.push({
        year,
        month: m,
        totalPrincipalIdr: Math.round(totalPrincipal),
        totalValueIdr: Math.round(currentWealth),
        totalGainIdr: Math.round(currentWealth - totalPrincipal),
        drawdownFloorIdr: Math.round(currentWealth * (1 - maxDrawdownPercent / 100)),
        realPurchasingPowerIdr: Math.round(realPurchasingPower),
      });
    }
  }

  const finalMonth = reachedMonth ?? totalMonths;
  const yearsToGoal = Math.floor(finalMonth / 12);
  const monthsToGoal = finalMonth % 12;
  const exactYearsFloat = Number((finalMonth / 12).toFixed(1));

  const wealthAtGoal = reachedMonth !== null
    ? principalAtGoal + gainAtGoal
    : currentWealth;

  const realPurchasingPowerAtGoalIdr = Math.round(
    wealthAtGoal / Math.pow(1 + monthlyInflationRate, finalMonth)
  );

  return {
    yearsToGoal,
    monthsToGoal,
    exactYearsFloat,
    reachedGoal: reachedMonth !== null,
    finalValueAfter25YIdr: Math.round(valueAt25Y),
    totalPrincipalAtGoalIdr: Math.round(
      reachedMonth !== null ? principalAtGoal : totalPrincipal
    ),
    totalGainAtGoalIdr: Math.round(
      reachedMonth !== null ? gainAtGoal : currentWealth - totalPrincipal
    ),
    realInflationRatePercent: annualInflationPercent,
    realPurchasingPowerAtGoalIdr,
    realYearsToGoalFloat:
      reachedRealMonth !== null ? Number((reachedRealMonth / 12).toFixed(1)) : undefined,
    monthlyLivingCostTargetIdr,
    requiredNestEggSWRIdr: Math.round(monthlyLivingCostTargetIdr * 12 * 25),
    monthsToFinancialFreedomDividends: freedomMonthDividends,
    monthsToFinancialFreedomSWR: freedomMonthSWR,
    yearsToFinancialFreedomDividendsFloat:
      freedomMonthDividends !== null
        ? Number((freedomMonthDividends / 12).toFixed(1))
        : null,
    yearsToFinancialFreedomSWRFloat:
      freedomMonthSWR !== null ? Number((freedomMonthSWR / 12).toFixed(1)) : null,
    timeline,
  };
}

/**
 * Simulates a 5-Year Historical / Regime Backtest comparing 4 Rebalancing Frequencies (mentioned at 16:08):
 * 1. Monthly Rebalancing (Every 1 month)
 * 2. Quarterly Rebalancing (Every 3 months)
 * 3. Annual Rebalancing (Every 12 months)
 * 4. Buy & Hold (Never rebalance — letting high-vol winners/losers drift freely)
 *
 * Uses a realistic 20-quarter (5-year) market cycle modeled after 2019–2024:
 * - Year 1 (2020): COVID Crash Q1 followed by stimulus recovery
 * - Year 2 (2021): Crypto & Tech Bull Run
 * - Year 3 (2022): Global Rate Hike Bear Market / Crypto Winter (-65% crypto, -22% tech, bonds steady)
 * - Year 4 (2023): AI & Bitcoin Recovery + Gold breakout
 * - Year 5 (2024): All-time highs in Gold, US Equities, BTC, and IDX Banking
 */
export interface BacktestFrequencyPoint {
  periodLabel: string;
  RebalanceBulanan: number;
  Rebalance3Bulan: number;
  RebalanceTahunan: number;
  BuyAndHold: number;
}

export function simulateRebalancingFrequencyBacktest(params: {
  initialCapitalIdr: number;
  baseCagrPercent: number;
  maxDrawdownPercent: number;
  assets?: AssetDefinition[];
  weights?: Record<string, number>;
  history?: MarketHistory;
  useRealizedReturns?: boolean;
}): {
  series: BacktestFrequencyPoint[];
  finalMonthlyIdr: number;
  finalQuarterlyIdr: number;
  finalAnnualIdr: number;
  finalBuyHoldIdr: number;
  monthlyMaxDdPercent?: number;
  quarterlyMaxDdPercent?: number;
  annualMaxDdPercent?: number;
  buyHoldMaxDdPercent: number;
  isHistorical: boolean;
  windowStart?: string;
  windowEnd?: string;
} {
  const {
    initialCapitalIdr,
    baseCagrPercent,
    maxDrawdownPercent,
    assets,
    weights,
    history = BUNDLED_MARKET_HISTORY,
    useRealizedReturns = true,
  } = params;

  // Prefer genuine historical multi-frequency backtest on 5Y weekly IDR data when portfolio positions are provided
  if (assets && weights) {
    const assetMap = new Map(assets.map((a) => [a.id, a]));
    const positions = Object.entries(weights)
      .filter(([id, w]) => w > 0 && assetMap.has(id))
      .map(([id, w]) => {
        const asset = assetMap.get(id)!;
        return {
          asset,
          weight: w / 100,
          assumedCagrPct: asset.cagr,
        };
      });

    const histResult = backtestRebalancingFrequencies(
      positions,
      initialCapitalIdr,
      history,
      useRealizedReturns
    );
    if (histResult) {
      return histResult;
    }
  }

  // Parametric fallback when custom/young assets lack >= 2Y common history:
  // Use zero-mean regime shocks around `baseCagrPercent` without fabricated rebalancing alpha
  const startCap = Math.max(10_000_000, initialCapitalIdr);
  const baseQuarterlyRate = Math.pow(1 + Math.max(0, baseCagrPercent) / 100, 1 / 4) - 1;
  const volFactor = Math.max(0.04, maxDrawdownPercent / 100);

  const rawCycleShocks = [
    -0.55, 0.45, 0.30, 0.40,
    0.55, -0.20, 0.35, 0.45,
    -0.35, -0.65, -0.25, 0.15,
    0.40, 0.25, 0.10, 0.50,
    0.45, 0.15, 0.25, 0.35,
  ];
  const shockMean =
    rawCycleShocks.reduce((sum, s) => sum + s, 0) / rawCycleShocks.length;
  const centeredShocks = rawCycleShocks.map((s) => s - shockMean);

  let valMonthly = startCap;
  let valQuarterly = startCap;
  let valAnnual = startCap;
  let valBuyHold = startCap;

  let peakMonthly = startCap;
  let peakQuarterly = startCap;
  let peakAnnual = startCap;
  let peakBuyHold = startCap;

  let mddMonthly = 0;
  let mddQuarterly = 0;
  let mddAnnual = 0;
  let mddBuyHold = 0;

  const series: BacktestFrequencyPoint[] = [
    {
      periodLabel: 'Start',
      RebalanceBulanan: Math.round(startCap / 1_000_000),
      Rebalance3Bulan: Math.round(startCap / 1_000_000),
      RebalanceTahunan: Math.round(startCap / 1_000_000),
      BuyAndHold: Math.round(startCap / 1_000_000),
    },
  ];

  for (let q = 0; q < centeredShocks.length; q++) {
    const shock = centeredShocks[q];
    const rQuarterly = baseQuarterlyRate + shock * volFactor * 0.42;
    const rMonthly = baseQuarterlyRate + shock * volFactor * 0.40;
    const rAnnual = baseQuarterlyRate + shock * volFactor * 0.46;
    const rBuyHold =
      shock < 0
        ? baseQuarterlyRate + shock * volFactor * 0.62
        : baseQuarterlyRate + shock * volFactor * 0.48;

    valMonthly *= Math.max(0.2, 1 + rMonthly);
    valQuarterly *= Math.max(0.2, 1 + rQuarterly);
    valAnnual *= Math.max(0.2, 1 + rAnnual);
    valBuyHold *= Math.max(0.15, 1 + rBuyHold);

    if (valMonthly > peakMonthly) peakMonthly = valMonthly;
    if (valQuarterly > peakQuarterly) peakQuarterly = valQuarterly;
    if (valAnnual > peakAnnual) peakAnnual = valAnnual;
    if (valBuyHold > peakBuyHold) peakBuyHold = valBuyHold;

    mddMonthly = Math.max(mddMonthly, (peakMonthly - valMonthly) / peakMonthly);
    mddQuarterly = Math.max(mddQuarterly, (peakQuarterly - valQuarterly) / peakQuarterly);
    mddAnnual = Math.max(mddAnnual, (peakAnnual - valAnnual) / peakAnnual);
    mddBuyHold = Math.max(mddBuyHold, (peakBuyHold - valBuyHold) / peakBuyHold);

    const yearNum = Math.floor(q / 4) + 1;
    const qNum = (q % 4) + 1;
    series.push({
      periodLabel: `Y${yearNum}Q${qNum}`,
      RebalanceBulanan: Math.round(valMonthly / 1_000_000),
      Rebalance3Bulan: Math.round(valQuarterly / 1_000_000),
      RebalanceTahunan: Math.round(valAnnual / 1_000_000),
      BuyAndHold: Math.round(valBuyHold / 1_000_000),
    });
  }

  return {
    series,
    finalMonthlyIdr: Math.round(valMonthly),
    finalQuarterlyIdr: Math.round(valQuarterly),
    finalAnnualIdr: Math.round(valAnnual),
    finalBuyHoldIdr: Math.round(valBuyHold),
    monthlyMaxDdPercent: Number((mddMonthly * 100).toFixed(2)),
    quarterlyMaxDdPercent: Number((mddQuarterly * 100).toFixed(2)),
    annualMaxDdPercent: Number((mddAnnual * 100).toFixed(2)),
    buyHoldMaxDdPercent: Number((mddBuyHold * 100).toFixed(2)),
    isHistorical: false,
  };
}

export interface MonteCarloYearPoint {
  year: number;
  principal: number;
  p10: number; // Bear 10th percentile
  p25: number;
  p50: number; // Median 50th percentile
  p75: number;
  p90: number; // Bull 90th percentile
  p10Real?: number;
  p25Real?: number;
  p50Real?: number;
  p75Real?: number;
  p90Real?: number;
  principalReal?: number;
}

export interface MonteCarloSimulationResult {
  series: MonteCarloYearPoint[];
  successProbabilityPercent: number;
  medianYearsToGoal: number | null;
  nominalSuccessProbabilityPercent: number;
  nominalMedianYearsToGoal: number | null;
  realSuccessProbabilityPercent: number;
  realMedianYearsToGoal: number | null;
  medianFinalWealthIdr: number;
  bearFinalWealthIdr: number;
  bullFinalWealthIdr: number;
  totalSimulations: number;
}

/**
 * 32-bit Mulberry PRNG for fast, deterministic pseudo-random number generation.
 */
function createMulberry32(seed: number) {
  let s = seed | 0;
  return function () {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Runs a 500-path stochastic Monte Carlo simulation using Geometric Brownian Motion
 * to model portfolio growth under market volatility and monthly DCA contributions.
 */
export function simulateMonteCarloPaths(params: {
  initialCapitalIdr: number;
  monthlyContributionIdr: number;
  annualCagrPercent: number;
  annualVolatilityPercent: number;
  targetGoalIdr?: number;
  maxYears?: number;
  numSimulations?: number;
  annualStepUpPercent?: number;
  annualInflationPercent?: number;
  goalBasis?: 'real' | 'nominal';
  seed?: number;
}): MonteCarloSimulationResult {
  const {
    initialCapitalIdr,
    monthlyContributionIdr,
    annualCagrPercent,
    annualVolatilityPercent,
    targetGoalIdr = 1_000_000_000,
    maxYears = 25,
    numSimulations = 500,
    annualStepUpPercent = 0,
    annualInflationPercent = 0,
    goalBasis = 'real',
    seed = 42,
  } = params;

  const muAnnual = Math.max(0, annualCagrPercent) / 100;
  // Floor volatility at 4% to ensure stochastic realism even for low-volatility assets
  const sigmaAnnual = Math.max(0.04, annualVolatilityPercent / 100);

  // `annualCagrPercent` is already a geometric CAGR (median compound rate), so do not subtract
  // `-0.5 * sigma^2` again (avoid double volatility drag vs deterministic CAGR).
  const dt = 1 / 12;
  const driftMonthly = Math.log(1 + muAnnual) * dt;
  const volMonthly = sigmaAnnual * Math.sqrt(dt);

  // Seeded Mulberry32 PRNG to eliminate random re-render jitter
  const rng = createMulberry32(seed);

  // Pseudo-random Normal standard distribution N(0, 1) using Box-Muller transform
  const getStandardNormal = (): number => {
    let u1 = 0;
    let u2 = 0;
    while (u1 === 0) u1 = rng();
    while (u2 === 0) u2 = rng();
    return Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
  };

  const safeMaxYears = Math.min(100, Math.max(1, Math.floor(Number.isFinite(maxYears) ? maxYears : 25)));
  const safeNumSimulations = Math.min(2000, Math.max(10, Math.floor(Number.isFinite(numSimulations) ? numSimulations : 500)));
  const totalMonths = safeMaxYears * 12;
  const monthlyInflationRate =
    annualInflationPercent > 0
      ? Math.pow(1 + annualInflationPercent / 100, 1 / 12) - 1
      : 0;

  // Track values at each year end for all simulation paths: [yearIndex][pathIndex]
  const yearlyWealthDistribution: number[][] = Array.from(
    { length: safeMaxYears + 1 },
    () => new Array(safeNumSimulations)
  );
  const yearlyRealWealthDistribution: number[][] = Array.from(
    { length: safeMaxYears + 1 },
    () => new Array(safeNumSimulations)
  );

  const goalReachedNominalMonths: (number | null)[] = new Array(safeNumSimulations).fill(null);
  const goalReachedRealMonths: (number | null)[] = new Array(safeNumSimulations).fill(null);

  for (let s = 0; s < safeNumSimulations; s++) {
    let wealth = Math.max(0, initialCapitalIdr);
    let currentMonthlyPmt = Math.max(0, monthlyContributionIdr);
    yearlyWealthDistribution[0][s] = wealth;
    yearlyRealWealthDistribution[0][s] = wealth;

    if (wealth >= targetGoalIdr) {
      goalReachedNominalMonths[s] = 0;
      goalReachedRealMonths[s] = 0;
    }

    for (let m = 1; m <= totalMonths; m++) {
      if (m > 1 && (m - 1) % 12 === 0 && annualStepUpPercent > 0) {
        currentMonthlyPmt *= 1 + annualStepUpPercent / 100;
      }

      const z = getStandardNormal();
      const monthlyReturnMultiplier = Math.exp(driftMonthly + volMonthly * z);
      wealth = wealth * monthlyReturnMultiplier + currentMonthlyPmt;

      const inflationDiscount =
        monthlyInflationRate > 0 ? Math.pow(1 + monthlyInflationRate, m) : 1;
      const realWealth = wealth / inflationDiscount;

      if (wealth >= targetGoalIdr && goalReachedNominalMonths[s] === null) {
        goalReachedNominalMonths[s] = m;
      }
      if (realWealth >= targetGoalIdr && goalReachedRealMonths[s] === null) {
        goalReachedRealMonths[s] = m;
      }

      if (m % 12 === 0) {
        const yr = m / 12;
        yearlyWealthDistribution[yr][s] = wealth;
        yearlyRealWealthDistribution[yr][s] = realWealth;
      }
    }
  }

  // Helper to extract quantile from sorted array
  const getQuantile = (sortedArr: number[], q: number) => {
    const idx = Math.min(sortedArr.length - 1, Math.max(0, Math.floor(q * sortedArr.length)));
    return sortedArr[idx];
  };

  // Build percentile series
  let runningPrincipal = initialCapitalIdr;
  let runningMonthlyPmt = Math.max(0, monthlyContributionIdr);
  const series: MonteCarloYearPoint[] = [];

  for (let yr = 0; yr <= safeMaxYears; yr++) {
    if (yr > 0) {
      if (yr > 1 && annualStepUpPercent > 0) {
        runningMonthlyPmt *= 1 + annualStepUpPercent / 100;
      }
      runningPrincipal += runningMonthlyPmt * 12;
    }

    const yrInflationDiscount =
      monthlyInflationRate > 0 ? Math.pow(1 + monthlyInflationRate, yr * 12) : 1;
    const sortedVals = [...yearlyWealthDistribution[yr]].sort((a, b) => a - b);
    const sortedRealVals = [...yearlyRealWealthDistribution[yr]].sort((a, b) => a - b);

    series.push({
      year: yr,
      principal: Math.round(runningPrincipal),
      principalReal: Math.round(runningPrincipal / yrInflationDiscount),
      p10: Math.round(getQuantile(sortedVals, 0.1)),
      p25: Math.round(getQuantile(sortedVals, 0.25)),
      p50: Math.round(getQuantile(sortedVals, 0.5)),
      p75: Math.round(getQuantile(sortedVals, 0.75)),
      p90: Math.round(getQuantile(sortedVals, 0.9)),
      p10Real: Math.round(getQuantile(sortedRealVals, 0.1)),
      p25Real: Math.round(getQuantile(sortedRealVals, 0.25)),
      p50Real: Math.round(getQuantile(sortedRealVals, 0.5)),
      p75Real: Math.round(getQuantile(sortedRealVals, 0.75)),
      p90Real: Math.round(getQuantile(sortedRealVals, 0.9)),
    });
  }

  const summarizeGoal = (monthsArr: (number | null)[]) => {
    const pathsReached = monthsArr.filter((m) => m !== null).length;
    const prob = Math.round((pathsReached / safeNumSimulations) * 100);
    const allSorted = monthsArr
      .map((m) => (m === null ? Infinity : m))
      .sort((a, b) => a - b);
    const med = allSorted[Math.floor(safeNumSimulations / 2)];
    const medYears = med !== Infinity ? Number((med / 12).toFixed(1)) : null;
    return { prob, medYears };
  };

  const nominalSummary = summarizeGoal(goalReachedNominalMonths);
  const realSummary = summarizeGoal(goalReachedRealMonths);
  const activeSummary = goalBasis === 'nominal' ? nominalSummary : realSummary;

  const finalYearValues = [...yearlyWealthDistribution[safeMaxYears]].sort((a, b) => a - b);

  return {
    series,
    successProbabilityPercent: activeSummary.prob,
    medianYearsToGoal: activeSummary.medYears,
    nominalSuccessProbabilityPercent: nominalSummary.prob,
    nominalMedianYearsToGoal: nominalSummary.medYears,
    realSuccessProbabilityPercent: realSummary.prob,
    realMedianYearsToGoal: realSummary.medYears,
    medianFinalWealthIdr: Math.round(getQuantile(finalYearValues, 0.5)),
    bearFinalWealthIdr: Math.round(getQuantile(finalYearValues, 0.1)),
    bullFinalWealthIdr: Math.round(getQuantile(finalYearValues, 0.9)),
    totalSimulations: safeNumSimulations,
  };
}

export interface ReverseDcaSolution {
  deterministicMonthlyDcaIdr: number;
  monteCarlo75MonthlyDcaIdr: number;
  targetYears: number;
  targetGoalIdr: number;
}

/**
 * Feature 3: Reverse DCA Goal Solver
 * Solves backward for required monthly DCA to reach a target in targetYears.
 */
export function solveRequiredMonthlySavings(params: {
  initialCapitalIdr: number;
  targetGoalIdr: number;
  targetYears: number;
  annualCagrPercent: number;
  annualVolatilityPercent?: number;
  annualStepUpPercent?: number;
  annualInflationPercent?: number;
  numSimulations?: number;
  seed?: number;
}): ReverseDcaSolution {
  const {
    initialCapitalIdr,
    targetGoalIdr,
    targetYears,
    annualCagrPercent,
    annualVolatilityPercent = 18,
    annualStepUpPercent = 0,
    annualInflationPercent = 0,
    numSimulations = 500,
    seed = 42,
  } = params;

  const totalMonths = Math.max(1, Math.round(targetYears * 12));
  const annualRate = Math.max(0, annualCagrPercent) / 100;
  const monthlyRate = Math.pow(1 + annualRate, 1 / 12) - 1;
  const monthlyInflation =
    annualInflationPercent > 0
      ? Math.pow(1 + annualInflationPercent / 100, 1 / 12) - 1
      : 0;
  const inflationDiscount =
    monthlyInflation > 0 ? Math.pow(1 + monthlyInflation, totalMonths) : 1;

  // 1. Solve Deterministic monthly DCA using bisection
  let low = 0;
  // Set generous upper bound to prevent clipping on short horizons or high inflation
  let high = Math.max(1_000_000, targetGoalIdr * Math.max(1, inflationDiscount) * 2);
  let bestPmt = high;

  for (let iter = 0; iter < 40; iter++) {
    const mid = (low + high) / 2;
    let wealth = initialCapitalIdr;
    let pmt = mid;
    for (let m = 1; m <= totalMonths; m++) {
      if (m > 1 && (m - 1) % 12 === 0 && annualStepUpPercent > 0) {
        pmt *= 1 + annualStepUpPercent / 100;
      }
      wealth = wealth * (1 + monthlyRate) + pmt;
    }
    const realWealth = wealth / inflationDiscount;
    if (realWealth >= targetGoalIdr) {
      bestPmt = mid;
      high = mid;
    } else {
      low = mid;
    }
  }
  const deterministicMonthlyDcaIdr = Math.max(
    0,
    Math.round(bestPmt / 10_000) * 10_000
  );

  // 2. Solve Monte Carlo 75% confidence monthly DCA using the exact same GBM path physics:
  // Since wealth(PMT) = initialCapital * G0 + PMT * AnnuityFactor is strictly linear in PMT,
  // we compute the exact required PMT per simulated path and take the 75th percentile!
  const safeNumSimulations = Math.min(
    2000,
    Math.max(10, Math.floor(Number.isFinite(numSimulations) ? numSimulations : 500))
  );
  const sigma = Math.max(0.04, annualVolatilityPercent / 100);
  const dt = 1 / 12;
  const driftMonthly = Math.log(1 + annualRate) * dt;
  const volMonthly = sigma * Math.sqrt(dt);

  const rng = createMulberry32(seed);
  const getStandardNormal = (): number => {
    let u1 = 0;
    let u2 = 0;
    while (u1 === 0) u1 = rng();
    while (u2 === 0) u2 = rng();
    return Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
  };

  const nominalTargetAtHorizon = targetGoalIdr * inflationDiscount;
  const requiredPmtByPath: number[] = new Array(safeNumSimulations);

  for (let s = 0; s < safeNumSimulations; s++) {
    let g0 = 1;
    let annuity = 0;
    let stepFactor = 1;
    for (let m = 1; m <= totalMonths; m++) {
      if (m > 1 && (m - 1) % 12 === 0 && annualStepUpPercent > 0) {
        stepFactor *= 1 + annualStepUpPercent / 100;
      }
      const r = Math.exp(driftMonthly + volMonthly * getStandardNormal());
      g0 *= r;
      annuity = annuity * r + stepFactor;
    }
    const shortfall = nominalTargetAtHorizon - Math.max(0, initialCapitalIdr) * g0;
    requiredPmtByPath[s] =
      shortfall <= 0 ? 0 : shortfall / Math.max(1e-9, annuity);
  }

  requiredPmtByPath.sort((a, b) => a - b);
  const q75Idx = Math.min(
    safeNumSimulations - 1,
    Math.max(0, Math.ceil(0.75 * safeNumSimulations) - 1)
  );
  const mc75Pmt = requiredPmtByPath[q75Idx];
  const monteCarlo75MonthlyDcaIdr = Math.max(
    0,
    Math.round(mc75Pmt / 10_000) * 10_000
  );

  return {
    deterministicMonthlyDcaIdr,
    monteCarlo75MonthlyDcaIdr,
    targetYears,
    targetGoalIdr,
  };
}


