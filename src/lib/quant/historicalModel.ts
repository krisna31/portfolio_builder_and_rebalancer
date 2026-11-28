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
  realizedCagrPct: number;
  maxDrawdownPct: number;
  volatilityPct: number;
  windowWeeks: number;
  windowStart: string;
  windowEnd: string;
  /** Assets without price history that were modeled as constant-growth (cash-like) sleeves. */
  modeledAssetIds: string[];
}

/** Annualized realized geometric CAGR (%) from available history, or null if < 1 year of data. */
export function historicalRealizedCagrPct(
  assetId: string,
  history: MarketHistory = BUNDLED_MARKET_HISTORY
): number | null {
  const series = getSeries(assetId, history);
  if (!series) return null;
  const values = series.filter((r): r is number => typeof r === 'number');
  if (values.length < MIN_CORRELATION_OVERLAP_WEEKS) return null;
  let logSum = 0;
  for (const r of values) {
    logSum += Math.log(1 + Math.max(-0.999, r));
  }
  const years = values.length / WEEKS_PER_YEAR;
  return Number(((Math.exp(logSum / years) - 1) * 100).toFixed(2));
}

/** Peak-to-trough maximum drawdown (%) from available history, or null if < 1 year of data. */
export function historicalMaxDrawdownPct(
  assetId: string,
  history: MarketHistory = BUNDLED_MARKET_HISTORY
): number | null {
  const series = getSeries(assetId, history);
  if (!series) return null;
  const values = series.filter((r): r is number => typeof r === 'number');
  if (values.length < MIN_CORRELATION_OVERLAP_WEEKS) return null;
  let val = 1;
  let peak = 1;
  let maxDd = 0;
  for (const r of values) {
    val *= 1 + Math.max(-0.999, r);
    if (val > peak) peak = val;
    maxDd = Math.max(maxDd, (peak - val) / peak);
  }
  return Number((maxDd * 100).toFixed(2));
}

/**
 * Current drawdown (%) from the peak over the trailing `lookbackWeeks` (or full available series),
 * or null if fewer than 4 weeks of price history exist.
 */
export function historicalCurrentDrawdownFromPeakPct(
  assetId: string,
  lookbackWeeks?: number,
  history: MarketHistory = BUNDLED_MARKET_HISTORY
): number | null {
  const series = getSeries(assetId, history);
  if (!series) return null;
  const allValues = series.filter((r): r is number => typeof r === 'number');
  const values =
    lookbackWeeks && lookbackWeeks > 0
      ? allValues.slice(-Math.min(allValues.length, lookbackWeeks))
      : allValues;
  if (values.length < 4) return null;
  let val = 1;
  let peak = 1;
  for (const r of values) {
    val *= 1 + Math.max(-0.999, r);
    if (val > peak) peak = val;
  }
  return Number((((peak - val) / peak) * 100).toFixed(1));
}

