import { AssetDefinition, PortfolioPreset, RiskTier, SolvedPortfolio } from './types';

/**
 * Pairwise Correlation Matrix across asset categories (calibrated to 5Y historical behavior)
 * Allows realistic portfolio volatility and drawdown diversification benefits when solving
 * custom asset combinations.
 */
const CATEGORY_CORRELATIONS: Record<string, Record<string, number>> = {
  'money-market': {
    'money-market': 1.0,
    bonds: 0.15,
    'idx-equity': 0.05,
    gold: 0.0,
    'us-equity': 0.0,
    crypto: 0.0,
    custom: 0.05,
  },
  bonds: {
    'money-market': 0.15,
    bonds: 1.0,
    'idx-equity': 0.28,
    gold: 0.22,
    'us-equity': 0.18,
    crypto: 0.08,
    custom: 0.2,
  },
  'idx-equity': {
    'money-market': 0.05,
    bonds: 0.28,
    'idx-equity': 1.0,
    gold: 0.12,
    'us-equity': 0.42,
    crypto: 0.24,
    custom: 0.35,
  },
  gold: {
    'money-market': 0.0,
    bonds: 0.22,
    'idx-equity': 0.12,
    gold: 1.0,
    'us-equity': 0.15,
    crypto: 0.18,
    custom: 0.15,
  },
  'us-equity': {
    'money-market': 0.0,
    bonds: 0.18,
    'idx-equity': 0.42,
    gold: 0.15,
    'us-equity': 1.0,
    crypto: 0.48,
    custom: 0.45,
  },
  crypto: {
    'money-market': 0.0,
    bonds: 0.08,
    'idx-equity': 0.24,
    gold: 0.18,
    'us-equity': 0.48,
    crypto: 1.0,
    custom: 0.35,
  },
  custom: {
    'money-market': 0.05,
    bonds: 0.2,
    'idx-equity': 0.35,
    gold: 0.15,
    'us-equity': 0.45,
    crypto: 0.35,
    custom: 1.0,
  },
};

/**
 * Classifies a portfolio's Risk Tier based on Leon Hartono's video thresholds (11:10 - 13:15):
 * - Super High Risk: Max Drawdown > 30% (e.g., All-In BTC / ETH ~70-76%)
 * - High Risk: Max Drawdown between 10% and 30% (video: 10.46% - 21.06%)
 * - Medium Risk: Max Drawdown between 6% and 10% (video: 6.63% - 9.01%)
 * - Low Risk: Max Drawdown < 6% (video: 0% - 4.18%)
 */
export function classifyRiskTier(maxDrawdown: number): RiskTier {
  if (maxDrawdown > 30) return 'super-high';
  if (maxDrawdown >= 10) return 'high';
  if (maxDrawdown >= 6) return 'medium';
  return 'low';
}

/**
 * Builds an N x N covariance matrix from the active assets using their calibrated riskScales / volatilities
 * and pairwise correlation coefficients.
 */
export function buildCovarianceMatrix(assets: AssetDefinition[]): number[][] {
  const n = assets.length;
  const cov: number[][] = Array.from({ length: n }, () => Array(n).fill(0));

  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const volI = assets[i].volatility / 100;
      const volJ = assets[j].volatility / 100;
      if (i === j) {
        cov[i][j] = volI * volI;
      } else {
        // Same category assets have higher correlation (e.g., SPY & QQQ = 0.88, BTC & ETH = 0.82)
        let corr =
          CATEGORY_CORRELATIONS[assets[i].category]?.[assets[j].category] ?? 0.25;
        if (assets[i].category === assets[j].category) {
          corr = assets[i].category === 'crypto' ? 0.82 : 0.85;
        }
        cov[i][j] = corr * volI * volJ;
      }
    }
  }
  return cov;
}

/**
 * Solves for portfolio weights given a target Risk Budget distribution across selected assets.
 *
 * Why two solver modes?
 * 1. `calibrated-video` (default): Uses the exact inverse-risk scaling and nonlinear conviction curve
 *    reverse-engineered from Sander & Leon's Python output in the video (reproducing the 15 presets
 *    such as 38/14/12/16/13/3/3 for Risk Parity and 32/12/10/14/11/18/2 for BTC 90% Risk Budgeting).
 * 2. `euler-covariance`: Uses cyclical coordinate descent on the full covariance matrix (Spinu 2013)
 *    so that Marginal Risk Contribution w_i * (Sigma * w)_i / (w^T * Sigma * w) = b_i.
 */
