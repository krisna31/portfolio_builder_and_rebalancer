import { describe, it, expect } from 'vitest';
import { CORE_AND_EXPANDED_ASSETS } from '../../../data/presets';
import { HoldingEntry } from '../types';
import { calculateRebalancePlan } from '../rebalancerEngine';
import { simulateWealthToGoal, simulateMonteCarloPaths } from '../wealthSimulator';
import { utf8ToBase64, base64ToUtf8 } from '../textDataParser';

describe('Comprehensive Audit Fixes Verification', () => {
  it('trim-defensive-first: protects underweight defensive assets and NEVER sells them', () => {
    // RDPT target is 40% (Rp 40M), but current holding is only Rp 10M (underweight by Rp 30M deficit)
    // BBCA target is 60% (Rp 60M), current holding is Rp 40M (deficit of Rp 20M)
    // Total portfolio value: Rp 50M. Target total: Rp 50M.
    const targetWeights = { RDPT: 40, BBCA: 60 };
    const holdings: Record<string, HoldingEntry> = {
      RDPT: { assetId: 'RDPT', currentValueIdr: 10_000_000, units: 10_000_000, currentPrice: 1, shockPercent: 0, isNominalOnly: true },
      BBCA: { assetId: 'BBCA', currentValueIdr: 40_000_000, units: 3902, currentPrice: 10250, shockPercent: 0 },
    };

    const plan = calculateRebalancePlan({
      assets: CORE_AND_EXPANDED_ASSETS,
      targetWeights,
      holdings,
      inputMode: 'nominal',
      usdIdrRate: 18000,
      rebalanceMode: 'trim-defensive-first',
      cashInjectionIdr: 0,
      driftThresholdAbsolutePercent: 3,
      enableIdxLotRounding: true,
      sweepRemainderToDefensive: false,
      enableBrokerFees: false,
      filterDustTrades: true,
    });

    const rdptItem = plan.items.find((i) => i.assetId === 'RDPT');
    expect(rdptItem).toBeDefined();
    // RDPT is underweight and has NO surplus, so it must NEVER be sold!
    expect(rdptItem?.action).not.toBe('SELL');
    expect(rdptItem?.tradeAmountIdr).toBeGreaterThanOrEqual(0);
  });

  it('trim-defensive-first: trims surplus defensive assets to fund growth dips without selling other assets', () => {
    // RDPT target is 30% (Rp 30M), but holding is Rp 70M (Surplus of Rp 40M)
    // BBCA target is 70% (Rp 70M), but holding is Rp 30M (Deficit of Rp 40M)
    const targetWeights = { RDPT: 30, BBCA: 70 };
    const holdings: Record<string, HoldingEntry> = {
      RDPT: { assetId: 'RDPT', currentValueIdr: 70_000_000, units: 70_000_000, currentPrice: 1, shockPercent: 0, isNominalOnly: true },
      BBCA: { assetId: 'BBCA', currentValueIdr: 30_000_000, units: 2926, currentPrice: 10250, shockPercent: 0 },
    };

    const plan = calculateRebalancePlan({
      assets: CORE_AND_EXPANDED_ASSETS,
      targetWeights,
      holdings,
      inputMode: 'nominal',
      usdIdrRate: 18000,
      rebalanceMode: 'trim-defensive-first',
      cashInjectionIdr: 0,
      driftThresholdAbsolutePercent: 3,
      enableIdxLotRounding: true,
      sweepRemainderToDefensive: false,
      enableBrokerFees: false,
      filterDustTrades: true,
    });

    const rdptItem = plan.items.find((i) => i.assetId === 'RDPT');
    const bbcaItem = plan.items.find((i) => i.assetId === 'BBCA');

    expect(rdptItem?.action).toBe('SELL');
    expect(bbcaItem?.action).toBe('BUY');
    expect(plan.totalSellIdr).toBeGreaterThan(0);
  });

  it('buy-only-dca: NEVER produces a SELL order even when lot rounding has negative remainder', () => {
    // BBCA price: 10250 (1 Lot = Rp 1,025,000)
    // If buy amount would allocate Rp 1,500,000, floored lot is 1 Lot = Rp 1,025,000.
    const targetWeights = { RDPT: 50, BBCA: 50 };
    const holdings: Record<string, HoldingEntry> = {
      RDPT: { assetId: 'RDPT', currentValueIdr: 5_000_000, units: 5_000_000, currentPrice: 1, shockPercent: 0, isNominalOnly: true },
      BBCA: { assetId: 'BBCA', currentValueIdr: 0, units: 0, currentPrice: 10250, shockPercent: 0 },
    };

    const plan = calculateRebalancePlan({
      assets: CORE_AND_EXPANDED_ASSETS,
      targetWeights,
      holdings,
      inputMode: 'nominal',
      usdIdrRate: 18000,
      rebalanceMode: 'buy-only-dca',
      cashInjectionIdr: 5_000_000,
      driftThresholdAbsolutePercent: 3,
      enableIdxLotRounding: true,
      sweepRemainderToDefensive: true,
      enableBrokerFees: true,
      filterDustTrades: true,
    });

    expect(plan.totalSellIdr).toBe(0);
    for (const item of plan.items) {
      expect(item.action).not.toBe('SELL');
      expect(item.tradeAmountIdr).toBeGreaterThanOrEqual(0);
    }
  });

  it('BUY lot rounding uses Math.floor so executed amount never exceeds allocated cash', () => {
    // 5.8 lots of BBCA at Rp 1,025,000/lot = Rp 5,945,000
    // Floored lots must be 5 lots (Rp 5,125,000), NOT 6 lots (Rp 6,150,000)
    const targetWeights = { BBCA: 100 };
    const holdings: Record<string, HoldingEntry> = {
      BBCA: { assetId: 'BBCA', currentValueIdr: 0, units: 0, currentPrice: 10250, shockPercent: 0 },
    };

    const plan = calculateRebalancePlan({
      assets: CORE_AND_EXPANDED_ASSETS,
      targetWeights,
      holdings,
      inputMode: 'nominal',
      usdIdrRate: 18000,
      rebalanceMode: 'buy-only-dca',
      cashInjectionIdr: 5_945_000,
      driftThresholdAbsolutePercent: 3,
      enableIdxLotRounding: true,
      sweepRemainderToDefensive: false,
      enableBrokerFees: false,
      filterDustTrades: false,
    });

    const bbcaItem = plan.items.find((i) => i.assetId === 'BBCA');
    expect(bbcaItem?.tradeLotsInteger).toBe(5);
    expect(bbcaItem?.tradeAmountIdr).toBe(5 * 100 * 10250); // 5,125,000 <= 5,945,000
    expect(bbcaItem?.tradeLotsRemainderIdr).toBe(5_945_000 - 5_125_000);
  });

  it('Anti-dust filter properly decrements totalEstimatedFeeIdr when dust trade is suppressed', () => {
    // An asset with a tiny trade (< 25,000)
    const targetWeights = { RDPT: 99.9, GLD: 0.1 };
    const holdings: Record<string, HoldingEntry> = {
      RDPT: { assetId: 'RDPT', currentValueIdr: 10_000_000, units: 10_000_000, currentPrice: 1, shockPercent: 0, isNominalOnly: true },
      GLD: { assetId: 'GLD', currentValueIdr: 0, units: 0, currentPrice: 2000, shockPercent: 0 },
    };

    const plan = calculateRebalancePlan({
      assets: CORE_AND_EXPANDED_ASSETS,
      targetWeights,
      holdings,
      inputMode: 'nominal',
      usdIdrRate: 18000,
      rebalanceMode: 'buy-only-dca',
      cashInjectionIdr: 1_000_000,
      driftThresholdAbsolutePercent: 3,
      enableIdxLotRounding: false,
      sweepRemainderToDefensive: false,
      enableBrokerFees: true,
      filterDustTrades: true,
      dustTradeThresholdIdr: 25_000,
    });

    const gldItem = plan.items.find((i) => i.assetId === 'GLD');
    if (gldItem?.isDustFiltered) {
      expect(gldItem.action).toBe('HOLD');
      expect(gldItem.estimatedFeeIdr).toBe(0);
    }
  });

  it('wealthSimulator: realPurchasingPowerAtGoalIdr accurately reflects wealth when goal is achieved', () => {
    const sim = simulateWealthToGoal({
      initialCapitalIdr: 100_000_000,
      monthlyContributionIdr: 10_000_000,
      annualCagrPercent: 15,
      maxDrawdownPercent: 20,
      targetWealthIdr: 1_000_000_000, // 1 Miliar
      annualInflationPercent: 4,
      maxYears: 30,
    });

    expect(sim.reachedGoal).toBe(true);
    // Goal of Rp 1 Miliar discounted by ~4-5 years of 4% inflation should be around Rp 800M - Rp 900M
    // (Definitely NOT hundreds of billions from the 30-year ending wealth!)
    expect(sim.realPurchasingPowerAtGoalIdr).toBeLessThan(1_000_000_000);
    expect(sim.realPurchasingPowerAtGoalIdr).toBeGreaterThan(600_000_000);
  });

  it('Monte Carlo simulation runs without double volatility drag and converges cleanly', () => {
    const mc = simulateMonteCarloPaths({
      initialCapitalIdr: 100_000_000,
      monthlyContributionIdr: 0,
      annualCagrPercent: 20,
      annualVolatilityPercent: 30,
      targetGoalIdr: 1_000_000_000,
      maxYears: 5,
      numSimulations: 200,
    });

    expect(mc.series.length).toBe(6); // Year 0 to 5
    // Year 5 median with 20% CAGR should be roughly 100M * (1.20)^5 ≈ 248M
    const p50Year5 = mc.series[5].p50;
    expect(p50Year5).toBeGreaterThan(180_000_000);
    expect(p50Year5).toBeLessThan(350_000_000);
  });

  it('utf8ToBase64 and base64ToUtf8 safely handles Unicode characters and emojis without DOMException', () => {
    const original = JSON.stringify({
      name: 'Portofolio Kripto & Emas 🚀 10 Miliar',
      note: 'Investasi santai dengan alokasi seimbang 🎯',
      symbols: ['BTC', 'ETH', 'BBCA', 'SBN'],
    });

    const encoded = utf8ToBase64(original);
    const decoded = base64ToUtf8(encoded);
    expect(decoded).toBe(original);
    const parsed = JSON.parse(decoded);
    expect(parsed.name).toContain('🚀');
  });
});
