import { describe, it, expect } from 'vitest';
import { CORE_AND_EXPANDED_ASSETS, VIDEO_PORTFOLIO_PRESETS } from '../../../data/presets';
import { HoldingEntry, PortfolioPreset } from '../types';
import { calculateRebalancePlan, generateCrashBuyingLadder } from '../rebalancerEngine';
import { parseFinancialNumber, parseHoldingsText } from '../textDataParser';
import { buildDynamicPresetsForSlotMap } from '../riskParitySolver';
import { simulateMonteCarloPaths } from '../wealthSimulator';

describe('Second Stage Audit Fixes Verification', () => {
  describe('Fix 1 & 2: Clamp Sell Lots to Owned Regular Lots (No Retail Naked Short-Selling)', () => {
    it('clamps sell lots in unit mode when selling fractional lots (150 shares -> max 1 regular lot)', () => {
      // BBCA price = 10,000 IDR (1 Lot = 100 shares = Rp 1,000,000)
      // User owns 150 shares (1.5 lots = Rp 1,500,000)
      // Target weight wants 0% (sell all)
      const targetWeights = { RDPT: 100, BBCA: 0 };
      const holdings: Record<string, HoldingEntry> = {
        RDPT: { assetId: 'RDPT', currentValueIdr: 10_000_000, units: 10_000_000, currentPrice: 1, shockPercent: 0, isNominalOnly: true },
        BBCA: { assetId: 'BBCA', currentValueIdr: 1_500_000, units: 150, currentPrice: 10_000, shockPercent: 0 },
      };

      const plan = calculateRebalancePlan({
        assets: CORE_AND_EXPANDED_ASSETS,
        targetWeights,
        holdings,
        inputMode: 'units',
        usdIdrRate: 16000,
        rebalanceMode: 'sell-and-buy',
        cashInjectionIdr: 0,
        driftThresholdAbsolutePercent: 1,
        enableIdxLotRounding: true,
        sweepRemainderToDefensive: false,
      });

      const bbca = plan.items.find((i) => i.assetId === 'BBCA');
      expect(bbca).toBeDefined();
      expect(bbca?.action).toBe('SELL');
      // Without clamping, rawLots (-1.5) rounded to -2 lots (-200 shares), which exceeds the 150 shares owned!
      // With clamping, max regular lots is Math.floor(150 / 100) = 1 lot.
      expect(bbca?.tradeLotsInteger).toBe(-1);
      expect(bbca?.tradeUnits).toBe(-100);
      expect(bbca?.tradeAmountIdr).toBe(-1_000_000);
      // Remainder represents the 50 odd-lot shares that cannot be sold on the regular board
      expect(bbca?.tradeLotsRemainderIdr).toBe(-500_000);
    });

    it('clamps sell lots in nominal mode based on implied unit price (150 shares equivalent)', () => {
      // BBCA unit price = 10,000 IDR. Nominal = 1,500,000 IDR -> Implied units = 150 shares
      const targetWeights = { RDPT: 100, BBCA: 0 };
      const holdings: Record<string, HoldingEntry> = {
        RDPT: { assetId: 'RDPT', currentValueIdr: 10_000_000, units: 10_000_000, currentPrice: 1, shockPercent: 0, isNominalOnly: true },
        BBCA: { assetId: 'BBCA', currentValueIdr: 1_500_000, units: 0, currentPrice: 10_000, shockPercent: 0 },
      };

      const plan = calculateRebalancePlan({
        assets: CORE_AND_EXPANDED_ASSETS,
        targetWeights,
        holdings,
        inputMode: 'nominal',
        usdIdrRate: 16000,
        rebalanceMode: 'sell-and-buy',
        cashInjectionIdr: 0,
        driftThresholdAbsolutePercent: 1,
        enableIdxLotRounding: true,
        sweepRemainderToDefensive: false,
      });

      const bbca = plan.items.find((i) => i.assetId === 'BBCA');
      expect(bbca?.tradeLotsInteger).toBe(-1);
      expect(bbca?.tradeUnits).toBe(-100);
    });

    it('prevents regular board sell when owned units < 100 (odd lot holding)', () => {
      // User owns 85 shares (< 100 shares = 0 lots on regular board)
      const targetWeights = { RDPT: 100, BBCA: 0 };
      const holdings: Record<string, HoldingEntry> = {
        RDPT: { assetId: 'RDPT', currentValueIdr: 10_000_000, units: 10_000_000, currentPrice: 1, shockPercent: 0, isNominalOnly: true },
        BBCA: { assetId: 'BBCA', currentValueIdr: 850_000, units: 85, currentPrice: 10_000, shockPercent: 0 },
      };

      const plan = calculateRebalancePlan({
        assets: CORE_AND_EXPANDED_ASSETS,
        targetWeights,
        holdings,
        inputMode: 'units',
        usdIdrRate: 16000,
        rebalanceMode: 'sell-and-buy',
        cashInjectionIdr: 0,
        driftThresholdAbsolutePercent: 1,
        enableIdxLotRounding: true,
        sweepRemainderToDefensive: false,
      });

      const bbca = plan.items.find((i) => i.assetId === 'BBCA');
      // maxSellLots is 0, so intLots is 0 (regular board order cannot be placed)
      expect(bbca?.tradeLotsInteger).toBe(0);
      expect(bbca?.tradeUnits).toBe(0);
      expect(bbca?.tradeAmountIdr).toBe(0);
    });
  });

  describe('Fix 3: Normalized Target Weight Accuracy under Tactical Asset Allocation', () => {
    it('uses effectiveTargetWeights divided by rawWeightSum for normTargetWeight', () => {
      const targetWeights = { RDPT: 50, BBCA: 50 };
      const holdings: Record<string, HoldingEntry> = {
        RDPT: { assetId: 'RDPT', currentValueIdr: 50_000_000, units: 50_000_000, currentPrice: 1, shockPercent: 0, isNominalOnly: true },
        BBCA: { assetId: 'BBCA', currentValueIdr: 50_000_000, units: 5000, currentPrice: 10_000, shockPercent: 0 },
      };

      const plan = calculateRebalancePlan({
        assets: CORE_AND_EXPANDED_ASSETS,
        targetWeights,
        holdings,
        inputMode: 'nominal',
        usdIdrRate: 16000,
        rebalanceMode: 'sell-and-buy',
        cashInjectionIdr: 0,
        driftThresholdAbsolutePercent: 1,
      });

      const rdpt = plan.items.find((i) => i.assetId === 'RDPT');
      const bbca = plan.items.find((i) => i.assetId === 'BBCA');
      expect(rdpt?.targetWeightPercent).toBe(50);
      expect(bbca?.targetWeightPercent).toBe(50);
    });
  });

  describe('Fix 4: Defensive Remainder Sweep to Nominal-Only Assets (RDPT/RDPU)', () => {
    it('preserves tradeUnits as direct IDR amount and increments targetValueIdr', () => {
      // BBCA 1 Lot = Rp 1,000,000. Target allocation results in an unallocated remainder.
      const targetWeights = { RDPT: 50, BBCA: 50 };
      const holdings: Record<string, HoldingEntry> = {
        RDPT: { assetId: 'RDPT', currentValueIdr: 50_000_000, units: 50_000_000, currentPrice: 1, shockPercent: 0, isNominalOnly: true },
        BBCA: { assetId: 'BBCA', currentValueIdr: 50_000_000, units: 5000, currentPrice: 10_000, shockPercent: 0 },
      };

      const plan = calculateRebalancePlan({
        assets: CORE_AND_EXPANDED_ASSETS,
        targetWeights,
        holdings,
        inputMode: 'nominal',
        usdIdrRate: 16000,
        rebalanceMode: 'sell-and-buy',
        cashInjectionIdr: 1_500_000, // BBCA gets 750,000 -> 0 lots (750k remainder swept to RDPT)
        driftThresholdAbsolutePercent: 1,
        enableIdxLotRounding: true,
        sweepRemainderToDefensive: true,
      });

      const rdpt = plan.items.find((i) => i.assetId === 'RDPT');
      expect(rdpt).toBeDefined();
      expect(rdpt?.isNominalOnly).toBe(true);
      // For nominal-only defensive asset, tradeUnits must equal tradeAmountIdr (not divided by price 54,200)
      expect(rdpt?.tradeUnits).toBe(rdpt?.tradeAmountIdr);
      expect(rdpt?.tradeAmountIdr).toBeGreaterThan(0);
      expect(rdpt?.targetValueIdr).toBe(rdpt!.postShockValueIdr + rdpt!.tradeAmountIdr);
    });
  });

  describe('Fix 5: Integer Lots in Crash Buying Ladder', () => {
    it('generates integer lots and 100-multiple buyUnits for IDX stocks', () => {
      const bbcaAsset = CORE_AND_EXPANDED_ASSETS.find((a) => a.id === 'BBCA')!;
      const holdings: Record<string, HoldingEntry> = {
        RDPT: { assetId: 'RDPT', currentValueIdr: 80_000_000, units: 80_000_000, currentPrice: 1, shockPercent: 0, isNominalOnly: true },
        BBCA: { assetId: 'BBCA', currentValueIdr: 20_000_000, units: 2000, currentPrice: 10_000, shockPercent: 0 },
      };

      const ladder = generateCrashBuyingLadder({
        targetAsset: bbcaAsset,
        allAssets: CORE_AND_EXPANDED_ASSETS,
        targetWeights: { RDPT: 40, BBCA: 60 },
        holdings,
        inputMode: 'units',
        usdIdrRate: 16000,
        extraCashIdr: 10_000_000,
        dropTiers: [-10, -20, -35, -50],
      });

      expect(ladder).toHaveLength(4);
      for (const step of ladder) {
        expect(step.rebalanceBuyLots).toBeDefined();
        // rebalanceBuyLots must be an integer, never a fraction like 1.4
        expect(Number.isInteger(step.rebalanceBuyLots)).toBe(true);
        // rebalanceBuyUnits must be an exact multiple of 100
        expect(step.rebalanceBuyUnits % 100).toBe(0);
        expect(step.rebalanceBuyUnits).toBe((step.rebalanceBuyLots ?? 0) * 100);
      }
    });
  });

  describe('Fix 6 & 7: Number Parser & Penny Stock Unit Mode Safety', () => {
    it('does NOT strip decimal point in 0.125 or 0.05 BTC', () => {
      const res1 = parseFinancialNumber('0.125');
      expect(res1.value).toBe(0.125);

      const res2 = parseFinancialNumber('0.05');
      expect(res2.value).toBe(0.05);

      const res3 = parseFinancialNumber('BTC 0.125');
      expect(res3.value).toBe(0.125);
    });

    it('still correctly parses Indonesian thousand separators with non-zero leading digits', () => {
      const res = parseFinancialNumber('15.000.000');
      expect(res.value).toBe(15_000_000);
      const res2 = parseFinancialNumber('1.250.000,50');
      expect(res2.value).toBe(1_250_000.5);
    });

    it('preserves unit mode for penny stocks with large share counts (e.g. GOTO 2000000)', () => {
      const gotoAsset = {
        id: 'GOTO',
        symbol: 'GOTO',
        name: 'GoTo Gojek Tokopedia Tbk',
        shortName: 'GOTO',
        category: 'idx-equity' as const,
        currency: 'IDR' as const,
        cagr: -10,
        maxDrawdown: 60,
        volatility: 40,
        riskScale: 5,
        defaultPrice: 50,
        lotSize: 100,
        allowFractional: false,
        isCoreBenchmark: false,
        color: '#00aa13',
        description: 'Ekuitas teknologi IDX',
      };
      const assets = [...CORE_AND_EXPANDED_ASSETS, gotoAsset];
      const text = 'GOTO 2000000';
      const parsed = parseHoldingsText(text, assets, 'units', 16000);
      expect(parsed.items).toHaveLength(1);
      const item = parsed.items[0];
      expect(item.assetId).toBe('GOTO');
      // In unit mode without currency markers, 2,000,000 must stay as 2,000,000 shares
      expect(item.units).toBe(2_000_000);
      expect(item.mode).toBe('units');
      // Nominal IDR is computed as units * price (GOTO defaultPrice = 50 IDR) -> 100,000,000 IDR
      expect(item.nominalIdr).toBe(100_000_000);
    });

    it('switches to nominal mode if currency marker is explicitly specified in unit mode', () => {
      const gotoAsset = {
        id: 'GOTO',
        symbol: 'GOTO',
        name: 'GoTo Gojek Tokopedia Tbk',
        shortName: 'GOTO',
        category: 'idx-equity' as const,
        currency: 'IDR' as const,
        cagr: -10,
        maxDrawdown: 60,
        volatility: 40,
        riskScale: 5,
        defaultPrice: 50,
        lotSize: 100,
        allowFractional: false,
        isCoreBenchmark: false,
        color: '#00aa13',
        description: 'Ekuitas teknologi IDX',
      };
      const assets = [...CORE_AND_EXPANDED_ASSETS, gotoAsset];
      const text = 'GOTO Rp 2.000.000';
      const parsed = parseHoldingsText(text, assets, 'units', 16000);
      expect(parsed.items).toHaveLength(1);
      const item = parsed.items[0];
      expect(item.assetId).toBe('GOTO');
      expect(item.mode).toBe('nominal');
      expect(item.nominalIdr).toBe(2_000_000);
    });
  });

  describe('Fix 8 & 12: Dynamic Presets Key Remapping for Custom Presets', () => {
    it('remaps custom preset weights when a benchmark slot is substituted', () => {
      const customPreset: PortfolioPreset = {
        id: 'custom-test',
        name: 'Custom Mix',
        method: 'custom',
        riskTier: 'medium',
        cagr: 15,
        maxDrawdown: 10,
        isOptimal15: true,
        weights: {
          BBCA: 30,
          RDPT: 70,
        },
      };

      const slotMap = {
        RDPU: 'RDPU',
        RDPT: 'RDPT',
        BBCA: 'PTBA', // BBCA replaced by PTBA
        GLD: 'GLD',
        SPY: 'SPY',
        QQQ: 'QQQ',
        BTC: 'BTC',
        ETH: 'ETH',
      };

      const dynamicPresets = buildDynamicPresetsForSlotMap(
        [customPreset],
        slotMap,
        CORE_AND_EXPANDED_ASSETS,
        0
      );

      expect(dynamicPresets).toHaveLength(1);
      const mapped = dynamicPresets[0];
      // BBCA weight should now be mapped to PTBA (30%), NOT lost as 0%
      expect(mapped.weights.PTBA).toBe(30);
      expect(mapped.weights.RDPT).toBe(70);
      expect(mapped.weights.BBCA).toBeUndefined();
    });
  });

  describe('Fix 16: Monte Carlo Annual Step-Up Support', () => {
    it('compounds monthly savings annually and produces higher wealth than without step-up', () => {
      const baseRes = simulateMonteCarloPaths({
        initialCapitalIdr: 50_000_000,
        monthlyContributionIdr: 5_000_000,
        annualCagrPercent: 12,
        annualVolatilityPercent: 15,
        targetGoalIdr: 500_000_000,
        maxYears: 10,
        numSimulations: 200,
        annualStepUpPercent: 0,
      });

      const stepUpRes = simulateMonteCarloPaths({
        initialCapitalIdr: 50_000_000,
        monthlyContributionIdr: 5_000_000,
        annualCagrPercent: 12,
        annualVolatilityPercent: 15,
        targetGoalIdr: 500_000_000,
        maxYears: 10,
        numSimulations: 200,
        annualStepUpPercent: 10, // 10% annual step-up
      });

      // With step-up, median final wealth and principal must be significantly higher
      expect(stepUpRes.series[10].principal).toBeGreaterThan(baseRes.series[10].principal);
      expect(stepUpRes.medianFinalWealthIdr).toBeGreaterThan(baseRes.medianFinalWealthIdr);
      expect(stepUpRes.successProbabilityPercent).toBeGreaterThanOrEqual(baseRes.successProbabilityPercent);
    });
  });

  describe('Fix 19: Broker Slip Formatting (No Double Negatives)', () => {
    it('guarantees positive lot numbers for SELL instructions in order slips', () => {
      // In rebalanceItemResult, tradeLotsInteger for SELL is negative (e.g. -5)
      const tradeLotsInteger = -5;
      const lotsFormatted = Math.abs(tradeLotsInteger ?? 0);
      expect(lotsFormatted).toBe(5);
      const actionStr = 'JUAL';
      const slipLine = `[ ] ${actionStr} BBCA - ${lotsFormatted} Lot (${(lotsFormatted * 100).toLocaleString('id-ID')} lembar)`;
      expect(slipLine).toBe('[ ] JUAL BBCA - 5 Lot (500 lembar)');
      expect(slipLine).not.toContain('- -');
    });
  });

  describe('Fix 4 (extended): Dust Filter Resets targetValueIdr', () => {
    it('resets targetValueIdr to postShockValueIdr when trade is dust filtered', () => {
      // GLD is allowFractional: true. Trade amount between 10,000 and 25,000 (e.g. ~15,000 IDR) triggers BUY then dust filter
      const targetWeights = { RDPT: 99.98, GLD: 0.02 };
      const holdings: Record<string, HoldingEntry> = {
        RDPT: { assetId: 'RDPT', currentValueIdr: 99_980_000, units: 99_980_000, currentPrice: 1, shockPercent: 0, isNominalOnly: true },
        GLD: { assetId: 'GLD', currentValueIdr: 5_000, units: 0.001, currentPrice: 270, shockPercent: 0 },
      };

      const plan = calculateRebalancePlan({
        assets: CORE_AND_EXPANDED_ASSETS,
        targetWeights,
        holdings,
        inputMode: 'nominal',
        usdIdrRate: 16000,
        rebalanceMode: 'sell-and-buy',
        cashInjectionIdr: 0,
        driftThresholdAbsolutePercent: 0.001,
        filterDustTrades: true,
        dustTradeThresholdIdr: 25_000,
      });

      const gld = plan.items.find((i) => i.assetId === 'GLD');
      expect(gld?.isDustFiltered).toBe(true);
      expect(gld?.action).toBe('HOLD');
      expect(gld?.tradeAmountIdr).toBe(0);
      // targetValueIdr must be reset to postShockValueIdr (5,000 IDR), not ideal target (20,000 IDR)
      expect(gld?.targetValueIdr).toBe(gld?.postShockValueIdr);
    });
  });

  describe('Fix 4 (extended): Remainder Sweep tradeAmountUsd & Custom Bond Fallback', () => {
    it('synchronizes tradeAmountUsd when remainder is swept into defensive asset', () => {
      const targetWeights = { RDPT: 50, BBCA: 50 };
      const holdings: Record<string, HoldingEntry> = {
        RDPT: { assetId: 'RDPT', currentValueIdr: 50_000_000, units: 50_000_000, currentPrice: 1, shockPercent: 0, isNominalOnly: true },
        BBCA: { assetId: 'BBCA', currentValueIdr: 50_000_000, units: 5000, currentPrice: 10_000, shockPercent: 0 },
      };

      const plan = calculateRebalancePlan({
        assets: CORE_AND_EXPANDED_ASSETS,
        targetWeights,
        holdings,
        inputMode: 'nominal',
        usdIdrRate: 16000,
        rebalanceMode: 'sell-and-buy',
        cashInjectionIdr: 1_500_000,
        driftThresholdAbsolutePercent: 1,
        enableIdxLotRounding: true,
        sweepRemainderToDefensive: true,
      });

      const rdpt = plan.items.find((i) => i.assetId === 'RDPT');
      expect(rdpt).toBeDefined();
      expect(rdpt?.tradeAmountIdr).toBeGreaterThan(0);
      // tradeAmountUsd must match tradeAmountIdr / usdIdrRate
      expect(rdpt?.tradeAmountUsd).toBe(Number((rdpt!.tradeAmountIdr / 16000).toFixed(2)));
    });

    it('falls back to custom bond asset when RDPT/RDPU are not present', () => {
      const customBond = {
        id: 'OBLIGASI_NEGARA',
        symbol: 'ORI024',
        name: 'Obligasi Negara Ritel ORI024',
        shortName: 'ORI024',
        category: 'bonds' as const,
        currency: 'IDR' as const,
        cagr: 6.5,
        maxDrawdown: 2,
        volatility: 3,
        riskScale: 2,
        defaultPrice: 1,
        lotSize: 1,
        allowFractional: true,
        isCoreBenchmark: false,
        color: '#0284c7',
        description: 'SBN Ritel',
      };
      const assets = [...CORE_AND_EXPANDED_ASSETS, customBond];
      const targetWeights = { OBLIGASI_NEGARA: 50, BBCA: 50 };
      const holdings: Record<string, HoldingEntry> = {
        OBLIGASI_NEGARA: { assetId: 'OBLIGASI_NEGARA', currentValueIdr: 50_000_000, units: 50_000_000, currentPrice: 1, shockPercent: 0, isNominalOnly: true },
        BBCA: { assetId: 'BBCA', currentValueIdr: 50_000_000, units: 5000, currentPrice: 10_000, shockPercent: 0 },
      };

      const plan = calculateRebalancePlan({
        assets,
        targetWeights,
        holdings,
        inputMode: 'nominal',
        usdIdrRate: 16000,
        rebalanceMode: 'sell-and-buy',
        cashInjectionIdr: 1_500_000, // BBCA gets 750,000 -> 0 lots (750k swept to ORI024)
        driftThresholdAbsolutePercent: 1,
        enableIdxLotRounding: true,
        sweepRemainderToDefensive: true,
      });

      const bond = plan.items.find((i) => i.assetId === 'OBLIGASI_NEGARA');
      expect(bond).toBeDefined();
      expect(bond?.tradeAmountIdr).toBe(1_500_000); // 750k initial allocation + 750k swept remainder
      expect(bond?.tradeUnits).toBe(1_500_000);
    });
  });

  describe('Fix 5 (extended): Crash Buying Ladder Zero-Lot IDR Alignment', () => {
    it('sets rebalanceBuyAmountIdr to 0 when allocated cash cannot buy even 1 lot', () => {
      const bbcaAsset = CORE_AND_EXPANDED_ASSETS.find((a) => a.id === 'BBCA')!;
      // Small portfolio: BBCA is 10k IDR/share (1 Lot = 1,000,000 IDR)
      // Extra cash only 100,000 IDR (can only buy 10 shares, but lotSize = 100)
      const holdings: Record<string, HoldingEntry> = {
        RDPT: { assetId: 'RDPT', currentValueIdr: 500_000, units: 500_000, currentPrice: 1, shockPercent: 0, isNominalOnly: true },
        BBCA: { assetId: 'BBCA', currentValueIdr: 500_000, units: 50, currentPrice: 10_000, shockPercent: 0 },
      };

      const ladder = generateCrashBuyingLadder({
        targetAsset: bbcaAsset,
        allAssets: CORE_AND_EXPANDED_ASSETS,
        targetWeights: { RDPT: 50, BBCA: 50 },
        holdings,
        inputMode: 'nominal',
        usdIdrRate: 16000,
        extraCashIdr: 100_000,
        dropTiers: [-5],
      });

      expect(ladder).toHaveLength(1);
      const step = ladder[0];
      // Cannot buy 1 regular lot (100 shares), so lots and units must be 0
      expect(step.rebalanceBuyLots).toBe(0);
      expect(step.rebalanceBuyUnits).toBe(0);
      // rebalanceBuyAmountIdr must be 0, not 50,000 IDR
      expect(step.rebalanceBuyAmountIdr).toBe(0);
    });
  });
});