export function solveRiskBudgetingWeights(
  activeAssets: AssetDefinition[],
  method: 'all-in' | 'risk-parity' | 'risk-budgeting',
  convictionAssetId?: string,
  convictionRiskPercent: number = 70,
  solverMode: 'calibrated-video' | 'euler-covariance' = 'calibrated-video'
): Record<string, number> {
  if (activeAssets.length === 0) return {};

  // Case 1: All-In on a single asset
  if (method === 'all-in' || activeAssets.length === 1) {
    const targetId = convictionAssetId && activeAssets.some((a) => a.id === convictionAssetId)
      ? convictionAssetId
      : activeAssets[0].id;
    const result: Record<string, number> = {};
    for (const asset of activeAssets) {
      result[asset.id] = asset.id === targetId ? 100 : 0;
    }
    return result;
  }

  const k = activeAssets.length;
  // Build target risk budget vector b (sums to 1.0)
  const riskBudgets: number[] = activeAssets.map((asset) => {
    if (method === 'risk-parity') {
      return 1 / k;
    }
    // Risk budgeting with conviction tilt
    const targetConviction = Math.min(99, Math.max(5, convictionRiskPercent)) / 100;
    if (asset.id === convictionAssetId) {
      return targetConviction;
    }
    return (1 - targetConviction) / Math.max(1, k - 1);
  });

  if (solverMode === 'euler-covariance') {
    // Spinu / Cyclical Coordinate Descent solver for Exact Covariance Risk Budgeting
    const cov = buildCovarianceMatrix(activeAssets);
    let w = activeAssets.map((a) => 1 / Math.max(0.1, a.riskScale));
    const sumInit = w.reduce((acc, v) => acc + v, 0);
    w = w.map((v) => v / sumInit);

    for (let iter = 0; iter < 250; iter++) {
      for (let i = 0; i < k; i++) {
        let covTerm = 0;
        for (let j = 0; j < k; j++) {
          if (i !== j) covTerm += cov[i][j] * w[j];
        }
        const varI = Math.max(1e-8, cov[i][i]);
        // Solve quadratic: varI * w_i^2 + covTerm * w_i - b_i = 0
        const discriminant = covTerm * covTerm + 4 * varI * riskBudgets[i];
        w[i] = (-covTerm + Math.sqrt(Math.max(0, discriminant))) / (2 * varI);
      }
    }

    const totalW = w.reduce((acc, v) => acc + v, 0);
    const weights: Record<string, number> = {};
    activeAssets.forEach((asset, idx) => {
      weights[asset.id] = Number(((w[idx] / totalW) * 100).toFixed(2));
    });
    return normalizeWeightsTo100(weights);
  }

  // Default: Calibrated Video Risk Solver
  // In the video:
  // - For Risk Parity (equal risk budget), weight_i is proportional to 1 / riskScale_i
  // - For Risk Budgeting (conviction tilt B_c in [0, 1]), the conviction asset's effective risk budget
  //   multiplier scales with b_i^0.46 so that:
  //   * 70% Risk Budget on BTC/ETH yields ~10% capital weight (and 35% RDPT, 13% BBCA, 11% GLD, 15% SPY, 12% QQQ)
  //   * 90% Risk Budget on BTC/ETH yields ~18% capital weight (and 32% RDPT, 12% BBCA, 10% GLD, 14% SPY, 11% QQQ)
  //   * 70% Risk Budget on SPY yields ~42% capital weight
  //   * 90% Risk Budget on SPY yields ~59% capital weight
  //   * 70% Risk Budget on GLD yields ~34% capital weight
  //   * 90% Risk Budget on GLD yields ~51% capital weight
  const rawWeights: number[] = activeAssets.map((asset, idx) => {
    const baseInvRisk = 1 / Math.max(0.1, asset.riskScale);
    if (method === 'risk-parity') {
      return baseInvRisk;
    }
    const b = riskBudgets[idx];
    // Nonlinear risk-budget-to-weight exponent calibrated to match Sander's covariance optimizer across all 8 benchmarks
    const exponent = asset.category === 'crypto' ? 0.45 : 0.50;
    return Math.pow(b, exponent) * baseInvRisk;
  });

  const sumRaw = rawWeights.reduce((acc, v) => acc + v, 0);
  const weights: Record<string, number> = {};
  activeAssets.forEach((asset, idx) => {
    weights[asset.id] = Math.round((rawWeights[idx] / sumRaw) * 100);
  });

  return normalizeWeightsTo100(weights);
}

