import {
  AssetDefinition,
  PortfolioPreset,
  SolvedPortfolio,
} from './types';
import {
  evaluatePortfolioMetrics,
  normalizeWeightsTo100,
  solveRiskBudgetingWeights,
} from './riskParitySolver';
import { simulateWealthToGoal } from './wealthSimulator';

export type InvestorProfileType =
  | 'proteksi-active-income'
  | 'balanced-quant'
  | 'aggressive-compounding'
  | 'passive-dividend';

export type CrashToleranceType = 'konservatif' | 'moderat' | 'agresif';

export type ConvictionPreferenceType =
  | 'auto-equal'
  | 'BTC'
  | 'ETH'
  | 'US_TECH'
  | 'IDX_EQUITY'
  | 'GOLD_SAFE';

export interface UserDiagnosticAnswers {
  /** Which investor archetype from minutes 00:59 - 03:56 */
  profile: InvestorProfileType;
  /** Maximum psychological drawdown tolerance during market crash */
  crashTolerance: CrashToleranceType;
  /** Which asset classes / specific instruments the user wants in their portfolio */
  selectedAssetIds: string[];
  /** Quick preset filter mode: 'all-default' | 'no-crypto' | 'high-dividend-idx' | 'custom-pick' */
  assetSelectionPreset:
    | 'all-default'
    | 'no-crypto'
    | 'high-dividend-idx'
    | 'custom-pick';
  /** Optional conviction tilt (Risk Budgeting) */
  convictionPreference: ConvictionPreferenceType;
  /** Whether to swap the default IDX bank slot (BBCA) with high-dividend coal/energy (PTBA or AADI) */
  idxEquitySlotChoice: 'BBCA' | 'PTBA' | 'AADI';
  /** Initial capital in IDR */
  initialCapitalIdr: number;
  /** Monthly DCA savings in IDR */
  monthlySavingsIdr: number;
  /** Target wealth goal in IDR */
  targetGoalIdr: number;
}

export interface PortfolioRecommendationItem {
  id: string;
  title: string;
  badgeLabel: string;
  isPrimaryTailored: boolean;
  method: 'risk-parity' | 'risk-budgeting' | 'custom';
  convictionAssetId?: string;
  convictionRiskPercent?: number;
  weights: Record<string, number>;
  metrics: SolvedPortfolio;
  netDividendYieldPercent: number;
  annualNetDividendAtInitialIdr: number;
  annualNetDividendAtGoalIdr: number;
  yearsToGoalFloat: number;
  rationalePoints: string[];
  matchingPresetId?: string;
}

export interface DiagnosticRecommendationResult {
  primaryRecommendation: PortfolioRecommendationItem;
  alternativeRecommendations: PortfolioRecommendationItem[];
  recommendedSlotMap: Record<string, string>;
}

/**
 * Computes net weighted dividend yield (%) for a given weight map.
 */
function computeNetDividendYield(
  weights: Record<string, number>,
  allAssets: AssetDefinition[]
): number {
  let netYield = 0;
  for (const asset of allAssets) {
    const w = (weights[asset.id] ?? 0) / 100;
    if (w <= 0) continue;
    const gross = asset.dividendYield ?? 0;
    const tax = asset.dividendTaxPercent ?? 0;
    netYield += w * gross * (1 - tax / 100);
  }
  return Number(netYield.toFixed(2));
}

/**
 * Generates tailored portfolio recommendations based on user's multiple-choice questionnaire answers.
 */
