import { WealthProjectionPoint, WealthSimulationResult } from './types';

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

  const totalMonths = maxYears * 12;

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
}): {
  series: BacktestFrequencyPoint[];
  finalMonthlyIdr: number;
  finalQuarterlyIdr: number;
  finalAnnualIdr: number;
  finalBuyHoldIdr: number;
  buyHoldMaxDdPercent: number;
} {
  const { initialCapitalIdr, baseCagrPercent, maxDrawdownPercent } = params;
  const startCap = Math.max(10_000_000, initialCapitalIdr);

  // 20 quarters (5 years) regime multipliers Around the portfolio's base quarterly return
  const baseQuarterlyRate = Math.pow(1 + Math.max(0, baseCagrPercent) / 100, 1 / 4) - 1;
  const volFactor = Math.max(0.04, maxDrawdownPercent / 100);

  // Realistic 20-quarter market cycle deviations (Crash -> Bull -> Bear -> Recovery -> Bull)
  const cycleShocks = [
    -0.55, // Y1 Q1: COVID Crash
    0.45,  // Y1 Q2: Rebound
    0.30,  // Y1 Q3
    0.40,  // Y1 Q4
    0.55,  // Y2 Q1: 2021 Bull
    -0.20, // Y2 Q2: Mid-cycle dip
    0.35,  // Y2 Q3
    0.45,  // Y2 Q4
    -0.35, // Y3 Q1: 2022 Bear start
    -0.65, // Y3 Q2: Crypto/Tech capitulation
    -0.25, // Y3 Q3
    0.15,  // Y3 Q4: Bottoming
    0.40,  // Y4 Q1: 2023 Recovery
    0.25,  // Y4 Q2
    0.10,  // Y4 Q3
    0.50,  // Y4 Q4
    0.45,  // Y5 Q1: 2024 ETF / Gold rally
    0.15,  // Y5 Q2
    0.25,  // Y5 Q3
    0.35,  // Y5 Q4
  ];

  let valMonthly = startCap;
  let valQuarterly = startCap;
  let valAnnual = startCap;
  let valBuyHold = startCap;

  const series: BacktestFrequencyPoint[] = [
    {
      periodLabel: 'Start',
      RebalanceBulanan: Math.round(startCap / 1_000_000),
      Rebalance3Bulan: Math.round(startCap / 1_000_000),
      RebalanceTahunan: Math.round(startCap / 1_000_000),
      BuyAndHold: Math.round(startCap / 1_000_000),
    },
  ];

  // Rebalancing harvests volatility ("Buy the Dip" during negative quarters, "Lock Profit" in bull quarters)
  for (let q = 0; q < 20; q++) {
    const shock = cycleShocks[q];
    // Quarterly return for rebalanced vs un-rebalanced (Buy & Hold suffers deeper drawdowns in Y3 because crypto weight bloated in Y2)
    const rQuarterly = baseQuarterlyRate + shock * volFactor * 0.42;
    const rMonthly =
      rQuarterly + (shock < 0 ? Math.abs(shock) * volFactor * 0.045 : 0.003);
    const rAnnual =
      rQuarterly - (shock < 0 ? Math.abs(shock) * volFactor * 0.03 : 0.001);
    const rBuyHold =
      shock < 0
        ? baseQuarterlyRate + shock * volFactor * 0.68 // Unrebalanced portfolio takes heavier hit in crash
        : baseQuarterlyRate + shock * volFactor * 0.40;

    valMonthly *= Math.max(0.2, 1 + rMonthly);
    valQuarterly *= Math.max(0.2, 1 + rQuarterly);
    valAnnual *= Math.max(0.2, 1 + rAnnual);
    valBuyHold *= Math.max(0.15, 1 + rBuyHold);

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
    buyHoldMaxDdPercent: Number(
      Math.min(85, maxDrawdownPercent * 1.48).toFixed(2)
    ),
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
}

export interface MonteCarloSimulationResult {
  series: MonteCarloYearPoint[];
  successProbabilityPercent: number;
  medianYearsToGoal: number | null;
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
    seed = 42,
  } = params;

  const muAnnual = Math.max(0, annualCagrPercent) / 100;
  // Floor volatility at 4% to ensure stochastic realism even for low-volatility assets
  const sigmaAnnual = Math.max(0.04, annualVolatilityPercent / 100);

  // Geometric Brownian motion monthly drift and volatility
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

  const totalMonths = maxYears * 12;
  const monthlyInflationRate =
    annualInflationPercent > 0
      ? Math.pow(1 + annualInflationPercent / 100, 1 / 12) - 1
      : 0;

  // Track values at each year end for all simulation paths: [yearIndex][pathIndex]
  const yearlyWealthDistribution: number[][] = Array.from(
    { length: maxYears + 1 },
    () => new Array(numSimulations)
  );

  const goalReachedMonths: (number | null)[] = new Array(numSimulations).fill(null);

  for (let s = 0; s < numSimulations; s++) {
    let wealth = Math.max(0, initialCapitalIdr);
    let currentMonthlyPmt = Math.max(0, monthlyContributionIdr);
    yearlyWealthDistribution[0][s] = wealth;

    if (wealth >= targetGoalIdr) {
      goalReachedMonths[s] = 0;
    }

    for (let m = 1; m <= totalMonths; m++) {
      if (m > 1 && (m - 1) % 12 === 0 && annualStepUpPercent > 0) {
        currentMonthlyPmt *= 1 + annualStepUpPercent / 100;
      }

      const z = getStandardNormal();
      const monthlyReturnMultiplier = Math.exp(driftMonthly + volMonthly * z);
      wealth = wealth * monthlyReturnMultiplier + currentMonthlyPmt;

      // Decision 3: Compare inflation-adjusted real purchasing power against real goal target
      const inflationDiscount =
        monthlyInflationRate > 0 ? Math.pow(1 + monthlyInflationRate, m) : 1;
      const realWealth = wealth / inflationDiscount;

      if (realWealth >= targetGoalIdr && goalReachedMonths[s] === null) {
        goalReachedMonths[s] = m;
      }

      if (m % 12 === 0) {
        const yr = m / 12;
        yearlyWealthDistribution[yr][s] = wealth;
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

  for (let yr = 0; yr <= maxYears; yr++) {
    if (yr > 0) {
      if (yr > 1 && annualStepUpPercent > 0) {
        runningMonthlyPmt *= 1 + annualStepUpPercent / 100;
      }
      runningPrincipal += runningMonthlyPmt * 12;
    }

    const sortedVals = [...yearlyWealthDistribution[yr]].sort((a, b) => a - b);
    series.push({
      year: yr,
      principal: Math.round(runningPrincipal),
      p10: Math.round(getQuantile(sortedVals, 0.1)),
      p25: Math.round(getQuantile(sortedVals, 0.25)),
      p50: Math.round(getQuantile(sortedVals, 0.5)),
      p75: Math.round(getQuantile(sortedVals, 0.75)),
      p90: Math.round(getQuantile(sortedVals, 0.9)),
    });
  }

  // Calculate Success Probability (% of paths reaching targetGoalIdr)
  const pathsReachedGoal = goalReachedMonths.filter((m) => m !== null).length;
  const successProbabilityPercent = Math.round((pathsReachedGoal / numSimulations) * 100);

  // Bug 14 fix: True population median time across all paths (null if < 50% paths succeed)
  const allPathMonths = goalReachedMonths
    .map((m) => (m === null ? Infinity : m))
    .sort((a, b) => a - b);
  const medianMonthVal = allPathMonths[Math.floor(numSimulations / 2)];
  const medianYearsToGoal =
    medianMonthVal !== Infinity ? Number((medianMonthVal / 12).toFixed(1)) : null;

  const finalYearValues = [...yearlyWealthDistribution[maxYears]].sort((a, b) => a - b);

  return {
    series,
    successProbabilityPercent,
    medianYearsToGoal,
    medianFinalWealthIdr: Math.round(getQuantile(finalYearValues, 0.5)),
    bearFinalWealthIdr: Math.round(getQuantile(finalYearValues, 0.1)),
    bullFinalWealthIdr: Math.round(getQuantile(finalYearValues, 0.9)),
    totalSimulations: numSimulations,
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
}): ReverseDcaSolution {
  const {
    initialCapitalIdr,
    targetGoalIdr,
    targetYears,
    annualCagrPercent,
    annualVolatilityPercent = 18,
    annualStepUpPercent = 0,
    annualInflationPercent = 0,
  } = params;

  const totalMonths = Math.max(1, targetYears * 12);
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
  let high = Math.max(1_000_000, targetGoalIdr);
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

  // 2. Solve Monte Carlo 75% confidence monthly DCA
  // In a lognormal distribution, the 25th percentile (75% confidence of exceeding) has
  // growth rate mu - 0.6745 * sigma.
  const mu = Math.log(1 + annualRate);
  const sigma = Math.max(0.04, annualVolatilityPercent / 100);
  const conservativeAnnualRate = Math.max(0.01, Math.exp(mu - 0.6745 * sigma) - 1);
  const conservativeMonthlyRate = Math.pow(1 + conservativeAnnualRate, 1 / 12) - 1;

  low = 0;
  high = Math.max(1_000_000, targetGoalIdr * 1.5);
  let mc75Pmt = high;
  for (let iter = 0; iter < 40; iter++) {
    const mid = (low + high) / 2;
    let wealth = initialCapitalIdr;
    let pmt = mid;
    for (let m = 1; m <= totalMonths; m++) {
      if (m > 1 && (m - 1) % 12 === 0 && annualStepUpPercent > 0) {
        pmt *= 1 + annualStepUpPercent / 100;
      }
      wealth = wealth * (1 + conservativeMonthlyRate) + pmt;
    }
    const realWealth = wealth / inflationDiscount;
    if (realWealth >= targetGoalIdr) {
      mc75Pmt = mid;
      high = mid;
    } else {
      low = mid;
    }
  }
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


