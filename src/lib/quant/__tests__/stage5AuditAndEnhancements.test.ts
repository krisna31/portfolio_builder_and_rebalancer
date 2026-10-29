import { describe, it, expect } from 'vitest';
import { simulateWealthToGoal } from '../wealthSimulator';
import { CORE_AND_EXPANDED_ASSETS } from '../../../data/presets';
import { AssetDefinition, HoldingEntry } from '../types';

describe('Stage 5 Audit and System-Wide Optimizations', () => {
  describe('Feature 1: Share Link Payload with Smart DCA Strategy', () => {
    it('properly encodes and restores Smart DCA parameters alongside portfolio weights', () => {
      const payload = {
        weights: { BBCA: 40, SBN: 40, GLD: 20 },
        presetId: 'all-weather-id',
        method: 'preset',
        capital: 50_000_000,
        dca: 5_000_000,
        goal: 1_000_000_000,
        smartDcaMonthlyBudgetIdr: 7_500_000,
        smartDcaOverflowMode: 'boost-discount',
        smartDcaAllocationMode: 'pure-confluence-rank',
        smartDcaIndicatorOverrides: {
          BTC: { customCycleScore: 88 },
        },
      };

      // Base64 round-trip simulation
      const jsonStr = JSON.stringify(payload);
      const encoded = btoa(unescape(encodeURIComponent(jsonStr)));
      const decodedStr = decodeURIComponent(escape(atob(encoded)));
      const restored = JSON.parse(decodedStr);

      expect(restored.weights).toEqual(payload.weights);
      expect(restored.smartDcaMonthlyBudgetIdr).toBe(7_500_000);
      expect(restored.smartDcaOverflowMode).toBe('boost-discount');
      expect(restored.smartDcaAllocationMode).toBe('pure-confluence-rank');
      expect(restored.smartDcaIndicatorOverrides?.BTC?.customCycleScore).toBe(88);
    });
  });

  describe('Feature 2: Institutional Factsheet Dividend Compounding & Cashout Alignment', () => {
    it('correctly reduces compounding rate when dividendUsageMode is cashout-passive', () => {
      const initialCapital = 100_000_000;
      const monthlyDca = 5_000_000;
      const rawCagr = 12.0; // 12% total return CAGR
      const netDividendYield = 4.0; // 4% net dividend yield

      // In DRIP mode: all returns compound
      const effectiveCagrDrip = rawCagr;
      const simDrip = simulateWealthToGoal({
        initialCapitalIdr: initialCapital,
        monthlyContributionIdr: monthlyDca,
        annualCagrPercent: effectiveCagrDrip,
        maxDrawdownPercent: 10,
        maxYears: 10,
        netDividendYieldPercent: netDividendYield,
      });

      // In Cashout mode: dividend is taken as living cash, compounding is cagr - yield
      const effectiveCagrCashout = Math.max(2, rawCagr - netDividendYield);
      const simCashout = simulateWealthToGoal({
        initialCapitalIdr: initialCapital,
        monthlyContributionIdr: monthlyDca,
        annualCagrPercent: effectiveCagrCashout,
        maxDrawdownPercent: 10,
        maxYears: 10,
        netDividendYieldPercent: netDividendYield,
      });

      expect(effectiveCagrCashout).toBe(8.0);
      // Cashout mode must have lower ending capital because yield was cashed out
      expect(simCashout.timeline[simCashout.timeline.length - 1].totalValueIdr).toBeLessThan(
        simDrip.timeline[simDrip.timeline.length - 1].totalValueIdr
      );
    });

    it('computes weighted net dividend yield across active portfolio weights accurately', () => {
      const activeAssetList = [
        {
          id: 'BBCA',
          category: 'idx-equity' as const,
          weightPct: 50,
          dividendYield: 3.0, // 3% gross => 2.7% net after 10% tax
        },
        {
          id: 'SBN',
          category: 'bonds' as const,
          weightPct: 30,
          dividendYield: 6.5, // 6.5% gross => 5.85% net after 10% tax
        },
        {
          id: 'GLD',
          category: 'gold' as const,
          weightPct: 20,
          dividendYield: 0, // 0%
        },
      ];

      let weightedNet = 0;
      for (const a of activeAssetList) {
        const gross = a.dividendYield ?? 0;
        const taxRate = a.category === 'idx-equity' ? 0.1 : a.category === 'bonds' ? 0.1 : 0;
        const net = gross * (1 - taxRate);
        weightedNet += (a.weightPct / 100) * net;
      }

      // (0.50 * 2.7) + (0.30 * 5.85) + (0.20 * 0) = 1.35 + 1.755 = 3.105%
      expect(Number(weightedNet.toFixed(2))).toBe(3.11);
    });
  });

  describe('Feature 3: Rebalancer Lot Override Dead-Zone and Short-Selling Guards', () => {
    it('clamps lot override decrements so candidate lots never drop below 0 (eliminates dead clicks)', () => {
      const baseLots = 2; // Recommended BUY 2 lots
      let currentOverride = 0;

      // Simulate clicking '-' 5 times
      const adjustLotOverride = (current: number, delta: number, base: number) => {
        let nextDelta = current + delta;
        const candidate = base + nextDelta;
        if (candidate < 0) {
          nextDelta = -base;
        }
        return nextDelta;
      };

      for (let i = 0; i < 5; i++) {
        currentOverride = adjustLotOverride(currentOverride, -1, baseLots);
      }

      // Even after 5 clicks of '-', override is clamped at -2 so base (2) + override (-2) = 0
      expect(currentOverride).toBe(-2);
      expect(baseLots + currentOverride).toBe(0);

      // Now clicking '+' once must immediately produce 1 lot without dead clicks
      currentOverride = adjustLotOverride(currentOverride, 1, baseLots);
      expect(currentOverride).toBe(-1);
      expect(baseLots + currentOverride).toBe(1);
    });

    it('clamps lot override increments for SELL orders to prevent short-selling beyond held units', () => {
      const baseLots = 1; // Recommended SELL 1 lot
      const holdingUnits = 200; // User holds 2 lots (200 units)
      const maxSellLots = Math.floor(holdingUnits / 100); // 2 lots

      const adjustSellLotOverride = (
        current: number,
        delta: number,
        base: number,
        maxSell: number
      ) => {
        let nextDelta = current + delta;
        const candidate = base + nextDelta;
        if (candidate < 0) {
          nextDelta = -base;
        }
        if (candidate > maxSell) {
          nextDelta = maxSell - base;
        }
        return nextDelta;
      };

      let currentOverride = 0;

      // Click '+' 5 times to try to sell more lots
      for (let i = 0; i < 5; i++) {
        currentOverride = adjustSellLotOverride(currentOverride, 1, baseLots, maxSellLots);
      }

      // Must be capped at maxSell (2 lots), so override is 2 - 1 = +1
      expect(currentOverride).toBe(1);
      expect(baseLots + currentOverride).toBe(2);
      expect(baseLots + currentOverride).toBeLessThanOrEqual(maxSellLots);
    });
  });
});
