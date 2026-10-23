import { describe, it, expect } from 'vitest';
import { RebalanceExecutionGuideModal } from '../RebalanceExecutionGuideModal';
import { calculateRebalancePlan } from '../../../lib/quant/rebalancerEngine';
import { CORE_AND_EXPANDED_ASSETS } from '../../../data/presets';
import { HoldingEntry } from '../../../lib/quant/types';

describe('RebalanceExecutionGuideModal & Initial Buy Workflow', () => {
  it('exports RebalanceExecutionGuideModal component properly', () => {
    expect(RebalanceExecutionGuideModal).toBeDefined();
    expect(typeof RebalanceExecutionGuideModal).toBe('function');
  });

  it('correctly calculates initial buy orders from Rp 0 when using buy-only-dca mode', () => {
    const assets = CORE_AND_EXPANDED_ASSETS.slice(0, 4); // RDPU, RDPT, BBCA, GLD
    const targetWeights = {
      RDPU: 20,
      RDPT: 30,
      BBCA: 25,
      GLD: 25,
    };

    // User starts with 0 holdings
    const holdings: Record<string, HoldingEntry> = {};
    for (const a of assets) {
      holdings[a.id] = {
        assetId: a.id,
        currentValueIdr: 0,
        units: 0,
        currentPrice: a.defaultPrice,
        shockPercent: 0,
      };
    }

    const initialCapital = 100_000_000; // Rp 100 Juta

    const plan = calculateRebalancePlan({
      assets,
      targetWeights,
      holdings,
      inputMode: 'nominal',
      rebalanceMode: 'buy-only-dca',
      cashInjectionIdr: initialCapital,
      driftThresholdAbsolutePercent: 5,
      usdIdrRate: 16_000,
      enableIdxLotRounding: true,
      enableBrokerFees: false,
    });

    // In initial buy mode:
    // 1. Initial holdings total was 0
    expect(plan.initialTotalIdr).toBe(0);

    // 2. No sell trades should ever be generated
    expect(plan.totalSellIdr).toBe(0);

    // 3. Total target value should equal the cash injection
    expect(plan.finalTargetTotalIdr).toBe(initialCapital);

    // 4. All target assets should have a BUY action
    const buyItems = plan.items.filter((i) => i.action === 'BUY');
    expect(buyItems.length).toBe(4);

    // 5. Total buy IDR should be close to 100M (minus any unallocated lot remainder)
    expect(plan.totalBuyIdr).toBeGreaterThan(95_000_000);
    expect(plan.totalBuyIdr).toBeLessThanOrEqual(initialCapital);
  });
});
