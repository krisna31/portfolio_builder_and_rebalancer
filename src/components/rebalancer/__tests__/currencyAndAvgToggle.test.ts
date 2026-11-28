import { describe, it, expect } from 'vitest';
import {
  calculateRebalancePlan,
  buildRebalanceCommitResult,
} from '../../../lib/quant/rebalancerEngine';
import {
  formatUsd,
  idrToUsd,
  usdToIdr,
} from '../../../lib/formatters';
import {
  formatRebalancerMoney,
  formatRebalancerMoneyWithIdr,
} from '../CurrencyAmount';
import { parseBackupPayload } from '../../../lib/quant/textDataParser';
import { CORE_AND_EXPANDED_ASSETS } from '../../../data/presets';
import { HoldingEntry } from '../../../lib/quant/types';

describe('Rebalancer USD + IDR Formatting & Conversion', () => {
  it('converts between IDR and USD accurately with safe rate guards', () => {
    expect(idrToUsd(18_000_000, 18_000)).toBe(1000);
    expect(usdToIdr(1250.5, 18_000)).toBe(22_509_000);
    // Non-positive rate falls back to 1 instead of Infinity/NaN
    expect(idrToUsd(1000, 0)).toBe(1000);
    expect(usdToIdr(100, -5)).toBe(100);
  });

  it('formats standard and compact USD strings', () => {
    expect(formatUsd(1250.5)).toBe('$1,250.50');
    expect(formatUsd(550.25, true)).toBe('$550.25');
    expect(formatUsd(5_550, true)).toBe('$5.5K');
    expect(formatUsd(1_250_000, true)).toBe('$1.25M');
    expect(formatUsd(-2_500, true)).toBe('-$2.5K');
  });

  it('formats IDR cleanly in IDR mode and dual USD + IDR in USD mode', () => {
    const rate = 18_000;
    const idrAmount = 18_000_000; // $1,000.00

    expect(formatRebalancerMoney(idrAmount, 'IDR', rate)).toBe('Rp 18.000.000');
    expect(formatRebalancerMoneyWithIdr(idrAmount, 'IDR', rate)).toBe('Rp 18.000.000');

    expect(formatRebalancerMoney(idrAmount, 'USD', rate)).toBe('$1,000.00');
    expect(formatRebalancerMoneyWithIdr(idrAmount, 'USD', rate)).toBe(
      '$1,000.00 (≈ Rp 18.000.000)'
    );
  });
});

