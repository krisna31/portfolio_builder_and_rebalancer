import { describe, expect, it } from 'vitest';
import { CORE_AND_EXPANDED_ASSETS, VIDEO_PORTFOLIO_PRESETS, VIDEO_1B_REBALANCE_EXAMPLE } from '../../../data/presets';
import { solveRiskBudgetingWeights, evaluatePortfolioMetrics } from '../riskParitySolver';
import { calculateRebalancePlan } from '../rebalancerEngine';
import { simulateWealthToGoal } from '../wealthSimulator';
import { HoldingEntry } from '../types';

describe('Risk Parity & Risk Budgeting Quant Engine', () => {
  const core7Assets = CORE_AND_EXPANDED_ASSETS.filter(
    (a) => a.isCoreBenchmark && a.id !== 'RDPU'
  );

  it('contains all 15 Optimal Portfolios from Leon Hartono video', () => {
    const optimal15 = VIDEO_PORTFOLIO_PRESETS.filter((p) => p.isOptimal15);
    expect(optimal15).toHaveLength(15);
    expect(optimal15[0].name).toBe('All In ETH');
    expect(optimal15[0].cagr).toBe(76.55);
    expect(optimal15[0].maxDrawdown).toBe(76.15);
    expect(optimal15[8].name).toBe('Risk Parity RDPT BBCA GLD SPY QQQ BTC ETH');
    expect(optimal15[8].weights).toEqual({
      RDPU: 0,
      RDPT: 38,
      BBCA: 14,
      GLD: 12,
      SPY: 16,
      QQQ: 13,
      BTC: 3,
      ETH: 3,
    });
  });

  it('solves Risk Parity across the 7 core assets matching the video weights (38/14/12/16/13/3/3)', () => {
    const weights = solveRiskBudgetingWeights(core7Assets, 'risk-parity');
    expect(weights.RDPT).toBeGreaterThanOrEqual(37);
    expect(weights.RDPT).toBeLessThanOrEqual(39);
    expect(weights.BBCA).toBe(14);
    expect(weights.GLD).toBe(12);
    expect(weights.SPY).toBe(16);
    expect(weights.QQQ).toBe(13);
    expect(weights.BTC).toBe(3);
    expect(weights.ETH).toBe(3);
  });

  it('solves Risk Budgeting BTC 90% and ETH 70% matching video proportions', () => {
    const btc90 = solveRiskBudgetingWeights(core7Assets, 'risk-budgeting', 'BTC', 90);
    // In video: RDPT ~32%, BTC ~18%, ETH ~2-3%
    expect(btc90.BTC).toBeGreaterThanOrEqual(16);
    expect(btc90.BTC).toBeLessThanOrEqual(20);
    expect(btc90.RDPT).toBeGreaterThanOrEqual(30);
    expect(btc90.RDPT).toBeLessThanOrEqual(34);

    const eth70 = solveRiskBudgetingWeights(core7Assets, 'risk-budgeting', 'ETH', 70);
    // In video: RDPT 35%, ETH 10%
    expect(eth70.ETH).toBeGreaterThanOrEqual(9);
    expect(eth70.ETH).toBeLessThanOrEqual(12);
    expect(eth70.RDPT).toBeGreaterThanOrEqual(33);
  });

  it('evaluates Pareto Dominance accurately (e.g., All-In QQQ is dominated by Risk Budgeting BTC/ETH 70%)', () => {
    const allInQqqWeights = { RDPU: 0, RDPT: 0, BBCA: 0, GLD: 0, SPY: 0, QQQ: 100, BTC: 0, ETH: 0 };
    const metrics = evaluatePortfolioMetrics(
      allInQqqWeights,
      CORE_AND_EXPANDED_ASSETS,
      VIDEO_PORTFOLIO_PRESETS
    );
    expect(metrics.isParetoDominated).toBe(true);
    expect(metrics.dominatingPresets.length).toBeGreaterThan(0);
  });
});

