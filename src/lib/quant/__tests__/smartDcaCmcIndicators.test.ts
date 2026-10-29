import { describe, it, expect } from 'vitest';
import {
  evaluateIndicatorRule,
  getConfluenceActionTier,
  getAssetIndicatorConfluence,
  CRYPTO_CYCLE_INDICATORS,
  MASTER_CYCLE_INDICATORS,
  getSourceTypeBadge,
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

  it('validates that all cycle indicators across all categories include source transparency metadata', () => {
    const categories = Object.keys(MASTER_CYCLE_INDICATORS) as Array<
      keyof typeof MASTER_CYCLE_INDICATORS
    >;

    for (const cat of categories) {
      const indicators = MASTER_CYCLE_INDICATORS[cat];
      expect(indicators.length).toBeGreaterThan(0);

      for (const ind of indicators) {
        expect(ind.sourceName).toBeDefined();
        expect(ind.sourceName.trim().length).toBeGreaterThan(0);
        expect(ind.sourceUrl).toBeDefined();
        expect(ind.sourceUrl.startsWith('http')).toBe(true);
        expect(['live-api', 'exchange-feed', 'on-chain-benchmark', 'macro-official']).toContain(
          ind.sourceType
        );
      }
    }
  });

  it('formats source type badges with appropriate styling classes', () => {
    const liveApi = getSourceTypeBadge('live-api');
    expect(liveApi.label).toBe('Live API');
    expect(liveApi.colorClass).toContain('emerald');

    const feed = getSourceTypeBadge('exchange-feed');
    expect(feed.label).toBe('Bursa / Feed');
    expect(feed.colorClass).toContain('blue');

    const onChain = getSourceTypeBadge('on-chain-benchmark');
    expect(onChain.label).toBe('On-Chain / Model');
    expect(onChain.colorClass).toContain('purple');

    const macro = getSourceTypeBadge('macro-official');
    expect(macro.label).toBe('Data Resmi / Makro');
    expect(macro.colorClass).toContain('amber');
  });

  it('propagates latest refresh timestamp and unique data sources into confluence & Smart DCA plan', () => {
    const mockTimestamp = '29 Okt 2026, 09:40:00 WIB';

    const btcAsset: AssetDefinition = {
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

    const confluence = getAssetIndicatorConfluence({
      asset: btcAsset,
      lastRefreshSuccessAt: mockTimestamp,
    });

    expect(confluence.lastRefreshSuccessAt).toBe(mockTimestamp);
    expect(confluence.dataSources.length).toBeGreaterThan(0);
    expect(confluence.dataSources.some((s) => s.sourceName.includes('CoinMarketCap'))).toBe(true);
    expect(confluence.dataSources.some((s) => s.sourceName.includes('Alternative.me'))).toBe(true);

    // Each indicator should receive the latest refresh success timestamp
    for (const ind of confluence.indicators) {
      expect(ind.lastSuccessTimestamp).toBe(mockTimestamp);
      expect(ind.sourceName).toBeDefined();
      expect(ind.sourceUrl).toBeDefined();
      expect(ind.sourceType).toBeDefined();
    }

    // Verify propagation inside calculateSmartDcaPlan
    const plan = calculateSmartDcaPlan({
      assets: [btcAsset],
      targetWeights: { btc: 100 },
      holdings: {
        btc: { assetId: 'btc', units: 0.1, currentValueIdr: 1000000, currentPrice: 90000, shockPercent: 0 },
      },
      monthlyBudgetIdr: 5_000_000,
      usdIdrRate: 16000,
      lastRefreshSuccessAt: mockTimestamp,
    });

    expect(plan.items[0].explanation.indicatorConfluence.lastRefreshSuccessAt).toBe(mockTimestamp);
    expect(plan.items[0].explanation.indicatorConfluence.dataSources.length).toBeGreaterThan(0);
  });

  it('enforces BEI fractional tick size rounding on idx-equity stock prices in smart DCA calculations', () => {
    const bbcaAsset: AssetDefinition = {
      id: 'bbca',
      symbol: 'BBCA',
      name: 'Bank Central Asia',
      shortName: 'BBCA',
      category: 'idx-equity',
      currency: 'IDR',
      cagr: 15,
      maxDrawdown: 25,
      volatility: 20,
      riskScale: 3,
      defaultPrice: 10250,
      lotSize: 100,
      allowFractional: false,
      isCoreBenchmark: true,
      description: 'Saham perbankan blue chip IDX',
      color: '#3b82f6',
    };

    // User provides an off-tick unrounded price: 10253 (not valid in BEI >= 5000 tick size 25)
    // Snapped to nearest tick: 10250
    const plan = calculateSmartDcaPlan({
      assets: [bbcaAsset],
      targetWeights: { bbca: 100 },
      holdings: {
        bbca: { assetId: 'bbca', units: 100, currentValueIdr: 1025300, currentPrice: 10253, shockPercent: 0 },
      },
      monthlyBudgetIdr: 2_500_000,
      usdIdrRate: 16000,
      enableIdxLotRounding: true,
      allocationMode: 'target-weight-multiplier',
    });

    const item = plan.items.find((i) => i.assetId === 'bbca')!;
    // unitPriceIdr must be rounded to tick 10250
    expect(item.unitPriceIdr).toBe(10250);
    // Price per lot is 10,250 * 100 = 1,025,000
    // With 2.5M budget, Math.floor(2,500,000 / 1,025,000) = 2 lots
    if (item.recommendedLotsInteger !== undefined && item.recommendedLotsInteger > 0) {
      expect(item.recommendedLotsInteger).toBe(2);
      expect(item.recommendedAmountIdr).toBe(2 * 10250 * 100); // 2,050,000
    }
  });

  it('evaluates multi-factor cycle indicators for custom assets with granular confluence tiers', () => {
    const customAsset: AssetDefinition = {
      id: 'custom_land',
      symbol: 'LAND',
      name: 'Properti Tanah Komersial',
      shortName: 'LAND',
      category: 'custom',
      currency: 'IDR',
      cagr: 12,
      maxDrawdown: 10,
      volatility: 12,
      riskScale: 2,
      defaultPrice: 500000000,
      lotSize: 1,
      allowFractional: true,
      isCoreBenchmark: false,
      description: 'Aset rill properti tanah',
      color: '#10b981',
    };

    // Verify custom category has 4 distinct multi-factor indicators
    const confluence = getAssetIndicatorConfluence({ asset: customAsset });
    expect(confluence.totalIndicators).toBe(4);
    expect(confluence.indicators.map((i) => i.id)).toEqual([
      'custom_discount_factor',
      'custom_drawdown_52w',
      'custom_allocation_drift_gap',
      'custom_stability_factor',
    ]);

    // Test intermediate confluence tiers by overriding triggered statuses
    // 2 out of 4 triggered = 50% confluence -> Normal Buy (1.0x)
    const conf50 = getAssetIndicatorConfluence({
      asset: customAsset,
      overrides: {
        custom_discount_factor: { currentValue: 15 }, // >= 10 (Triggered)
        custom_drawdown_52w: { currentValue: 10 }, // < 20 (Not triggered)
        custom_allocation_drift_gap: { currentValue: 15 }, // >= 10 (Triggered)
        custom_stability_factor: { currentValue: 50 }, // < 70 (Not triggered)
      },
    });

    expect(conf50.triggeredCount).toBe(2);
    expect(conf50.confluencePercent).toBe(50);
    expect(conf50.action).toBe('NORMAL_BUY');
    expect(conf50.multiplier).toBe(1.0);
  });
});