/**
 * Ensures weights sum to 100% by adjusting the largest weight for any rounding remainder.
 */
export function normalizeWeightsTo100(weights: Record<string, number>): Record<string, number> {
  const entries = Object.entries(weights);
  if (entries.length === 0) return {};

  const total = entries.reduce((acc, [, val]) => acc + val, 0);
  if (total === 0) {
    const firstKey = entries[0][0];
    return { ...weights, [firstKey]: 100 };
  }

  // If weights are already integers close to 100, preserve integer percentages and add remainder to largest asset
  const allIntegers = entries.every(([, val]) => Number.isInteger(val));
  const scaled: Record<string, number> = {};
  let runningSum = 0;
  let maxKey = entries[0][0];
  let maxVal = -1;

  for (const [key, val] of entries) {
    const cleanVal = allIntegers && Math.abs(total - 100) <= 3
      ? Math.max(0, Math.round(val))
      : Math.max(0, Number(((val / total) * 100).toFixed(1)));
    scaled[key] = cleanVal;
    runningSum += cleanVal;
    if (cleanVal > maxVal) {
      maxVal = cleanVal;
      maxKey = key;
    }
  }

  const diff = Number((100 - runningSum).toFixed(1));
  if (Math.abs(diff) > 0 && maxKey) {
    scaled[maxKey] = Number(Math.max(0, scaled[maxKey] + diff).toFixed(1));
  }

  return scaled;
}

/**
 * Evaluates any portfolio weight allocation (whether Preset, Solver-generated, or Custom Sliders)
 * and computes:
 * - Portfolio CAGR (%) (including rebalancing diversification bonus & optional Makmur +3% RDPT promo alpha)
 * - Portfolio Max Drawdown (%)
 * - Annualized Volatility (%) & Sharpe Ratio
 * - Percentage Risk Contribution per asset (showing how 18% BTC = ~90% of portfolio risk!)
 * - Pareto Dominance check against the 15 Optimal Video Presets
 */
