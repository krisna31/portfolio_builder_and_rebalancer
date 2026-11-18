import { describe, it, expect } from 'vitest';
import { CORE_AND_EXPANDED_ASSETS, VIDEO_PORTFOLIO_PRESETS } from '../../../data/presets';
import {
  BUNDLED_MARKET_HISTORY,
  backtestRebalancedPortfolio,
  ensurePositiveDefinite,
  historicalCorrelation,
  historicalVolatilityPct,
  type MarketHistory,
} from '../historicalModel';
import {
  buildCovarianceMatrix,
  computeEulerRiskContributions,
  evaluatePortfolioMetrics,
  solveRiskBudgetingWeights,
} from '../riskParitySolver';
import { validateFetchedPrice } from '../../../services/priceFeed';
import type { AssetDefinition } from '../types';

describe('Historical Market Model & Euler Covariance Engine', () => {
  const core7Assets = CORE_AND_EXPANDED_ASSETS.filter(
    (a) => a.isCoreBenchmark && a.id !== 'RDPU'
  );

  it('includes 5 years of aligned weekly IDR return history for core benchmark assets', () => {
    expect(BUNDLED_MARKET_HISTORY.currency).toBe('IDR');
    expect(BUNDLED_MARKET_HISTORY.frequency).toBe('weekly');
    expect(BUNDLED_MARKET_HISTORY.weekStarts.length).toBeGreaterThanOrEqual(250);

    for (const id of ['BBCA', 'GLD', 'SPY', 'QQQ', 'BTC', 'ETH']) {
      const vol = historicalVolatilityPct(id);
      expect(vol).not.toBeNull();
      expect(vol!).toBeGreaterThan(5);
    }

    const spyQqqCorr = historicalCorrelation('SPY', 'QQQ');
    expect(spyQqqCorr).not.toBeNull();
    expect(spyQqqCorr!).toBeGreaterThan(0.75);
  });

  it('repairs a non-positive-definite correlation matrix via shrinkage', () => {
    // Impossible triangle: corr(0,1)=0.9, corr(0,2)=0.9, corr(1,2)=-0.5
    const nonPd = [
      [1, 0.9, 0.9],
      [0.9, 1, -0.5],
      [0.9, -0.5, 1],
    ];
    const repaired = ensurePositiveDefinite(nonPd);
    // Diagonal remains 1 and off-diagonals are damped until PD
    expect(repaired[0][0]).toBe(1);
    expect(repaired[1][1]).toBe(1);
    expect(repaired[2][2]).toBe(1);
    expect(Math.abs(repaired[0][1])).toBeLessThan(0.9);
  });

  it('solves genuine Equal Risk Contribution by default (euler-covariance)', () => {
    const weights = solveRiskBudgetingWeights(core7Assets, 'risk-parity');
    const cov = buildCovarianceMatrix(core7Assets, 'historical');
    const fracs = core7Assets.map((a) => (weights[a.id] ?? 0) / 100);
    const eulerRc = computeEulerRiskContributions(fracs, cov);

    const targetRc = 100 / core7Assets.length;
    for (const rc of eulerRc) {
      expect(Math.abs(rc - targetRc)).toBeLessThan(1.0);
    }
  });

  it('hits target Euler risk budget for Risk Budgeting conviction tilt', () => {
    const weights = solveRiskBudgetingWeights(core7Assets, 'risk-budgeting', 'BTC', 90);
    const cov = buildCovarianceMatrix(core7Assets, 'historical');
    const fracs = core7Assets.map((a) => (weights[a.id] ?? 0) / 100);
    const eulerRc = computeEulerRiskContributions(fracs, cov);
    const btcIdx = core7Assets.findIndex((a) => a.id === 'BTC');

    expect(eulerRc[btcIdx]).toBeGreaterThan(88);
    expect(eulerRc[btcIdx]).toBeLessThan(92);
  });

  it('does not inflate custom portfolio CAGR with fabricated Shannon bonus or apply 0.78 drawdown discount', () => {
    const btcRdpu = evaluatePortfolioMetrics(
      { BTC: 50, RDPU: 50 },
      CORE_AND_EXPANDED_ASSETS,
      VIDEO_PORTFOLIO_PRESETS
    );
    expect(btcRdpu.metricsSource).toBe('historical-backtest');
    expect(btcRdpu.riskContributionModel).toBe('euler-covariance');
    // Old heuristic gave 37.04% CAGR and 27.3% MDD; real rebalanced backtest is ~28.6% CAGR and ~32% MDD
    expect(btcRdpu.cagr).toBeLessThan(31);
    expect(btcRdpu.maxDrawdown).toBeGreaterThan(29);

    const spyQqq = evaluatePortfolioMetrics(
      { SPY: 50, QQQ: 50 },
      CORE_AND_EXPANDED_ASSETS,
      VIDEO_PORTFOLIO_PRESETS
    );
    expect(spyQqq.metricsSource).toBe('historical-backtest');
    expect(spyQqq.cagr).toBeLessThan(19);
    expect(spyQqq.maxDrawdown).toBeGreaterThan(22);
  });

  it('falls back transparently to parametric covariance when a volatile custom asset has no history', () => {
    const syntheticAsset: AssetDefinition = {
      id: 'CUSTOM_IPO',
      symbol: 'CIPO',
      name: 'Custom Synthetic IPO',
      shortName: 'CIPO',
      category: 'custom',
      currency: 'IDR',
      cagr: 20,
      maxDrawdown: 40,
      volatility: 35,
      riskScale: 5,
      defaultPrice: 1000,
      lotSize: 100,
      allowFractional: false,
      isCoreBenchmark: false,
      color: '#10b981',
      description: 'Test synthetic asset',
    };
    const assets = [...CORE_AND_EXPANDED_ASSETS, syntheticAsset];
    const metrics = evaluatePortfolioMetrics(
      { CUSTOM_IPO: 50, RDPT: 50 },
      assets,
      VIDEO_PORTFOLIO_PRESETS
    );
    expect(metrics.metricsSource).toBe('parametric');
    // Parametric weighted CAGR without fabricated bonus: 0.5*20 + 0.5*6.85 = 13.43%
    expect(metrics.cagr).toBeCloseTo(13.43, 1);
  });

  it('respects editable RDPU risk-free rate in Sharpe ratio', () => {
    const modifiedAssets = CORE_AND_EXPANDED_ASSETS.map((a) =>
      a.id === 'RDPU' ? { ...a, cagr: 6.0 } : a
    );
    const baseMetrics = evaluatePortfolioMetrics(
      { SPY: 100 },
      CORE_AND_EXPANDED_ASSETS,
      VIDEO_PORTFOLIO_PRESETS
    );
    const highRfMetrics = evaluatePortfolioMetrics(
      { SPY: 100 },
      modifiedAssets,
      VIDEO_PORTFOLIO_PRESETS
    );
    expect(highRfMetrics.sharpeRatio).toBeLessThan(baseMetrics.sharpeRatio);
  });

  it('backtestRebalancedPortfolio reproduces exact geometric return on synthetic constant returns', () => {
    const weeks = 104;
    const weeklyR = Math.pow(1.1, 1 / 52) - 1; // 10% CAGR
    const history: MarketHistory = {
      generatedAt: '2026-01-01T00:00:00Z',
      currency: 'IDR',
      frequency: 'weekly',
      weekStarts: Array.from({ length: weeks + 1 }, (_, i) => `W${i}`),
      returns: {
        A: Array(weeks).fill(weeklyR),
      },
    };
    const spy = CORE_AND_EXPANDED_ASSETS.find((a) => a.id === 'SPY')!;
    const res = backtestRebalancedPortfolio(
      [{ asset: { ...spy, id: 'A' }, weight: 1, assumedCagrPct: 12 }],
      history
    );
    expect(res).not.toBeNull();
    expect(res!.cagrPct).toBeCloseTo(12, 4);
    expect(res!.maxDrawdownPct).toBeCloseTo(0, 6);
  });
});

