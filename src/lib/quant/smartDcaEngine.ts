import {
  AssetCategory,
  AssetDefinition,
  HoldingEntry,
  RebalanceItemResult,
  RebalanceSummaryResult,
  SentimentZone,
  ValuationSentimentConfig,
} from './types';
import { getSentimentZone } from './tacticalValuationEngine';

export type SmartDcaAction =
  | 'AGGRESSIVE_BUY'
  | 'MODERATE_BUY'
  | 'NORMAL_BUY'
  | 'SMALL_BUY'
  | 'HOLD_SKIP';

export type SmartDcaOverflowMode = 'park-rdpu' | 'boost-discount';

export interface ValuationMetricItem {
  name: string;
  label: string;
  value: string | number;
  weightPercent: number; // e.g. 50 or 60
  score: number; // 0 - 100 (100 = maximum discount / strongest buy)
  formulaSnippet: string;
  description: string;
}

export interface ValuationMetricBreakdown {
  category: AssetCategory;
  score: number; // 0 - 100
  metrics: ValuationMetricItem[];
  summary: string;
}

export interface DriftMetricBreakdown {
  targetWeightPercent: number;
  currentWeightPercent: number;
  driftPercent: number; // current - target
  relativeDeficitPercent: number; // (target - current) / target * 100
  score: number; // 0 - 100 (100 = 100% underweight / missing from portfolio)
  summary: string;
}

export interface SmartDcaExplanation {
  compositeScore: number;
  valuationScore: number;
  driftScore: number;
  action: SmartDcaAction;
  actionLabel: string;
  multiplier: number;
  valuationBreakdown: ValuationMetricBreakdown;
  driftBreakdown: DriftMetricBreakdown;
  narrativeWhy: string;
  formulaHow: string;
  budgetMath: {
    baseAllocationIdr: number;
    multiplier: number;
    rawAllocationIdr: number;
    finalAllocationIdr: number;
    warChestShareIdr: number;
  };
}

export interface SmartDcaItemResult {
  assetId: string;
  symbol: string;
  name: string;
  category: AssetCategory;
  color: string;
  targetWeightPercent: number;
  currentWeightPercent: number;
  currentValueIdr: number;
  unitPriceIdr: number;
  action: SmartDcaAction;
  actionLabel: string;
  multiplier: number;
  baseAllocationIdr: number;
  recommendedAmountIdr: number;
  recommendedUnits: number;
  recommendedLotsInteger?: number;
  remainderLotIdr?: number;
  isNominalOnly?: boolean;
  isDustFiltered?: boolean;
  explanation: SmartDcaExplanation;
}

export interface SmartDcaResult {
  totalBudgetIdr: number;
  totalAllocatedAssetsIdr: number;
  warChestParkedIdr: number;
  unallocatedCashRemainderIdr: number;
  overflowMode: SmartDcaOverflowMode;
  items: SmartDcaItemResult[];
  warChestAssetId?: string;
  asRebalanceSummary: RebalanceSummaryResult;
}

export interface MarketDataOverride {
  peRatio?: number;
  pe5yAvg?: number;
  forwardPe?: number;
  forwardPe5yAvg?: number;
  drawdown52w?: number;
  drawdownAth?: number;
  realYield?: number;
  fearGreedScore?: number;
}

export interface SmartDcaInputParams {
  assets: AssetDefinition[];
  targetWeights: Record<string, number>;
  holdings: Record<string, HoldingEntry>;
  monthlyBudgetIdr: number;
  inputMode?: 'nominal' | 'units';
  usdIdrRate: number;
  overflowMode?: SmartDcaOverflowMode;
  enableIdxLotRounding?: boolean;
  filterDustTrades?: boolean;
  dustTradeThresholdIdr?: number;
  tacticalConfig?: ValuationSentimentConfig;
  marketDataOverrides?: Record<string, MarketDataOverride>;
}

/**
 * Curated benchmark parameters for major asset classes
 * Used when live market metrics are not explicitly overridden
 */
export const CURATED_VALUATION_BENCHMARKS: Record<
  string,
  {
    athPriceUsd?: number;
    athPriceIdr?: number;
    pe5yAvg?: number;
    currentPeEst?: number;
    forwardPe5yAvg?: number;
    currentForwardPeEst?: number;
    benchmarkDrawdown52w?: number;
    benchmarkDrawdownAth?: number;
    benchmarkRealYield?: number;
  }
> = {
  BTC: {
    athPriceUsd: 73750,
    benchmarkDrawdownAth: 15.0,
  },
  ETH: {
    athPriceUsd: 4890,
    benchmarkDrawdownAth: 45.0,
  },
  SOL: {
    athPriceUsd: 260,
    benchmarkDrawdownAth: 35.0,
  },
  BBCA: {
    pe5yAvg: 24.0,
    currentPeEst: 20.5,
    benchmarkDrawdown52w: 8.5,
  },
  BBRI: {
    pe5yAvg: 14.2,
    currentPeEst: 11.2,
    benchmarkDrawdown52w: 22.0,
  },
  BMRI: {
    pe5yAvg: 12.0,
    currentPeEst: 10.4,
    benchmarkDrawdown52w: 12.0,
  },
  TLKM: {
    pe5yAvg: 15.5,
    currentPeEst: 11.8,
    benchmarkDrawdown52w: 26.0,
  },
  ASII: {
    pe5yAvg: 8.5,
    currentPeEst: 6.8,
    benchmarkDrawdown52w: 18.0,
  },
  SPY: {
    forwardPe5yAvg: 19.5,
    currentForwardPeEst: 20.8,
    benchmarkDrawdown52w: 4.5,
  },
  QQQ: {
    forwardPe5yAvg: 25.0,
    currentForwardPeEst: 26.5,
    benchmarkDrawdown52w: 6.0,
  },
  GLD: {
    benchmarkDrawdownAth: 3.5,
    benchmarkRealYield: 1.95,
  },
};

/**
 * Action Tier Configuration
 */