/**
 * Backtests a periodically rebalanced portfolio on the common history window of its assets.
 * Returns null when the portfolio cannot be backtested honestly (a volatile asset has no history,
 * or the common window is shorter than `MIN_BACKTEST_WEEKS`).
 *
 * Maintains two parallel tracks across the exact same rebalancing schedule:
 * - Unadjusted historical returns -> used for `maxDrawdownPct`, `volatilityPct`, and `realizedCagrPct`
 *   so optimistic CAGR assumptions never shrink historical crash depth.
 * - Re-centered returns (matched to each asset's `assumedCagrPct`) -> used for `cagrPct` so user
 *   forward-return edits and RDPT promo remain responsive.
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

  // Unadjusted weekly log returns (actual historical moves) and re-centered log returns (for assumed CAGR)
  const rawLogReturns: number[][] = [];
  const recenteredLogReturns: number[][] = [];
  for (let idx = 0; idx < active.length; idx++) {
    const p = active[idx];
    const target = Math.log(1 + Math.max(-99, p.assumedCagrPct) / 100) / WEEKS_PER_YEAR;
    const series = seriesByIdx[idx];
    if (!series) {
      const cashSeries = Array(windowWeeks).fill(target);
      rawLogReturns.push(cashSeries);
      recenteredLogReturns.push(cashSeries);
      continue;
    }
    const raw = series.slice(start).map((r) => Math.log(1 + Math.max(-0.999, r as number)));
    const mean = raw.reduce((s, v) => s + v, 0) / raw.length;
    rawLogReturns.push(raw);
    recenteredLogReturns.push(raw.map((l) => l - mean + target));
  }

  const targets = active.map((p) => p.weight / totalWeight);
  let holdings = [...targets];
  let value = 1;

  let rawHoldings = [...targets];
  let rawValue = 1;
  let rawPeak = 1;
  let rawMaxDrawdown = 0;
  const rawWeeklyReturns: number[] = [];

  for (let t = 0; t < windowWeeks; t++) {
    holdings = holdings.map((h, i) => h * Math.exp(recenteredLogReturns[i][t]));
    value = holdings.reduce((s, h) => s + h, 0);

    rawHoldings = rawHoldings.map((h, i) => h * Math.exp(rawLogReturns[i][t]));
    const nextRawValue = rawHoldings.reduce((s, h) => s + h, 0);
    rawWeeklyReturns.push(nextRawValue / rawValue - 1);
    rawValue = nextRawValue;
    if (rawValue > rawPeak) rawPeak = rawValue;
    rawMaxDrawdown = Math.max(rawMaxDrawdown, (rawPeak - rawValue) / rawPeak);

    if (Number.isFinite(rebalanceEveryWeeks) && (t + 1) % rebalanceEveryWeeks === 0) {
      holdings = targets.map((w) => w * value);
      rawHoldings = targets.map((w) => w * rawValue);
    }
  }

  const years = windowWeeks / WEEKS_PER_YEAR;
  const meanWeekly = rawWeeklyReturns.reduce((s, r) => s + r, 0) / rawWeeklyReturns.length;
  const weeklyVariance =
    rawWeeklyReturns.reduce((acc, r) => acc + (r - meanWeekly) ** 2, 0) /
    Math.max(1, rawWeeklyReturns.length - 1);

  return {
    cagrPct: (Math.pow(value, 1 / years) - 1) * 100,
    realizedCagrPct: (Math.pow(rawValue, 1 / years) - 1) * 100,
    maxDrawdownPct: rawMaxDrawdown * 100,
    volatilityPct: Math.sqrt(weeklyVariance * WEEKS_PER_YEAR) * 100,
    windowWeeks,
    windowStart: history.weekStarts[start],
    windowEnd: history.weekStarts[n],
    modeledAssetIds,
  };
}

export interface HistoricalRebalanceFrequencyResult {
  series: Array<{
    periodLabel: string;
    RebalanceBulanan: number;
    Rebalance3Bulan: number;
    RebalanceTahunan: number;
    BuyAndHold: number;
  }>;
  finalMonthlyIdr: number;
  finalQuarterlyIdr: number;
  finalAnnualIdr: number;
  finalBuyHoldIdr: number;
  monthlyMaxDdPercent: number;
  quarterlyMaxDdPercent: number;
  annualMaxDdPercent: number;
  buyHoldMaxDdPercent: number;
  windowStart: string;
  windowEnd: string;
  windowWeeks: number;
  isHistorical: true;
}

function formatIsoQuarterLabel(isoDate: string): string {
  const year = isoDate.slice(0, 4);
  const month = Number(isoDate.slice(5, 7)) || 1;
  const q = Math.min(4, Math.max(1, Math.ceil(month / 3)));
  return `${year} Q${q}`;
}

/**
 * Runs 4 real weekly IDR backtests (Monthly 4w, Quarterly 13w, Annual 52w, Buy & Hold)
 * over the common historical window of `positions`. Returns null if any risky asset lacks >= 2Y history.
 */