describe('Portfolio Rebalancer & Crash Stress-Test Engine', () => {
  const btc90Preset = VIDEO_PORTFOLIO_PRESETS.find((p) => p.id === 'opt-4-rb-btc-90')!;

  it('executes Video Scenario 1 (15:20): BTC & ETH 3x (+200%), BBCA -10% -> Sells BTC/ETH to buy RDPT/BBCA', () => {
    const holdings: Record<string, HoldingEntry> = {};
    for (const asset of CORE_AND_EXPANDED_ASSETS.filter((a) => a.isCoreBenchmark)) {
      holdings[asset.id] = {
        assetId: asset.id,
        currentValueIdr: VIDEO_1B_REBALANCE_EXAMPLE[asset.id] ?? 0,
        units: 0,
        currentPrice: asset.defaultPrice,
        shockPercent:
          asset.id === 'BTC' || asset.id === 'ETH'
            ? 200 // 3x bull run
            : asset.id === 'BBCA'
              ? -10
              : 0,
      };
    }

    const result = calculateRebalancePlan({
      assets: CORE_AND_EXPANDED_ASSETS.filter((a) => a.isCoreBenchmark),
      targetWeights: btc90Preset.weights,
      holdings,
      inputMode: 'nominal',
      usdIdrRate: 15500,
      cashInjectionIdr: 0,
      rebalanceMode: 'sell-and-buy',
      driftThresholdAbsolutePercent: 3,
    });

    // Initial portfolio was Rp 1 Billion; after BTC (180M -> 540M) & ETH (30M -> 90M) & BBCA (120M -> 108M),
    // total portfolio grows to Rp 1,408,000,000
    expect(result.initialTotalIdr).toBe(1_000_000_000);
    expect(result.postShockTotalIdr).toBe(1_408_000_000);

    const btcItem = result.items.find((i) => i.assetId === 'BTC')!;
    const rdptItem = result.items.find((i) => i.assetId === 'RDPT')!;

    expect(btcItem.action).toBe('SELL');
    expect(btcItem.tradeAmountIdr).toBeLessThan(0); // Take profit on BTC
    expect(rdptItem.action).toBe('BUY');
    expect(rdptItem.tradeAmountIdr).toBeGreaterThan(0); // Lock gains into RDPT
  });

  it('executes Video Scenario 2 (15:46): BTC & ETH Crash -50% -> Sells defensive assets to Buy the Dip on BTC/ETH', () => {
    const holdings: Record<string, HoldingEntry> = {};
    for (const asset of CORE_AND_EXPANDED_ASSETS.filter((a) => a.isCoreBenchmark)) {
      holdings[asset.id] = {
        assetId: asset.id,
        currentValueIdr: VIDEO_1B_REBALANCE_EXAMPLE[asset.id] ?? 0,
        units: 0,
        currentPrice: asset.defaultPrice,
        shockPercent: asset.id === 'BTC' || asset.id === 'ETH' ? -50 : 0,
      };
    }

    const result = calculateRebalancePlan({
      assets: CORE_AND_EXPANDED_ASSETS.filter((a) => a.isCoreBenchmark),
      targetWeights: btc90Preset.weights,
      holdings,
      inputMode: 'nominal',
      usdIdrRate: 15500,
      cashInjectionIdr: 0,
      rebalanceMode: 'sell-and-buy',
      driftThresholdAbsolutePercent: 3,
    });

    const btcItem = result.items.find((i) => i.assetId === 'BTC')!;
    const rdptItem = result.items.find((i) => i.assetId === 'RDPT')!;

    expect(btcItem.action).toBe('BUY');
    expect(btcItem.tradeAmountIdr).toBeGreaterThan(0); // Buy the dip on BTC
    expect(rdptItem.action).toBe('SELL');
  });

  it('supports Buy-Only DCA mode (no selling when injecting monthly cash)', () => {
    const holdings: Record<string, HoldingEntry> = {};
    for (const asset of CORE_AND_EXPANDED_ASSETS.filter((a) => a.isCoreBenchmark)) {
      holdings[asset.id] = {
        assetId: asset.id,
        currentValueIdr: VIDEO_1B_REBALANCE_EXAMPLE[asset.id] ?? 0,
        units: 0,
        currentPrice: asset.defaultPrice,
        shockPercent: asset.id === 'BTC' ? -30 : 0,
      };
    }

    const result = calculateRebalancePlan({
      assets: CORE_AND_EXPANDED_ASSETS.filter((a) => a.isCoreBenchmark),
      targetWeights: btc90Preset.weights,
      holdings,
      inputMode: 'nominal',
      usdIdrRate: 15500,
      cashInjectionIdr: 20_000_000,
      rebalanceMode: 'buy-only-dca',
      driftThresholdAbsolutePercent: 2,
    });

    expect(result.totalSellIdr).toBe(0);
    expect(result.totalBuyIdr).toBeCloseTo(20_000_000, -2);
  });
});

describe('Rp10 Miliar Pertama Wealth Simulator', () => {
  it('reproduces video timelines (e.g., High Risk ~25% CAGR with Rp 5M/mo reaches Rp 10B in ~16 years)', () => {
    const sim = simulateWealthToGoal({
      initialCapitalIdr: 0,
      monthlyContributionIdr: 5_000_000,
      annualCagrPercent: 25.36, // Risk budgeting ETH 70%
      maxDrawdownPercent: 13.89,
      targetWealthIdr: 10_000_000_000,
    });
    expect(sim.reachedGoal).toBe(true);
    expect(sim.yearsToGoal).toBeGreaterThanOrEqual(14);
    expect(sim.yearsToGoal).toBeLessThanOrEqual(20);
  });
});