export function getActionTier(score: number): {
  action: SmartDcaAction;
  actionLabel: string;
  badgeClass: string;
  multiplier: number;
} {
  const cleanScore = Math.max(0, Math.min(100, Math.round(score)));

  if (cleanScore >= 80) {
    // Aggressive Buy: 1.75x to 2.0x linear interpolation
    const factor = (cleanScore - 80) / 20;
    const multiplier = Number((1.75 + factor * 0.25).toFixed(2));
    return {
      action: 'AGGRESSIVE_BUY',
      actionLabel: 'Beli Agresif',
      badgeClass: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
      multiplier,
    };
  }

  if (cleanScore >= 60) {
    // Moderate Buy: 1.25x to 1.5x linear interpolation
    const factor = (cleanScore - 60) / 19;
    const multiplier = Number((1.25 + factor * 0.25).toFixed(2));
    return {
      action: 'MODERATE_BUY',
      actionLabel: 'Beli Rutin Plus',
      badgeClass: 'bg-teal-500/20 text-teal-400 border-teal-500/30',
      multiplier,
    };
  }

  if (cleanScore >= 45) {
    // Normal Buy: 1.0x baseline
    return {
      action: 'NORMAL_BUY',
      actionLabel: 'Beli Normal',
      badgeClass: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
      multiplier: 1.0,
    };
  }

  if (cleanScore >= 30) {
    // Small Buy: 0.5x minimum DCA
    return {
      action: 'SMALL_BUY',
      actionLabel: 'Beli Minimal',
      badgeClass: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
      multiplier: 0.5,
    };
  }

  // Hold / Skip: 0.0x DCA allocation
  return {
    action: 'HOLD_SKIP',
    actionLabel: 'Tahan / Lewati',
    badgeClass: 'bg-rose-500/20 text-rose-400 border-rose-500/30',
    multiplier: 0.0,
  };
}

/**
 * Pillar 1: Market Valuation & Discount Score Calculation (0 - 100)
 * Higher score = more discounted / undervalued / fear (stronger buying opportunity)
 */
