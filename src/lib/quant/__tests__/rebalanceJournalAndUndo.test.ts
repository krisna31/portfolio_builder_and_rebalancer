import { describe, it, expect } from 'vitest';
import { CORE_AND_EXPANDED_ASSETS } from '../../../data/presets';
import { HoldingEntry } from '../types';
import {
  applyRebalanceUndo,
  buildRebalanceCommitResult,
  calculateRebalancePlan,
} from '../rebalancerEngine';

function createZeroHoldings(): Record<string, HoldingEntry> {
  const holdings: Record<string, HoldingEntry> = {};
  for (const a of CORE_AND_EXPANDED_ASSETS) {
    const isNominalOnly = a.category === 'bonds' || a.category === 'money-market';
    holdings[a.id] = {
      assetId: a.id,
      currentValueIdr: 0,
      units: 0,
      currentPrice: isNominalOnly ? 1 : a.defaultPrice,
      shockPercent: 0,
      isNominalOnly,
    };
  }
  return holdings;
}

describe('Rebalance Journal Recording & Undo State Restoration (Production Engine)', () => {
  const targetWeights: Record<string, number> = { BBCA: 50, RDPT: 50 };

  it('records exact table inputs (Aset Terisi Saat Ini: Rp 2 Jt) when DCA budget is Rp 3 Jt', () => {
    const zeroHoldings = createZeroHoldings();
    const bbcaPrice = CORE_AND_EXPANDED_ASSETS.find((a) => a.id === 'BBCA')!.defaultPrice;

    const tableHoldings: Record<string, HoldingEntry> = {
      ...createZeroHoldings(),
      BBCA: {
        assetId: 'BBCA',
        currentValueIdr: 1_000_000,
        units: Number((1_000_000 / bbcaPrice).toFixed(4)),
        currentPrice: bbcaPrice,
        shockPercent: 0,
        isNominalOnly: false,
      },
      RDPT: {
        assetId: 'RDPT',
        currentValueIdr: 1_000_000,
        units: 1_000_000,
        currentPrice: 1,
        shockPercent: 0,
        isNominalOnly: true,
      },
    };

    const plan = calculateRebalancePlan({
      assets: CORE_AND_EXPANDED_ASSETS,
      targetWeights,
      holdings: tableHoldings,
      inputMode: 'nominal',
      usdIdrRate: 18000,
      cashInjectionIdr: 3_000_000,
      rebalanceMode: 'buy-only-dca',
      driftThresholdAbsolutePercent: 3,
      enableIdxLotRounding: true,
      filterDustTrades: true,
    });

    const result = buildRebalanceCommitResult({
      allAssets: CORE_AND_EXPANDED_ASSETS,
      holdings: tableHoldings,
      plan,
      activeWeights: targetWeights,
      rebalanceHistory: [],
      inputMode: 'nominal',
      usdIdrRate: 18000,
      rebalanceMode: 'buy-only-dca',
      cashInjectionIdr: 3_000_000,
      isFixedBudgetMode: false,
      fixedTotalBudgetIdr: 0,
      customNote: 'DCA Perdana',
      hasManualTableEdits: true,
      hasPlanOverride: false,
      baselineHoldings: zeroHoldings,
      now: new Date('2026-11-07T10:00:00Z'),
    });

    expect(result.newEntry.note).toBe('DCA Perdana');
    expect(result.newEntry.totalValueBeforeIdr).toBe(0);
    expect(result.newEntry.totalValueAfterIdr).toBe(2_000_000);
    expect(result.newEntry.cashInjectedIdr).toBe(2_000_000);
    expect(result.newEntry.unspentCashRemainderIdr).toBe(1_000_000);
    expect(result.leftoverCash).toBe(1_000_000);
    expect(result.newEntry.totalBuyIdr).toBe(2_000_000);
    expect(result.newEntry.totalSellIdr).toBe(0);
    expect(result.newEntry.tradesSummary).toEqual([
      'BUY RDPT Rp 1.0 Jt',
      'BUY BBCA Rp 1.0 Jt',
    ]);
    expect(result.newEntry.holdingsBefore?.BBCA.currentValueIdr).toBe(0);
    expect(result.newEntry.holdingsBefore?.RDPT.currentValueIdr).toBe(0);
    expect(result.newEntry.holdingsAfter?.BBCA.currentValueIdr).toBe(1_000_000);
    expect(result.newEntry.holdingsAfter?.RDPT.currentValueIdr).toBe(1_000_000);
    expect(result.nextHoldings.BBCA.currentValueIdr).toBe(1_000_000);
  });

  it('correctly diffs subsequent manual DCA from Rp 2 Jt to Rp 4.5 Jt against previous history snapshot', () => {
    const bbcaPrice = CORE_AND_EXPANDED_ASSETS.find((a) => a.id === 'BBCA')!.defaultPrice;

    const step1Holdings: Record<string, HoldingEntry> = {
      ...createZeroHoldings(),
      BBCA: {
        assetId: 'BBCA',
        currentValueIdr: 1_000_000,
        units: Number((1_000_000 / bbcaPrice).toFixed(4)),
        currentPrice: bbcaPrice,
        shockPercent: 0,
        isNominalOnly: false,
      },
      RDPT: {
        assetId: 'RDPT',
        currentValueIdr: 1_000_000,
        units: 1_000_000,
        currentPrice: 1,
        shockPercent: 0,
        isNominalOnly: true,
      },
    };

    const plan1 = calculateRebalancePlan({
      assets: CORE_AND_EXPANDED_ASSETS,
      targetWeights,
      holdings: step1Holdings,
      inputMode: 'nominal',
      usdIdrRate: 18000,
      cashInjectionIdr: 3_000_000,
      rebalanceMode: 'buy-only-dca',
      driftThresholdAbsolutePercent: 3,
    });

    const res1 = buildRebalanceCommitResult({
      allAssets: CORE_AND_EXPANDED_ASSETS,
      holdings: step1Holdings,
      plan: plan1,
      activeWeights: targetWeights,
      rebalanceHistory: [],
      inputMode: 'nominal',
      usdIdrRate: 18000,
      rebalanceMode: 'buy-only-dca',
      cashInjectionIdr: 3_000_000,
      isFixedBudgetMode: false,
      fixedTotalBudgetIdr: 0,
      customNote: 'DCA Perdana',
      hasManualTableEdits: true,
      hasPlanOverride: false,
      now: new Date('2026-11-01T10:00:00Z'),
    });

    const step2Holdings: Record<string, HoldingEntry> = {
      ...res1.nextHoldings,
      BBCA: {
        ...res1.nextHoldings.BBCA,
        currentValueIdr: 2_500_000,
        units: Number((2_500_000 / bbcaPrice).toFixed(4)),
      },
      RDPT: {
        ...res1.nextHoldings.RDPT,
        currentValueIdr: 2_000_000,
        units: 2_000_000,
      },
    };

    const plan2 = calculateRebalancePlan({
      assets: CORE_AND_EXPANDED_ASSETS,
      targetWeights,
      holdings: step2Holdings,
      inputMode: 'nominal',
      usdIdrRate: 18000,
      cashInjectionIdr: 3_000_000,
      rebalanceMode: 'buy-only-dca',
      driftThresholdAbsolutePercent: 3,
    });

    const res2 = buildRebalanceCommitResult({
      allAssets: CORE_AND_EXPANDED_ASSETS,
      holdings: step2Holdings,
      plan: plan2,
      activeWeights: targetWeights,
      rebalanceHistory: [res1.newEntry],
      inputMode: 'nominal',
      usdIdrRate: 18000,
      rebalanceMode: 'buy-only-dca',
      cashInjectionIdr: 3_000_000,
      isFixedBudgetMode: false,
      fixedTotalBudgetIdr: 0,
      customNote: 'DCA Rutin Bulan 2',
      hasManualTableEdits: true,
      hasPlanOverride: false,
      now: new Date('2026-11-07T10:00:00Z'),
    });

    expect(res2.newEntry.totalValueBeforeIdr).toBe(2_000_000);
    expect(res2.newEntry.totalValueAfterIdr).toBe(4_500_000);
    expect(res2.newEntry.cashInjectedIdr).toBe(2_500_000);
    expect(res2.newEntry.unspentCashRemainderIdr).toBe(500_000);
    expect(res2.newEntry.totalBuyIdr).toBe(2_500_000);
    expect(res2.newEntry.totalSellIdr).toBe(0);
    expect(res2.newEntry.tradesSummary).toEqual([
      'BUY RDPT Rp 1.0 Jt',
      'BUY BBCA Rp 1.5 Jt',
    ]);
    expect(res2.newEntry.holdingsBefore?.BBCA.currentValueIdr).toBe(1_000_000);
    expect(res2.newEntry.holdingsBefore?.RDPT.currentValueIdr).toBe(1_000_000);

    // Undo second entry -> rolls back to 2M (BBCA 1M, RDPT 1M) and restores 3M cash budget
    const undo2 = applyRebalanceUndo({
      id: res2.newEntry.id,
      rebalanceHistory: [res2.newEntry, res1.newEntry],
      currentHoldings: res2.nextHoldings,
      currentCashInjectionIdr: res2.leftoverCash,
    });

    expect(undo2.found).toBe(true);
    expect(undo2.nextHoldings.BBCA.currentValueIdr).toBe(1_000_000);
    expect(undo2.nextHoldings.RDPT.currentValueIdr).toBe(1_000_000);
    expect(undo2.nextCashInjectionIdr).toBe(3_000_000);
    expect(undo2.nextHistory).toHaveLength(1);

    // Undo first entry -> rolls back to 0M
    const undo1 = applyRebalanceUndo({
      id: res1.newEntry.id,
      rebalanceHistory: undo2.nextHistory,
      currentHoldings: undo2.nextHoldings,
      currentCashInjectionIdr: undo2.nextCashInjectionIdr,
    });

    expect(undo1.found).toBe(true);
    expect(undo1.nextHoldings.BBCA.currentValueIdr).toBe(0);
    expect(undo1.nextHoldings.RDPT.currentValueIdr).toBe(0);
    expect(undo1.nextCashInjectionIdr).toBe(3_000_000);
    expect(undo1.nextHistory).toHaveLength(0);
  });

  it('executes standard calculated rebalance trades when hasManualTableEdits is false and supports Undo', () => {
    const bbcaPrice = CORE_AND_EXPANDED_ASSETS.find((a) => a.id === 'BBCA')!.defaultPrice;

    const existingHoldings: Record<string, HoldingEntry> = {
      ...createZeroHoldings(),
      BBCA: {
        assetId: 'BBCA',
        currentValueIdr: 60_000_000,
        units: Number((60_000_000 / bbcaPrice).toFixed(4)),
        currentPrice: bbcaPrice,
        shockPercent: 0,
        isNominalOnly: false,
      },
      RDPT: {
        assetId: 'RDPT',
        currentValueIdr: 40_000_000,
        units: 40_000_000,
        currentPrice: 1,
        shockPercent: 0,
        isNominalOnly: true,
      },
    };

    const plan = calculateRebalancePlan({
      assets: CORE_AND_EXPANDED_ASSETS,
      targetWeights,
      holdings: existingHoldings,
      inputMode: 'nominal',
      usdIdrRate: 18000,
      cashInjectionIdr: 0,
      rebalanceMode: 'sell-and-buy',
      driftThresholdAbsolutePercent: 3,
      enableIdxLotRounding: true,
      sweepRemainderToDefensive: true,
      filterDustTrades: true,
    });

    // Plan must propose selling overweight BBCA and buying underweight RDPT
    expect(plan.totalSellIdr).toBeGreaterThan(0);
    expect(plan.totalBuyIdr).toBeGreaterThan(0);

    const commitRes = buildRebalanceCommitResult({
      allAssets: CORE_AND_EXPANDED_ASSETS,
      holdings: existingHoldings,
      plan,
      activeWeights: targetWeights,
      rebalanceHistory: [],
      inputMode: 'nominal',
      usdIdrRate: 18000,
      rebalanceMode: 'sell-and-buy',
      cashInjectionIdr: 0,
      isFixedBudgetMode: false,
      fixedTotalBudgetIdr: 0,
      hasManualTableEdits: false,
      hasPlanOverride: false,
      now: new Date('2026-11-08T10:00:00Z'),
    });

    // Trades from the plan must be applied and recorded in journal
    expect(commitRes.newEntry.totalValueBeforeIdr).toBe(100_000_000);
    expect(commitRes.newEntry.totalSellIdr).toBe(plan.totalSellIdr);
    expect(commitRes.newEntry.totalBuyIdr).toBe(plan.totalBuyIdr);
    expect(commitRes.newEntry.tradesSummary.some((t) => t.startsWith('SELL BBCA'))).toBe(true);
    expect(commitRes.newEntry.tradesSummary.some((t) => t.startsWith('BUY RDPT'))).toBe(true);
    expect(commitRes.nextHoldings.BBCA.currentValueIdr).toBeLessThan(60_000_000);
    expect(commitRes.nextHoldings.RDPT.currentValueIdr).toBeGreaterThan(40_000_000);

    // Undo restores exact pre-rebalance 60M / 40M positions
    const undoRes = applyRebalanceUndo({
      id: commitRes.newEntry.id,
      rebalanceHistory: [commitRes.newEntry],
      currentHoldings: commitRes.nextHoldings,
      currentCashInjectionIdr: commitRes.leftoverCash,
    });

    expect(undoRes.found).toBe(true);
    expect(undoRes.nextHoldings.BBCA.currentValueIdr).toBe(60_000_000);
    expect(undoRes.nextHoldings.RDPT.currentValueIdr).toBe(40_000_000);
    expect(undoRes.nextHistory).toHaveLength(0);

    // Non-existent ID returns found: false safely
    const missingUndo = applyRebalanceUndo({
      id: 'non-existent-id',
      rebalanceHistory: [commitRes.newEntry],
      currentHoldings: commitRes.nextHoldings,
      currentCashInjectionIdr: commitRes.leftoverCash,
    });
    expect(missingUndo.found).toBe(false);
    expect(missingUndo.nextHistory).toHaveLength(1);
  });
});