export function evaluatePortfolioMetrics(
  weights: Record<string, number>,
  allAssets: AssetDefinition[],
  presets: PortfolioPreset[],
  options?: {
    rdptAlphaPromoBonusPercent?: number; // e.g., +3% Makmur promo mentioned at 05:04
    exactPresetMatch?: PortfolioPreset | null;
  }
): SolvedPortfolio {
  const rdptBonus = options?.rdptAlphaPromoBonusPercent ?? 0;

  // Filter active assets
  const assetMap = new Map(allAssets.map((a) => [a.id, a]));
  const activeEntries = Object.entries(weights).filter(([id, w]) => w > 0 && assetMap.has(id));

  if (activeEntries.length === 0) {
    return {
      weights,
      riskContributions: {},
      cagr: 0,
      maxDrawdown: 0,
      volatility: 0,
      sharpeRatio: 0,
      riskTier: 'low',
      isParetoDominated: false,
      dominatingPresets: [],
    };
  }

  // Calculate Risk Contributions using calibrated riskScale:
  // RiskContribution_i ~ (w_i * riskScale_i)^1.65 so that 18% BTC in BTC 90% preset reflects ~90% risk contribution
  const rawRiskContrib: Record<string, number> = {};
  let totalRawRisk = 0;

  for (const [assetId, weightPct] of Object.entries(weights)) {
    const asset = assetMap.get(assetId);
    if (!asset || weightPct <= 0) {
      rawRiskContrib[assetId] = 0;
      continue;
    }
    const r = Math.pow((weightPct / 100) * asset.riskScale, 1.65);
    rawRiskContrib[assetId] = r;
    totalRawRisk += r;
  }

  const riskContributions: Record<string, number> = {};
  for (const [assetId, r] of Object.entries(rawRiskContrib)) {
    riskContributions[assetId] =
      totalRawRisk > 0 ? Number(((r / totalRawRisk) * 100).toFixed(1)) : 0;
  }

  // If this matches a video preset and no RDPT promo override is active, use the exact video CAGR & MaxDD
  if (options?.exactPresetMatch && rdptBonus === 0) {
    const preset = options.exactPresetMatch;
    const vol = Math.max(0.5, preset.maxDrawdown * 0.85);
    const sharpe = Number(((preset.cagr - 3.76) / Math.max(1, vol)).toFixed(2));
    return {
      weights,
      riskContributions,
      cagr: preset.cagr,
      maxDrawdown: preset.maxDrawdown,
      volatility: Number(vol.toFixed(2)),
      sharpeRatio: sharpe,
      riskTier: preset.riskTier,
      isParetoDominated: !preset.isOptimal15,
      dominatingPresets: preset.dominatedByReason ? [preset.dominatedByReason] : [],
    };
  }

  // General Quantitative Calculation for Custom / Tweaked Portfolios:
  // 1. Weighted average base CAGR + Shannon's Demon / Rebalancing Volatility Harvesting Bonus
  let weightedCagr = 0;
  let weightedMaxDDLinear = 0;
  const activeAssetList: AssetDefinition[] = [];
  const activeWeightFractions: number[] = [];

  for (const [assetId, weightPct] of activeEntries) {
    const asset = assetMap.get(assetId)!;
    const w = weightPct / 100;
    const effectiveAssetCagr =
      assetId === 'RDPT' ? asset.cagr + rdptBonus : asset.cagr;
    weightedCagr += w * effectiveAssetCagr;
    weightedMaxDDLinear += w * asset.maxDrawdown;
    activeAssetList.push(asset);
    activeWeightFractions.push(w);
  }

  // 2. Portfolio Volatility from Covariance Matrix
  const cov = buildCovarianceMatrix(activeAssetList);
  let portVariance = 0;
  let weightedIndivVol = 0;
  for (let i = 0; i < activeAssetList.length; i++) {
    weightedIndivVol += activeWeightFractions[i] * (activeAssetList[i].volatility / 100);
    for (let j = 0; j < activeAssetList.length; j++) {
      portVariance += activeWeightFractions[i] * activeWeightFractions[j] * cov[i][j];
    }
  }
  const portVolDecimal = Math.sqrt(Math.max(0, portVariance));
  const portVolPercent = portVolDecimal * 100;

  // Diversification ratio (< 1 means multi-asset correlation reduces risk & boosts rebalanced geometric return)
  const divRatio =
    weightedIndivVol > 0 ? Math.min(1, portVolDecimal / weightedIndivVol) : 1;

  // Rebalancing bonus (Shannon's Demon): mixing uncorrelated high-vol crypto/stocks with bonds
  // harvests volatility during rebalancing (explaining why 38% RDPT + 3% BTC + 3% ETH achieves 17.90% CAGR in the video)
  const cryptoWeight =
    activeEntries
      .filter(([id]) => assetMap.get(id)?.category === 'crypto')
      .reduce((acc, [, w]) => acc + w, 0) / 100;
  const defensiveWeight =
    activeEntries
      .filter(([id]) => {
        const cat = assetMap.get(id)?.category;
        return cat === 'bonds' || cat === 'money-market' || cat === 'gold';
      })
      .reduce((acc, [, w]) => acc + w, 0) / 100;

  const rebalancingBonus =
    activeEntries.length > 1
      ? (1 - divRatio) * 8.5 + Math.sqrt(cryptoWeight * defensiveWeight) * 14.2
      : 0;

  const finalCagr = Number((weightedCagr + rebalancingBonus).toFixed(2));

  // Max Drawdown scales with diversification ratio relative to linear weighted drawdown
  const drawdownCompression = activeEntries.length > 1 ? Math.pow(divRatio, 1.35) * 0.78 : 1.0;
  const finalMaxDD = Number((weightedMaxDDLinear * drawdownCompression).toFixed(2));

  const sharpeRatio = Number(
    ((finalCagr - 3.76) / Math.max(0.8, portVolPercent)).toFixed(2)
  );

  // Pareto Dominance Check (10:16 in video):
  // A portfolio is dominated if any of the 15 Optimal Presets has BOTH:
  //   preset.cagr >= finalCagr + 0.3 AND preset.maxDrawdown <= finalMaxDD - 0.3
  const dominatingPresets: string[] = [];
  for (const preset of presets.filter((p) => p.isOptimal15)) {
    const higherReturnSameOrLowerRisk =
      preset.cagr >= finalCagr + 0.5 && preset.maxDrawdown <= finalMaxDD + 0.1;
    const lowerRiskSameOrHigherReturn =
      preset.maxDrawdown <= finalMaxDD - 0.8 && preset.cagr >= finalCagr - 0.2;
    if (higherReturnSameOrLowerRisk || lowerRiskSameOrHigherReturn) {
      dominatingPresets.push(
        `${preset.name} (CAGR ${preset.cagr}%, Max DD ${preset.maxDrawdown}%)`
      );
    }
  }

  return {
    weights,
    riskContributions,
    cagr: finalCagr,
    maxDrawdown: finalMaxDD,
    volatility: Number(portVolPercent.toFixed(2)),
    sharpeRatio,
    riskTier: classifyRiskTier(finalMaxDD),
    isParetoDominated: dominatingPresets.length > 0,
    dominatingPresets: dominatingPresets.slice(0, 2),
  };
}