export function calculateValuationScore(
  asset: AssetDefinition,
  tacticalConfig?: ValuationSentimentConfig,
  override?: MarketDataOverride,
  currentPriceNative?: number,
  usdIdrRate: number = 16000
): ValuationMetricBreakdown {
  const isCrypto =
    asset.category === 'crypto' || ['BTC', 'ETH', 'SOL'].includes(asset.id);
  const isIdxEquity =
    asset.category === 'idx-equity' ||
    ['BBCA', 'BBRI', 'BMRI', 'TLKM', 'ASII', 'AADI'].includes(asset.id);
  const isUsEquity =
    asset.category === 'us-equity' ||
    ['SPY', 'QQQ', 'NVDA', 'AAPL', 'MSFT'].includes(asset.id);
  const isGold = asset.category === 'gold' || ['GLD', 'ANTM'].includes(asset.id);
  const isDefensive =
    asset.category === 'money-market' ||
    asset.category === 'bonds' ||
    asset.id === 'RDPU' ||
    asset.id === 'RDPT';

  const benchmark = CURATED_VALUATION_BENCHMARKS[asset.id] ?? {};

  // 1. CRYPTO: ATH Drawdown (50%) + Fear & Greed Index (50%)
  if (isCrypto) {
    const fngScore =
      override?.fearGreedScore ??
      tacticalConfig?.cryptoScore ??
      50;
    // Fear & Greed discount: when FnG is 20 (Fear), discount score is 80 (100 - 20)
    const fngDiscountScore = Math.max(0, Math.min(100, 100 - fngScore));

    // Calculate ATH drawdown
    let athDd = override?.drawdownAth ?? benchmark.benchmarkDrawdownAth ?? 20.0;
    if (override?.drawdownAth === undefined && benchmark.athPriceUsd && currentPriceNative) {
      let targetPriceNative = currentPriceNative;
      if (asset.currency === 'IDR') {
        const rate = usdIdrRate > 0 ? usdIdrRate : 16000;
        targetPriceNative = currentPriceNative / rate;
      }
      athDd = Math.max(
        0,
        Number((((benchmark.athPriceUsd - targetPriceNative) / benchmark.athPriceUsd) * 100).toFixed(1))
      );
    }
    // 0% DD = score 0, 70%+ DD = score 100
    const athDdScore = Math.max(0, Math.min(100, Math.round((athDd / 70.0) * 100)));

    const compositeScore = Math.round(0.5 * athDdScore + 0.5 * fngDiscountScore);

    return {
      category: 'crypto',
      score: compositeScore,
      metrics: [
        {
          name: 'Drawdown dari ATH',
          label: 'Koreksi Puncak Tertinggi (ATH)',
          value: `-${athDd.toFixed(1)}%`,
          weightPercent: 50,
          score: athDdScore,
          formulaSnippet: `Math.min(100, (${athDd.toFixed(1)}% / 70%) × 100) = ${athDdScore}`,
          description:
            'Mengukur seberapa dalam diskon harga saat ini dari level rekor tertinggi historis (ATH).',
        },
        {
          name: 'Fear & Greed Index',
          label: 'Sentimen Pasar Kripto',
          value: `${fngScore}/100 (${getSentimentZone(fngScore)})`,
          weightPercent: 50,
          score: fngDiscountScore,
          formulaSnippet: `100 - Sentimen(${fngScore}) = ${fngDiscountScore}`,
          description:
            'Indeks ketakutan pasar (Alternative.me). Skor rendah (Fear) menandakan valuasi diskon ekstrem.',
        },
      ],
      summary: `Valuasi Kripto: Diskon ATH ${athDd.toFixed(1)}% (Skor ${athDdScore}) & Sentimen ${fngScore}/100 (Skor Diskon ${fngDiscountScore}).`,
    };
  }

  // 2. IDX EQUITY: P/E vs 5Y Average (60%) + 52-Week Drawdown (40%)
  if (isIdxEquity) {
    let currentPe = override?.peRatio;
    let pe5y = override?.pe5yAvg;

    if (currentPe === undefined) {
      if (benchmark.currentPeEst !== undefined) {
        currentPe = benchmark.currentPeEst;
        // If tacticalConfig.idxEquityScore is configured and not default neutral (50),
        // modulate the benchmark estimated P/E so user's market macro sentiment drives the score
        if (tacticalConfig?.idxEquityScore !== undefined && tacticalConfig.idxEquityScore !== 50) {
          const factor = 0.7 + (tacticalConfig.idxEquityScore / 100) * 0.6;
          const basePe = benchmark.pe5yAvg ?? currentPe;
          currentPe = Number((basePe * factor).toFixed(1));
        }
      } else if (tacticalConfig?.idxEquityScore !== undefined) {
        // Custom IDX stock fallback: map sentiment (0 = 10x discount, 50 = 15x fair, 100 = 20x overbought)
        currentPe = Number((10.0 + (tacticalConfig.idxEquityScore / 100) * 10.0).toFixed(1));
      } else {
        currentPe = 14.0;
      }
    }

    if (pe5y === undefined) {
      pe5y = benchmark.pe5yAvg ?? 16.0;
    }

    // Diskon P/E %: (pe5y - currentPe) / pe5y * 100
    const peDiscountPct = Number((((pe5y - currentPe) / pe5y) * 100).toFixed(1));
    // Score: 50 baseline when equal, +1.5 pt per 1% discount
    const peScore = Math.max(0, Math.min(100, Math.round(50 + peDiscountPct * 1.5)));

    // 52W Drawdown: 0% DD = 0 score, 25%+ DD = 100 score
    const dd52w =
      override?.drawdown52w ?? benchmark.benchmarkDrawdown52w ?? 10.0;
    const dd52wScore = Math.max(0, Math.min(100, Math.round((dd52w / 25.0) * 100)));

    const compositeScore = Math.round(0.6 * peScore + 0.4 * dd52wScore);

    return {
      category: 'idx-equity',
      score: compositeScore,
      metrics: [
        {
          name: 'P/E vs Rata-rata 5 Tahun',
          label: 'Price to Earnings Multiplier',
          value: `${currentPe.toFixed(1)}x (vs 5Y Avg ${pe5y.toFixed(1)}x)`,
          weightPercent: 60,
          score: peScore,
          formulaSnippet: `50 + (${peDiscountPct > 0 ? '+' : ''}${peDiscountPct}% × 1.5) = ${peScore}`,
          description:
            'Perbandingan valuasi laba saham saat ini terhadap rata-rata historis 5 tahunnya.',
        },
        {
          name: 'Drawdown 52-Minggu',
          label: 'Koreksi dari Puncak 1 Tahun',
          value: `-${dd52w.toFixed(1)}%`,
          weightPercent: 40,
          score: dd52wScore,
          formulaSnippet: `Math.min(100, (${dd52w.toFixed(1)}% / 25%) × 100) = ${dd52wScore}`,
          description:
            'Penurunan harga dari level tertinggi 52 minggu (1 tahun terakhir). Koreksi >20% merupakan area serok.',
        },
      ],
      summary: `Valuasi Saham IDX: P/E ${currentPe.toFixed(1)}x vs 5Y ${pe5y.toFixed(1)}x (Diskon ${peDiscountPct}%, Skor ${peScore}) + DD 52W -${dd52w.toFixed(1)}% (Skor ${dd52wScore}).`,
    };
  }

  // 3. US EQUITY: Forward P/E vs 5Y Avg (60%) + 52-Week Drawdown (40%)
  if (isUsEquity) {
    let fwdPe = override?.forwardPe;
    let fwdPe5y = override?.forwardPe5yAvg;

    if (fwdPe === undefined) {
      if (benchmark.currentForwardPeEst !== undefined) {
        fwdPe = benchmark.currentForwardPeEst;
        if (tacticalConfig?.usEquityScore !== undefined && tacticalConfig.usEquityScore !== 50) {
          const factor = 0.7 + (tacticalConfig.usEquityScore / 100) * 0.6;
          const basePe = benchmark.forwardPe5yAvg ?? fwdPe;
          fwdPe = Number((basePe * factor).toFixed(1));
        }
      } else if (tacticalConfig?.usEquityScore !== undefined) {
        fwdPe = Number((15.0 + (tacticalConfig.usEquityScore / 100) * 12.0).toFixed(1));
      } else {
        fwdPe = 21.0;
      }
    }

    if (fwdPe5y === undefined) {
      fwdPe5y = benchmark.forwardPe5yAvg ?? 20.0;
    }

    const peDiscountPct = Number((((fwdPe5y - fwdPe) / fwdPe5y) * 100).toFixed(1));
    const peScore = Math.max(0, Math.min(100, Math.round(50 + peDiscountPct * 1.5)));

    const dd52w =
      override?.drawdown52w ?? benchmark.benchmarkDrawdown52w ?? 6.0;
    // US large-cap 20% DD is bear market territory = score 100
    const dd52wScore = Math.max(0, Math.min(100, Math.round((dd52w / 20.0) * 100)));

    const compositeScore = Math.round(0.6 * peScore + 0.4 * dd52wScore);

    return {
      category: 'us-equity',
      score: compositeScore,
      metrics: [
        {
          name: 'Forward P/E vs Rata-rata 5 Tahun',
          label: 'Forward Price to Earnings (12M Forward)',
          value: `${fwdPe.toFixed(1)}x (vs 5Y Avg ${fwdPe5y.toFixed(1)}x)`,
          weightPercent: 60,
          score: peScore,
          formulaSnippet: `50 + (${peDiscountPct > 0 ? '+' : ''}${peDiscountPct}% × 1.5) = ${peScore}`,
          description:
            'Valuasi pasar saham AS berdasarkan estimasi laba konsensus analis 12 bulan ke depan.',
        },
        {
          name: 'Drawdown 52-Minggu',
          label: 'Koreksi dari Puncak 1 Tahun',
          value: `-${dd52w.toFixed(1)}%`,
          weightPercent: 40,
          score: dd52wScore,
          formulaSnippet: `Math.min(100, (${dd52w.toFixed(1)}% / 20%) × 100) = ${dd52wScore}`,
          description:
            'Penurunan dari puncak 52 minggu. Diskon pada indeks S&P 500 / Nasdaq memberi sinyal akumulasi berkala.',
        },
      ],
      summary: `Valuasi Saham AS: Forward P/E ${fwdPe.toFixed(1)}x (Skor ${peScore}) + DD 52W -${dd52w.toFixed(1)}% (Skor ${dd52wScore}).`,
    };
  }

  // 4. GOLD: Real Yield Macro (50%) + ATH Drawdown (50%)
  if (isGold) {
    const realYield =
      override?.realYield ?? benchmark.benchmarkRealYield ?? 1.95;
    // Higher real yields (>2.5%) create headwinds/discount (score ~35), lower (<1.0%) creates premium (score ~65)
    // Formula: baseline 50 at 2.0% real yield, +15 score per 1% drop in real yield
    const realYieldScore = Math.max(
      0,
      Math.min(100, Math.round(50 + (2.0 - realYield) * 15))
    );

    const athDd =
      override?.drawdownAth ?? benchmark.benchmarkDrawdownAth ?? 3.5;
    // Gold 15% DD from ATH is a major dip = score 100
    const athDdScore = Math.max(0, Math.min(100, Math.round((athDd / 15.0) * 100)));

    const compositeScore = Math.round(0.5 * realYieldScore + 0.5 * athDdScore);

    return {
      category: 'gold',
      score: compositeScore,
      metrics: [
        {
          name: 'US 10Y Real Yield',
          label: 'Yield Riil Obligasi AS (Inflasi Tersirat)',
          value: `${realYield.toFixed(2)}%`,
          weightPercent: 50,
          score: realYieldScore,
          formulaSnippet: `50 + (2.0% - ${realYield.toFixed(2)}%) × 15 = ${realYieldScore}`,
          description:
            'Opportunity cost memegang emas non-bunga. Suku bunga riil rendah menopang harga emas.',
        },
        {
          name: 'Drawdown dari Rekor ATH',
          label: 'Koreksi Harga Emas Dunia',
          value: `-${athDd.toFixed(1)}%`,
          weightPercent: 50,
          score: athDdScore,
          formulaSnippet: `Math.min(100, (${athDd.toFixed(1)}% / 15%) × 100) = ${athDdScore}`,
          description:
            'Diskon harga emas dari titik tertinggi sepanjang sejarah.',
        },
      ],
      summary: `Valuasi Emas: Real Yield ${realYield.toFixed(2)}% (Skor ${realYieldScore}) + Diskon ATH -${athDd.toFixed(1)}% (Skor ${athDdScore}).`,
    };
  }

  // 5. DEFENSIVE (Money Market / Bonds / RDPU / RDPT): Baseline 50 (Fair / Neutral)
  if (isDefensive) {
    return {
      category: asset.category,
      score: 50,
      metrics: [
        {
          name: 'Jangkar Defensif Portofolio',
          label: 'Stabilitas & Kas Siaga (War Chest)',
          value: 'Netral (50/100)',
          weightPercent: 100,
          score: 50,
          formulaSnippet: 'Baseline Skor Netral = 50',
          description:
            'Aset pendapatan tetap & pasar uang berfungsi sebagai jangkar risiko dan wadah kas siaga (War Chest), memiliki valuasi stabil.',
        },
      ],
      summary: 'Valuasi Jangkar Defensif: Skor netral 50/100 (Instrumen stabil bebas siklus valuasi ekstrem).',
    };
  }

  // Fallback for custom asset: check if user configured tactical scores or overrides
  let customScore = 50;
  let customSnippet = 'Default Netral = 50';
  if (override?.fearGreedScore !== undefined) {
    customScore = Math.max(0, Math.min(100, 100 - override.fearGreedScore));
    customSnippet = `100 - Sentimen(${override.fearGreedScore}) = ${customScore}`;
  } else if (tacticalConfig?.cryptoScore !== undefined && asset.category === 'crypto') {
    customScore = Math.max(0, Math.min(100, 100 - tacticalConfig.cryptoScore));
    customSnippet = `100 - Sentimen Kripto(${tacticalConfig.cryptoScore}) = ${customScore}`;
  } else if (tacticalConfig?.idxEquityScore !== undefined && asset.category === 'idx-equity') {
    customScore = Math.max(0, Math.min(100, 100 - tacticalConfig.idxEquityScore));
    customSnippet = `100 - Sentimen IHSG(${tacticalConfig.idxEquityScore}) = ${customScore}`;
  } else if (tacticalConfig?.usEquityScore !== undefined && asset.category === 'us-equity') {
    customScore = Math.max(0, Math.min(100, 100 - tacticalConfig.usEquityScore));
    customSnippet = `100 - Sentimen Saham AS(${tacticalConfig.usEquityScore}) = ${customScore}`;
  }

  return {
    category: asset.category,
    score: customScore,
    metrics: [
      {
        name: 'Valuasi Kustom',
        label: 'Estimasi Nilai Wajar',
        value: `${customScore}/100`,
        weightPercent: 100,
        score: customScore,
        formulaSnippet: customSnippet,
        description: 'Aset kustom dievaluasi berdasarkan metrik sentimen yang aktif atau netral standar.',
      },
    ],
    summary: `Valuasi Kustom: Skor ${customScore}/100.`,
  };
}