describe('Avg Price Toggle Behavior (ignoreAvgBuyPrice & preserveAvgBuyPrice)', () => {
  const bbca = CORE_AND_EXPANDED_ASSETS.find((a) => a.id === 'BBCA')!;
  const rdpt = CORE_AND_EXPANDED_ASSETS.find((a) => a.id === 'RDPT')!;
  const assets = [bbca, rdpt];
  const targetWeights = { BBCA: 50, RDPT: 50 };

  // BBCA is overweight (70% vs 50%), currentPrice 10,000 < avgBuyPrice 12,000 (underwater)
  const holdings: Record<string, HoldingEntry> = {
    BBCA: {
      assetId: 'BBCA',
      currentValueIdr: 70_000_000,
      units: 7_000,
      currentPrice: 10_000,
      avgBuyPrice: 12_000,
      shockPercent: 0,
    },
    RDPT: {
      assetId: 'RDPT',
      currentValueIdr: 30_000_000,
      units: 30_000_000,
      currentPrice: 1,
      shockPercent: 0,
      isNominalOnly: true,
    },
  };

  it('protects underwater asset in selective-profit-trim and computes P&L when Avg Price is ON', () => {
    const plan = calculateRebalancePlan({
      assets,
      targetWeights,
      holdings,
      inputMode: 'nominal',
      usdIdrRate: 18_000,
      cashInjectionIdr: 0,
      rebalanceMode: 'selective-profit-trim',
      driftThresholdAbsolutePercent: 3,
      enableIdxLotRounding: true,
      ignoreAvgBuyPrice: false,
    });

    const bbcaItem = plan.items.find((i) => i.assetId === 'BBCA')!;
    expect(bbcaItem.action).toBe('HOLD');
    expect(bbcaItem.unrealizedGainPercent).toBeLessThan(0);
    expect(bbcaItem.unrealizedGainIdr).toBeLessThan(0);
  });

  it('ignores stale avgBuyPrice in selective-profit-trim and suppresses P&L when Avg Price is OFF', () => {
    const plan = calculateRebalancePlan({
      assets,
      targetWeights,
      holdings,
      inputMode: 'nominal',
      usdIdrRate: 18_000,
      cashInjectionIdr: 0,
      rebalanceMode: 'selective-profit-trim',
      driftThresholdAbsolutePercent: 3,
      enableIdxLotRounding: true,
      ignoreAvgBuyPrice: true,
    });

    const bbcaItem = plan.items.find((i) => i.assetId === 'BBCA')!;
    expect(bbcaItem.action).toBe('SELL');
    expect(bbcaItem.tradeAmountIdr).toBeLessThan(0);
    // P&L suppressed when toggle is OFF
    expect(bbcaItem.unrealizedGainPercent).toBeUndefined();
    expect(bbcaItem.unrealizedGainIdr).toBeUndefined();
    // Original saved avgBuyPrice data on holding is still intact
    expect(holdings.BBCA.avgBuyPrice).toBe(12_000);
  });

  it('preserves existing avgBuyPrice untouched during commit when preserveAvgBuyPrice is true', () => {
    const initialHoldings: Record<string, HoldingEntry> = {
      BBCA: {
        assetId: 'BBCA',
        currentValueIdr: 30_000_000,
        units: 3_000,
        currentPrice: 10_000,
        avgBuyPrice: 12_000,
        shockPercent: 0,
      },
      RDPT: {
        assetId: 'RDPT',
        currentValueIdr: 70_000_000,
        units: 70_000_000,
        currentPrice: 1,
        shockPercent: 0,
        isNominalOnly: true,
      },
    };

    const plan = calculateRebalancePlan({
      assets,
      targetWeights,
      holdings: initialHoldings,
      inputMode: 'nominal',
      usdIdrRate: 18_000,
      cashInjectionIdr: 0,
      rebalanceMode: 'sell-and-buy',
      driftThresholdAbsolutePercent: 3,
      enableIdxLotRounding: true,
      ignoreAvgBuyPrice: true,
    });

    const commitHidden = buildRebalanceCommitResult({
      allAssets: assets,
      holdings: initialHoldings,
      plan,
      activeWeights: targetWeights,
      rebalanceHistory: [],
      inputMode: 'nominal',
      usdIdrRate: 18_000,
      rebalanceMode: 'sell-and-buy',
      cashInjectionIdr: 0,
      isFixedBudgetMode: false,
      fixedTotalBudgetIdr: 0,
      hasManualTableEdits: false,
      preserveAvgBuyPrice: true,
    });

    // Existing avgBuyPrice remains 12,000 instead of being recalculated to weighted average
    expect(commitHidden.nextHoldings.BBCA.avgBuyPrice).toBe(12_000);

    const commitVisible = buildRebalanceCommitResult({
      allAssets: assets,
      holdings: initialHoldings,
      plan,
      activeWeights: targetWeights,
      rebalanceHistory: [],
      inputMode: 'nominal',
      usdIdrRate: 18_000,
      rebalanceMode: 'sell-and-buy',
      cashInjectionIdr: 0,
      isFixedBudgetMode: false,
      fixedTotalBudgetIdr: 0,
      hasManualTableEdits: false,
      preserveAvgBuyPrice: false,
    });

    // When Avg Price tracking is ON, weighted average is recalculated (< 12,000)
    expect(commitVisible.nextHoldings.BBCA.avgBuyPrice).toBeLessThan(12_000);
    expect(commitVisible.nextHoldings.BBCA.avgBuyPrice).toBeGreaterThan(10_000);
  });
});

describe('Backup Persistence for rebalancerCurrency and showAvgBuyPrice', () => {
  it('roundtrips rebalancerCurrency and showAvgBuyPrice in v2 backup payload', () => {
    const payload = {
      version: 2,
      app: 'QuantPorto',
      exportedAt: '2026-11-28T00:00:00.000Z',
      data: {
        menu1_builder: { activeWeights: { BTC: 50, RDPT: 50 } },
        menu2_rebalancer: {
          holdings: {},
          rebalanceHistory: [],
          rebalancerCurrency: 'USD',
          showAvgBuyPrice: true,
        },
        menu3_simulator: {},
        global: { usdIdrRate: 16_500, savedPortfolios: [] },
      },
    };

    const parsed = parseBackupPayload(JSON.stringify(payload));
    expect(parsed.success).toBe(true);
    expect(parsed.data?.data.menu2_rebalancer.rebalancerCurrency).toBe('USD');
    expect(parsed.data?.data.menu2_rebalancer.showAvgBuyPrice).toBe(true);
  });
});