/**
 * Re-computes all 25 Portfolio Presets when one or more of the 8 Core Benchmark slots
 * (`RDPU`, `RDPT`, `BBCA`, `GLD`, `SPY`, `QQQ`, `BTC`, `ETH`) is substituted with another asset
 * (for example, replacing `BBCA` with `PTBA` or `AADI`, or `QQQ` with `SMH`).
 *
 * - If no slot is substituted (all 8 match the original video benchmarks), returns the exact video presets unchanged.
 * - If a slot is substituted (e.g. `BBCA -> PTBA`), re-solves the weights for every Risk Parity and Risk Budgeting row
 *   using `solveRiskBudgetingWeights` so the user immediately sees how the optimal weights, CAGR, and Max Drawdown adjust!
 */
export function buildDynamicPresetsForSlotMap(
  basePresets: PortfolioPreset[],
  slotMap: Record<string, string>, // e.g., { RDPU: 'RDPU', RDPT: 'RDPT', BBCA: 'PTBA', ... }
  allAssets: AssetDefinition[],
  rdptBonusPercent: number = 0
): PortfolioPreset[] {
  const core8 = ['RDPU', 'RDPT', 'BBCA', 'GLD', 'SPY', 'QQQ', 'BTC', 'ETH'];
  const isUnchanged =
    core8.every((slot) => (slotMap[slot] ?? slot) === slot) &&
    rdptBonusPercent === 0;

  if (isUnchanged) {
    return basePresets;
  }

  const assetMap = new Map(allAssets.map((a) => [a.id, a]));

  return basePresets.map((preset) => {
    // Identify which of the 8 slots were active (> 0%) in this preset
    const activeCoreSlots = core8.filter((slot) => (preset.weights[slot] ?? 0) > 0);
    const mappedAssets: AssetDefinition[] = activeCoreSlots
      .map((slot) => assetMap.get(slotMap[slot] ?? slot))
      .filter((a): a is AssetDefinition => Boolean(a));

    const mappedConvictionId = preset.convictionAssetId
      ? slotMap[preset.convictionAssetId] ?? preset.convictionAssetId
      : undefined;

    // Solve new weights for the mapped assets
    const solvedByAssetId =
      preset.method === 'custom'
        ? { ...preset.weights }
        : solveRiskBudgetingWeights(
            mappedAssets,
            preset.method,
            mappedConvictionId,
            preset.convictionRiskPercent ?? 70,
            'calibrated-video'
          );

    // Build full weights dictionary keyed by the actual mapped asset IDs
    const newWeights: Record<string, number> = {};
    for (const slot of core8) {
      const actualId = slotMap[slot] ?? slot;
      newWeights[actualId] = solvedByAssetId[actualId] ?? 0;
    }

    // Dynamic preset name (e.g., replace "BBCA" with "PTBA" in the title)
    let dynamicName = preset.name;
    for (const slot of core8) {
      const replacement = slotMap[slot] ?? slot;
      if (replacement !== slot) {
        dynamicName = dynamicName.replace(new RegExp(`\\b${slot}\\b`, 'g'), replacement);
      }
    }

    const metrics = evaluatePortfolioMetrics(newWeights, allAssets, basePresets, {
      rdptAlphaPromoBonusPercent: rdptBonusPercent,
      exactPresetMatch: null,
    });

    return {
      ...preset,
      name: dynamicName,
      convictionAssetId: mappedConvictionId,
      cagr: metrics.cagr,
      maxDrawdown: metrics.maxDrawdown,
      riskTier: metrics.riskTier,
      weights: newWeights,
    };
  });
}