/**
 * Pillar 2: Portfolio Deficit & Drift Gap Score Calculation (0 - 100)
 * Higher score = more underweight (higher deficit, urgent need to accumulate)
 * Lower score = overweight (surplus, should slow down or hold)
 */
export function calculateDriftScore(
  targetWeightPercent: number,
  currentWeightPercent: number
): DriftMetricBreakdown {
  if (targetWeightPercent <= 0) {
    return {
      targetWeightPercent: 0,
      currentWeightPercent,
      driftPercent: currentWeightPercent,
      relativeDeficitPercent: -100,
      score: 0,
      summary: 'Aset ini memiliki bobot target 0%, sehingga skor akumulasi adalah 0.',
    };
  }

  // Relative Deficit: (Target - Current) / Target
  // If current is 0: deficit is 1.0 (100% underweight) -> score 100
  // If current is target: deficit is 0.0 -> score 50
  // If current is 2x target: deficit is -1.0 (100% overweight) -> score 0
  const driftPercent = Number((currentWeightPercent - targetWeightPercent).toFixed(2));
  const relativeDeficit = (targetWeightPercent - currentWeightPercent) / targetWeightPercent;
  const relativeDeficitPercent = Number((relativeDeficit * 100).toFixed(1));

  // Map to 0 - 100 score
  const score = Math.max(0, Math.min(100, Math.round(50 + relativeDeficit * 50)));

  let summary = '';
  if (relativeDeficitPercent >= 50) {
    summary = `Sangat Underweight: Defisit ${relativeDeficitPercent}% dari target bobot (${currentWeightPercent.toFixed(1)}% vs target ${targetWeightPercent.toFixed(1)}%). Skor defisit tinggi ${score}/100.`;
  } else if (relativeDeficitPercent > 0) {
    summary = `Sedikit Underweight: Defisit ${relativeDeficitPercent}% dari target (${currentWeightPercent.toFixed(1)}% vs target ${targetWeightPercent.toFixed(1)}%). Skor defisit ${score}/100.`;
  } else if (relativeDeficitPercent === 0) {
    summary = `Sesuai Target: Bobot persis seimbang ${targetWeightPercent.toFixed(1)}%. Skor netral 50/100.`;
  } else {
    summary = `Overweight: Melebihi target sebesar +${Math.abs(relativeDeficitPercent)}% (${currentWeightPercent.toFixed(1)}% vs target ${targetWeightPercent.toFixed(1)}%). Skor defisit rendah ${score}/100.`;
  }

  return {
    targetWeightPercent,
    currentWeightPercent,
    driftPercent,
    relativeDeficitPercent,
    score,
    summary,
  };
}

/**
 * Generates an intuitive Indonesian narrative explaining WHY the recommendation was made
 */
