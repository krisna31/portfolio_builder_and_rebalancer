/**
 * Historical Market Model
 *
 * Replaces the video-calibrated heuristics with statistics computed from real weekly price history
 * (`src/data/market-history.json`, regenerated weekly by `scripts/fetch_market_data.py`).
 *
 * Modeling choice — "historical risk, assumed returns":
 * - Volatility, correlation and drawdown *paths* come from the actual 5Y weekly IDR return series.
 * - The long-run return level comes from each asset's editable `cagr` assumption. Each series is
 *   re-centered in log space so its geometric mean equals that assumption. This keeps user-edited
 *   return assumptions (and the RDPT promo bonus) meaningful while the risk side stays empirical,
 *   and avoids treating one 5-year window's realized returns as a forecast.
 */
import bundledHistoryJson from '../../data/market-history.json';
import type { AssetDefinition } from './types';

export interface MarketHistory {
  generatedAt: string;
  currency: 'IDR';
  frequency: 'weekly';
  /** Monday of each week on the grid (length N + 1). */
  weekStarts: string[];
  /** Simple weekly IDR returns (length N); null before the asset's first close. */
  returns: Record<string, (number | null)[]>;
}

export const BUNDLED_MARKET_HISTORY = bundledHistoryJson as MarketHistory;

export const WEEKS_PER_YEAR = 52;
/** Minimum common window (2 years) for a portfolio backtest to be considered meaningful. */
export const MIN_BACKTEST_WEEKS = 104;
/** Minimum pairwise overlap (1 year) before a historical correlation replaces the category prior. */
export const MIN_CORRELATION_OVERLAP_WEEKS = 52;
/**
 * Assets without price history (e.g. RDPU / RDPT mutual funds) at or below this volatility are
 * modeled as a constant-growth sleeve in the backtest. Higher-volatility assets without history
 * cannot be backtested honestly, so the portfolio falls back to a labeled parametric estimate.
 */
export const CASH_LIKE_MAX_VOLATILITY_PCT = 5;
/** Monthly (every 4 weeks) rebalancing back to target weights. */
export const DEFAULT_REBALANCE_EVERY_WEEKS = 4;

/** Returns the non-null tail of an asset's return series, or null if the asset has no history. */
function getSeries(assetId: string, history: MarketHistory): (number | null)[] | null {
  const series = history.returns[assetId];
  return Array.isArray(series) && series.length > 0 ? series : null;
}

function firstAvailableIndex(series: (number | null)[]): number {
  const idx = series.findIndex((r) => typeof r === 'number');
  return idx === -1 ? series.length : idx;
}

/** Number of weeks of history available for an asset (0 if none). */
export function historyWeeks(assetId: string, history: MarketHistory = BUNDLED_MARKET_HISTORY): number {
  const series = getSeries(assetId, history);
  return series ? series.length - firstAvailableIndex(series) : 0;
}

const volatilityCache = new WeakMap<MarketHistory, Map<string, number | null>>();
const correlationCache = new WeakMap<MarketHistory, Map<string, number | null>>();

function cacheFor<T>(store: WeakMap<MarketHistory, Map<string, T>>, history: MarketHistory) {
  let cache = store.get(history);
  if (!cache) {
    cache = new Map();
    store.set(history, cache);
  }
  return cache;
}

/** Annualized volatility (%) of an asset's full available history, or null if < 1 year of data. */
export function historicalVolatilityPct(
  assetId: string,
  history: MarketHistory = BUNDLED_MARKET_HISTORY
): number | null {
  const cache = cacheFor(volatilityCache, history);
  if (cache.has(assetId)) return cache.get(assetId)!;

  const series = getSeries(assetId, history);
  let result: number | null = null;
  if (series) {
    const values = series.filter((r): r is number => typeof r === 'number');
    if (values.length >= MIN_CORRELATION_OVERLAP_WEEKS) {
      const mean = values.reduce((a, b) => a + b, 0) / values.length;
      const variance =
        values.reduce((acc, r) => acc + (r - mean) ** 2, 0) / Math.max(1, values.length - 1);
      result = Math.sqrt(variance * WEEKS_PER_YEAR) * 100;
    }
  }
  cache.set(assetId, result);
  return result;
}

/** Pearson correlation over the overlapping weeks of two assets, or null if overlap < 1 year. */
export function historicalCorrelation(
  assetIdA: string,
  assetIdB: string,
  history: MarketHistory = BUNDLED_MARKET_HISTORY
): number | null {
  if (assetIdA === assetIdB) return 1;
  const key = assetIdA < assetIdB ? `${assetIdA}|${assetIdB}` : `${assetIdB}|${assetIdA}`;
  const cache = cacheFor(correlationCache, history);
  if (cache.has(key)) return cache.get(key)!;

  const a = getSeries(assetIdA, history);
  const b = getSeries(assetIdB, history);
  let result: number | null = null;
  if (a && b && a.length === b.length) {
    const xs: number[] = [];
    const ys: number[] = [];
    for (let i = 0; i < a.length; i++) {
      const x = a[i];
      const y = b[i];
      if (typeof x === 'number' && typeof y === 'number') {
        xs.push(x);
        ys.push(y);
      }
    }
    if (xs.length >= MIN_CORRELATION_OVERLAP_WEEKS) {
      const mx = xs.reduce((s, v) => s + v, 0) / xs.length;
      const my = ys.reduce((s, v) => s + v, 0) / ys.length;
      let sxy = 0;
      let sxx = 0;
      let syy = 0;
      for (let i = 0; i < xs.length; i++) {
        sxy += (xs[i] - mx) * (ys[i] - my);
        sxx += (xs[i] - mx) ** 2;
        syy += (ys[i] - my) ** 2;
      }
      result = sxx > 0 && syy > 0 ? Math.max(-1, Math.min(1, sxy / Math.sqrt(sxx * syy))) : null;
    }
  }
  cache.set(key, result);
  return result;
}

