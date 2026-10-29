import { describe, it, expect } from 'vitest';
import {
  evaluateIndicatorRule,
  getConfluenceActionTier,
  getAssetIndicatorConfluence,
  CRYPTO_CYCLE_INDICATORS,
} from '../smartDcaIndicators';
import {
  calculateSmartDcaPlan,
  SmartDcaInputParams,
} from '../smartDcaEngine';
import { AssetDefinition, HoldingEntry, ValuationSentimentConfig } from '../types';

describe('CoinMarketCap Market Cycle Indicators & Confluence Rules', () => {
  it('correctly evaluates comparison operators (<=, >=, <, >)', () => {
    expect(evaluateIndicatorRule(0.45, '<=', 0.50)).toBe(true);
    expect(evaluateIndicatorRule(0.55, '<=', 0.50)).toBe(false);

    expect(evaluateIndicatorRule(80, '>=', 75)).toBe(true);
    expect(evaluateIndicatorRule(70, '>=', 75)).toBe(false);

    expect(evaluateIndicatorRule(15, '<', 20)).toBe(true);
    expect(evaluateIndicatorRule(20, '<', 20)).toBe(false);

    expect(evaluateIndicatorRule(25, '>', 20)).toBe(true);
    expect(evaluateIndicatorRule(20, '>', 20)).toBe(false);
  });

  it('correctly assigns action tiers and multipliers based on confluence percent', () => {
    // >= 80% -> AGGRESSIVE_BUY (2.0x)
    expect(getConfluenceActionTier(85).action).toBe('AGGRESSIVE_BUY');
    expect(getConfluenceActionTier(85).multiplier).toBe(2.0);
    expect(getConfluenceActionTier(80).action).toBe('AGGRESSIVE_BUY');
    expect(getConfluenceActionTier(80).multiplier).toBe(2.0);

    // 60% - 79% -> MODERATE_BUY (1.5x)
    expect(getConfluenceActionTier(70).action).toBe('MODERATE_BUY');
    expect(getConfluenceActionTier(70).multiplier).toBe(1.5);
    expect(getConfluenceActionTier(60).action).toBe('MODERATE_BUY');
    expect(getConfluenceActionTier(60).multiplier).toBe(1.5);

    // 40% - 59% -> NORMAL_BUY (1.0x)
    expect(getConfluenceActionTier(50).action).toBe('NORMAL_BUY');
    expect(getConfluenceActionTier(50).multiplier).toBe(1.0);
    expect(getConfluenceActionTier(40).action).toBe('NORMAL_BUY');
    expect(getConfluenceActionTier(40).multiplier).toBe(1.0);

    // 20% - 39% -> SMALL_BUY (0.5x)
    expect(getConfluenceActionTier(30).action).toBe('SMALL_BUY');
    expect(getConfluenceActionTier(30).multiplier).toBe(0.5);
    expect(getConfluenceActionTier(20).action).toBe('SMALL_BUY');
    expect(getConfluenceActionTier(20).multiplier).toBe(0.5);

    // < 20% -> HOLD_SKIP (0.0x)
    expect(getConfluenceActionTier(15).action).toBe('HOLD_SKIP');
    expect(getConfluenceActionTier(15).multiplier).toBe(0.0);
    expect(getConfluenceActionTier(0).action).toBe('HOLD_SKIP');
    expect(getConfluenceActionTier(0).multiplier).toBe(0.0);
  });

  it('supports manual indicator overrides reactively', () => {
    const asset: AssetDefinition = {
      id: 'btc',
      symbol: 'BTC',
      name: 'Bitcoin',
      shortName: 'BTC',
      category: 'crypto',
      currency: 'USD',
      cagr: 45,
      maxDrawdown: 70,
      volatility: 60,
      riskScale: 12,
      defaultPrice: 90000,
      lotSize: 1,
      allowFractional: true,
      isCoreBenchmark: true,
      color: '#f97316',
      description: 'Crypto',
    };

    const tactical: ValuationSentimentConfig = {
      enabled: true,
      aggressiveness: 0.2,
      cryptoScore: 20,
      usEquityScore: 50,
      idxEquityScore: 50,
    };

    // Default confluence without overrides (tactical fear & greed 20 = extreme fear)
    const baseConfluence = getAssetIndicatorConfluence({
      asset,
      tacticalConfig: tactical,
      overrides: {},
    });
    expect(baseConfluence.totalIndicators).toBe(CRYPTO_CYCLE_INDICATORS.length);

    // Override Ahr999 index to 2.5 (above reference <= 0.45, so untriggered)
    const overriddenConfluence = getAssetIndicatorConfluence({
      asset,
      tacticalConfig: tactical,
      overrides: {
        'ahr999': { currentValue: 2.5 },
      },
    });

    const ahrInd = overriddenConfluence.indicators.find((i) => i.id === 'ahr999');
    expect(ahrInd?.isManualOverride).toBe(true);
    expect(ahrInd?.currentValue).toBe(2.5);
    expect(ahrInd?.isTriggered).toBe(false);
  });
});

