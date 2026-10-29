import { describe, it, expect } from 'vitest';
import {
  calculateValuationScore,
  calculateDriftScore,
  getActionTier,
  calculateSmartDcaPlan,
} from '../smartDcaEngine';
import { AssetDefinition, HoldingEntry } from '../types';

describe('smartDcaEngine', () => {
  const mockBtc: AssetDefinition = {
    id: 'BTC',
    symbol: 'BTC',
    name: 'Bitcoin',
    shortName: 'BTC',
    category: 'crypto',
    currency: 'USD',
    cagr: 45,
    maxDrawdown: 70,
    volatility: 65,
    riskScale: 12,
    defaultPrice: 60000,
    lotSize: 1,
    allowFractional: true,
    isCoreBenchmark: true,
    color: '#f97316',
    description: 'Crypto alpha',
  };

  const mockBbca: AssetDefinition = {
    id: 'BBCA',
    symbol: 'BBCA.JK',
    name: 'Bank Central Asia Tbk',
    shortName: 'BBCA',
    category: 'idx-equity',
    currency: 'IDR',
    cagr: 14,
    maxDrawdown: 21,
    volatility: 18,
    riskScale: 2.7,
    defaultPrice: 10000,
    lotSize: 100,
    allowFractional: false,
    isCoreBenchmark: true,
    color: '#3b82f6',
    description: 'IDX Banking',
  };

  const mockSpy: AssetDefinition = {
    id: 'SPY',
    symbol: 'SPY',
    name: 'SPDR S&P 500 ETF',
    shortName: 'SPY',
    category: 'us-equity',
    currency: 'USD',
    cagr: 15,
    maxDrawdown: 24,
    volatility: 17,
    riskScale: 2.3,
    defaultPrice: 550,
    lotSize: 1,
    allowFractional: true,
    isCoreBenchmark: true,
    color: '#10b981',
    description: 'US Large Cap',
  };

  const mockRdpu: AssetDefinition = {
    id: 'RDPU',
    symbol: 'RDPU',
    name: 'Reksa Dana Pasar Uang',
    shortName: 'RDPU',
    category: 'money-market',
    currency: 'IDR',
    cagr: 4,
    maxDrawdown: 0,
    volatility: 0.5,
    riskScale: 0.25,
    defaultPrice: 1800,
    lotSize: 1,
    allowFractional: true,
    isCoreBenchmark: true,
    color: '#94a3b8',
    description: 'Cash parking',
    isNominalOnly: true,
  };

  const mockAssets: AssetDefinition[] = [mockBtc, mockBbca, mockSpy, mockRdpu];

  describe('Pillar 1: calculateValuationScore', () => {
    it('calculates Crypto valuation score correctly with Fear and ATH Drawdown', () => {
      // Fear & Greed 20 (Extreme Fear = 80 discount score), ATH drawdown 45% (45/70 * 100 ≈ 64 score)
      const breakdown = calculateValuationScore(
        mockBtc,
        { enabled: true, aggressiveness: 0.2, cryptoScore: 20, usEquityScore: 50, idxEquityScore: 50 },
        { drawdownAth: 45.0, fearGreedScore: 20 },
        60000
      );

      expect(breakdown.category).toBe('crypto');
      expect(breakdown.metrics).toHaveLength(2);
      expect(breakdown.metrics[0].name).toBe('Drawdown dari ATH');
      expect(breakdown.metrics[1].name).toBe('Fear & Greed Index');
      expect(breakdown.metrics[1].score).toBe(80); // 100 - 20
      expect(breakdown.score).toBeGreaterThan(70); // High discount score
    });

    it('calculates IDX Equity valuation score with P/E discount and 52W Drawdown', () => {
      // BBCA 5Y avg 24x, current 18x (25% discount -> 50 + 25*1.5 = 87.5 ≈ 88)
      // 52W DD = 15% -> 15/25 * 100 = 60
      // Composite = 0.6 * 88 + 0.4 * 60 = 52.8 + 24 = 77
      const breakdown = calculateValuationScore(
        mockBbca,
        undefined,
        { peRatio: 18.0, pe5yAvg: 24.0, drawdown52w: 15.0 },
        10000
      );

      expect(breakdown.category).toBe('idx-equity');
      expect(breakdown.metrics).toHaveLength(2);
      expect(breakdown.metrics[0].name).toBe('P/E vs Rata-rata 5 Tahun');
      expect(breakdown.score).toBe(77);
    });

    it('returns baseline 50 for money-market / RDPU', () => {
      const breakdown = calculateValuationScore(mockRdpu);
      expect(breakdown.category).toBe('money-market');
      expect(breakdown.score).toBe(50);
      expect(breakdown.metrics[0].name).toContain('Jangkar Defensif');
    });
  });

  describe('Pillar 2: calculateDriftScore', () => {
    it('returns 100 for 100% underweight (current weight 0%)', () => {
      const drift = calculateDriftScore(20, 0);
      expect(drift.relativeDeficitPercent).toBe(100);
      expect(drift.score).toBe(100);
      expect(drift.summary).toContain('Sangat Underweight');
    });

    it('returns 75 for 50% underweight (current weight 10% vs target 20%)', () => {
      const drift = calculateDriftScore(20, 10);
      expect(drift.relativeDeficitPercent).toBe(50);
      expect(drift.score).toBe(75);
    });

    it('returns 50 for balanced asset (current weight 20% vs target 20%)', () => {
      const drift = calculateDriftScore(20, 20);
      expect(drift.relativeDeficitPercent).toBe(0);
      expect(drift.score).toBe(50);
      expect(drift.summary).toContain('Sesuai Target');
    });

    it('returns low score (<50) for overweight asset', () => {
      const drift = calculateDriftScore(20, 30); // 50% overweight
      expect(drift.relativeDeficitPercent).toBe(-50);
      expect(drift.score).toBe(25);
      expect(drift.summary).toContain('Overweight');
    });

    it('clamps score between 0 and 100 for extreme overweight (current 60% vs target 20%)', () => {
      const drift = calculateDriftScore(20, 60);
      expect(drift.score).toBe(0);
    });
  });

  describe('Action Tiers & Multipliers', () => {
    it('maps scores >= 80 to Aggressive Buy (1.75x - 2.0x)', () => {
      const tier80 = getActionTier(80);
      expect(tier80.action).toBe('AGGRESSIVE_BUY');
      expect(tier80.multiplier).toBe(1.75);

      const tier100 = getActionTier(100);
      expect(tier100.action).toBe('AGGRESSIVE_BUY');
      expect(tier100.multiplier).toBe(2.0);
    });

    it('maps scores 60-79 to Moderate Buy (1.25x - 1.5x)', () => {
      const tier60 = getActionTier(60);
      expect(tier60.action).toBe('MODERATE_BUY');
      expect(tier60.multiplier).toBe(1.25);

      const tier79 = getActionTier(79);
      expect(tier79.action).toBe('MODERATE_BUY');
      expect(tier79.multiplier).toBe(1.5);
    });

    it('maps scores 45-59 to Normal Buy (1.0x)', () => {
      const tier50 = getActionTier(50);
      expect(tier50.action).toBe('NORMAL_BUY');
      expect(tier50.multiplier).toBe(1.0);
    });

    it('maps scores 30-44 to Small Buy (0.5x)', () => {
      const tier40 = getActionTier(40);
      expect(tier40.action).toBe('SMALL_BUY');
      expect(tier40.multiplier).toBe(0.5);
    });

    it('maps scores < 30 to Hold / Skip (0.0x)', () => {
      const tier25 = getActionTier(25);
      expect(tier25.action).toBe('HOLD_SKIP');
      expect(tier25.multiplier).toBe(0.0);
    });
  });

  describe('calculateSmartDcaPlan Budgeting & Overflows', () => {
    const targetWeights = {
      BTC: 25,
      BBCA: 25,
      SPY: 25,
      RDPU: 25,
    };

    it('parks skipped and reduced DCA budget to RDPU (War Chest) by default', () => {
      // Setup portfolio where BTC is heavily discounted and underweight (Aggressive Buy),
      // but BBCA is heavily overweight and at high valuation (Hold/Skip).
      const holdings: Record<string, HoldingEntry> = {
        BTC: {
          assetId: 'BTC',
          currentValueIdr: 0,
          units: 0,
          currentPrice: 55000,
          shockPercent: 0,
        },
        BBCA: {
          assetId: 'BBCA',
          currentValueIdr: 100_000_000, // heavily overweight
          units: 10000,
          currentPrice: 10000,
          shockPercent: 0,
        },
        SPY: {
          assetId: 'SPY',
          currentValueIdr: 25_000_000,
          units: 3,
          currentPrice: 550,
          shockPercent: 0,
        },
        RDPU: {
          assetId: 'RDPU',
          currentValueIdr: 25_000_000,
          units: 25000000,
          currentPrice: 1800,
          shockPercent: 0,
        },
      };

      const result = calculateSmartDcaPlan({
        assets: mockAssets,
        targetWeights,
        holdings,
        monthlyBudgetIdr: 10_000_000,
        usdIdrRate: 16000,
        overflowMode: 'park-rdpu',
        marketDataOverrides: {
          BTC: { fearGreedScore: 15, drawdownAth: 50 }, // Deep discount
          BBCA: { peRatio: 30, pe5yAvg: 20, drawdown52w: 0 }, // Very expensive
        },
      });

      expect(result.totalBudgetIdr).toBe(10_000_000);

      const btcItem = result.items.find((i) => i.assetId === 'BTC');
      const bbcaItem = result.items.find((i) => i.assetId === 'BBCA');
      const rdpuItem = result.items.find((i) => i.assetId === 'RDPU');

      expect(btcItem?.action).toBe('AGGRESSIVE_BUY');
      expect(btcItem?.multiplier).toBeGreaterThanOrEqual(1.75);

      expect(bbcaItem?.action).toBe('HOLD_SKIP');
      expect(bbcaItem?.multiplier).toBe(0.0);
      expect(bbcaItem?.recommendedAmountIdr).toBe(0);

      // Check War Chest accumulation in RDPU
      expect(result.warChestParkedIdr).toBeGreaterThan(0);
      expect(rdpuItem?.recommendedAmountIdr).toBeGreaterThanOrEqual(2_500_000);

      // Budget conservation check: total deployed strictly matches monthly budget (excluding remainder lots)
      const totalDeployed =
        result.totalAllocatedAssetsIdr + result.unallocatedCashRemainderIdr;
      expect(totalDeployed).toBe(10_000_000);
    });

    it('boosts discounted assets when overflowMode === "boost-discount"', () => {
      const holdings: Record<string, HoldingEntry> = {
        BTC: {
          assetId: 'BTC',
          currentValueIdr: 0,
          units: 0,
          currentPrice: 55000,
          shockPercent: 0,
        },
        BBCA: {
          assetId: 'BBCA',
          currentValueIdr: 100_000_000,
          units: 10000,
          currentPrice: 10000,
          shockPercent: 0,
        },
      };

      const result = calculateSmartDcaPlan({
        assets: [mockBtc, mockBbca],
        targetWeights: { BTC: 50, BBCA: 50 },
        holdings,
        monthlyBudgetIdr: 6_000_000,
        usdIdrRate: 16000,
        overflowMode: 'boost-discount',
        marketDataOverrides: {
          BTC: { fearGreedScore: 15, drawdownAth: 60 },
          BBCA: { peRatio: 35, pe5yAvg: 20, drawdown52w: 0 },
        },
      });

      const btcItem = result.items.find((i) => i.assetId === 'BTC');
      const bbcaItem = result.items.find((i) => i.assetId === 'BBCA');

      expect(bbcaItem?.action).toBe('HOLD_SKIP');
      expect(bbcaItem?.recommendedAmountIdr).toBe(0);

      // All budget is diverted to boost BTC
      expect(btcItem?.recommendedAmountIdr).toBe(6_000_000);
      expect(result.warChestParkedIdr).toBe(0);
    });

    it('rounds IDX stock BBCA to whole 100-share lots and tracks remainder', () => {
      const holdings: Record<string, HoldingEntry> = {
        BBCA: {
          assetId: 'BBCA',
          currentValueIdr: 0,
          units: 0,
          currentPrice: 10250, // 1 lot = Rp 1,025,000
          shockPercent: 0,
        },
      };

      const result = calculateSmartDcaPlan({
        assets: [mockBbca],
        targetWeights: { BBCA: 100 },
        holdings,
        monthlyBudgetIdr: 2_500_000, // Can only buy 2 lots (Rp 2,050,000), remainder Rp 450,000
        usdIdrRate: 16000,
        enableIdxLotRounding: true,
      });

      const bbcaItem = result.items.find((i) => i.assetId === 'BBCA');
      expect(bbcaItem?.recommendedLotsInteger).toBe(2);
      expect(bbcaItem?.recommendedUnits).toBe(200);
      expect(bbcaItem?.recommendedAmountIdr).toBe(2_050_000);
      expect(bbcaItem?.remainderLotIdr).toBe(450_000);
      expect(result.unallocatedCashRemainderIdr).toBe(450_000);
    });

    it('suppresses micro dust trades (< Rp 25.000) when filterDustTrades is true', () => {
      const holdings: Record<string, HoldingEntry> = {
        BBCA: {
          assetId: 'BBCA',
          currentValueIdr: 10_000_000,
          units: 1000,
          currentPrice: 10000,
          shockPercent: 0,
        },
      };

      const result = calculateSmartDcaPlan({
        assets: [mockBbca],
        targetWeights: { BBCA: 100 },
        holdings,
        monthlyBudgetIdr: 20_000, // Less than Rp 25.000 dust threshold
        usdIdrRate: 16000,
        enableIdxLotRounding: false,
        filterDustTrades: true,
        dustTradeThresholdIdr: 25_000,
      });

      const bbcaItem = result.items.find((i) => i.assetId === 'BBCA');
      expect(bbcaItem?.recommendedAmountIdr).toBe(0);
      expect(result.unallocatedCashRemainderIdr).toBe(20_000);
    });

    it('generates fully populated explanations and narrative for each asset', () => {
      const result = calculateSmartDcaPlan({
        assets: [mockBtc],
        targetWeights: { BTC: 100 },
        holdings: {},
        monthlyBudgetIdr: 1_000_000,
        usdIdrRate: 16000,
        overflowMode: 'boost-discount',
        tacticalConfig: {
          enabled: true,
          aggressiveness: 0.2,
          cryptoScore: 20,
          usEquityScore: 50,
          idxEquityScore: 50,
        },
      });

      const btc = result.items[0];
      expect(btc.explanation.compositeScore).toBeGreaterThanOrEqual(0);
      expect(btc.explanation.compositeScore).toBeLessThanOrEqual(100);
      expect(btc.explanation.narrativeWhy).toBeTruthy();
      expect(btc.explanation.formulaHow).toContain('Pilar 1');
      expect(btc.explanation.formulaHow).toContain('Pilar 2');
      expect(btc.explanation.valuationBreakdown.metrics.length).toBeGreaterThan(0);
      expect(btc.explanation.budgetMath.finalAllocationIdr).toBe(1_000_000);
    });

    it('exports a valid asRebalanceSummary compatible with broker slip', () => {
      const result = calculateSmartDcaPlan({
        assets: mockAssets,
        targetWeights: { BTC: 50, BBCA: 50 },
        holdings: {},
        monthlyBudgetIdr: 5_000_000,
        usdIdrRate: 16000,
      });

      const summary = result.asRebalanceSummary;
      expect(summary.rebalanceMode).toBe('buy-only-dca');
      expect(summary.cashInjectionIdr).toBe(5_000_000);
      expect(summary.totalSellIdr).toBe(0);
      expect(summary.items.length).toBeGreaterThan(0);
      expect(summary.items.every((i) => i.action === 'BUY' || i.action === 'HOLD')).toBe(true);
    });

    it('parks War Chest to RDPU even when RDPU has targetWeight 0% (omitted from active target)', () => {
      // Portfolio of BTC 50% & BBCA 50%, RDPU in asset universe with 0% target
      const holdings: Record<string, HoldingEntry> = {
        BTC: {
          assetId: 'BTC',
          currentValueIdr: 0,
          units: 0,
          currentPrice: 55000,
          shockPercent: 0,
        },
        BBCA: {
          assetId: 'BBCA',
          currentValueIdr: 100_000_000, // heavily overweight -> HOLD_SKIP (0x)
          units: 10000,
          currentPrice: 10000,
          shockPercent: 0,
        },
      };

      const result = calculateSmartDcaPlan({
        assets: mockAssets,
        targetWeights: { BTC: 50, BBCA: 50 }, // RDPU target is 0%
        holdings,
        monthlyBudgetIdr: 10_000_000,
        usdIdrRate: 16000,
        overflowMode: 'park-rdpu',
        marketDataOverrides: {
          BTC: { fearGreedScore: 50, drawdownAth: 20 }, // Normal buy (1.0x) -> 5M
          BBCA: { peRatio: 35, pe5yAvg: 20, drawdown52w: 0 }, // Hold/skip (0x) -> 0M
        },
      });

      // Both BTC & BBCA are in Hold/Skip cycle (0x), so 100% of budget (10M) is safely parked to RDPU War Chest
      expect(result.warChestParkedIdr).toBe(10_000_000);
      const rdpuItem = result.items.find((i) => i.assetId === 'RDPU');
      expect(rdpuItem).toBeDefined();
      expect(rdpuItem?.recommendedAmountIdr).toBe(10_000_000);
      expect(rdpuItem?.actionLabel).toBe('Parkir War Chest');

      // Crucial: check that asRebalanceSummary contains BUY RDPU so broker slip and execution don't lose the War Chest cash
      const summaryItem = result.asRebalanceSummary.items.find((i) => i.assetId === 'RDPU');
      expect(summaryItem).toBeDefined();
      expect(summaryItem?.tradeAmountIdr).toBe(10_000_000);
      expect(summaryItem?.action).toBe('BUY');
      expect(result.asRebalanceSummary.totalBuyIdr).toBe(10_000_000);
    });

    it('sweeps unallocated funds to unallocatedCashRemainderIdr when no defensive asset exists', () => {
      // Only BTC and BBCA, no RDPU or defensive instrument
      const holdings: Record<string, HoldingEntry> = {
        BTC: { assetId: 'BTC', currentValueIdr: 0, units: 0, currentPrice: 55000, shockPercent: 0 },
        BBCA: { assetId: 'BBCA', currentValueIdr: 100_000_000, units: 10000, currentPrice: 10000, shockPercent: 0 },
      };

      const result = calculateSmartDcaPlan({
        assets: [mockBtc, mockBbca],
        targetWeights: { BTC: 50, BBCA: 50 },
        holdings,
        monthlyBudgetIdr: 10_000_000,
        usdIdrRate: 16000,
        overflowMode: 'park-rdpu',
        marketDataOverrides: {
          BTC: { fearGreedScore: 50, drawdownAth: 20 },
          BBCA: { peRatio: 35, pe5yAvg: 20, drawdown52w: 0 },
        },
      });

      // Since no War Chest asset exists, the 10M goes into unallocatedCashRemainderIdr
      expect(result.unallocatedCashRemainderIdr).toBe(10_000_000);
      expect(result.totalAllocatedAssetsIdr).toBe(0);
      expect(result.asRebalanceSummary.unallocatedCashRemainderIdr).toBe(10_000_000);
      expect(result.totalAllocatedAssetsIdr + result.unallocatedCashRemainderIdr).toBe(10_000_000);
    });

    it('handles monthly budget smaller than 1 lot of an IDX stock cleanly (0 lots ordered, remainder swept)', () => {
      // 1 lot of BBCA @ 10,250 is Rp 1,025,000. Monthly budget is Rp 500,000.
      const holdings: Record<string, HoldingEntry> = {
        BBCA: { assetId: 'BBCA', currentValueIdr: 0, units: 0, currentPrice: 10250, shockPercent: 0 },
      };

      const result = calculateSmartDcaPlan({
        assets: [mockBbca],
        targetWeights: { BBCA: 100 },
        holdings,
        monthlyBudgetIdr: 500_000,
        usdIdrRate: 16000,
        enableIdxLotRounding: true,
      });

      const bbca = result.items.find((i) => i.assetId === 'BBCA');
      expect(bbca?.recommendedLotsInteger).toBe(0);
      expect(bbca?.recommendedAmountIdr).toBe(0);
      expect(bbca?.remainderLotIdr).toBe(500_000);
      expect(result.unallocatedCashRemainderIdr).toBe(500_000);
      expect(bbca?.explanation.formulaHow).toContain('Pembulatan Lot BEI');
      expect(bbca?.explanation.formulaHow).toContain('Sisa Kas Pecahan Lot');
    });

    it('conserves 100% of budget without penny leaks during odd-division boost-discount', () => {
      // 3 assets with equal weights, budget Rp 10,000,000 (10,000,000 / 3 = 3,333,333.33)
      const mockAsset3: AssetDefinition = {
        ...mockSpy,
        id: 'SPY3',
        symbol: 'SPY3',
      };

      const result = calculateSmartDcaPlan({
        assets: [mockBtc, mockSpy, mockAsset3],
        targetWeights: { BTC: 33.33, SPY: 33.33, SPY3: 33.34 },
        holdings: {},
        monthlyBudgetIdr: 10_000_000,
        usdIdrRate: 16000,
        overflowMode: 'boost-discount',
        tacticalConfig: {
          enabled: true,
          aggressiveness: 0.2,
          cryptoScore: 20,
          usEquityScore: 30,
          idxEquityScore: 50,
        },
        enableIdxLotRounding: false,
        filterDustTrades: false,
      });

      const totalAlloc = result.items.reduce((sum, i) => sum + i.recommendedAmountIdr, 0);
      expect(totalAlloc).toBe(10_000_000);
    });

    it('dynamically modulates IDX and US equity valuation scores with tacticalConfig sliders', () => {
      // Test IDX when IHSG is in deep fear (score 15 = discount)
      const fearBreakdown = calculateValuationScore(
        mockBbca,
        { enabled: true, aggressiveness: 0.2, cryptoScore: 50, usEquityScore: 50, idxEquityScore: 15 },
        undefined,
        10000
      );

      // Test IDX when IHSG is overbought (score 85 = expensive)
      const greedBreakdown = calculateValuationScore(
        mockBbca,
        { enabled: true, aggressiveness: 0.2, cryptoScore: 50, usEquityScore: 50, idxEquityScore: 85 },
        undefined,
        10000
      );

      expect(fearBreakdown.score).toBeGreaterThan(greedBreakdown.score);
    });
  });
});
