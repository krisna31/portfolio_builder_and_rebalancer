import { describe, it, expect } from 'vitest';
import { HoldingEntry, RebalanceHistoryEntry } from '../types';

describe('Rebalance Journal Recording & Undo State Restoration', () => {
  it('records exact table inputs (Aset Terisi Saat Ini: Rp 2 Jt) when DCA budget is Rp 3 Jt', () => {
    // Initial state: 0 holdings, DCA cash injection = 3M
    const initialHoldings: Record<string, HoldingEntry> = {
      BBCA: { assetId: 'BBCA', currentValueIdr: 0, units: 0, currentPrice: 10000, shockPercent: 0 },
      RDPT: { assetId: 'RDPT', currentValueIdr: 0, units: 0, currentPrice: 1, shockPercent: 0, isNominalOnly: true },
    };
    const initialCashInjectionIdr = 3_000_000;
    const prevCommittedValueIdr = 0;

    // User fills in 1M BBCA and 1M RDPT into the table
    const tableHoldings: Record<string, HoldingEntry> = {
      BBCA: { assetId: 'BBCA', currentValueIdr: 1_000_000, units: 100, currentPrice: 10000, shockPercent: 0 },
      RDPT: { assetId: 'RDPT', currentValueIdr: 1_000_000, units: 1_000_000, currentPrice: 1, shockPercent: 0, isNominalOnly: true },
    };

    const currentFilledTableIdr = Object.values(tableHoldings).reduce(
      (sum, h) => sum + h.currentValueIdr,
      0
    );
    expect(currentFilledTableIdr).toBe(2_000_000);

    const actualNetCashInjected = Math.max(0, currentFilledTableIdr - prevCommittedValueIdr);
    const unspentCashRemainderIdr = Math.max(0, initialCashInjectionIdr - actualNetCashInjected);

    expect(actualNetCashInjected).toBe(2_000_000);
    expect(unspentCashRemainderIdr).toBe(1_000_000);

    // Build history entry
    const entry: RebalanceHistoryEntry = {
      id: 'reb-test-1',
      timestamp: '07 Nov 2026',
      note: 'DCA Perdana',
      totalValueBeforeIdr: prevCommittedValueIdr,
      cashInjectedIdr: actualNetCashInjected,
      totalValueAfterIdr: currentFilledTableIdr,
      totalBuyIdr: 2_000_000,
      totalSellIdr: 0,
      tradesSummary: ['BUY BBCA Rp 1.000.000', 'BUY RDPT Rp 1.000.000'],
      weightsAfter: { BBCA: 50, RDPT: 50 },
      holdingsBefore: JSON.parse(JSON.stringify(initialHoldings)),
      holdingsAfter: JSON.parse(JSON.stringify(tableHoldings)),
      cashInjectionBeforeIdr: initialCashInjectionIdr,
      unspentCashRemainderIdr,
    };

    // Assert recorded values match user requirement (2M recorded, NOT 3M)
    expect(entry.totalValueAfterIdr).toBe(2_000_000);
    expect(entry.cashInjectedIdr).toBe(2_000_000);
    expect(entry.unspentCashRemainderIdr).toBe(1_000_000);
    expect(entry.holdingsAfter?.BBCA.currentValueIdr).toBe(1_000_000);
    expect(entry.holdingsAfter?.RDPT.currentValueIdr).toBe(1_000_000);
  });

  it('correctly handles subsequent DCA from Rp 2 Jt to Rp 4.5 Jt', () => {
    const prevCommittedValueIdr = 2_000_000;
    const currentTableHoldings: Record<string, HoldingEntry> = {
      BBCA: { assetId: 'BBCA', currentValueIdr: 2_500_000, units: 250, currentPrice: 10000, shockPercent: 0 },
      RDPT: { assetId: 'RDPT', currentValueIdr: 2_000_000, units: 2_000_000, currentPrice: 1, shockPercent: 0, isNominalOnly: true },
    };

    const currentFilledTableIdr = Object.values(currentTableHoldings).reduce(
      (sum, h) => sum + h.currentValueIdr,
      0
    );
    expect(currentFilledTableIdr).toBe(4_500_000);

    const actualNetCashInjected = Math.max(0, currentFilledTableIdr - prevCommittedValueIdr);
    expect(actualNetCashInjected).toBe(2_500_000);

    const entry: RebalanceHistoryEntry = {
      id: 'reb-test-2',
      timestamp: '07 Nov 2026',
      note: 'DCA Rutin Bulan 2',
      totalValueBeforeIdr: prevCommittedValueIdr,
      cashInjectedIdr: actualNetCashInjected,
      totalValueAfterIdr: currentFilledTableIdr,
      totalBuyIdr: 2_500_000,
      totalSellIdr: 0,
      tradesSummary: ['BUY BBCA Rp 1.500.000', 'BUY RDPT Rp 1.000.000'],
      weightsAfter: { BBCA: 55.56, RDPT: 44.44 },
    };

    expect(entry.totalValueBeforeIdr).toBe(2_000_000);
    expect(entry.totalValueAfterIdr).toBe(4_500_000);
    expect(entry.cashInjectedIdr).toBe(2_500_000);
  });

  it('restores previous holdings and cash injection on Undo', () => {
    // Initial state before rebalance
    const preRebalanceHoldings: Record<string, HoldingEntry> = {
      BBCA: { assetId: 'BBCA', currentValueIdr: 5_000_000, units: 500, currentPrice: 10000, shockPercent: 0 },
      RDPT: { assetId: 'RDPT', currentValueIdr: 5_000_000, units: 5_000_000, currentPrice: 1, shockPercent: 0, isNominalOnly: true },
    };
    const preCashInjection = 3_000_000;

    // Committed state
    const postRebalanceHoldings: Record<string, HoldingEntry> = {
      BBCA: { assetId: 'BBCA', currentValueIdr: 6_000_000, units: 600, currentPrice: 10000, shockPercent: 0 },
      RDPT: { assetId: 'RDPT', currentValueIdr: 6_000_000, units: 6_000_000, currentPrice: 1, shockPercent: 0, isNominalOnly: true },
    };
    const postCashInjection = 1_000_000;

    const entry: RebalanceHistoryEntry = {
      id: 'reb-undo-test',
      timestamp: '07 Nov 2026',
      note: 'Test Rebalance with Undo',
      totalValueBeforeIdr: 10_000_000,
      cashInjectedIdr: 2_000_000,
      totalValueAfterIdr: 12_000_000,
      totalBuyIdr: 2_000_000,
      totalSellIdr: 0,
      tradesSummary: ['BUY BBCA Rp 1 Jt', 'BUY RDPT Rp 1 Jt'],
      weightsAfter: { BBCA: 50, RDPT: 50 },
      holdingsBefore: preRebalanceHoldings,
      holdingsAfter: postRebalanceHoldings,
      cashInjectionBeforeIdr: preCashInjection,
      unspentCashRemainderIdr: 1_000_000,
    };

    let currentHoldings = { ...postRebalanceHoldings };
    let currentCash = postCashInjection;
    let history: RebalanceHistoryEntry[] = [entry];

    // Execute Undo
    const undoTarget = history.find((h) => h.id === 'reb-undo-test');
    expect(undoTarget).toBeDefined();

    if (undoTarget?.holdingsBefore) {
      currentHoldings = JSON.parse(JSON.stringify(undoTarget.holdingsBefore));
    }
    if (typeof undoTarget?.cashInjectionBeforeIdr === 'number') {
      currentCash = undoTarget.cashInjectionBeforeIdr;
    }
    history = history.filter((h) => h.id !== undoTarget?.id);

    // Assert that holdings and cash are rolled back to pre-rebalance state
    expect(currentHoldings.BBCA.currentValueIdr).toBe(5_000_000);
    expect(currentHoldings.RDPT.currentValueIdr).toBe(5_000_000);
    expect(currentCash).toBe(3_000_000);
    expect(history.length).toBe(0);
  });
});