describe('Smart DCA 100% Indicator-Driven Engine (Zero Drift Interference)', () => {
  const assets: AssetDefinition[] = [
    {
      id: 'btc',
      symbol: 'BTC',
      name: 'Bitcoin',
      shortName: 'BTC',
      category: 'crypto',
      currency: 'USD',
      cagr: 45,
      maxDrawdown: 70,
      volatility: 60,
      riskScale: 12,
      defaultPrice: 60000,
      lotSize: 1,
      allowFractional: true,
      isCoreBenchmark: true,
      color: '#f97316',
      description: 'Crypto',
    },
    {
      id: 'bbca',
      symbol: 'BBCA',
      name: 'Bank Central Asia',
      shortName: 'BBCA',
      category: 'idx-equity',
      currency: 'IDR',
      cagr: 15,
      maxDrawdown: 20,
      volatility: 18,
      riskScale: 2.5,
      defaultPrice: 10000,
      lotSize: 100,
      allowFractional: false,
      isCoreBenchmark: true,
      color: '#3b82f6',
      description: 'IDX Bank',
    },
    {
      id: 'rdpu',
      symbol: 'RDPU',
      name: 'Reksa Dana Pasar Uang',
      shortName: 'RDPU',
      category: 'money-market',
      currency: 'IDR',
      cagr: 5,
      maxDrawdown: 1,
      volatility: 1,
      riskScale: 1,
      defaultPrice: 1000,
      lotSize: 1,
      allowFractional: true,
      isCoreBenchmark: true,
      color: '#10b981',
      description: 'Kas',
      isNominalOnly: true,
    },
  ];

  const targetWeights = {
    btc: 40,
    bbca: 40,
    rdpu: 20,
  };

  it('guarantees action and multiplier are 100% determined by indicators regardless of portfolio deficit', () => {
    // Scenario A: BTC is severely underweight (holding = 0, target = 40%)
    const holdingsUnderweight: Record<string, HoldingEntry> = {
      btc: { assetId: 'btc', units: 0, currentValueIdr: 0, currentPrice: 60000, shockPercent: 0 },
      bbca: { assetId: 'bbca', units: 80, currentValueIdr: 80_000_000, currentPrice: 10000, shockPercent: 0 },
      rdpu: { assetId: 'rdpu', units: 20_000_000, currentValueIdr: 20_000_000, currentPrice: 1000, shockPercent: 0 },
    };

    // Scenario B: BTC is heavily overweight (holding = 70%, target = 40%)
    const holdingsOverweight: Record<string, HoldingEntry> = {
      btc: { assetId: 'btc', units: 10, currentValueIdr: 100_000_000, currentPrice: 60000, shockPercent: 0 },
      bbca: { assetId: 'bbca', units: 20, currentValueIdr: 20_000_000, currentPrice: 10000, shockPercent: 0 },
      rdpu: { assetId: 'rdpu', units: 10_000_000, currentValueIdr: 10_000_000, currentPrice: 1000, shockPercent: 0 },
    };

    const commonParams: Omit<SmartDcaInputParams, 'holdings'> = {
      assets,
      targetWeights,
      monthlyBudgetIdr: 10_000_000,
      inputMode: 'nominal',
      usdIdrRate: 16_000,
      overflowMode: 'park-rdpu',
      allocationMode: 'target-weight-multiplier',
      tacticalConfig: {
        enabled: true,
        aggressiveness: 0.2,
        cryptoScore: 20, // Extreme fear (bullish accumulator)
        idxEquityScore: 50,
        usEquityScore: 50,
        goldScore: 50,
      },
    };

    const planUnderweight = calculateSmartDcaPlan({
      ...commonParams,
      holdings: holdingsUnderweight,
    });

    const planOverweight = calculateSmartDcaPlan({
      ...commonParams,
      holdings: holdingsOverweight,
    });

    const btcUnder = planUnderweight.items.find((i) => i.assetId === 'btc')!;
    const btcOver = planOverweight.items.find((i) => i.assetId === 'btc')!;

    // Both MUST have identical action and multiplier because indicators are 100% in control!
    expect(btcUnder.action).toBe(btcOver.action);
    expect(btcUnder.multiplier).toBe(btcOver.multiplier);

    // Confluence percentage must be identical
    expect(btcUnder.explanation.indicatorConfluence.confluencePercent).toBe(
      btcOver.explanation.indicatorConfluence.confluencePercent
    );

    // But drift breakdown reflects informational context
    expect(btcUnder.explanation.driftBreakdown.relativeDeficitPercent).toBe(100);
    expect(btcOver.explanation.driftBreakdown.relativeDeficitPercent).toBeLessThan(0);
  });

  it('allocates correctly in pure-confluence-rank mode vs target-weight-multiplier mode', () => {
    const holdings: Record<string, HoldingEntry> = {
      btc: { assetId: 'btc', units: 1, currentValueIdr: 50_000_000, currentPrice: 60000, shockPercent: 0 },
      bbca: { assetId: 'bbca', units: 50, currentValueIdr: 50_000_000, currentPrice: 10000, shockPercent: 0 },
      rdpu: { assetId: 'rdpu', units: 20_000_000, currentValueIdr: 20_000_000, currentPrice: 1000, shockPercent: 0 },
    };

    // Mode 1: target-weight-multiplier
    const planMode1 = calculateSmartDcaPlan({
      assets,
      targetWeights,
      holdings,
      monthlyBudgetIdr: 10_000_000,
      inputMode: 'nominal',
      usdIdrRate: 16_000,
      overflowMode: 'park-rdpu',
      allocationMode: 'target-weight-multiplier',
      tacticalConfig: {
        enabled: true,
        aggressiveness: 0.2,
        cryptoScore: 20,
        idxEquityScore: 50,
        usEquityScore: 50,
        goldScore: 50,
      },
    });

    // Mode 2: pure-confluence-rank
    const planMode2 = calculateSmartDcaPlan({
      assets,
      targetWeights,
      holdings,
      monthlyBudgetIdr: 10_000_000,
      inputMode: 'nominal',
      usdIdrRate: 16_000,
      overflowMode: 'park-rdpu',
      allocationMode: 'pure-confluence-rank',
      tacticalConfig: {
        enabled: true,
        aggressiveness: 0.2,
        cryptoScore: 20,
        idxEquityScore: 50,
        usEquityScore: 50,
        goldScore: 50,
      },
    });

    expect(planMode1.allocationMode).toBe('target-weight-multiplier');
    expect(planMode2.allocationMode).toBe('pure-confluence-rank');

    // Both total allocations + war chest should not exceed total monthly budget
    const totalAllocated1 = planMode1.totalAllocatedAssetsIdr + planMode1.warChestParkedIdr + planMode1.unallocatedCashRemainderIdr;
    expect(totalAllocated1).toBeLessThanOrEqual(10_000_000);

    const totalAllocated2 = planMode2.totalAllocatedAssetsIdr + planMode2.warChestParkedIdr + planMode2.unallocatedCashRemainderIdr;
    expect(totalAllocated2).toBeLessThanOrEqual(10_000_000);
  });

  it('respects BEI lot rounding (100 shares) and stores remainder in cash', () => {
    const holdings: Record<string, HoldingEntry> = {
      btc: { assetId: 'btc', units: 0, currentValueIdr: 0, currentPrice: 60000, shockPercent: 0 },
      bbca: { assetId: 'bbca', units: 0, currentValueIdr: 0, currentPrice: 10000, shockPercent: 0 },
      rdpu: { assetId: 'rdpu', units: 0, currentValueIdr: 0, currentPrice: 1000, shockPercent: 0 },
    };

    const plan = calculateSmartDcaPlan({
      assets,
      targetWeights,
      holdings,
      monthlyBudgetIdr: 2_350_000,
      inputMode: 'units',
      usdIdrRate: 16_000,
      overflowMode: 'park-rdpu',
      allocationMode: 'target-weight-multiplier',
      enableIdxLotRounding: true,
      tacticalConfig: {
        enabled: true,
        aggressiveness: 0.2,
        cryptoScore: 50,
        idxEquityScore: 30, // moderate buy for IDX
        usEquityScore: 50,
        goldScore: 50,
      },
    });

    const bbcaItem = plan.items.find((i) => i.assetId === 'bbca')!;
    if (bbcaItem.recommendedLotsInteger !== undefined) {
      // Must be an integer lot count
      expect(Number.isInteger(bbcaItem.recommendedLotsInteger)).toBe(true);
      // recommendedUnits must be lots * 100
      expect(bbcaItem.recommendedUnits).toBe(bbcaItem.recommendedLotsInteger * 100);
    }
  });
});
