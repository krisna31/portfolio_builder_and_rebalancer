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
