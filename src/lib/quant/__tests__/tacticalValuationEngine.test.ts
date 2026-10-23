import { describe, it, expect, vi } from 'vitest';
import {
  getSentimentZone,
  getSentimentDescription,
  calculateTiltMultiplier,
  calculateTacticalWeights,
  fetchLiveCryptoFearAndGreed,
} from '../tacticalValuationEngine';
import { AssetDefinition } from '../types';

describe('tacticalValuationEngine', () => {
  const mockAssets: AssetDefinition[] = [
    {
      id: 'BTC',
      symbol: 'BTC',
      name: 'Bitcoin',
      shortName: 'BTC',
      category: 'crypto',
      currency: 'USD',
      cagr: 45,
      maxDrawdown: 75,
      volatility: 60,
      riskScale: 4,
      defaultPrice: 90000,
      lotSize: 1,
      allowFractional: true,
      isCoreBenchmark: false,
      color: '#f59e0b',
      description: 'Mock BTC',
    },
    {
      id: 'SPY',
      symbol: 'SPY',
      name: 'S&P 500 ETF',
      shortName: 'SPY',
      category: 'us-equity',
      currency: 'USD',
      cagr: 12,
      maxDrawdown: 23,
      volatility: 16,
      riskScale: 2,
      defaultPrice: 500,
      lotSize: 1,
      allowFractional: true,
      isCoreBenchmark: false,
      color: '#3b82f6',
      description: 'Mock SPY',
    },
    {
      id: 'BBCA',
      symbol: 'BBCA.JK',
      name: 'Bank Central Asia',
      shortName: 'BBCA',
      category: 'idx-equity',
      currency: 'IDR',
      cagr: 14,
      maxDrawdown: 22,
      volatility: 18,
      riskScale: 2,
      defaultPrice: 10000,
      lotSize: 100,
      allowFractional: false,
      isCoreBenchmark: true,
      color: '#10b981',
      description: 'Mock BBCA',
    },
    {
      id: 'RDPT',
      symbol: 'RDPT',
      name: 'Reksadana Pendapatan Tetap',
      shortName: 'RDPT',
      category: 'bonds',
      currency: 'IDR',
      cagr: 7,
      maxDrawdown: 3,
      volatility: 3,
      riskScale: 1,
      defaultPrice: 1000,
      lotSize: 1,
      allowFractional: true,
      isCoreBenchmark: false,
      color: '#6366f1',
      description: 'Mock RDPT',
    },
    {
      id: 'RDPU',
      symbol: 'RDPU',
      name: 'Reksadana Pasar Uang',
      shortName: 'RDPU',
      category: 'money-market',
      currency: 'IDR',
      cagr: 5,
      maxDrawdown: 0.5,
      volatility: 1,
      riskScale: 0.5,
      defaultPrice: 1000,
      lotSize: 1,
      allowFractional: true,
      isCoreBenchmark: false,
      color: '#94a3b8',
      description: 'Mock RDPU',
    },
  ];

  const baseWeights = {
    BTC: 10,
    SPY: 30,
    BBCA: 20,
    RDPT: 25,
    RDPU: 15,
  };

  describe('getSentimentZone', () => {
    it('classifies scores correctly into 5 standard sentiment tiers', () => {
      expect(getSentimentZone(15)).toBe('extreme-fear');
      expect(getSentimentZone(24)).toBe('extreme-fear');
      expect(getSentimentZone(25)).toBe('fear');
      expect(getSentimentZone(40)).toBe('fear');
      expect(getSentimentZone(45)).toBe('neutral');
      expect(getSentimentZone(50)).toBe('neutral');
      expect(getSentimentZone(55)).toBe('neutral');
      expect(getSentimentZone(65)).toBe('greed');
      expect(getSentimentZone(75)).toBe('greed');
      expect(getSentimentZone(76)).toBe('extreme-greed');
      expect(getSentimentZone(95)).toBe('extreme-greed');
    });

    it('clamps out of bounds scores', () => {
      expect(getSentimentZone(-10)).toBe('extreme-fear');
      expect(getSentimentZone(150)).toBe('extreme-greed');
    });
  });

  describe('getSentimentDescription', () => {
    it('returns appropriate indonesian labels and guidance', () => {
      const fearDesc = getSentimentDescription('extreme-fear');
      expect(fearDesc.label).toBe('Extreme Fear');
      expect(fearDesc.actionHint).toContain('Diskon Besar');

      const greedDesc = getSentimentDescription('extreme-greed');
      expect(greedDesc.label).toBe('Extreme Greed');
      expect(greedDesc.actionHint).toContain('Puncak Euphoria');
    });
  });

  describe('calculateTiltMultiplier', () => {
    it('returns 0 for neutral zone (45-55)', () => {
      expect(calculateTiltMultiplier(50, 0.20)).toBe(0);
      expect(calculateTiltMultiplier(45, 0.20)).toBe(0);
      expect(calculateTiltMultiplier(55, 0.20)).toBe(0);
    });

    it('returns positive tilt for fear (discount zone)', () => {
      const tiltExtremeFear = calculateTiltMultiplier(0, 0.20);
      expect(tiltExtremeFear).toBe(0.20); // max +20%

      const tiltMildFear = calculateTiltMultiplier(22.5, 0.20);
      expect(tiltMildFear).toBeGreaterThan(0);
      expect(tiltMildFear).toBeLessThan(0.20);
    });

    it('returns negative tilt for greed (profit-taking zone)', () => {
      const tiltExtremeGreed = calculateTiltMultiplier(100, 0.20);
      expect(tiltExtremeGreed).toBe(-0.20); // max -20%

      const tiltMildGreed = calculateTiltMultiplier(77.5, 0.20);
      expect(tiltMildGreed).toBeLessThan(0);
      expect(tiltMildGreed).toBeGreaterThan(-0.20);
    });
  });

  describe('calculateTacticalWeights', () => {
    it('returns base weights untouched when disabled', () => {
      const result = calculateTacticalWeights(baseWeights, mockAssets, {
        enabled: false,
        aggressiveness: 0.2,
        cryptoScore: 20,
        usEquityScore: 80,
        idxEquityScore: 50,
      });

      expect(result.tacticalWeights).toEqual(baseWeights);
      expect(result.isAnyTiltApplied).toBe(false);
    });

    it('tilts crypto up in Extreme Fear and funds it from defensive buffer assets', () => {
      const result = calculateTacticalWeights(baseWeights, mockAssets, {
        enabled: true,
        aggressiveness: 0.2, // ±20%
        cryptoScore: 10,     // Extreme Fear -> BTC tilts up ~ +20%
        usEquityScore: 50,   // Neutral -> SPY tilts 0%
        idxEquityScore: 50,  // Neutral -> BBCA tilts 0%
      });

      expect(result.isAnyTiltApplied).toBe(true);
      // BTC base was 10%, should increase to ~12%
      expect(result.tacticalWeights.BTC).toBeGreaterThan(10);
      // RDPT + RDPU should decrease to fund the BTC discount purchase
      expect(result.tacticalWeights.RDPT).toBeLessThan(25);
      expect(result.tacticalWeights.RDPU).toBeLessThan(15);

      // Total must sum to 100.0%
      const sum = Object.values(result.tacticalWeights).reduce((a, b) => a + b, 0);
      expect(Math.abs(sum - 100)).toBeLessThan(0.05);

      // Tactical signal for BTC should exist
      expect(result.tacticalSignals.BTC).toBeDefined();
      expect(result.tacticalSignals.BTC.sentimentZone).toBe('extreme-fear');
      expect(result.tacticalSignals.BTC.tiltMultiplierPercent).toBeGreaterThan(0);
    });

    it('tilts equity down in Extreme Greed and moves capital into defensive buffer assets', () => {
      const result = calculateTacticalWeights(baseWeights, mockAssets, {
        enabled: true,
        aggressiveness: 0.2,
        cryptoScore: 50,
        usEquityScore: 90,   // Extreme Greed -> SPY tilts down ~ -20%
        idxEquityScore: 50,
      });

      expect(result.isAnyTiltApplied).toBe(true);
      // SPY base was 30%, should decrease
      expect(result.tacticalWeights.SPY).toBeLessThan(30);
      // RDPT + RDPU should increase to bank the profit
      expect(result.tacticalWeights.RDPT).toBeGreaterThan(25);
      expect(result.tacticalWeights.RDPU).toBeGreaterThan(15);

      // Total must sum to 100.0%
      const sum = Object.values(result.tacticalWeights).reduce((a, b) => a + b, 0);
      expect(Math.abs(sum - 100)).toBeLessThan(0.05);

      // Tactical signal for SPY should exist
      expect(result.tacticalSignals.SPY).toBeDefined();
      expect(result.tacticalSignals.SPY.sentimentZone).toBe('extreme-greed');
      expect(result.tacticalSignals.SPY.tiltMultiplierPercent).toBeLessThan(0);
    });
  });

  describe('fetchLiveCryptoFearAndGreed', () => {
    it('gracefully handles successful API response or offline failure', async () => {
      // Test the live/fallback function
      const res = await fetchLiveCryptoFearAndGreed();
      if (res) {
        expect(res.score).toBeGreaterThanOrEqual(0);
        expect(res.score).toBeLessThanOrEqual(100);
        expect(typeof res.classification).toBe('string');
      }
    });
  });
});
