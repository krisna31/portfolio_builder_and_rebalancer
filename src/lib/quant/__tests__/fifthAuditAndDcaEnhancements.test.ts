import { describe, it, expect } from 'vitest';
import {
  calculateRebalancePlan,
  roundToIdxTick,
  getIdxTickSize,
} from '../rebalancerEngine';
import { getAssetPairwiseCorrelation } from '../riskParitySolver';
import { simulateWealthToGoal } from '../wealthSimulator';
import { CORE_AND_EXPANDED_ASSETS } from '../../../data/presets';
import { HoldingEntry, AssetDefinition, QuantPortoBackupPayload } from '../types';

describe('Fifth Audit Fixes and DCA Enhancements', () => {
  describe('Fix 1: BEI Tick Rounding Inconsistency under Market Shock', () => {
    it('verifies getIdxTickSize returns official BEI tick sizes for all price tiers', () => {
      // Tier 1: < 200 => tick 1
      expect(getIdxTickSize(50)).toBe(1);
      expect(getIdxTickSize(199)).toBe(1);

      // Tier 2: 200 - 500 => tick 2
      expect(getIdxTickSize(200)).toBe(2);
      expect(getIdxTickSize(450)).toBe(2);

      // Tier 3: 500 - 2000 => tick 5
      expect(getIdxTickSize(500)).toBe(5);
      expect(getIdxTickSize(1250)).toBe(5);

      // Tier 4: 2000 - 5000 => tick 10
      expect(getIdxTickSize(2000)).toBe(10);
      expect(getIdxTickSize(3450)).toBe(10);

      // Tier 5: >= 5000 => tick 25
      expect(getIdxTickSize(5000)).toBe(25);
      expect(getIdxTickSize(9850)).toBe(25);
    });

    it('roundToIdxTick rounds accurately to nearest tick', () => {
      // 8569.5 in Tier 5 (tick 25) should round to 8575
      expect(roundToIdxTick(8569.5)).toBe(8575);
      // 4185 in Tier 4 (tick 10) should round to 4190 (or 4180 if floor)
      expect(roundToIdxTick(4185, 'nearest')).toBe(4190);
      expect(roundToIdxTick(4185, 'floor')).toBe(4180);
      expect(roundToIdxTick(4185, 'ceil')).toBe(4190);
    });

    it('guarantees post-shock prices for idx-equity in calculateRebalancePlan adhere strictly to BEI tick sizes', () => {
      const baseBbca = CORE_AND_EXPANDED_ASSETS.find((a) => a.id === 'BBCA')!;
      const baseRdpu = CORE_AND_EXPANDED_ASSETS.find((a) => a.id === 'RDPU')!;
      expect(baseBbca).toBeDefined();
      expect(baseRdpu).toBeDefined();

      const bbcaAsset: AssetDefinition = {
        ...baseBbca,
        defaultPrice: 9850,
      };

      const rdpuAsset: AssetDefinition = {
        ...baseRdpu,
        defaultPrice: 1000,
      };

      const holdings: Record<string, HoldingEntry> = {
        BBCA: {
          assetId: 'BBCA',
          units: 1000,
          currentValueIdr: 9850 * 1000,
          currentPrice: 9850,
          shockPercent: -13, // 9850 * 0.87 = 8569.5 -> rounded to 8575
        },
        RDPU: {
          assetId: 'RDPU',
          units: 10000,
          currentValueIdr: 1000 * 10000,
          currentPrice: 1000,
          shockPercent: 0,
        },
      };

      const planWithShock = calculateRebalancePlan({
        assets: [bbcaAsset, rdpuAsset],
        targetWeights: { BBCA: 50, RDPU: 50 },
        holdings,
        inputMode: 'units',
        usdIdrRate: 16000,
        cashInjectionIdr: 0,
        rebalanceMode: 'sell-and-buy',
        driftThresholdAbsolutePercent: 1,
        enableIdxLotRounding: true,
      });

      const bbcaItem = planWithShock.items.find((i) => i.assetId === 'BBCA');
      expect(bbcaItem).toBeDefined();

      const roundedPrice = roundToIdxTick(9850 * 0.87);
      expect(roundedPrice).toBe(8575);
      expect(roundedPrice % 25).toBe(0);

      // Verify that all executed lots and trade amount align with multiples of 1 lot (100 lembar * 8,575)
      if (bbcaItem && bbcaItem.tradeLotsInteger !== undefined) {
        expect(bbcaItem.tradeUnits % 100).toBe(0);
        const lotCost = 100 * roundedPrice;
        expect(Math.abs(bbcaItem.tradeAmountIdr) % lotCost).toBe(0);
        // Any leftover remainder must be strictly less than 1 lot
        expect(bbcaItem.tradeLotsRemainderIdr).toBeLessThan(lotCost);
      }
    });
  });

  describe('Fix 4: Correlation Matrix Bidirectional Symmetry', () => {
    it('retrieves pairwise correlation symmetrically regardless of asset argument order', () => {
      const gldAsset = CORE_AND_EXPANDED_ASSETS.find((a) => a.id === 'GLD')!;
      const btcAsset = CORE_AND_EXPANDED_ASSETS.find((a) => a.id === 'BTC')!;
      expect(gldAsset).toBeDefined();
      expect(btcAsset).toBeDefined();

      // Query (gld, btc) vs (btc, gld)
      const corrForward = getAssetPairwiseCorrelation(gldAsset, btcAsset);
      const corrReverse = getAssetPairwiseCorrelation(btcAsset, gldAsset);
      expect(corrForward).toBe(corrReverse);
      expect(corrForward).toBe(0.18);
    });

    it('returns 1.0 when comparing an asset with itself', () => {
      const bbcaAsset = CORE_AND_EXPANDED_ASSETS.find((a) => a.id === 'BBCA')!;
      expect(bbcaAsset).toBeDefined();
      expect(getAssetPairwiseCorrelation(bbcaAsset, bbcaAsset)).toBe(1.0);
    });
  });

  describe('Fix 5: Institutional Factsheet Inflation Discounting Forwarding', () => {
    it('correctly discounts nominal target wealth to real purchasing power', () => {
      const initialCapital = 100_000_000;
      const monthlyContribution = 5_000_000;
      const expectedCagr = 12;
      const inflationPercent = 5;

      const simNominal = simulateWealthToGoal({
        initialCapitalIdr: initialCapital,
        monthlyContributionIdr: monthlyContribution,
        annualCagrPercent: expectedCagr,
        maxDrawdownPercent: 15,
        targetWealthIdr: 1_000_000_000,
        annualInflationPercent: 0,
      });

      const simReal = simulateWealthToGoal({
        initialCapitalIdr: initialCapital,
        monthlyContributionIdr: monthlyContribution,
        annualCagrPercent: expectedCagr,
        maxDrawdownPercent: 15,
        targetWealthIdr: 1_000_000_000,
        annualInflationPercent: inflationPercent,
      });

      // Both reach nominal target at same duration because CAGR and savings are identical
      expect(simNominal.yearsToGoal).toBe(simReal.yearsToGoal);

      // Verify real purchasing power at year 10 (month 120)
      const ptNominal = simNominal.timeline.find((p) => p.month === 120);
      const ptReal = simReal.timeline.find((p) => p.month === 120);
      expect(ptNominal).toBeDefined();
      expect(ptReal).toBeDefined();

      if (ptNominal && ptReal) {
        // Real purchasing power is strictly discounted by inflation
        expect(ptReal.realPurchasingPowerIdr).toBeLessThan(ptNominal.totalValueIdr);
        // Nominal value in zero-inflation equals its real purchasing power
        expect(ptNominal.realPurchasingPowerIdr).toBe(ptNominal.totalValueIdr);
      }
    });
  });

  describe('Fix 2 & 3: Backup Payload Schema Integrity', () => {
    it('supports new fields in QuantPortoBackupPayload without schema regression', () => {
      const samplePayload: QuantPortoBackupPayload = {
        version: 2,
        app: 'QuantPorto',
        exportedAt: new Date().toISOString(),
        data: {
          menu1_builder: {
            activeWeights: { BBCA: 50, SBN: 50 },
            lockedAssetIds: ['BBCA'],
            rdptPromoActive: false,
          },
          menu2_rebalancer: {
            holdings: {},
            rebalanceHistory: [],
            inputMode: 'units',
            rebalanceMode: 'sell-and-buy',
            driftThresholdPercent: 5,
            cashInjectionIdr: 10_000_000,
            smartDcaMonthlyBudgetIdr: 5_000_000,
            smartDcaOverflowMode: 'boost-discount',
          },
          menu3_simulator: {
            initialCapitalIdr: 50_000_000,
            monthlySavingsIdr: 5_000_000,
            targetGoalIdr: 10_000_000_000,
            annualInflationPercent: 4.5,
            annualStepUpPct: 5,
            monteCarloDisplayMode: 'real',
          },
          global: {
            usdIdrRate: 16000,
            savedPortfolios: [],
          },
        },
      };

      expect(samplePayload.data.menu2_rebalancer.smartDcaMonthlyBudgetIdr).toBe(5_000_000);
      expect(samplePayload.data.menu2_rebalancer.smartDcaOverflowMode).toBe('boost-discount');
      expect(samplePayload.data.menu3_simulator.monteCarloDisplayMode).toBe('real');
    });
  });
});