export function generatePortfolioRecommendations(
  answers: UserDiagnosticAnswers,
  allAssets: AssetDefinition[],
  presets: PortfolioPreset[]
): DiagnosticRecommendationResult {
  // 1. Determine recommended slot map (e.g., whether BBCA slot is swapped to PTBA or AADI)
  const recommendedSlotMap: Record<string, string> = {
    RDPU: 'RDPU',
    RDPT: 'RDPT',
    BBCA: answers.idxEquitySlotChoice,
    GLD: 'GLD',
    SPY: 'SPY',
    QQQ: 'QQQ',
    BTC: 'BTC',
    ETH: 'ETH',
  };

  // 2. Resolve active candidate assets from user's selection
  let activeIds = [...answers.selectedAssetIds];
  if (answers.assetSelectionPreset === 'all-default') {
    activeIds = [
      'RDPT',
      answers.idxEquitySlotChoice,
      'GLD',
      'SPY',
      'QQQ',
      'BTC',
      'ETH',
    ];
  } else if (answers.assetSelectionPreset === 'no-crypto') {
    activeIds = ['RDPU', 'RDPT', answers.idxEquitySlotChoice, 'GLD', 'SPY', 'QQQ'];
  } else if (answers.assetSelectionPreset === 'high-dividend-idx') {
    activeIds = ['RDPT', 'PTBA', 'AADI', 'BBRI', 'BBCA', 'GLD', 'SCHD'];
  } else {
    // Ensure if user picked custom assets, at least 1 asset is active
    if (activeIds.length === 0) {
      activeIds = ['RDPT', answers.idxEquitySlotChoice, 'GLD', 'SPY', 'QQQ'];
    }
  }

  // Deduplicate activeIds
  activeIds = Array.from(new Set(activeIds));
  const selectedAssets = allAssets.filter((a) => activeIds.includes(a.id));

  // 3. Determine Allocation Method & Conviction Risk % based on Profile + Crash Tolerance + Conviction Preference
  let method: 'risk-parity' | 'risk-budgeting' | 'custom' = 'risk-parity';
  let convictionAssetId: string | undefined;
  let convictionRiskPercent = 50;

  const hasCrypto = activeIds.includes('BTC') || activeIds.includes('ETH');

  if (answers.convictionPreference !== 'auto-equal') {
    method = 'risk-budgeting';
    if (answers.convictionPreference === 'BTC' && activeIds.includes('BTC')) {
      convictionAssetId = 'BTC';
    } else if (
      answers.convictionPreference === 'ETH' &&
      activeIds.includes('ETH')
    ) {
      convictionAssetId = 'ETH';
    } else if (answers.convictionPreference === 'US_TECH') {
      convictionAssetId = activeIds.includes('QQQ')
        ? 'QQQ'
        : activeIds.includes('SPY')
          ? 'SPY'
          : selectedAssets[0]?.id;
    } else if (answers.convictionPreference === 'IDX_EQUITY') {
      convictionAssetId = activeIds.includes(answers.idxEquitySlotChoice)
        ? answers.idxEquitySlotChoice
        : activeIds.find((id) =>
            ['PTBA', 'AADI', 'BBCA', 'BBRI', 'BMRI'].includes(id)
          ) ?? selectedAssets[0]?.id;
    } else if (answers.convictionPreference === 'GOLD_SAFE') {
      convictionAssetId = activeIds.includes('GLD')
        ? 'GLD'
        : activeIds.includes('RDPT')
          ? 'RDPT'
          : selectedAssets[0]?.id;
    }
  } else if (
    answers.profile === 'aggressive-compounding' &&
    hasCrypto &&
    answers.crashTolerance !== 'konservatif'
  ) {
    method = 'risk-budgeting';
    convictionAssetId = activeIds.includes('BTC') ? 'BTC' : 'ETH';
  } else if (
    answers.profile === 'balanced-quant' &&
    hasCrypto &&
    answers.crashTolerance === 'moderat'
  ) {
    method = 'risk-budgeting';
    convictionAssetId = activeIds.includes('BTC') ? 'BTC' : 'ETH';
  }

  // Calibrate conviction risk % based on crash tolerance & profile
  if (method === 'risk-budgeting' && convictionAssetId) {
    if (
      answers.crashTolerance === 'agresif' ||
      answers.profile === 'aggressive-compounding'
    ) {
      convictionRiskPercent = 90;
    } else if (answers.crashTolerance === 'moderat') {
      convictionRiskPercent = 70;
    } else {
      convictionRiskPercent = 50;
    }
  }

  // 4. Solve Primary Tailored Weights
  let primaryWeights = solveRiskBudgetingWeights(
    selectedAssets,
    method === 'risk-budgeting' ? 'risk-budgeting' : 'risk-parity',
    convictionAssetId,
    convictionRiskPercent,
    'calibrated-video'
  );

  // Special adjustment if user specifically selected 'passive-dividend' or 'konservatif'
  if (answers.profile === 'passive-dividend') {
    // Tilt weights toward high-yielding assets while preserving risk-parity structure
    const tilted: Record<string, number> = {};
    for (const a of selectedAssets) {
      const baseW = primaryWeights[a.id] ?? 0;
      const yieldBoost = 1 + (a.dividendYield ?? 0) / 8;
      tilted[a.id] = baseW * yieldBoost;
    }
    primaryWeights = normalizeWeightsTo100(tilted);
    method = 'custom';
  } else if (
    answers.crashTolerance === 'konservatif' &&
    answers.profile === 'proteksi-active-income'
  ) {
    // Ensure defensive anchor (RDPT / RDPU / GLD) is at least ~50% to keep Max DD very low
    const tilted: Record<string, number> = { ...primaryWeights };
    if (tilted.RDPT !== undefined) {
      tilted.RDPT = Math.max(42, (tilted.RDPT ?? 0) + 12);
    }
    if (tilted.BTC !== undefined && tilted.BTC > 3) {
      tilted.BTC = 2;
    }
    if (tilted.ETH !== undefined && tilted.ETH > 2) {
      tilted.ETH = 1;
    }
    primaryWeights = normalizeWeightsTo100(tilted);
  }

  const primaryMetrics = evaluatePortfolioMetrics(
    primaryWeights,
    allAssets,
    presets
  );
  const primaryNetYield = computeNetDividendYield(primaryWeights, allAssets);
  const primarySim = simulateWealthToGoal({
    initialCapitalIdr: answers.initialCapitalIdr,
    monthlyContributionIdr: answers.monthlySavingsIdr,
    annualCagrPercent: primaryMetrics.cagr,
    maxDrawdownPercent: primaryMetrics.maxDrawdown,
    targetWealthIdr: answers.targetGoalIdr,
  });

  // Build explanation bullets for Primary Recommendation
  const rationalePoints: string[] = [];
  if (answers.profile === 'proteksi-active-income') {
    rationalePoints.push(
      'Sesuai menit 01:22 di video: Karena fokus utama Anda di karir/bisnis aktif, portfolio ini memprioritaskan penjagaan kekayaan dengan porsi obligasi (RDPT) & emas (GLD) sebagai peredam kejut.'
    );
  } else if (answers.profile === 'balanced-quant') {
    rationalePoints.push(
      'Sesuai rumus Quant Sander (Menit 08:25): Menggabungkan stabilitas RDPT, saham bluechip, dan porsi terukur di aset pertumbuhan agar return optimal tanpa membuat jantungan saat crash.'
    );
  } else if (answers.profile === 'aggressive-compounding') {
    rationalePoints.push(
      'Sesuai menit 02:14 & 09:20: Menggunakan pendekatan Risk Budgeting dengan alokasi risiko tinggi pada aset conviction untuk memaksimalkan kecepatan compounding menuju target.'
    );
  } else {
    rationalePoints.push(
      `Dikalibrasi untuk menghasilkan arus kas pasif dari kupon RDPT dan saham dividen tinggi (estimasi Net Dividend Yield ${primaryNetYield}%/tahun).`
    );
  }

  rationalePoints.push(
    `Menghasilkan estimasi CAGR ${primaryMetrics.cagr}%/tahun dengan batas penurunan terdalam (Max Drawdown) -${primaryMetrics.maxDrawdown}% (rasio efisiensi ${(
      primaryMetrics.cagr / Math.max(1, primaryMetrics.maxDrawdown)
    ).toFixed(2)}x).`
  );

  if (answers.idxEquitySlotChoice !== 'BBCA') {
    rationalePoints.push(
      `Mengganti slot saham bank standar (BBCA) menjadi ${answers.idxEquitySlotChoice} untuk meningkatkan potensi dividen & eksposur komoditas Indonesia.`
    );
  }

  const primaryTitle =
    method === 'risk-budgeting' && convictionAssetId
      ? `Rekomendasi Utama: Risk Budgeting ${convictionAssetId} (${convictionRiskPercent}% Risiko)`
      : answers.profile === 'passive-dividend'
        ? `Rekomendasi Utama: Quant Dividend & Cashflow (${primaryNetYield}% Net Yield)`
        : `Rekomendasi Utama: Risk Parity (${selectedAssets.length} Instrumen Pilihan)`;

  const primaryRecommendation: PortfolioRecommendationItem = {
    id: 'rec-primary-tailored',
    title: primaryTitle,
    badgeLabel: 'Paling Sesuai Profil Anda',
    isPrimaryTailored: true,
    method,
    convictionAssetId,
    convictionRiskPercent,
    weights: primaryWeights,
    metrics: primaryMetrics,
    netDividendYieldPercent: primaryNetYield,
    annualNetDividendAtInitialIdr: Math.round(
      answers.initialCapitalIdr * (primaryNetYield / 100)
    ),
    annualNetDividendAtGoalIdr: Math.round(
      answers.targetGoalIdr * (primaryNetYield / 100)
    ),
    yearsToGoalFloat: primarySim.exactYearsFloat,
    rationalePoints,
  };

  // 5. Find Top 3 Alternative Presets from the 15 Optimal Video Portfolios
  const targetMaxDdCap =
    answers.crashTolerance === 'konservatif'
      ? 10
      : answers.crashTolerance === 'moderat'
        ? 18
        : 80;

  const optimalPresets = presets.filter((p) => p.isOptimal15);
  // Bug 16 fix: Strictly filter out crypto presets if user preference excludes crypto (!hasCrypto)
  const candidatePresets = optimalPresets.filter((p) => {
    if (!hasCrypto) {
      const presetHasCrypto =
        (p.weights.BTC ?? 0) > 0 || (p.weights.ETH ?? 0) > 0 || (p.weights.SOL ?? 0) > 0;
      if (presetHasCrypto) return false;
    }
    return true;
  });

  const scoredPresets = candidatePresets
    .map((p) => {
      let score = 0;
      // Check drawdown alignment
      if (p.maxDrawdown <= targetMaxDdCap) {
        score += 30;
      } else {
        score -= Math.abs(p.maxDrawdown - targetMaxDdCap) * 1.5;
      }

      // Check crypto preference
      const presetHasCrypto =
        (p.weights.BTC ?? 0) > 0 || (p.weights.ETH ?? 0) > 0 || (p.weights.SOL ?? 0) > 0;
      if (hasCrypto && presetHasCrypto) {
        score += 15;
      }

      // Profile alignment
      if (
        answers.profile === 'proteksi-active-income' &&
        (p.riskTier === 'low' || p.riskTier === 'medium')
      ) {
        score += 20;
      } else if (
        answers.profile === 'balanced-quant' &&
        (p.riskTier === 'medium' || p.riskTier === 'high')
      ) {
        score += 20;
      } else if (
        answers.profile === 'aggressive-compounding' &&
        (p.riskTier === 'high' || p.riskTier === 'super-high')
      ) {
        score += 25;
      }

      // Calmar efficiency bonus
      score += (p.cagr / Math.max(1, p.maxDrawdown)) * 8;

      return { preset: p, score };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);

  const alternativeRecommendations: PortfolioRecommendationItem[] =
    scoredPresets.map(({ preset }, idx) => {
      const m = evaluatePortfolioMetrics(preset.weights, allAssets, presets, {
        exactPresetMatch: preset,
      });
      const netY = computeNetDividendYield(preset.weights, allAssets);
      const sim = simulateWealthToGoal({
        initialCapitalIdr: answers.initialCapitalIdr,
        monthlyContributionIdr: answers.monthlySavingsIdr,
        annualCagrPercent: m.cagr,
        maxDrawdownPercent: m.maxDrawdown,
        targetWealthIdr: answers.targetGoalIdr,
      });

      return {
        id: `rec-alt-${preset.id}`,
        title: preset.name,
        badgeLabel:
          idx === 0
            ? 'Preset Video Terdekat'
            : idx === 1
              ? 'Alternatif Lebih Aman'
              : 'Alternatif Pertumbuhan',
        isPrimaryTailored: false,
        method:
          preset.method === 'risk-budgeting'
            ? 'risk-budgeting'
            : preset.method === 'risk-parity'
              ? 'risk-parity'
              : 'custom',
        convictionAssetId: preset.convictionAssetId,
        convictionRiskPercent: preset.convictionRiskPercent,
        weights: { ...preset.weights },
        metrics: m,
        netDividendYieldPercent: netY,
        annualNetDividendAtInitialIdr: Math.round(
          answers.initialCapitalIdr * (netY / 100)
        ),
        annualNetDividendAtGoalIdr: Math.round(
          answers.targetGoalIdr * (netY / 100)
        ),
        yearsToGoalFloat: sim.exactYearsFloat,
        rationalePoints: [
          preset.videoNote ||
            `Salah satu dari 15 Portfolio Terbaik di video dengan CAGR ${m.cagr}% dan Max Drawdown -${m.maxDrawdown}%.`,
        ],
        matchingPresetId: preset.id,
      };
    });

  return {
    primaryRecommendation,
    alternativeRecommendations,
    recommendedSlotMap,
  };
}