describe('Proxy Live Price Sanity Validation', () => {
  it('rejects invalid, zero, or negative prices', () => {
    expect(validateFetchedPrice(0, 1000).accepted).toBe(false);
    expect(validateFetchedPrice(-50, 1000).accepted).toBe(false);
    expect(validateFetchedPrice(Number.NaN, 1000).accepted).toBe(false);
  });

  it('rejects prices deviating past snapshot bounds while accepting normal moves', () => {
    expect(validateFetchedPrice(5800, 5500, { maxDeviationRatio: 0.4 }).accepted).toBe(true);
    expect(validateFetchedPrice(9500, 5500, { maxDeviationRatio: 0.4 }).accepted).toBe(false);
    expect(validateFetchedPrice(100, 5500, { maxDeviationRatio: 0.4 }).accepted).toBe(false);
    // Crypto wider threshold (60%)
    expect(validateFetchedPrice(95000, 65000, { maxDeviationRatio: 0.6 }).accepted).toBe(true);
    expect(validateFetchedPrice(150000, 65000, { maxDeviationRatio: 0.6 }).accepted).toBe(false);
  });

  it('catches extreme currency/magnitude mismatches even without tight snapshot ratio', () => {
    // e.g. USD vs IDR 1000x glitch
    expect(validateFetchedPrice(750 * 18000, 750).accepted).toBe(false);
    expect(validateFetchedPrice(750 / 18000, 750).accepted).toBe(false);
    expect(validateFetchedPrice(900, 750).accepted).toBe(true);
  });
});