function buildNarrativeWhy(
  asset: AssetDefinition,
  compositeScore: number,
  valuationBreakdown: ValuationMetricBreakdown,
  driftBreakdown: DriftMetricBreakdown,
  action: SmartDcaAction,
  actionLabel: string,
  multiplier: number
): string {
  const parts: string[] = [];

  parts.push(
    `Berdasarkan analisis 2-Pilar Smart DCA, **${asset.shortName} (${asset.name})** memperoleh **Skor Komposit ${compositeScore}/100**, menghasilkan rekomendasi **${actionLabel} (${multiplier}x)**.`
  );

  // Valuation rationale
  if (valuationBreakdown.score >= 70) {
    parts.push(
      `Di sisi pasar, aset sedang mengalami diskon yang sangat menarik (Skor Valuasi ${valuationBreakdown.score}/100): ${valuationBreakdown.summary}`
    );
  } else if (valuationBreakdown.score <= 35) {
    parts.push(
      `Di sisi pasar, harga aset saat ini relatif tinggi / overbought (Skor Valuasi ${valuationBreakdown.score}/100): ${valuationBreakdown.summary}`
    );
  } else {
    parts.push(
      `Kondisi pasar saat ini berada di rentang wajar (Skor Valuasi ${valuationBreakdown.score}/100).`
    );
  }

  // Drift rationale
  if (driftBreakdown.relativeDeficitPercent >= 20) {
    parts.push(
      `Secara portofolio, posisinya masih tertinggal (${driftBreakdown.currentWeightPercent.toFixed(1)}% vs target ${driftBreakdown.targetWeightPercent.toFixed(1)}%), sehingga membutuhkan akumulasi lebih agresif untuk mengejar target.`
    );
  } else if (driftBreakdown.relativeDeficitPercent < -10) {
    parts.push(
      `Secara portofolio, porsi aset ini sudah melampaui target alokasi (${driftBreakdown.currentWeightPercent.toFixed(1)}% vs target ${driftBreakdown.targetWeightPercent.toFixed(1)}%), sehingga DCA bulan ini diringankan atau dialihkan ke instrumen kas siaga.`
    );
  } else {
    parts.push(
      `Porsi portofolio berada cukup dekat dengan target alokasi (${driftBreakdown.currentWeightPercent.toFixed(1)}% vs target ${driftBreakdown.targetWeightPercent.toFixed(1)}%).`
    );
  }

  return parts.join(' ');
}

/**
 * Generates a step-by-step arithmetic formula explanation
 */
function buildFormulaHow(
  valuationBreakdown: ValuationMetricBreakdown,
  driftBreakdown: DriftMetricBreakdown,
  compositeScore: number,
  actionLabel: string,
  multiplier: number,
  baseAllocationIdr: number,
  finalAllocationIdr: number,
  lotDetails?: {
    isIdxStock: boolean;
    recommendedLots?: number;
    pricePerLotIdr?: number;
    remainderLotIdr?: number;
  },
  overflowDetails?: {
    mode: SmartDcaOverflowMode;
    sharePercent?: number;
    warChestAddIdr?: number;
  }
): string {
  const steps: string[] = [
    `1. Pilar 1 (Valuasi Pasar): Skor = ${valuationBreakdown.score}/100`,
    `   ${valuationBreakdown.metrics.map((m) => `• ${m.name}: ${m.formulaSnippet} (Bobot ${m.weightPercent}%)`).join('\n   ')}`,
    `2. Pilar 2 (Defisit Portofolio): Skor = ${driftBreakdown.score}/100`,
    `   • Rumus: 50 + ((${driftBreakdown.targetWeightPercent.toFixed(1)}% - ${driftBreakdown.currentWeightPercent.toFixed(1)}%) / ${driftBreakdown.targetWeightPercent.toFixed(1)}%) × 50 = ${driftBreakdown.score}`,
    `3. Skor Komposit:`,
    `   • (50% × ${valuationBreakdown.score}) + (50% × ${driftBreakdown.score}) = ${compositeScore}/100`,
    `4. Rekomendasi & Multiplier:`,
    `   • Skor ${compositeScore} ➔ ${actionLabel} (Multiplier: ${multiplier}x)`,
    `5. Alokasi Dana:`,
    `   • Base Alokasi Target: Rp ${baseAllocationIdr.toLocaleString('id-ID')}`,
  ];

  if (overflowDetails?.mode === 'boost-discount' && overflowDetails.sharePercent !== undefined) {
    steps.push(`   • Mode Sisa Dana: Perbesar Aset Diskon (Porsi ${overflowDetails.sharePercent.toFixed(1)}%)`);
  }

  if (lotDetails?.isIdxStock && lotDetails.recommendedLots !== undefined && lotDetails.pricePerLotIdr) {
    steps.push(
      `   • Pembulatan Lot BEI (100 lbr): ${lotDetails.recommendedLots} Lot × Rp ${lotDetails.pricePerLotIdr.toLocaleString('id-ID')} = Rp ${finalAllocationIdr.toLocaleString('id-ID')}`
    );
    if (lotDetails.remainderLotIdr && lotDetails.remainderLotIdr > 0) {
      steps.push(
        `   • Sisa Kas Pecahan Lot: Rp ${lotDetails.remainderLotIdr.toLocaleString('id-ID')} (dialihkan ke kas siaga)`
      );
    }
  }

  if (overflowDetails?.warChestAddIdr && overflowDetails.warChestAddIdr > 0) {
    steps.push(
      `   • Tambahan Parkir Kas (War Chest): +Rp ${overflowDetails.warChestAddIdr.toLocaleString('id-ID')}`
    );
  }

  steps.push(`   • Alokasi Smart DCA Final: Rp ${finalAllocationIdr.toLocaleString('id-ID')}`);

  return steps.join('\n');
}

/**
 * Main Smart DCA Planning Engine
 */
