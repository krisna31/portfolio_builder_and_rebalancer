import { describe, it, expect } from 'vitest';
import { CORE_AND_EXPANDED_ASSETS } from '../../../data/presets';
import {
  applyAssumptionPreset,
  backtestRebalancedPortfolio,
  BUNDLED_MARKET_HISTORY,
  historicalCurrentDrawdownFromPeakPct,
} from '../historicalModel';
import {
  simulateMonteCarloPaths,
  simulateRebalancingFrequencyBacktest,
  solveRequiredMonthlySavings,
} from '../wealthSimulator';
import { calculateValuationScore } from '../smartDcaEngine';
import { calculateRebalancePlan } from '../rebalancerEngine';

describe('Audit Calculation & Business Flow Regression Fixes', () => {
  it('keeps historical maxDrawdownPct strictly invariant across assumedCagrPct changes', () => {
    const eth = CORE_AND_EXPANDED_ASSETS.find((a) => a.id === 'ETH')!;
    const optimistic = backtestRebalancedPortfolio(
      [{ asset: eth, weight: 1, assumedCagrPct: 76.55 }],
      BUNDLED_MARKET_HISTORY
    );
    const neutral = backtestRebalancedPortfolio(
      [{ asset: eth, weight: 1, assumedCagrPct: 0 }],
      BUNDLED_MARKET_HISTORY
    );
    const negative = backtestRebalancedPortfolio(
      [{ asset: eth, weight: 1, assumedCagrPct: -16.45 }],
      BUNDLED_MARKET_HISTORY
    );

    expect(optimistic).not.toBeNull();
    expect(neutral).not.toBeNull();
    expect(negative).not.toBeNull();
    expect(optimistic!.maxDrawdownPct).toBeCloseTo(neutral!.maxDrawdownPct, 6);
    expect(neutral!.maxDrawdownPct).toBeCloseTo(negative!.maxDrawdownPct, 6);
    expect(optimistic!.maxDrawdownPct).toBeGreaterThan(70);
    expect(optimistic!.cagrPct).toBeCloseTo(76.55, 1);
  });

  it('applies conservative-forward, realized-5y, and video-baseline assumption presets cleanly', () => {
    const conservative = applyAssumptionPreset(
      CORE_AND_EXPANDED_ASSETS,
      'conservative-forward',
      { baseAssets: CORE_AND_EXPANDED_ASSETS, history: BUNDLED_MARKET_HISTORY }
    );
    const btcCons = conservative.find((a) => a.id === 'BTC')!;
    const spyCons = conservative.find((a) => a.id === 'SPY')!;
    expect(btcCons.cagr).toBe(18);
    expect(spyCons.cagr).toBe(10);

    const realized = applyAssumptionPreset(
      CORE_AND_EXPANDED_ASSETS,
      'realized-5y',
      {
        baseAssets: CORE_AND_EXPANDED_ASSETS,
        snapshotMetrics: {
          BTC: { cagr5y: 1.44, maxDrawdown5y: 71.54, volatility5y: 49.46 },
        },
        history: BUNDLED_MARKET_HISTORY,
      }
    );
    const btcReal = realized.find((a) => a.id === 'BTC')!;
    expect(btcReal.cagr).toBe(1.44);
    expect(btcReal.maxDrawdown).toBe(71.54);

    const video = applyAssumptionPreset(realized, 'video-baseline', {
      baseAssets: CORE_AND_EXPANDED_ASSETS,
    });
    expect(video.find((a) => a.id === 'BTC')!.cagr).toBe(49.39);
    expect(video.find((a) => a.id === 'ETH')!.cagr).toBe(76.55);
  });

  it('runs genuine 5Y historical rebalancing frequency backtest and removes fake drift from parametric fallback', () => {
    const weights = { RDPT: 32, BBCA: 12, GLD: 10, SPY: 14, QQQ: 11, BTC: 18, ETH: 3 };
    const realFreq = simulateRebalancingFrequencyBacktest({
      initialCapitalIdr: 100_000_000,
      baseCagrPercent: 15,
      maxDrawdownPercent: 20,
      assets: CORE_AND_EXPANDED_ASSETS,
      weights,
    });
    expect(realFreq.isHistorical).toBe(true);
    expect(realFreq.windowStart).toBeTruthy();
    expect(realFreq.windowEnd).toBeTruthy();

    // Parametric fallback with 0% CAGR must not manufacture ~6%/yr fake return
    const zeroFallback = simulateRebalancingFrequencyBacktest({
      initialCapitalIdr: 100_000_000,
      baseCagrPercent: 0,
      maxDrawdownPercent: 20,
    });
    expect(zeroFallback.isHistorical).toBe(false);
    expect(zeroFallback.finalMonthlyIdr).toBeLessThan(105_000_000);
    expect(zeroFallback.finalQuarterlyIdr).toBeLessThan(105_000_000);
  });

  it('aligns Monte Carlo goalBasis (nominal vs real) and solves Reverse DCA MC 75% consistently', () => {
    const mc = simulateMonteCarloPaths({
      initialCapitalIdr: 100_000_000,
      monthlyContributionIdr: 5_000_000,
      annualCagrPercent: 12,
      annualVolatilityPercent: 18,
      targetGoalIdr: 1_500_000_000,
      maxYears: 15,
      annualInflationPercent: 4,
      goalBasis: 'nominal',
    });
    expect(mc.successProbabilityPercent).toBe(mc.nominalSuccessProbabilityPercent);
    expect(mc.nominalSuccessProbabilityPercent).toBeGreaterThanOrEqual(
      mc.realSuccessProbabilityPercent
    );

    const rev = solveRequiredMonthlySavings({
      initialCapitalIdr: 0,
      targetGoalIdr: 10_000_000_000,
      targetYears: 20,
      annualCagrPercent: 15,
      annualVolatilityPercent: 20,
    });
    // Horizon-consistent 75% confidence should be ~12-16 jt/mo, NOT ~38 jt/mo from 1Y haircut
    expect(rev.monteCarlo75MonthlyDcaIdr).toBeGreaterThan(rev.deterministicMonthlyDcaIdr);
    expect(rev.monteCarlo75MonthlyDcaIdr).toBeLessThan(22_000_000);

    const verifyMc = simulateMonteCarloPaths({
      initialCapitalIdr: 0,
      monthlyContributionIdr: rev.monteCarlo75MonthlyDcaIdr,
      annualCagrPercent: 15,
      annualVolatilityPercent: 20,
      targetGoalIdr: 10_000_000_000,
      maxYears: 20,
      numSimulations: 500,
    });
    expect(verifyMc.successProbabilityPercent).toBeGreaterThanOrEqual(70);
    expect(verifyMc.successProbabilityPercent).toBeLessThanOrEqual(85);
  });

  it('derives Smart DCA BTC peak drawdown dynamically from bundled 5Y history instead of stale $73,750 ATH', () => {
    const btc = CORE_AND_EXPANDED_ASSETS.find((a) => a.id === 'BTC')!;
    const histDd = historicalCurrentDrawdownFromPeakPct('BTC');
    expect(histDd).not.toBeNull();
    const breakdown = calculateValuationScore(btc, undefined, undefined, 61537);
    expect(breakdown.metrics[0].value).toBe(`-${histDd!.toFixed(1)}%`);
  });

  it('computes nominal-mode unrealized P&L using pre-shock unit price when shockPercent is active', () => {
    const bbca = CORE_AND_EXPANDED_ASSETS.find((a) => a.id === 'BBCA')!;
    const rdpt = CORE_AND_EXPANDED_ASSETS.find((a) => a.id === 'RDPT')!;

    const basePlan = calculateRebalancePlan({
      assets: [bbca, rdpt],
      targetWeights: { BBCA: 50, RDPT: 50 },
      holdings: {
        BBCA: {
          assetId: 'BBCA',
          currentValueIdr: 10_250_000,
          units: 1000,
          currentPrice: 10250,
          avgBuyPrice: 8000,
          shockPercent: 0,
        },
        RDPT: {
          assetId: 'RDPT',
          currentValueIdr: 10_000_000,
          units: 10_000_000,
          currentPrice: 1,
          shockPercent: 0,
        },
      },
      inputMode: 'nominal',
      usdIdrRate: 16000,
      cashInjectionIdr: 0,
      rebalanceMode: 'sell-and-buy',
      driftThresholdAbsolutePercent: 3,
    });

    const shockedPlan = calculateRebalancePlan({
      assets: [bbca, rdpt],
      targetWeights: { BBCA: 50, RDPT: 50 },
      holdings: {
        BBCA: {
          assetId: 'BBCA',
          currentValueIdr: 10_250_000,
          units: 1000,
          currentPrice: 10250,
          avgBuyPrice: 8000,
          shockPercent: -50,
        },
        RDPT: {
          assetId: 'RDPT',
          currentValueIdr: 10_000_000,
          units: 10_000_000,
          currentPrice: 1,
          shockPercent: 0,
        },
      },
      inputMode: 'nominal',
      usdIdrRate: 16000,
      cashInjectionIdr: 0,
      rebalanceMode: 'sell-and-buy',
      driftThresholdAbsolutePercent: 3,
    });

    const basePnl = basePlan.items.find((i) => i.assetId === 'BBCA')!.unrealizedGainIdr;
    const shockedPnl = shockedPlan.items.find((i) => i.assetId === 'BBCA')!.unrealizedGainIdr;
    expect(basePnl).toBe(2_250_000);
    expect(shockedPnl).toBe(2_250_000);
  });
});
