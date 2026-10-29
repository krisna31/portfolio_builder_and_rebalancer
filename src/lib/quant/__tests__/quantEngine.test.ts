import { describe, expect, it } from 'vitest';
import { CORE_AND_EXPANDED_ASSETS, VIDEO_PORTFOLIO_PRESETS, VIDEO_1B_REBALANCE_EXAMPLE } from '../../../data/presets';
import {
  solveRiskBudgetingWeights,
  evaluatePortfolioMetrics,
  buildDynamicPresetsForSlotMap,
} from '../riskParitySolver';
import { calculateRebalancePlan, generateCrashBuyingLadder } from '../rebalancerEngine';
import {
  simulateWealthToGoal,
  simulateRebalancingFrequencyBacktest,
  simulateMonteCarloPaths,
} from '../wealthSimulator';
import { generatePortfolioRecommendations } from '../portfolioRecommender';
import { HoldingEntry, QuantPortoBackupPayload } from '../types';

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
      RDPT: 39,
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

  it('recomputes all 15 table presets dynamically when swapping BBCA -> PTBA', () => {
    const slotMap = {
      RDPU: 'RDPU',
      RDPT: 'RDPT',
      BBCA: 'PTBA',
      GLD: 'GLD',
      SPY: 'SPY',
      QQQ: 'QQQ',
      BTC: 'BTC',
      ETH: 'ETH',
    };
    const dynamic = buildDynamicPresetsForSlotMap(
      VIDEO_PORTFOLIO_PRESETS,
      slotMap,
      CORE_AND_EXPANDED_ASSETS
    );
    const rp7 = dynamic.find((p) => p.id === 'opt-9-rp-all-7')!;
    expect(rp7.name).toContain('PTBA');
    // Since PTBA has higher riskScale (3.6) than BBCA (2.714), its optimal Risk Parity weight is slightly lower (~11% vs 14%)
    expect(rp7.weights.PTBA).toBeGreaterThanOrEqual(10);
    expect(rp7.weights.PTBA).toBeLessThanOrEqual(13);
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

  it('supports Selective Profit Trim mode: only sells significant overweight winners while keeping minor drift assets on HOLD', () => {
    // Total portfolio = 100M.
    // BBCA: 10M (target 25% = 25M -> deficit 15M)
    // RDPT: 49.93M (target 35% = 35M -> major surplus ~15M)
    // SPY: 20.05M (target 20% = 20M -> minor surplus 50k, drift +0.05%)
    // BTC: 20.02M (target 20% = 20M -> minor surplus 20k, drift +0.02%)
    const holdings: Record<string, HoldingEntry> = {
      BBCA: { assetId: 'BBCA', currentValueIdr: 10_000_000, units: 10, currentPrice: 10_000, shockPercent: 0 },
      RDPT: { assetId: 'RDPT', currentValueIdr: 49_930_000, units: 50, currentPrice: 1_000_000, shockPercent: 0 },
      SPY: { assetId: 'SPY', currentValueIdr: 20_050_000, units: 2, currentPrice: 500, shockPercent: 0 },
      BTC: { assetId: 'BTC', currentValueIdr: 20_020_000, units: 0.02, currentPrice: 65000, shockPercent: 0 },
    };

    const targetWeights = {
      BBCA: 25,
      RDPT: 35,
      SPY: 20,
      BTC: 20,
    };

    const result = calculateRebalancePlan({
      assets: CORE_AND_EXPANDED_ASSETS.filter((a) => ['BBCA', 'RDPT', 'SPY', 'BTC'].includes(a.id)),
      targetWeights,
      holdings,
      inputMode: 'nominal',
      usdIdrRate: 16000,
      cashInjectionIdr: 0,
      rebalanceMode: 'selective-profit-trim',
      driftThresholdAbsolutePercent: 3,
      filterDustTrades: true,
    });

    const bbca = result.items.find((i) => i.assetId === 'BBCA')!;
    const rdpt = result.items.find((i) => i.assetId === 'RDPT')!;
    const spy = result.items.find((i) => i.assetId === 'SPY')!;
    const btc = result.items.find((i) => i.assetId === 'BTC')!;

    // BBCA is severely underweight -> must BUY
    expect(bbca.action).toBe('BUY');
    // RDPT is heavily overweight -> must SELL
    expect(rdpt.action).toBe('SELL');
    // SPY and BTC have negligible drift (< 1%) -> must remain HOLD without micro selling
    expect(spy.action).toBe('HOLD');
    expect(btc.action).toBe('HOLD');
  });

  it('supports Defensive Buffer First mode: funds equity/crypto dip from RDPT without selling growth assets', () => {
    // Total portfolio = 100M.
    // BBCA: 10M (target 25% = 25M -> deficit 15M)
    // RDPT: 40M (target 25% = 25M -> surplus 15M)
    // SPY: 25M (target 25% = 25M -> 0 drift)
    // BTC: 25M (target 25% = 25M -> 0 drift)
    const holdings: Record<string, HoldingEntry> = {
      BBCA: { assetId: 'BBCA', currentValueIdr: 10_000_000, units: 10, currentPrice: 10_000, shockPercent: 0 },
      RDPT: { assetId: 'RDPT', currentValueIdr: 40_000_000, units: 40, currentPrice: 1_000_000, shockPercent: 0 },
      SPY: { assetId: 'SPY', currentValueIdr: 25_000_000, units: 2, currentPrice: 500, shockPercent: 0 },
      BTC: { assetId: 'BTC', currentValueIdr: 25_000_000, units: 0.02, currentPrice: 65000, shockPercent: 0 },
    };

    const targetWeights = {
      BBCA: 25,
      RDPT: 25,
      SPY: 25,
      BTC: 25,
    };

    const result = calculateRebalancePlan({
      assets: CORE_AND_EXPANDED_ASSETS.filter((a) => ['BBCA', 'RDPT', 'SPY', 'BTC'].includes(a.id)),
      targetWeights,
      holdings,
      inputMode: 'nominal',
      usdIdrRate: 16000,
      cashInjectionIdr: 0,
      rebalanceMode: 'trim-defensive-first',
      driftThresholdAbsolutePercent: 3,
    });

    const bbca = result.items.find((i) => i.assetId === 'BBCA')!;
    const rdpt = result.items.find((i) => i.assetId === 'RDPT')!;
    const spy = result.items.find((i) => i.assetId === 'SPY')!;
    const btc = result.items.find((i) => i.assetId === 'BTC')!;

    expect(bbca.action).toBe('BUY');
    expect(rdpt.action).toBe('SELL');
    // SPY and BTC are growth assets -> protected from selling
    expect(spy.action).toBe('HOLD');
    expect(btc.action).toBe('HOLD');
  });

  it('filters dust trades below Rp 25.000 into clean HOLDs', () => {
    const holdings: Record<string, HoldingEntry> = {
      ETH: { assetId: 'ETH', currentValueIdr: 10_015_000, units: 0.1, currentPrice: 3000, shockPercent: 0 },
      RDPT: { assetId: 'RDPT', currentValueIdr: 90_000_000, units: 90, currentPrice: 1_000_000, shockPercent: 0 },
    };

    const targetWeights = {
      ETH: 10,
      RDPT: 90,
    };

    const result = calculateRebalancePlan({
      assets: CORE_AND_EXPANDED_ASSETS.filter((a) => ['ETH', 'RDPT'].includes(a.id)),
      targetWeights,
      holdings,
      inputMode: 'nominal',
      usdIdrRate: 16000,
      cashInjectionIdr: 0,
      rebalanceMode: 'sell-and-buy',
      driftThresholdAbsolutePercent: 1,
      filterDustTrades: true,
      dustTradeThresholdIdr: 25_000,
    });

    const eth = result.items.find((i) => i.assetId === 'ETH')!;
    // Without dust filter, ETH would sell Rp 15.000. With dust filter, it becomes HOLD.
    expect(eth.action).toBe('HOLD');
    expect(eth.isDustFiltered).toBe(true);
    expect(result.suppressedDustTradesCount).toBeGreaterThanOrEqual(1);
  });

  it('accurately recalculates rebalance BUY targets when asset price drops manually (Price Drop Simulator)', () => {
    // BBCA base price Rp 10.000. User holds 1000 shares (10 lots) = Rp 10.000.000.
    // RDPT holds Rp 90.000.000.
    // Target: BBCA 20%, RDPT 80% (Total portfolio was Rp 100M).
    // Now simulate BBCA price crashing -50% to Rp 5.000.
    // New holding value of BBCA is 1000 shares * Rp 5.000 = Rp 5.000.000.
    // Total portfolio shrinks to Rp 95.000.000.
    // BBCA target 20% of 95M = Rp 19.000.000.
    // BBCA needs BUY of Rp 14.000.000 (19M - 5M).
    // At Rp 5.000/share (Rp 500.000/lot), BUY order must equal exactly 28 Lots!
    const holdings: Record<string, HoldingEntry> = {
      BBCA: {
        assetId: 'BBCA',
        currentValueIdr: 5_000_000,
        units: 1000,
        currentPrice: 5_000,
        shockPercent: 0,
      },
      RDPT: {
        assetId: 'RDPT',
        currentValueIdr: 90_000_000,
        units: 90,
        currentPrice: 1_000_000,
        shockPercent: 0,
      },
    };

    const targetWeights = {
      BBCA: 20,
      RDPT: 80,
    };

    const result = calculateRebalancePlan({
      assets: CORE_AND_EXPANDED_ASSETS.filter((a) => ['BBCA', 'RDPT'].includes(a.id)),
      targetWeights,
      holdings,
      inputMode: 'nominal',
      usdIdrRate: 16000,
      cashInjectionIdr: 0,
      rebalanceMode: 'sell-and-buy',
      driftThresholdAbsolutePercent: 1,
      enableIdxLotRounding: true,
    });

    const bbca = result.items.find((i) => i.assetId === 'BBCA')!;
    expect(bbca.action).toBe('BUY');
    expect(bbca.tradeAmountIdr).toBe(14_000_000);
    // At Rp 500.000 per lot (100 shares * Rp 5.000), Rp 14.000.000 buys exactly 28 lots!
    expect(bbca.tradeLotsInteger).toBe(28);
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

  it('generates Pre-Planned Crash Buying Ladder (-10%, -20%, -35%, -50%) with increasing BUY amounts', () => {
    const btc90Preset = VIDEO_PORTFOLIO_PRESETS.find((p) => p.id === 'opt-4-rb-btc-90')!;
    const btcAsset = CORE_AND_EXPANDED_ASSETS.find((a) => a.id === 'BTC')!;
    const holdings: Record<string, HoldingEntry> = {};
    for (const asset of CORE_AND_EXPANDED_ASSETS.filter((a) => a.isCoreBenchmark)) {
      holdings[asset.id] = {
        assetId: asset.id,
        currentValueIdr: VIDEO_1B_REBALANCE_EXAMPLE[asset.id] ?? 0,
        units: 0,
        currentPrice: asset.defaultPrice,
        shockPercent: 0,
      };
    }

    const ladder = generateCrashBuyingLadder({
      targetAsset: btcAsset,
      allAssets: CORE_AND_EXPANDED_ASSETS,
      targetWeights: btc90Preset.weights,
      holdings,
      inputMode: 'nominal',
      usdIdrRate: 15600,
    });
    expect(ladder).toHaveLength(4);
    expect(ladder[0].dropPercent).toBe(-10);
    expect(ladder[3].dropPercent).toBe(-50);
    expect(ladder[3].rebalanceBuyAmountIdr).toBeGreaterThan(
      ladder[0].rebalanceBuyAmountIdr
    );
  });

  it('simulates 5-Year Historical Rebalancing Frequency Backtest (Monthly vs Quarterly vs Annual vs Buy & Hold)', () => {
    const btc90Preset = VIDEO_PORTFOLIO_PRESETS.find((p) => p.id === 'opt-4-rb-btc-90')!;
    const backtest = simulateRebalancingFrequencyBacktest({
      initialCapitalIdr: 100_000_000,
      baseCagrPercent: btc90Preset.cagr,
      maxDrawdownPercent: btc90Preset.maxDrawdown,
    });
    expect(backtest.series).toHaveLength(21); // Start + 20 quarters
    expect(backtest.finalQuarterlyIdr).toBeGreaterThan(100_000_000);
    // Rebalancing reduces max drawdown compared to never rebalancing
    expect(btc90Preset.maxDrawdown).toBeLessThan(backtest.buyHoldMaxDdPercent);
  });

  it('estimates tailored portfolio recommendations from user multiple-choice answers', () => {
    const rec = generatePortfolioRecommendations(
      {
        profile: 'balanced-quant',
        crashTolerance: 'moderat',
        selectedAssetIds: ['RDPT', 'PTBA', 'GLD', 'SPY', 'QQQ', 'BTC', 'ETH'],
        assetSelectionPreset: 'all-default',
        convictionPreference: 'auto-equal',
        idxEquitySlotChoice: 'PTBA',
        initialCapitalIdr: 100_000_000,
        monthlySavingsIdr: 10_000_000,
        targetGoalIdr: 1_000_000_000,
      },
      CORE_AND_EXPANDED_ASSETS,
      VIDEO_PORTFOLIO_PRESETS
    );

    expect(rec.recommendedSlotMap.BBCA).toBe('PTBA');
    expect(rec.primaryRecommendation.weights.PTBA).toBeGreaterThan(0);
    expect(rec.primaryRecommendation.metrics.cagr).toBeGreaterThan(15);
    expect(rec.alternativeRecommendations).toHaveLength(3);
  });

  it('correctly tags bonds / money-market and nominal-only holdings with isNominalOnly: true and direct tradeUnits', () => {
    const rdptAsset = CORE_AND_EXPANDED_ASSETS.find((a) => a.id === 'RDPT')!;
    const bbcaAsset = CORE_AND_EXPANDED_ASSETS.find((a) => a.id === 'BBCA')!;

    const plan = calculateRebalancePlan({
      assets: [rdptAsset, bbcaAsset],
      targetWeights: { RDPT: 50, BBCA: 50 },
      holdings: {
        RDPT: {
          assetId: 'RDPT',
          currentValueIdr: 10_000_000,
          units: 10_000_000,
          currentPrice: 1,
          shockPercent: 0,
          isNominalOnly: true,
        },
        BBCA: {
          assetId: 'BBCA',
          currentValueIdr: 30_000_000,
          units: 3000,
          currentPrice: 10000,
          shockPercent: 0,
          isNominalOnly: false,
        },
      },
      inputMode: 'nominal',
      usdIdrRate: 16000,
      cashInjectionIdr: 0,
      driftThresholdAbsolutePercent: 3,
      rebalanceMode: 'sell-and-buy',
      enableIdxLotRounding: true,
      enableBrokerFees: false,
      filterDustTrades: false,
    });

    const rdptItem = plan.items.find((i) => i.assetId === 'RDPT')!;
    const bbcaItem = plan.items.find((i) => i.assetId === 'BBCA')!;

    expect(rdptItem.isNominalOnly).toBe(true);
    expect(rdptItem.action).toBe('BUY');
    expect(rdptItem.tradeUnits).toBe(rdptItem.tradeAmountIdr); // Direct IDR nominal execution

    expect(bbcaItem.isNominalOnly).toBe(false);
    expect(bbcaItem.action).toBe('SELL');
    expect(bbcaItem.tradeLotsInteger).toBeDefined();
  });

  it('supports full comprehensive backup payload structure v2 with all menus and journal history', () => {
    const backup: QuantPortoBackupPayload = {
      version: 2,
      app: 'QuantPorto',
      exportedAt: new Date().toISOString(),
      data: {
        menu1_builder: {
          activeWeights: { RDPT: 40, BBCA: 20, BTC: 40 },
          activePresetId: 'opt-4-rb-btc-90',
          allocationMethod: 'preset',
          convictionAssetId: 'BTC',
          convictionRiskPercent: 90,
          solverMode: 'calibrated-video',
          selectedUniverseIds: ['RDPT', 'BBCA', 'BTC'],
          pinnedPresetIds: ['opt-4-rb-btc-90'],
          rdptPromoActive: false,
        },
        menu2_rebalancer: {
          holdings: {
            RDPT: {
              assetId: 'RDPT',
              currentValueIdr: 40_000_000,
              units: 40_000_000,
              currentPrice: 1,
              shockPercent: 0,
              isNominalOnly: true,
            },
          },
          rebalanceHistory: [
            {
              id: 'hist-1',
              timestamp: '2026-10-22T10:00:00Z',
              note: 'Rebalance Kuartal 1',
              totalValueBeforeIdr: 100_000_000,
              cashInjectedIdr: 5_000_000,
              totalValueAfterIdr: 105_000_000,
              totalBuyIdr: 5_000_000,
              totalSellIdr: 0,
              tradesSummary: ['BUY RDPT Rp 5.000.000'],
              weightsAfter: { RDPT: 40, BBCA: 20, BTC: 40 },
            },
          ],
          rebalanceMode: 'selective-profit-trim',
          driftThresholdPercent: 3,
        },
        menu3_simulator: {
          initialCapitalIdr: 100_000_000,
          targetGoalIdr: 10_000_000_000,
          monthlySavingsIdr: 5_000_000,
        },
        global: {
          usdIdrRate: 18000,
          savedPortfolios: [],
        },
      },
    };

    expect(backup.version).toBe(2);
    expect(backup.data.menu2_rebalancer.rebalanceHistory).toHaveLength(1);
    expect(backup.data.menu2_rebalancer.rebalanceHistory[0].note).toBe(
      'Rebalance Kuartal 1'
    );
    expect(backup.data.menu3_simulator.monthlySavingsIdr).toBe(5_000_000);
    expect(backup.data.menu3_simulator.targetGoalIdr).toBe(10_000_000_000);
  });

  it('applies Ito Lemma variance correction in Monte Carlo Geometric Brownian Motion', () => {
    // Under log-normal Geometric Brownian Motion with Ito drift (ln(1+mu) - 0.5*sigma^2),
    // the theoretical median (50th percentile) is S_0 * exp((ln(1+mu) - 0.5*sigma^2) * t).
    // For 15% CAGR (mu = 0.15) and 50% volatility (sigma = 0.5) over 5 years:
    // drift_rate = ln(1.15) - 0.5 * (0.25) = 0.13976 - 0.125 = 0.01476
    // theoretical_median = 100M * exp(0.01476 * 5) = ~107.66M
    const res = simulateMonteCarloPaths({
      initialCapitalIdr: 100_000_000,
      monthlyContributionIdr: 0,
      annualCagrPercent: 15,
      annualVolatilityPercent: 50,
      maxYears: 5,
      numSimulations: 500,
      seed: 42,
    });

    const year5Median = res.series[5].p50;
    const theoreticalMedian =
      100_000_000 * Math.exp((Math.log(1.15) - 0.5 * 0.5 * 0.5) * 5);
    const ratioToTheoretical = year5Median / theoreticalMedian;

    // Simulation median converges within 5% of theoretical Ito-corrected log-normal median
    expect(ratioToTheoretical).toBeGreaterThan(0.95);
    expect(ratioToTheoretical).toBeLessThan(1.05);
  });
});
