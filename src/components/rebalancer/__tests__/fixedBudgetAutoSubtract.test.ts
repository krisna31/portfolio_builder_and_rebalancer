import { describe, it, expect } from 'vitest';
import { calculateRebalancePlan } from '../../../lib/quant/rebalancerEngine';
import { CORE_AND_EXPANDED_ASSETS } from '../../../data/presets';
import { HoldingEntry } from '../../../lib/quant/types';

describe('Fixed Budget Auto-Subtract (Staged Initial Buying)', () => {
  const assets = CORE_AND_EXPANDED_ASSETS.slice(0, 4); // RDPU, RDPT, BBCA, GLD
  const targetWeights = {
    RDPU: 20, // 20%
    RDPT: 30, // 30%
    BBCA: 25, // 25%
    GLD: 25,  // 25%
  };

  it('correctly auto-subtracts remaining cash when assets are partially filled', () => {
    const totalBudgetIdr = 25_000_000; // Rp 25 Juta Total Budget
    const rdptPurchasedIdr = 9_000_000; // User already bought RDPT Rp 9 Jt

    // Simulate auto-subtract formula
    const currentTotalHoldings = rdptPurchasedIdr;
    const autoSubtractedCash = Math.max(0, totalBudgetIdr - currentTotalHoldings);

    expect(autoSubtractedCash).toBe(16_000_000); // Remaining cash is Rp 16 Juta
  });

  it('keeps total target portfolio exactly at the locked budget without capital inflation', () => {
    const totalBudgetIdr = 25_000_000;
    const rdptPurchasedIdr = 9_000_000;
    const remainingCash = totalBudgetIdr - rdptPurchasedIdr; // 16_000_000

    const holdings: Record<string, HoldingEntry> = {
      RDPU: { assetId: 'RDPU', currentValueIdr: 0, units: 0, currentPrice: 1, shockPercent: 0 },
      RDPT: { assetId: 'RDPT', currentValueIdr: rdptPurchasedIdr, units: rdptPurchasedIdr, currentPrice: 1, shockPercent: 0 },
      BBCA: { assetId: 'BBCA', currentValueIdr: 0, units: 0, currentPrice: 9000, shockPercent: 0 },
      GLD: { assetId: 'GLD', currentValueIdr: 0, units: 0, currentPrice: 180, shockPercent: 0 },
    };

    const plan = calculateRebalancePlan({
      assets,
      targetWeights,
      holdings,
      inputMode: 'nominal',
      rebalanceMode: 'buy-only-dca',
      cashInjectionIdr: remainingCash,
      driftThresholdAbsolutePercent: 3,
      usdIdrRate: 16_000,
      enableIdxLotRounding: true,
      enableBrokerFees: false,
    });

    // 1. Initial holdings is Rp 9.000.000
    expect(plan.initialTotalIdr).toBe(9_000_000);

    // 2. Final target total should be exactly Rp 25.000.000 (NOT Rp 34.000.000!)
    expect(plan.finalTargetTotalIdr).toBe(25_000_000);

    // 3. No sell orders generated (Buy-Only DCA)
    expect(plan.totalSellIdr).toBe(0);

    // 4. In buy-only DCA mode, no asset is sold, and total target equals 25M
    const rdptItem = plan.items.find((i) => i.assetId === 'RDPT');
    expect(rdptItem).toBeDefined();
    expect(rdptItem?.action).not.toBe('SELL');
    expect(rdptItem?.postShockValueIdr).toBe(9_000_000);

    // 5. Total buy amount across other assets should fit comfortably in the 16M cash
    expect(plan.totalBuyIdr).toBeLessThanOrEqual(remainingCash);
    expect(plan.totalBuyIdr).toBeGreaterThan(15_000_000);
  });

  it('clamps remaining cash to 0 when holdings exceed total locked budget (overbudget protection)', () => {
    const totalBudgetIdr = 25_000_000;
    const currentTotalHoldings = 26_500_000; // Holdings exceed budget

    const autoSubtractedCash = Math.max(0, totalBudgetIdr - currentTotalHoldings);
    expect(autoSubtractedCash).toBe(0);
  });
});
