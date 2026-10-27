import {
  AssetDefinition,
  SentimentZone,
  TacticalSignalInfo,
  ValuationSentimentConfig,
} from './types';

/**
 * Returns the standard 5-tier financial market sentiment classification
 */
export function getSentimentZone(score: number): SentimentZone {
  const cleanScore = Math.max(0, Math.min(100, Math.round(score)));
  if (cleanScore <= 24) return 'extreme-fear';
  if (cleanScore <= 44) return 'fear';
  if (cleanScore <= 55) return 'neutral';
  if (cleanScore <= 75) return 'greed';
  return 'extreme-greed';
}

/**
 * Descriptive label and tactical guidance per sentiment zone
 */
export function getSentimentDescription(zone: SentimentZone): {
  label: string;
  badgeLabel: string;
  actionHint: string;
  colorClass: string;
} {
  switch (zone) {
    case 'extreme-fear':
      return {
        label: 'Extreme Fear',
        badgeLabel: 'Diskon Ekstrem',
        actionHint: 'Diskon Besar: Akumulasi serok agresif',
        colorClass: 'text-emerald-500 dark:text-emerald-400',
      };
    case 'fear':
      return {
        label: 'Fear',
        badgeLabel: 'Koreksi Diskon',
        actionHint: 'Koreksi Sehat: Akumulasi ekstra',
        colorClass: 'text-emerald-400 dark:text-emerald-300',
      };
    case 'neutral':
      return {
        label: 'Netral',
        badgeLabel: 'Valuasi Wajar',
        actionHint: 'Valuasi Wajar: Ikuti alokasi baku',
        colorClass: 'text-slate-400 dark:text-slate-300',
      };
    case 'greed':
      return {
        label: 'Greed',
        badgeLabel: 'Overheated',
        actionHint: 'Reli Tinggi: Mulai pangkas bertahap',
        colorClass: 'text-amber-500 dark:text-amber-400',
      };
    case 'extreme-greed':
      return {
        label: 'Extreme Greed',
        badgeLabel: 'Puncak Euphoria',
        actionHint: 'Puncak Euphoria: Pangkas agresif & amankan profit',
        colorClass: 'text-rose-500 dark:text-rose-400',
      };
  }
}

/**
 * Converts a 0-100 sentiment score to a tactical weight tilt percentage (-aggressiveness to +aggressiveness)
 * - Fear (score < 45): positive tilt (+% to buy more discounted assets)
 * - Greed (score > 55): negative tilt (-% to trim overbought winners)
 * - Neutral (45 - 55): 0% tilt
 */
export function calculateTiltMultiplier(score: number, aggressiveness: number): number {
  const cleanScore = Math.max(0, Math.min(100, score));
  const maxTilt = Math.max(0.05, Math.min(0.40, aggressiveness));

  if (cleanScore >= 45 && cleanScore <= 55) {
    return 0;
  }

  if (cleanScore < 45) {
    // Fear zone: (45 - cleanScore) / 45 scales from 0 to 1
    const factor = (45 - cleanScore) / 45;
    return Number((factor * maxTilt).toFixed(4));
  }

  // Greed zone: (cleanScore - 55) / 45 scales from 0 to 1
  const factor = (cleanScore - 55) / 45;
  return Number((-factor * maxTilt).toFixed(4));
}

export interface TacticalWeightsResult {
  tacticalWeights: Record<string, number>;
  tacticalSignals: Record<string, TacticalSignalInfo>;
  isAnyTiltApplied: boolean;
  totalDefensiveDeltaPercent: number;
}

/**
 * Dynamically adjusts target weights based on market sentiment (Valuation Band)
 * - Discounted assets (Fear) get scaled up
 * - Overextended assets (Greed) get scaled down
 * - The net difference is funded from / absorbed by defensive buffer assets (RDPT, RDPU, Cash)
 * - Guarantees the weights strictly sum to 100.00% (Zero-Sum Conservation)
 */
