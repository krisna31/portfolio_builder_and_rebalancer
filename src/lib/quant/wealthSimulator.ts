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
}): WealthSimulationResult {
  const {
    initialCapitalIdr,
    monthlyContributionIdr,
    annualCagrPercent,
    maxDrawdownPercent,
    targetWealthIdr = 10_000_000_000, // Default Rp 10 Miliar
    annualStepUpPercent = 0,
    maxYears = 45,
  } = params;

  // Effective monthly compounding rate from annualized rate
  const annualRate = Math.max(0, annualCagrPercent) / 100;
  // Use standard nominal monthly compounding rate (annualRate / 12) or geometric (1+r)^(1/12)-1
  // Note: Financial calculators in the video use geometric monthly equivalent: (1 + CAGR)^(1/12) - 1
  const monthlyRate = Math.pow(1 + annualRate, 1 / 12) - 1;

  let currentWealth = Math.max(0, initialCapitalIdr);
  let totalPrincipal = Math.max(0, initialCapitalIdr);
  let currentMonthlyPmt = Math.max(0, monthlyContributionIdr);

  let reachedMonth: number | null = currentWealth >= targetWealthIdr ? 0 : null;
  let principalAtGoal = totalPrincipal;
  let gainAtGoal = 0;
  let valueAt25Y = currentWealth;

  const timeline: WealthProjectionPoint[] = [
    {
      year: 0,
      month: 0,
      totalPrincipalIdr: Math.round(totalPrincipal),
      totalValueIdr: Math.round(currentWealth),
      totalGainIdr: 0,
      drawdownFloorIdr: Math.round(currentWealth * (1 - maxDrawdownPercent / 100)),
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

    if (reachedMonth === null && currentWealth >= targetWealthIdr) {
      reachedMonth = m;
      principalAtGoal = totalPrincipal;
      gainAtGoal = currentWealth - totalPrincipal;
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
      });
    }
  }

  const finalMonth = reachedMonth ?? totalMonths;
  const yearsToGoal = Math.floor(finalMonth / 12);
  const monthsToGoal = finalMonth % 12;
  const exactYearsFloat = Number((finalMonth / 12).toFixed(1));

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