/**
 * Makes a correlation matrix positive-definite by shrinking toward the identity until a Cholesky
 * factorization succeeds. Pairwise-complete correlations (different overlap windows per pair) are
 * not guaranteed to be PSD; risk budgeting and portfolio variance require PSD input.
 */
export function ensurePositiveDefinite(corr: number[][]): number[][] {
  const n = corr.length;
  const isPd = (m: number[][]): boolean => {
    const L: number[][] = Array.from({ length: n }, () => Array(n).fill(0));
    for (let i = 0; i < n; i++) {
      for (let j = 0; j <= i; j++) {
        let sum = m[i][j];
        for (let k = 0; k < j; k++) sum -= L[i][k] * L[j][k];
        if (i === j) {
          if (sum <= 1e-10) return false;
          L[i][i] = Math.sqrt(sum);
        } else {
          L[i][j] = sum / L[j][j];
        }
      }
    }
    return true;
  };
  if (isPd(corr)) return corr;
  for (let delta = 0.05; delta <= 1.0001; delta += 0.05) {
    const shrunk = corr.map((row, i) => row.map((v, j) => (i === j ? 1 : (1 - delta) * v)));
    if (isPd(shrunk)) return shrunk;
  }
  return corr.map((row, i) => row.map((_, j) => (i === j ? 1 : 0)));
}

export interface BacktestPosition {
  asset: AssetDefinition;
  /** Target weight as a fraction (positions should sum to 1). */
  weight: number;
  /** Long-run geometric return assumption (%) used to re-center the series. */
  assumedCagrPct: number;
}

export interface BacktestResult {
  cagrPct: number;
  maxDrawdownPct: number;
  volatilityPct: number;
  windowWeeks: number;
  windowStart: string;
  windowEnd: string;
  /** Assets without price history that were modeled as constant-growth (cash-like) sleeves. */
  modeledAssetIds: string[];
}

/**
 * Backtests a periodically rebalanced portfolio on the common history window of its assets.
 * Returns null when the portfolio cannot be backtested honestly (a volatile asset has no history,
 * or the common window is shorter than `MIN_BACKTEST_WEEKS`).
 */
export function backtestRebalancedPortfolio(
  positions: BacktestPosition[],
  history: MarketHistory = BUNDLED_MARKET_HISTORY,
  rebalanceEveryWeeks: number = DEFAULT_REBALANCE_EVERY_WEEKS
): BacktestResult | null {
  const active = positions.filter((p) => p.weight > 0);
  if (active.length === 0) return null;

  const totalWeight = active.reduce((s, p) => s + p.weight, 0);
  const n = history.weekStarts.length - 1;
  if (n <= 0 || totalWeight <= 0) return null;

  const modeledAssetIds: string[] = [];
  const seriesByIdx: ((number | null)[] | null)[] = [];
  let start = 0;
  for (const p of active) {
    const series = getSeries(p.asset.id, history);
    if (!series || series.length !== n) {
      if (p.asset.volatility <= CASH_LIKE_MAX_VOLATILITY_PCT) {
        modeledAssetIds.push(p.asset.id);
        seriesByIdx.push(null);
        continue;
      }
      return null;
    }
    start = Math.max(start, firstAvailableIndex(series));
    seriesByIdx.push(series);
  }

  const windowWeeks = n - start;
  if (windowWeeks < MIN_BACKTEST_WEEKS) return null;

  // Re-centered weekly log returns per position (see module docs).
  const logReturns: number[][] = active.map((p, idx) => {
    const target = Math.log(1 + Math.max(-99, p.assumedCagrPct) / 100) / WEEKS_PER_YEAR;
    const series = seriesByIdx[idx];
    if (!series) return Array(windowWeeks).fill(target);
    const raw = series.slice(start).map((r) => Math.log(1 + Math.max(-0.999, r as number)));
    const mean = raw.reduce((s, v) => s + v, 0) / raw.length;
    return raw.map((l) => l - mean + target);
  });

  const targets = active.map((p) => p.weight / totalWeight);
  let holdings = [...targets];
  let value = 1;
  let peak = 1;
  let maxDrawdown = 0;
  const weeklyReturns: number[] = [];

  for (let t = 0; t < windowWeeks; t++) {
    holdings = holdings.map((h, i) => h * Math.exp(logReturns[i][t]));
    const nextValue = holdings.reduce((s, h) => s + h, 0);
    weeklyReturns.push(nextValue / value - 1);
    value = nextValue;
    if (value > peak) peak = value;
    maxDrawdown = Math.max(maxDrawdown, (peak - value) / peak);
    if ((t + 1) % rebalanceEveryWeeks === 0) {
      holdings = targets.map((w) => w * value);
    }
  }

  const years = windowWeeks / WEEKS_PER_YEAR;
  const meanWeekly = weeklyReturns.reduce((s, r) => s + r, 0) / weeklyReturns.length;
  const weeklyVariance =
    weeklyReturns.reduce((acc, r) => acc + (r - meanWeekly) ** 2, 0) /
    Math.max(1, weeklyReturns.length - 1);

  return {
    cagrPct: (Math.pow(value, 1 / years) - 1) * 100,
    maxDrawdownPct: maxDrawdown * 100,
    volatilityPct: Math.sqrt(weeklyVariance * WEEKS_PER_YEAR) * 100,
    windowWeeks,
    windowStart: history.weekStarts[start],
    windowEnd: history.weekStarts[n],
    modeledAssetIds,
  };
}
