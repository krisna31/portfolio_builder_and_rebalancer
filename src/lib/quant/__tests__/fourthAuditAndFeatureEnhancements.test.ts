import { describe, it, expect } from 'vitest';
import {
  simulateMonteCarloPaths,
  solveRequiredMonthlySavings,
} from '../wealthSimulator';
import {
  calculateRebalancePlan,
  generateCrashBuyingLadder,
} from '../rebalancerEngine';
import { calculateTacticalWeights } from '../tacticalValuationEngine';
import { generatePortfolioRecommendations } from '../portfolioRecommender';
import { parseHoldingsText } from '../textDataParser';
import { normalizeWeightsTo100 } from '../riskParitySolver';
import { CORE_AND_EXPANDED_ASSETS, VIDEO_PORTFOLIO_PRESETS } from '../../../data/presets';
import { HoldingEntry, AssetDefinition } from '../types';

describe('Phase 1-4 Audit Fixes and Enhancements', () => {
  describe('Monte Carlo Simulator & Reverse DCA Solver', () => {
    it('produces deterministic, reproducible paths with seeded Mulberry32 PRNG', () => {
      const run1 = simulateMonteCarloPaths({
        initialCapitalIdr: 100_000_000,
        monthlyContributionIdr: 5_000_000,
        annualCagrPercent: 12,
        annualVolatilityPercent: 15,
        targetGoalIdr: 1_000_000_000,
        maxYears: 10,
        numSimulations: 200,
        annualInflationPercent: 0,
      });

      const run2 = simulateMonteCarloPaths({
        initialCapitalIdr: 100_000_000,
        monthlyContributionIdr: 5_000_000,
        annualCagrPercent: 12,
        annualVolatilityPercent: 15,
        targetGoalIdr: 1_000_000_000,
        maxYears: 10,
        numSimulations: 200,
        annualInflationPercent: 0,
      });

      expect(run1.medianFinalWealthIdr).toBe(run2.medianFinalWealthIdr);
      expect(run1.bearFinalWealthIdr).toBe(run2.bearFinalWealthIdr);
      expect(run1.bullFinalWealthIdr).toBe(run2.bullFinalWealthIdr);
      expect(run1.series[10].p50).toBe(run2.series[10].p50);
      expect(run1.series[10].p10).toBe(run2.series[10].p10);
      expect(run1.series[10].p90).toBe(run2.series[10].p90);
    });

    it('discounts wealth paths against target goal when annualInflationPercent is positive (Decision 3)', () => {
      const nominal = simulateMonteCarloPaths({
        initialCapitalIdr: 100_000_000,
        monthlyContributionIdr: 5_000_000,
        annualCagrPercent: 10,
        annualVolatilityPercent: 15,
        targetGoalIdr: 1_500_000_000,
        maxYears: 10,
        numSimulations: 200,
        annualInflationPercent: 0,
      });

      const real = simulateMonteCarloPaths({
        initialCapitalIdr: 100_000_000,
        monthlyContributionIdr: 5_000_000,
        annualCagrPercent: 10,
        annualVolatilityPercent: 15,
        targetGoalIdr: 1_500_000_000,
        maxYears: 10,
        numSimulations: 200,
        annualInflationPercent: 5.0,
      });

      // Purchasing power is discounted, so reaching the real purchasing power goal is strictly harder
      expect(real.successProbabilityPercent).toBeLessThanOrEqual(nominal.successProbabilityPercent);
      if (real.medianYearsToGoal !== null && nominal.medianYearsToGoal !== null) {
        expect(real.medianYearsToGoal).toBeGreaterThanOrEqual(nominal.medianYearsToGoal);
      }
    });

    it('calculates required monthly DCA correctly in solveRequiredMonthlySavings (Feature 3)', () => {
      // 1. Target already met
      const metSolution = solveRequiredMonthlySavings({
        initialCapitalIdr: 1_000_000_000,
        targetGoalIdr: 500_000_000,
        targetYears: 5,
        annualCagrPercent: 10,
      });
      expect(metSolution.deterministicMonthlyDcaIdr).toBe(0);

      // 2. Horizon 0 years
      const zeroYearSolution = solveRequiredMonthlySavings({
        initialCapitalIdr: 100_000_000,
        targetGoalIdr: 500_000_000,
        targetYears: 0,
        annualCagrPercent: 10,
      });
      expect(zeroYearSolution.deterministicMonthlyDcaIdr).toBeGreaterThanOrEqual(0);

      // 3. Positive target requiring contributions
      const solution = solveRequiredMonthlySavings({
        initialCapitalIdr: 50_000_000,
        targetGoalIdr: 1_000_000_000,
        targetYears: 10,
        annualCagrPercent: 12,
        annualVolatilityPercent: 18,
      });
      expect(solution.deterministicMonthlyDcaIdr).toBeGreaterThan(0);
      // Monte Carlo 75% confidence buffer should require higher savings than deterministic mean
      expect(solution.monteCarlo75MonthlyDcaIdr).toBeGreaterThan(solution.deterministicMonthlyDcaIdr);
      // Values are rounded to IDR 10,000 multiples
      expect(solution.deterministicMonthlyDcaIdr % 10_000).toBe(0);
      expect(solution.monteCarlo75MonthlyDcaIdr % 10_000).toBe(0);
    });
  });

  describe('Rebalancer Engine (Selective Trim, Underwater Protection, Ladder Rounding)', () => {
    const mockAssets: AssetDefinition[] = CORE_AND_EXPANDED_ASSETS;

    it('selective-profit-trim respects high drift cutoffs without 2.0% cap and falls back to HOLD (Decision 2)', () => {
      // BBCA is 60%, Target is 50% -> drift is +10%.
      // If driftThresholdAbsolutePercent is set to 25%, minDriftCutoff = 25 * 0.5 = 12.5%.
      // Since drift (10%) < minDriftCutoff (12.5%), no candidate exceeds cutoff -> 0 sells generated, HOLD
      const holdings: Record<string, HoldingEntry> = {
        BBCA: {
          assetId: 'BBCA',
          currentValueIdr: 60_000_000,
          units: 6000,
          currentPrice: 10_000,
          shockPercent: 0,
          avgBuyPrice: 8_000, // In profit
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
        assets: mockAssets,
        targetWeights: { BBCA: 50, RDPT: 50 },
        holdings,
        inputMode: 'nominal',
        usdIdrRate: 16_000,
        rebalanceMode: 'selective-profit-trim',
        cashInjectionIdr: 0,
        driftThresholdAbsolutePercent: 25.0, // minDriftCutoff = 12.5% > 10% drift
      });

      // No sell should occur because BBCA drift (10%) < cutoff (12.5%)
      const bbcaItem = plan.items.find((i) => i.assetId === 'BBCA');
      expect(bbcaItem?.action).toBe('HOLD');
      expect(plan.totalSellIdr).toBe(0);
    });

    it('selective-profit-trim protects underwater holdings from being trimmed (Feature 5)', () => {
      // BBCA is overweight (60% vs target 50%), but current price is 10,000 and avgBuyPrice is 12,000 (underwater)
      const holdings: Record<string, HoldingEntry> = {
        BBCA: {
          assetId: 'BBCA',
          currentValueIdr: 60_000_000,
          units: 6000,
          currentPrice: 10_000,
          shockPercent: 0,
          avgBuyPrice: 12_000, // Underwater!
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
        assets: mockAssets,
        targetWeights: { BBCA: 50, RDPT: 50 },
        holdings,
        inputMode: 'nominal',
        usdIdrRate: 16_000,
        rebalanceMode: 'selective-profit-trim',
        cashInjectionIdr: 0,
        driftThresholdAbsolutePercent: 2.0,
      });

      const bbcaItem = plan.items.find((i) => i.assetId === 'BBCA');
      expect(bbcaItem?.action).toBe('HOLD');
      expect(plan.totalSellIdr).toBe(0);
    });

    it('generateCrashBuyingLadder respects enableIdxLotRounding for Indonesian equities (Bug 9)', () => {
      const bbcaAsset = mockAssets.find((a) => a.id === 'BBCA')!;
      const ladder = generateCrashBuyingLadder({
        targetAsset: bbcaAsset,
        allAssets: mockAssets,
        targetWeights: { BBCA: 50, RDPT: 50 },
        holdings: {
          BBCA: {
            assetId: 'BBCA',
            currentValueIdr: 50_000_000,
            units: 5000,
            currentPrice: 10_000,
            shockPercent: 0,
          },
          RDPT: {
            assetId: 'RDPT',
            currentValueIdr: 50_000_000,
            units: 50_000_000,
            currentPrice: 1,
            shockPercent: 0,
            isNominalOnly: true,
          },
        },
        inputMode: 'nominal',
        usdIdrRate: 16_000,
        dropTiers: [-10, -20],
        enableIdxLotRounding: true,
      });

      expect(ladder.length).toBe(2);
      for (const step of ladder) {
        // Shares must be a multiple of 100 shares (1 IDX lot)
        expect(step.rebalanceBuyUnits % 100).toBe(0);
        expect(step.rebalanceBuyLots).toBe(step.rebalanceBuyUnits / 100);
      }
    });
  });

  describe('Tactical Valuation Engine', () => {
    it('resets tilt cleanly to neutral when autoApplyValuationTilts is false or intensity is 0 (Bug 10)', () => {
      const baseWeights = {
        BBCA: 40,
        RDPT: 30,
        RDPU: 30,
      };

      const result = calculateTacticalWeights(
        baseWeights,
        CORE_AND_EXPANDED_ASSETS,
        {
          enabled: true,
          aggressiveness: 0,
          cryptoScore: 50,
          usEquityScore: 50,
          idxEquityScore: 50,
        }
      );

      expect(result.isAnyTiltApplied).toBe(false);
      expect(result.tacticalWeights.BBCA).toBe(40);
      expect(result.tacticalWeights.RDPT).toBe(30);
      expect(result.tacticalWeights.RDPU).toBe(30);
      expect(Object.keys(result.tacticalSignals)).toHaveLength(0);
    });
  });

  describe('Bug 5, 12, and 16 Edge Case Verifications', () => {
    it('Bug 5: parses crypto units with 8 decimal precision in parseHoldingsText', () => {
      const parsed = parseHoldingsText(
        'BTC 0.00123456',
        CORE_AND_EXPANDED_ASSETS,
        'units',
        16_000
      );
      expect(parsed.items).toHaveLength(1);
      expect(parsed.items[0].assetId).toBe('BTC');
      expect(parsed.items[0].units).toBe(0.00123456);
    });

    it('Bug 12: normalizeWeightsTo100 accurately normalizes merged active weights to 100%', () => {
      const mergedWeights = {
        RDPT: 35,
        BBCA: 25,
        GLD: 15,
        SPY: 15,
        QQQ: 20, // Total is 110%
      };
      const normalized = normalizeWeightsTo100(mergedWeights);
      const total = Object.values(normalized).reduce((a, b) => a + b, 0);
      expect(Math.round(total)).toBe(100);
    });

    it('Bug 16: strictly excludes crypto presets when user excludes crypto in Smart Recommender', () => {
      const recommendations = generatePortfolioRecommendations(
        {
          profile: 'balanced-quant',
          crashTolerance: 'moderat',
          selectedAssetIds: ['RDPT', 'BBCA', 'GLD', 'SPY'],
          assetSelectionPreset: 'no-crypto',
          convictionPreference: 'auto-equal',
          idxEquitySlotChoice: 'BBCA',
          initialCapitalIdr: 100_000_000,
          monthlySavingsIdr: 5_000_000,
          targetGoalIdr: 1_000_000_000,
        },
        CORE_AND_EXPANDED_ASSETS,
        VIDEO_PORTFOLIO_PRESETS
      );

      // Verify that neither the primary nor alternative presets contain any BTC or ETH weights
      expect(recommendations.primaryRecommendation.weights.BTC ?? 0).toBe(0);
      expect(recommendations.primaryRecommendation.weights.ETH ?? 0).toBe(0);
      for (const alt of recommendations.alternativeRecommendations) {
        expect(alt.weights.BTC ?? 0).toBe(0);
        expect(alt.weights.ETH ?? 0).toBe(0);
      }
    });

    it('Bug 2 & 6: zeroed-out sub-10k trade synchronizes targetValueIdr with postShockValueIdr', () => {
      // Create a scenario where tradeAmountIdr is between 1.000 and 10.000 IDR (e.g. 5.000 IDR)
      const holdings: Record<string, HoldingEntry> = {
        BBCA: {
          assetId: 'BBCA',
          currentValueIdr: 49_995_000,
          units: 4999.5,
          currentPrice: 10_000,
          shockPercent: 0,
        },
        RDPT: {
          assetId: 'RDPT',
          currentValueIdr: 50_005_000,
          units: 50_005_000,
          currentPrice: 1,
          shockPercent: 0,
          isNominalOnly: true,
        },
      };

      const plan = calculateRebalancePlan({
        assets: CORE_AND_EXPANDED_ASSETS,
        targetWeights: { BBCA: 50, RDPT: 50 },
        holdings,
        inputMode: 'nominal',
        usdIdrRate: 16_000,
        rebalanceMode: 'sell-and-buy',
        cashInjectionIdr: 0,
        driftThresholdAbsolutePercent: 3.0,
        enableIdxLotRounding: false, // test raw dead-zone without lot quantization
        filterDustTrades: false,
      });

      const bbca = plan.items.find((i) => i.assetId === 'BBCA');
      expect(bbca).toBeDefined();
      expect(bbca?.action).toBe('HOLD');
      expect(bbca?.tradeAmountIdr).toBe(0);
      // targetValueIdr must equal postShockValueIdr when trade is zeroed out
      expect(bbca?.targetValueIdr).toBe(bbca?.postShockValueIdr);
    });
  });
});