export function backtestRebalancingFrequencies(
  positions: BacktestPosition[],
  initialCapitalIdr: number,
  history: MarketHistory = BUNDLED_MARKET_HISTORY,
  useRealizedReturns: boolean = true
): HistoricalRebalanceFrequencyResult | null {
  const active = positions.filter((p) => p.weight > 0);
  if (active.length === 0) return null;

  const totalWeight = active.reduce((s, p) => s + p.weight, 0);
  const n = history.weekStarts.length - 1;
  if (n <= 0 || totalWeight <= 0) return null;

  const seriesByIdx: ((number | null)[] | null)[] = [];
  let start = 0;
  for (const p of active) {
    const series = getSeries(p.asset.id, history);
    if (!series || series.length !== n) {
      if (p.asset.volatility <= CASH_LIKE_MAX_VOLATILITY_PCT) {
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

  const logReturns: number[][] = active.map((p, idx) => {
    const target = Math.log(1 + Math.max(-99, p.assumedCagrPct) / 100) / WEEKS_PER_YEAR;
    const series = seriesByIdx[idx];
    if (!series) return Array(windowWeeks).fill(target);
    const raw = series.slice(start).map((r) => Math.log(1 + Math.max(-0.999, r as number)));
    if (useRealizedReturns) return raw;
    const mean = raw.reduce((s, v) => s + v, 0) / raw.length;
    return raw.map((l) => l - mean + target);
  });

  const startCap = Math.max(1_000_000, initialCapitalIdr);
  const targets = active.map((p) => p.weight / totalWeight);

  const schedules = [4, 13, 52, Infinity] as const;
  const holdingsBySched = schedules.map(() => targets.map((w) => w * startCap));
  const valuesBySched = schedules.map(() => startCap);
  const peaksBySched = schedules.map(() => startCap);
  const maxDdBySched = schedules.map(() => 0);

  const chartSeries: HistoricalRebalanceFrequencyResult['series'] = [
    {
      periodLabel: 'Start',
      RebalanceBulanan: Math.round(startCap / 1_000_000),
      Rebalance3Bulan: Math.round(startCap / 1_000_000),
      RebalanceTahunan: Math.round(startCap / 1_000_000),
      BuyAndHold: Math.round(startCap / 1_000_000),
    },
  ];

  for (let t = 0; t < windowWeeks; t++) {
    for (let sIdx = 0; sIdx < schedules.length; sIdx++) {
      holdingsBySched[sIdx] = holdingsBySched[sIdx].map(
        (h, i) => h * Math.exp(logReturns[i][t])
      );
      const val = holdingsBySched[sIdx].reduce((sum, h) => sum + h, 0);
      valuesBySched[sIdx] = val;
      if (val > peaksBySched[sIdx]) peaksBySched[sIdx] = val;
      maxDdBySched[sIdx] = Math.max(
        maxDdBySched[sIdx],
        (peaksBySched[sIdx] - val) / peaksBySched[sIdx]
      );
      const every = schedules[sIdx];
      if (Number.isFinite(every) && (t + 1) % every === 0) {
        holdingsBySched[sIdx] = targets.map((w) => w * val);
      }
    }

    if ((t + 1) % 13 === 0 || t === windowWeeks - 1) {
      const dateStr = history.weekStarts[start + t + 1] ?? history.weekStarts[n];
      chartSeries.push({
        periodLabel: formatIsoQuarterLabel(dateStr),
        RebalanceBulanan: Math.round(valuesBySched[0] / 1_000_000),
        Rebalance3Bulan: Math.round(valuesBySched[1] / 1_000_000),
        RebalanceTahunan: Math.round(valuesBySched[2] / 1_000_000),
        BuyAndHold: Math.round(valuesBySched[3] / 1_000_000),
      });
    }
  }

  return {
    series: chartSeries,
    finalMonthlyIdr: Math.round(valuesBySched[0]),
    finalQuarterlyIdr: Math.round(valuesBySched[1]),
    finalAnnualIdr: Math.round(valuesBySched[2]),
    finalBuyHoldIdr: Math.round(valuesBySched[3]),
    monthlyMaxDdPercent: Number((maxDdBySched[0] * 100).toFixed(2)),
    quarterlyMaxDdPercent: Number((maxDdBySched[1] * 100).toFixed(2)),
    annualMaxDdPercent: Number((maxDdBySched[2] * 100).toFixed(2)),
    buyHoldMaxDdPercent: Number((maxDdBySched[3] * 100).toFixed(2)),
    windowStart: history.weekStarts[start],
    windowEnd: history.weekStarts[n],
    windowWeeks,
    isHistorical: true,
  };
}

export type AssumptionPresetMode = 'conservative-forward' | 'realized-5y' | 'video-baseline';

export const CONSERVATIVE_FORWARD_CAGR_BY_ID: Record<string, number> = {
  RDPU: 3.76,
  RDPT: 6.85,
  BBCA: 10.5,
  BMRI: 10.5,
  BBRI: 10.0,
  BBNI: 9.5,
  NISP: 10.5,
  PTBA: 10.0,
  AADI: 10.0,
  ADRO: 10.0,
  ITMG: 10.0,
  TLKM: 7.0,
  ASII: 8.5,
  ICBP: 8.5,
  ANTM: 9.5,
  UNTR: 9.5,
  BRIS: 10.5,
  BREN: 10.0,
  AMMN: 10.0,
  PANI: 10.0,
  GLD: 8.5,
  SPY: 10.0,
  VOO: 10.0,
  SCHD: 9.5,
  QQQ: 12.0,
  SMH: 13.0,
  NVDA: 14.0,
  BTC: 18.0,
  ETH: 18.0,
  SOL: 20.0,
};

const CATEGORY_CONSERVATIVE_CAGR: Record<string, number> = {
  'money-market': 3.76,
  bonds: 6.85,
  gold: 8.5,
  'idx-equity': 9.5,
  'us-equity': 10.0,
  crypto: 18.0,
  custom: 10.0,
};

/**
 * Applies a return/risk assumption regime across the asset universe:
 * - `'conservative-forward'`: disciplined forward expected returns (capped crypto/equity) + empirical 5Y risk
 * - `'realized-5y'`: latest rolling 5Y realized CAGR, Max Drawdown, and Volatility from snapshot / history
 * - `'video-baseline'`: original 2019-2024 video benchmark constants from `baseAssets`
 */
export function applyAssumptionPreset(
  assets: AssetDefinition[],
  mode: AssumptionPresetMode,
  options?: {
    baseAssets?: AssetDefinition[];
    snapshotMetrics?: Record<
      string,
      { cagr5y?: number; maxDrawdown5y?: number; volatility5y?: number }
    > | null;
    history?: MarketHistory;
  }
): AssetDefinition[] {
  const history = options?.history ?? BUNDLED_MARKET_HISTORY;
  const baseMap = new Map((options?.baseAssets ?? []).map((a) => [a.id, a]));
  const snap = options?.snapshotMetrics ?? null;

  return assets.map((asset) => {
    const base = baseMap.get(asset.id);

    if (mode === 'video-baseline') {
      if (!base) return asset;
      return {
        ...asset,
        cagr: base.cagr,
        maxDrawdown: base.maxDrawdown,
        volatility: base.volatility,
      };
    }

    const snapItem = snap?.[asset.id];
    const empiricalDd =
      snapItem?.maxDrawdown5y ?? historicalMaxDrawdownPct(asset.id, history) ?? asset.maxDrawdown;
    const empiricalVol =
      snapItem?.volatility5y ?? historicalVolatilityPct(asset.id, history) ?? asset.volatility;

    if (mode === 'realized-5y') {
      const empiricalCagr =
        snapItem?.cagr5y ?? historicalRealizedCagrPct(asset.id, history) ?? asset.cagr;
      return {
        ...asset,
        cagr: Number(empiricalCagr.toFixed(2)),
        maxDrawdown: Number(empiricalDd.toFixed(2)),
        volatility: Number(empiricalVol.toFixed(2)),
      };
    }

    // 'conservative-forward'
    const catCap = CATEGORY_CONSERVATIVE_CAGR[asset.category] ?? 10.0;
    const targetCagr =
      CONSERVATIVE_FORWARD_CAGR_BY_ID[asset.id] ??
      (asset.cagr > 0 ? Math.min(asset.cagr, catCap) : catCap);

    return {
      ...asset,
      cagr: Number(targetCagr.toFixed(2)),
      maxDrawdown: Number(empiricalDd.toFixed(2)),
      volatility: Number(empiricalVol.toFixed(2)),
    };
  });
}