export function calculateSmartDcaPlan(params: SmartDcaInputParams): SmartDcaResult {
  const {
    assets,
    targetWeights,
    holdings,
    monthlyBudgetIdr,
    inputMode = 'nominal',
    usdIdrRate,
    overflowMode = 'park-rdpu',
    enableIdxLotRounding = true,
    filterDustTrades = true,
    dustTradeThresholdIdr = 25_000,
    tacticalConfig,
    marketDataOverrides,
  } = params;

  // 1. Identify defensive cash / War Chest asset (e.g. RDPU or RDPT)
  const warChestAsset =
    assets.find((a) => a.id === 'RDPU') ||
    assets.find((a) => a.category === 'money-market') ||
    assets.find((a) => a.id === 'RDPT') ||
    assets.find((a) => a.category === 'bonds');
  const warChestAssetId = warChestAsset?.id;

  // 2. Compute current total portfolio value in IDR
  let currentTotalHoldingsIdr = 0;
  const holdingValuesByIdr: Record<string, number> = {};

  for (const asset of assets) {
    const h = holdings[asset.id];
    let valIdr = 0;
    if (h) {
      if (inputMode === 'nominal') {
        valIdr = Math.max(0, h.currentValueIdr ?? 0);
      } else {
        const pNative = h.currentPrice > 0 ? h.currentPrice : asset.defaultPrice;
        const pIdr = asset.currency === 'USD' ? pNative * usdIdrRate : pNative;
        valIdr = Math.max(0, (h.units ?? 0) * pIdr);
      }
    }
    holdingValuesByIdr[asset.id] = valIdr;
    currentTotalHoldingsIdr += valIdr;
  }

  // 3. Compute relative target weights for assets with target > 0
  const activeAssets = assets.filter((a) => (targetWeights[a.id] ?? 0) > 0);
  const totalTargetWeight = activeAssets.reduce(
    (sum, a) => sum + (targetWeights[a.id] ?? 0),
    0
  );

  // 4. Initial pass: Calculate 2-pillar scores and raw multipliers per asset
  interface IntermediateAssetPlan {
    asset: AssetDefinition;
    targetWeight: number;
    currentWeight: number;
    currentValIdr: number;
    unitPriceIdr: number;
    valuationBreakdown: ValuationMetricBreakdown;
    driftBreakdown: DriftMetricBreakdown;
    compositeScore: number;
    tier: ReturnType<typeof getActionTier>;
    baseAllocIdr: number;
    rawAllocIdr: number;
  }

  const intermediatePlans: IntermediateAssetPlan[] = [];

  for (const asset of activeAssets) {
    const targetW = targetWeights[asset.id] ?? 0;
    const currentValIdr = holdingValuesByIdr[asset.id] ?? 0;
    const currentW =
      currentTotalHoldingsIdr > 0
        ? (currentValIdr / currentTotalHoldingsIdr) * 100
        : 0;

    const h = holdings[asset.id];
    const unitPriceNative =
      h && h.currentPrice > 0 ? h.currentPrice : asset.defaultPrice;
    const unitPriceIdr =
      asset.currency === 'USD' ? unitPriceNative * usdIdrRate : unitPriceNative;

    const override = marketDataOverrides?.[asset.id];

    // Pillar 1: Valuation Score
    const valuationBreakdown = calculateValuationScore(
      asset,
      tacticalConfig,
      override,
      unitPriceNative,
      usdIdrRate
    );

    // Pillar 2: Drift Score
    const driftBreakdown = calculateDriftScore(targetW, currentW);

    // Composite 50% / 50% Score
    const compositeScore = Math.max(
      0,
      Math.min(
        100,
        Math.round(0.5 * valuationBreakdown.score + 0.5 * driftBreakdown.score)
      )
    );

    const tier = getActionTier(compositeScore);

    // Base allocation without multiplier
    const normTargetW = totalTargetWeight > 0 ? targetW / totalTargetWeight : 0;
    const baseAllocIdr = Math.round(monthlyBudgetIdr * normTargetW);
    const rawAllocIdr = Math.round(baseAllocIdr * tier.multiplier);

    intermediatePlans.push({
      asset,
      targetWeight: targetW,
      currentWeight: currentW,
      currentValIdr,
      unitPriceIdr,
      valuationBreakdown,
      driftBreakdown,
      compositeScore,
      tier,
      baseAllocIdr,
      rawAllocIdr,
    });
  }

  // 5. Handle budget distribution according to overflowMode
  const finalAllocationsIdr: Record<string, number> = {};
  const totalRawBuys = intermediatePlans.reduce(
    (sum, p) => sum + p.rawAllocIdr,
    0
  );
  let warChestParkedIdr = 0;

  if (overflowMode === 'boost-discount') {
    // Mode B: Boost discounted assets with all unallocated budget
    // Active buy assets are those with multiplier > 0
    const buyingPlans = intermediatePlans.filter((p) => p.tier.multiplier > 0);
    const totalMultiplierWeightedBase = buyingPlans.reduce(
      (sum, p) => sum + p.rawAllocIdr,
      0
    );

    if (totalMultiplierWeightedBase > 0) {
      let sumAlloc = 0;
      for (const p of intermediatePlans) {
        if (p.tier.multiplier > 0) {
          const share = p.rawAllocIdr / totalMultiplierWeightedBase;
          const alloc = Math.round(monthlyBudgetIdr * share);
          finalAllocationsIdr[p.asset.id] = alloc;
          sumAlloc += alloc;
        } else {
          finalAllocationsIdr[p.asset.id] = 0;
        }
      }
      // Preserve budget conservation against integer rounding diff
      const roundingDiff = monthlyBudgetIdr - sumAlloc;
      if (roundingDiff !== 0 && buyingPlans.length > 0) {
        finalAllocationsIdr[buyingPlans[0].asset.id] = Math.max(
          0,
          (finalAllocationsIdr[buyingPlans[0].asset.id] ?? 0) + roundingDiff
        );
      }
    } else {
      // If all assets are HOLD_SKIP, entire budget goes to War Chest
      warChestParkedIdr = monthlyBudgetIdr;
      for (const p of intermediatePlans) {
        finalAllocationsIdr[p.asset.id] = 0;
      }
    }
  } else {
    // Mode A (Default): 'park-rdpu' (War Chest Accumulation)
    if (totalRawBuys <= monthlyBudgetIdr) {
      // Unallocated funds are parked in RDPU / War Chest
      for (const p of intermediatePlans) {
        finalAllocationsIdr[p.asset.id] = p.rawAllocIdr;
      }
      warChestParkedIdr = Math.max(0, monthlyBudgetIdr - totalRawBuys);
    } else {
      // If multipliers caused total > monthlyBudgetIdr, scale back so budget is conserved
      const scale = monthlyBudgetIdr / totalRawBuys;
      let sumScaled = 0;
      for (const p of intermediatePlans) {
        const scaled = Math.round(p.rawAllocIdr * scale);
        finalAllocationsIdr[p.asset.id] = scaled;
        sumScaled += scaled;
      }
      // Conservation check
      const diff = monthlyBudgetIdr - sumScaled;
      if (diff !== 0 && intermediatePlans.length > 0) {
        finalAllocationsIdr[intermediatePlans[0].asset.id] = Math.max(
          0,
          (finalAllocationsIdr[intermediatePlans[0].asset.id] ?? 0) + diff
        );
      }
      warChestParkedIdr = 0;
    }
  }

  // 6. Apply Lot Rounding (BEI 100 shares), Anti-Dust Trade Filter, and Units Calculation
  const finalItems: SmartDcaItemResult[] = [];
  let unallocatedCashRemainderIdr = 0;
  let totalAllocatedAssetsIdr = 0;

  for (const p of intermediatePlans) {
    let allocatedIdr = finalAllocationsIdr[p.asset.id] ?? 0;

    // Check anti-dust threshold
    let isDustFiltered = false;
    if (filterDustTrades && allocatedIdr > 0 && allocatedIdr < dustTradeThresholdIdr) {
      unallocatedCashRemainderIdr += allocatedIdr;
      allocatedIdr = 0;
      isDustFiltered = true;
    }

    let recommendedLotsInteger: number | undefined;
    let remainderLotIdr: number | undefined;
    let recommendedUnits = 0;

    const isIdxStock =
      p.asset.lotSize === 100 &&
      p.asset.category === 'idx-equity' &&
      !p.asset.isNominalOnly;

    const pricePerLot = p.unitPriceIdr * 100;

    if (enableIdxLotRounding && isIdxStock) {
      if (pricePerLot > 0) {
        const wholeLots = Math.floor(allocatedIdr / pricePerLot);
        recommendedLotsInteger = wholeLots;
        const roundedAllocIdr = wholeLots * pricePerLot;
        remainderLotIdr = Math.max(0, allocatedIdr - roundedAllocIdr);
        allocatedIdr = roundedAllocIdr;
        recommendedUnits = wholeLots * 100;
        unallocatedCashRemainderIdr += remainderLotIdr;
      }
    } else {
      if (p.asset.isNominalOnly) {
        recommendedUnits = allocatedIdr;
      } else {
        recommendedUnits =
          p.unitPriceIdr > 0
            ? Number(
                (allocatedIdr / p.unitPriceIdr).toFixed(
                  p.asset.category === 'crypto' ? 8 : 4
                )
              )
            : 0;
      }
    }

    totalAllocatedAssetsIdr += allocatedIdr;

    // Build transparency explanation
    const narrativeWhy = buildNarrativeWhy(
      p.asset,
      p.compositeScore,
      p.valuationBreakdown,
      p.driftBreakdown,
      p.tier.action,
      p.tier.actionLabel,
      p.tier.multiplier
    );

    const sharePercent =
      monthlyBudgetIdr > 0 ? (allocatedIdr / monthlyBudgetIdr) * 100 : undefined;

    const formulaHow = buildFormulaHow(
      p.valuationBreakdown,
      p.driftBreakdown,
      p.compositeScore,
      p.tier.actionLabel,
      p.tier.multiplier,
      p.baseAllocIdr,
      allocatedIdr,
      isIdxStock && enableIdxLotRounding
        ? {
            isIdxStock: true,
            recommendedLots: recommendedLotsInteger,
            pricePerLotIdr: pricePerLot,
            remainderLotIdr,
          }
        : undefined,
      {
        mode: overflowMode,
        sharePercent,
      }
    );

    const explanation: SmartDcaExplanation = {
      compositeScore: p.compositeScore,
      valuationScore: p.valuationBreakdown.score,
      driftScore: p.driftBreakdown.score,
      action: p.tier.action,
      actionLabel: p.tier.actionLabel,
      multiplier: p.tier.multiplier,
      valuationBreakdown: p.valuationBreakdown,
      driftBreakdown: p.driftBreakdown,
      narrativeWhy,
      formulaHow,
      budgetMath: {
        baseAllocationIdr: p.baseAllocIdr,
        multiplier: p.tier.multiplier,
        rawAllocationIdr: p.rawAllocIdr,
        finalAllocationIdr: allocatedIdr,
        warChestShareIdr: p.tier.multiplier < 1.0 ? Math.max(0, p.baseAllocIdr - allocatedIdr) : 0,
      },
    };

    finalItems.push({
      assetId: p.asset.id,
      symbol: p.asset.symbol,
      name: p.asset.name,
      category: p.asset.category,
      color: p.asset.color,
      targetWeightPercent: p.targetWeight,
      currentWeightPercent: p.currentWeight,
      currentValueIdr: p.currentValIdr,
      unitPriceIdr: p.unitPriceIdr,
      action: p.tier.action,
      actionLabel: p.tier.actionLabel,
      multiplier: p.tier.multiplier,
      baseAllocationIdr: p.baseAllocIdr,
      recommendedAmountIdr: allocatedIdr,
      recommendedUnits,
      recommendedLotsInteger,
      remainderLotIdr,
      isNominalOnly: p.asset.isNominalOnly,
      isDustFiltered,
      explanation,
    });
  }

  // 6.5 Handle War Chest Parking when overflowMode === 'park-rdpu' and warChestParkedIdr > 0
  if (overflowMode === 'park-rdpu' && warChestParkedIdr > 0) {
    if (warChestAssetId && warChestAsset) {
      const existingWarChestItem = finalItems.find((i) => i.assetId === warChestAssetId);
      if (existingWarChestItem) {
        // Case 1: War Chest asset already in finalItems (targetWeight > 0)
        const oldRecommendedIdr = existingWarChestItem.recommendedAmountIdr;
        const newRecommendedIdr = oldRecommendedIdr + warChestParkedIdr;

        if (filterDustTrades && newRecommendedIdr < dustTradeThresholdIdr) {
          unallocatedCashRemainderIdr += warChestParkedIdr;
          existingWarChestItem.recommendedAmountIdr = 0;
          existingWarChestItem.recommendedUnits = 0;
          existingWarChestItem.isDustFiltered = true;
          existingWarChestItem.action = 'HOLD_SKIP';
        } else {
          existingWarChestItem.recommendedAmountIdr = newRecommendedIdr;
          existingWarChestItem.isDustFiltered = false;

          if (existingWarChestItem.isNominalOnly) {
            existingWarChestItem.recommendedUnits = newRecommendedIdr;
          } else if (existingWarChestItem.unitPriceIdr > 0) {
            existingWarChestItem.recommendedUnits = Number(
              (newRecommendedIdr / existingWarChestItem.unitPriceIdr).toFixed(4)
            );
          }

          totalAllocatedAssetsIdr += warChestParkedIdr;

          // Synchronize explanation math
          existingWarChestItem.explanation.budgetMath.finalAllocationIdr = newRecommendedIdr;
          existingWarChestItem.explanation.budgetMath.warChestShareIdr = warChestParkedIdr;
          existingWarChestItem.explanation.narrativeWhy += ` Aset ini juga menerima tambahan alokasi kas siaga (War Chest) sebesar Rp ${warChestParkedIdr.toLocaleString('id-ID')} dari aset-aset yang di-Hold/Skip.`;
          existingWarChestItem.explanation.formulaHow += `\n   • Tambahan Parkir War Chest: +Rp ${warChestParkedIdr.toLocaleString('id-ID')}\n   • Total Alokasi Smart DCA Final: Rp ${newRecommendedIdr.toLocaleString('id-ID')}`;
        }
      } else {
        // Case 2: War Chest asset exists in portfolio universe but targetWeight was 0
        const h = holdings[warChestAsset.id];
        let currentValIdr = 0;
        if (h) {
          if (inputMode === 'nominal') {
            currentValIdr = Math.max(0, h.currentValueIdr ?? 0);
          } else {
            const pNative = h.currentPrice > 0 ? h.currentPrice : warChestAsset.defaultPrice;
            const pIdr = warChestAsset.currency === 'USD' ? pNative * usdIdrRate : pNative;
            currentValIdr = Math.max(0, (h.units ?? 0) * pIdr);
          }
        }
        const currentW =
          currentTotalHoldingsIdr > 0
            ? (currentValIdr / currentTotalHoldingsIdr) * 100
            : 0;
        const unitPriceNative =
          h && h.currentPrice > 0 ? h.currentPrice : warChestAsset.defaultPrice;
        const unitPriceIdr =
          warChestAsset.currency === 'USD'
            ? unitPriceNative * usdIdrRate
            : unitPriceNative;
        const isNominal =
          warChestAsset.isNominalOnly ??
          (warChestAsset.category === 'money-market' ||
            warChestAsset.category === 'bonds');
        const recommendedUnits = isNominal
          ? warChestParkedIdr
          : unitPriceIdr > 0
            ? Number((warChestParkedIdr / unitPriceIdr).toFixed(4))
            : 0;

        if (filterDustTrades && warChestParkedIdr < dustTradeThresholdIdr) {
          unallocatedCashRemainderIdr += warChestParkedIdr;
          warChestParkedIdr = 0;
        } else {
          const warChestItem: SmartDcaItemResult = {
            assetId: warChestAsset.id,
            symbol: warChestAsset.symbol,
            name: warChestAsset.name,
            category: warChestAsset.category,
            color: warChestAsset.color,
            targetWeightPercent: 0,
            currentWeightPercent: currentW,
            currentValueIdr: currentValIdr,
            unitPriceIdr,
            action: 'NORMAL_BUY',
            actionLabel: 'Parkir War Chest',
            multiplier: 1.0,
            baseAllocationIdr: 0,
            recommendedAmountIdr: warChestParkedIdr,
            recommendedUnits,
            isNominalOnly: isNominal,
            explanation: {
              compositeScore: 50,
              valuationScore: 50,
              driftScore: 50,
              action: 'NORMAL_BUY',
              actionLabel: 'Parkir War Chest',
              multiplier: 1.0,
              valuationBreakdown: calculateValuationScore(
                warChestAsset,
                tacticalConfig,
                undefined,
                unitPriceNative,
                usdIdrRate
              ),
              driftBreakdown: calculateDriftScore(0, currentW),
              narrativeWhy: `Aset ini menerima alokasi Rp ${warChestParkedIdr.toLocaleString('id-ID')} sebagai kas siaga (War Chest) dari sisa budget aset yang di-Hold/Skip untuk persiapan serok crash.`,
              formulaHow: `1. Pengalihan Sisa Dana Aset Hold/Skip: Rp ${warChestParkedIdr.toLocaleString('id-ID')}\n2. Alokasi ke Kas Siaga (${warChestAsset.symbol}): Rp ${warChestParkedIdr.toLocaleString('id-ID')}\n   • Total Alokasi Smart DCA Final: Rp ${warChestParkedIdr.toLocaleString('id-ID')}`,
              budgetMath: {
                baseAllocationIdr: 0,
                multiplier: 1.0,
                rawAllocationIdr: 0,
                finalAllocationIdr: warChestParkedIdr,
                warChestShareIdr: warChestParkedIdr,
              },
            },
          };
          finalItems.push(warChestItem);
          totalAllocatedAssetsIdr += warChestParkedIdr;
        }
      }
    } else {
      // Case 3: No defensive asset in universe at all, retain as unallocated cash
      unallocatedCashRemainderIdr += warChestParkedIdr;
      warChestParkedIdr = 0;
    }
  }

  // 7. Construct RebalanceSummaryResult for Broker Slip & 1-Click Execution compatibility
  const rebalanceItems: RebalanceItemResult[] = finalItems.map((item) => {
    const isBuy = item.recommendedAmountIdr >= 1000;
    const isSuppressedDust = Boolean(item.isDustFiltered);

    const sentimentScore = item.explanation.compositeScore;
    const zone: SentimentZone =
      sentimentScore >= 80
        ? 'extreme-fear'
        : sentimentScore >= 60
          ? 'fear'
          : sentimentScore >= 45
            ? 'neutral'
            : sentimentScore >= 30
              ? 'greed'
              : 'extreme-greed';

    return {
      assetId: item.assetId,
      symbol: item.symbol,
      name: item.name,
      color: item.color,
      targetWeightPercent: item.targetWeightPercent,
      initialValueIdr: item.currentValueIdr,
      postShockValueIdr: item.currentValueIdr,
      currentWeightPercent: item.currentWeightPercent,
      absoluteDriftPercent: Number(
        (item.currentWeightPercent - item.targetWeightPercent).toFixed(2)
      ),
      relativeDriftPercent: item.explanation.driftBreakdown.relativeDeficitPercent,
      isDriftBreached: Math.abs(item.currentWeightPercent - item.targetWeightPercent) > 3.0,
      targetValueIdr: item.currentValueIdr + item.recommendedAmountIdr,
      tradeAmountIdr: isBuy ? item.recommendedAmountIdr : 0,
      tradeAmountUsd:
        usdIdrRate > 0 ? (isBuy ? item.recommendedAmountIdr : 0) / usdIdrRate : 0,
      tradeUnits: isBuy ? item.recommendedUnits : 0,
      tradeLotsInteger: item.recommendedLotsInteger,
      tradeLots: item.recommendedLotsInteger,
      tradeLotsRemainderIdr: item.remainderLotIdr,
      isNominalOnly: item.isNominalOnly,
      action: isBuy ? 'BUY' : 'HOLD',
      isDustFiltered: isSuppressedDust,
      tacticalSignal: {
        sentimentZone: zone,
        sentimentScore,
        sentimentLabel: item.actionLabel,
        badgeLabel: `${item.actionLabel} (${item.multiplier}x)`,
        tiltMultiplierPercent: Number(((item.multiplier - 1.0) * 100).toFixed(1)),
        baseTargetWeightPercent: item.targetWeightPercent,
        tacticalTargetWeightPercent: item.targetWeightPercent,
        reason: item.explanation.narrativeWhy,
      },
    };
  });

  const asRebalanceSummary: RebalanceSummaryResult = {
    initialTotalIdr: currentTotalHoldingsIdr,
    postShockTotalIdr: currentTotalHoldingsIdr,
    cashInjectionIdr: monthlyBudgetIdr,
    finalTargetTotalIdr: currentTotalHoldingsIdr + monthlyBudgetIdr,
    totalBuyIdr: totalAllocatedAssetsIdr,
    totalSellIdr: 0,
    maxAbsoluteDrift: Math.max(
      0,
      ...finalItems.map((i) =>
        Math.abs(i.currentWeightPercent - i.targetWeightPercent)
      )
    ),
    breachedCount: finalItems.filter(
      (i) => Math.abs(i.currentWeightPercent - i.targetWeightPercent) > 3.0
    ).length,
    lotRoundingEnabled: enableIdxLotRounding,
    unallocatedCashRemainderIdr,
    totalEstimatedFeeIdr: 0,
    rebalanceMode: 'buy-only-dca',
    tacticalBandActive: true,
    items: rebalanceItems,
  };

  return {
    totalBudgetIdr: monthlyBudgetIdr,
    totalAllocatedAssetsIdr,
    warChestParkedIdr,
    unallocatedCashRemainderIdr,
    overflowMode,
    items: finalItems,
    warChestAssetId,
    asRebalanceSummary,
  };
}