export function calculateTacticalWeights(
  baseWeights: Record<string, number>,
  assets: AssetDefinition[],
  config?: ValuationSentimentConfig
): TacticalWeightsResult {
  if (!config || !config.enabled) {
    return {
      tacticalWeights: { ...baseWeights },
      tacticalSignals: {},
      isAnyTiltApplied: false,
      totalDefensiveDeltaPercent: 0,
    };
  }

  const aggressiveness = config.aggressiveness ?? 0.2;
  const tacticalWeights: Record<string, number> = {};
  const tacticalSignals: Record<string, TacticalSignalInfo> = {};

  // 1. Identify growth vs defensive buffer assets
  const growthAssetIds: string[] = [];
  const defensiveAssetIds: string[] = [];

  for (const asset of assets) {
    const isDefensive =
      asset.category === 'money-market' ||
      asset.category === 'bonds' ||
      asset.id === 'RDPU' ||
      asset.id === 'RDPT';

    if (isDefensive) {
      defensiveAssetIds.push(asset.id);
    } else {
      growthAssetIds.push(asset.id);
    }
  }

  let totalGrowthWeightDiff = 0;
  let isAnyTiltApplied = false;

  // 2. Compute tactical tilts for growth assets
  for (const assetId of growthAssetIds) {
    const baseW = baseWeights[assetId] ?? 0;
    if (baseW <= 0) {
      tacticalWeights[assetId] = 0;
      continue;
    }

    const asset = assets.find((a) => a.id === assetId);
    let score = 50; // default neutral

    const isCrypto =
      asset?.category === 'crypto' || ['BTC', 'ETH', 'SOL'].includes(assetId);
    const isUsEquity =
      asset?.category === 'us-equity' ||
      ['SPY', 'QQQ', 'NVDA', 'AAPL', 'MSFT'].includes(assetId);
    const isIdxEquity =
      asset?.category === 'idx-equity' ||
      ['BBCA', 'IHSG', 'BBRI', 'ASII', 'TLKM', 'AADI'].includes(assetId);
    const isGold =
      asset?.category === 'gold' || ['GLD', 'ANTM'].includes(assetId);

    if (isCrypto) {
      score = config.cryptoScore;
    } else if (isUsEquity) {
      score = config.usEquityScore;
    } else if (isIdxEquity) {
      score = config.idxEquityScore;
    } else if (isGold) {
      score = config.goldScore ?? 50;
    }

    const tiltMultiplier = calculateTiltMultiplier(score, aggressiveness);
    const zone = getSentimentZone(score);
    const desc = getSentimentDescription(zone);

    // Apply multiplier: e.g. baseW 20% * (1 + 0.20) = 24%
    const tiltedWeight = Math.max(0.5, baseW * (1 + tiltMultiplier));
    const deltaW = tiltedWeight - baseW;

    totalGrowthWeightDiff += deltaW;
    tacticalWeights[assetId] = tiltedWeight;

    if (Math.abs(tiltMultiplier) >= 0.01) {
      isAnyTiltApplied = true;
      tacticalSignals[assetId] = {
        sentimentZone: zone,
        sentimentScore: score,
        sentimentLabel: desc.label,
        badgeLabel: desc.badgeLabel,
        tiltMultiplierPercent: Number((tiltMultiplier * 100).toFixed(1)),
        baseTargetWeightPercent: Number(baseW.toFixed(2)),
        tacticalTargetWeightPercent: Number(tiltedWeight.toFixed(2)),
        reason: desc.actionHint,
      };
    }
  }

  // 3. Balance the growth delta against defensive buffer assets (Zero-Sum)
  const totalBaseDefensive = defensiveAssetIds.reduce(
    (sum, id) => sum + (baseWeights[id] ?? 0),
    0
  );

  if (totalBaseDefensive > 0) {
    // If growth weights increased (+totalGrowthWeightDiff), defensive must decrease (-totalGrowthWeightDiff)
    const targetTotalDefensive = Math.max(0.5, totalBaseDefensive - totalGrowthWeightDiff);
    const defensiveScale = targetTotalDefensive / totalBaseDefensive;

    for (const defId of defensiveAssetIds) {
      const baseW = baseWeights[defId] ?? 0;
      tacticalWeights[defId] = Number((baseW * defensiveScale).toFixed(4));
    }
  } else {
    // In all-growth portfolio without defensive assets, keep base weights of defensive
    for (const defId of defensiveAssetIds) {
      tacticalWeights[defId] = baseWeights[defId] ?? 0;
    }
  }

  // 4. Exact 100% normalization check
  const sumWeights = Object.values(tacticalWeights).reduce((a, b) => a + b, 0);
  if (sumWeights > 0 && Math.abs(sumWeights - 100) > 0.001) {
    const normFactor = 100 / sumWeights;
    for (const id of Object.keys(tacticalWeights)) {
      tacticalWeights[id] = Number((tacticalWeights[id] * normFactor).toFixed(2));
    }
  } else {
    for (const id of Object.keys(tacticalWeights)) {
      tacticalWeights[id] = Number(tacticalWeights[id].toFixed(2));
    }
  }

  // Re-synchronize tacticalTargetWeightPercent in tacticalSignals after normalization
  for (const id of Object.keys(tacticalSignals)) {
    if (tacticalWeights[id] !== undefined) {
      tacticalSignals[id].tacticalTargetWeightPercent = tacticalWeights[id];
      const baseRounded = Number((baseWeights[id] ?? 0).toFixed(2));
      if (Math.abs(tacticalWeights[id] - baseRounded) < 0.01) {
        delete tacticalSignals[id];
      }
    }
  }

  // Verify whether any asset weight actually changed after 100% normalization
  const hasEffectiveWeightChange = Object.keys(tacticalWeights).some(
    (id) => Math.abs((tacticalWeights[id] ?? 0) - Number((baseWeights[id] ?? 0).toFixed(2))) >= 0.01
  );

  if (!hasEffectiveWeightChange) {
    isAnyTiltApplied = false;
    for (const id of Object.keys(tacticalSignals)) {
      delete tacticalSignals[id];
    }
  }

  const effectiveGrowthDelta = hasEffectiveWeightChange
    ? growthAssetIds.reduce(
        (sum, id) => sum + ((tacticalWeights[id] ?? 0) - (baseWeights[id] ?? 0)),
        0
      )
    : 0;

  return {
    tacticalWeights,
    tacticalSignals,
    isAnyTiltApplied,
    totalDefensiveDeltaPercent: Number(effectiveGrowthDelta.toFixed(2)),
  };
}

/**
 * Fetches live Crypto Fear & Greed Index from the public alternative.me API
 */
export async function fetchLiveCryptoFearAndGreed(): Promise<{
  score: number;
  classification: string;
  updatedAt: string;
} | null> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 4500);

    const res = await fetch('https://api.alternative.me/fng/?limit=1', {
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!res.ok) return null;
    const json = await res.json();
    const item = json?.data?.[0];

    if (item && item.value !== undefined) {
      return {
        score: Number(item.value),
        classification: item.value_classification ?? 'Neutral',
        updatedAt: item.timestamp
          ? new Date(Number(item.timestamp) * 1000).toLocaleDateString('id-ID', {
              day: '2-digit',
              month: 'short',
              year: 'numeric',
            })
          : 'Live API',
      };
    }
    return null;
  } catch {
    return null;
  }
}
