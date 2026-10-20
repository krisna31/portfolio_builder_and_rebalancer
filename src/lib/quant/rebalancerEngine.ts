import {
  AssetDefinition,
  CrashLadderStep,
  HoldingEntry,
  RebalanceItemResult,
  RebalanceMode,
  RebalanceSummaryResult,
} from './types';

/**
 * Calculates exact portfolio rebalancing instructions (Buy / Sell / Hold), supporting:
 * 1. Nominal Value (IDR) OR Units * Price (with automatic USD -> IDR conversion)
 * 2. Simulated Market Crash / Bull Run shocks per asset (e.g., BTC +200%, BBCA -10%, or Crypto -50%)
 * 3. Two Rebalance Modes:
 *    - `sell-and-buy`: Standard full rebalance (sell overweight winners, buy underweight dips + deploy any new cash)
 *    - `buy-only-dca`: Cash injection only (never sell existing assets; allocate new cash to the most underweight assets first)
 * 4. Drift threshold alerts (absolute % or relative % drift)
 * 5. IDX 100-share lot calculation vs fractional US/Crypto units
 */
export function calculateRebalancePlan(params: {
  assets: AssetDefinition[];
  targetWeights: Record<string, number>; // Asset ID -> target % (sums to 100)
  holdings: Record<string, HoldingEntry>;
  inputMode: 'nominal' | 'units';
  usdIdrRate: number;
  cashInjectionIdr: number;
  rebalanceMode: RebalanceMode;
  driftThresholdAbsolutePercent: number; // e.g. 3% absolute drift
}): RebalanceSummaryResult {
  const {
    assets,
    targetWeights,
    holdings,
    inputMode,
    usdIdrRate,
    cashInjectionIdr,
    rebalanceMode,
    driftThresholdAbsolutePercent,
  } = params;

  // Consider all assets that either have a target weight > 0 or current holding > 0
  const relevantAssets = assets.filter((asset) => {
    const targetW = targetWeights[asset.id] ?? 0;
    const h = holdings[asset.id];
    const hasHolding =
      h && (inputMode === 'nominal' ? h.currentValueIdr > 0 : h.units > 0);
    return targetW > 0 || hasHolding;
  });

  // Step 1: Compute initial and post-shock IDR values per asset
  let initialTotalIdr = 0;
  let postShockTotalIdr = 0;

  const computedHoldings = relevantAssets.map((asset) => {
    const h: HoldingEntry = holdings[asset.id] ?? {
      assetId: asset.id,
      currentValueIdr: 0,
      units: 0,
      currentPrice: asset.defaultPrice,
      shockPercent: 0,
    };

    const unitPriceNative = h.currentPrice > 0 ? h.currentPrice : asset.defaultPrice;
    const unitPriceIdr =
      asset.currency === 'USD' ? unitPriceNative * usdIdrRate : unitPriceNative;

    const initialValIdr =
      inputMode === 'nominal'
        ? Math.max(0, h.currentValueIdr)
        : Math.max(0, h.units * unitPriceIdr);

    // Apply market crash / bull run shock multiplier: e.g., +200% shock = 3.0x value, -50% shock = 0.5x value
    const shockMultiplier = Math.max(0, 1 + (h.shockPercent ?? 0) / 100);
    const postShockValIdr = initialValIdr * shockMultiplier;
    const postShockUnitPriceIdr = Math.max(1e-6, unitPriceIdr * shockMultiplier);

    initialTotalIdr += initialValIdr;
    postShockTotalIdr += postShockValIdr;

    return {
      asset,
      holding: h,
      initialValIdr,
      postShockValIdr,
      postShockUnitPriceIdr,
    };
  });

  // Normalize target weights among relevant assets so they sum to 100%
  const rawWeightSum = relevantAssets.reduce(
    (acc, a) => acc + Math.max(0, targetWeights[a.id] ?? 0),
    0
  );

  // Total portfolio capital after cash injection
  const finalTargetTotalIdr = Math.max(0, postShockTotalIdr + cashInjectionIdr);

  // Step 2: Determine target post-rebalance IDR value per asset based on RebalanceMode
  const targetValuesByAsset: Record<string, number> = {};

  if (rebalanceMode === 'sell-and-buy' || cashInjectionIdr <= 0) {
    // Full rebalance: each asset targets finalTargetTotalIdr * (targetWeight / 100)
    for (const item of computedHoldings) {
      const normW =
        rawWeightSum > 0
          ? (Math.max(0, targetWeights[item.asset.id] ?? 0) / rawWeightSum) * 100
          : 0;
      targetValuesByAsset[item.asset.id] = finalTargetTotalIdr * (normW / 100);
    }
  } else {
    // Buy-Only DCA mode: Do not sell overweight assets; distribute cashInjectionIdr
    // proportionally to deficits below the ideal target value
    const deficits: Record<string, number> = {};
    let totalDeficit = 0;

    for (const item of computedHoldings) {
      const normW =
        rawWeightSum > 0
          ? (Math.max(0, targetWeights[item.asset.id] ?? 0) / rawWeightSum) * 100
          : 0;
      const idealTargetIdr = finalTargetTotalIdr * (normW / 100);
      const deficit = Math.max(0, idealTargetIdr - item.postShockValIdr);
      deficits[item.asset.id] = deficit;
      totalDeficit += deficit;
    }

    for (const item of computedHoldings) {
      const buyAdd =
        totalDeficit > 0
          ? cashInjectionIdr * (deficits[item.asset.id] / totalDeficit)
          : cashInjectionIdr *
            ((targetWeights[item.asset.id] ?? 0) / Math.max(1, rawWeightSum));
      targetValuesByAsset[item.asset.id] = item.postShockValIdr + buyAdd;
    }
  }

  // Step 3: Build detailed trade instructions per asset
  let totalBuyIdr = 0;
  let totalSellIdr = 0;
  let maxAbsoluteDrift = 0;
  let breachedCount = 0;

  const items: RebalanceItemResult[] = computedHoldings.map((item) => {
    const normTargetWeight =
      rawWeightSum > 0
        ? Number(
            (
              (Math.max(0, targetWeights[item.asset.id] ?? 0) / rawWeightSum) *
              100
            ).toFixed(2)
          )
        : 0;

    const currentWeightPercent =
      postShockTotalIdr > 0
        ? Number(((item.postShockValIdr / postShockTotalIdr) * 100).toFixed(2))
        : 0;

    const absoluteDriftPercent = Number(
      (currentWeightPercent - normTargetWeight).toFixed(2)
    );
    const relativeDriftPercent =
      normTargetWeight > 0
        ? Number(
            (
              ((currentWeightPercent - normTargetWeight) / normTargetWeight) *
              100
            ).toFixed(1)
          )
        : currentWeightPercent > 0
          ? 100
          : 0;

    const absDriftMag = Math.abs(absoluteDriftPercent);
    if (absDriftMag > maxAbsoluteDrift) {
      maxAbsoluteDrift = absDriftMag;
    }

    const isDriftBreached = absDriftMag >= driftThresholdAbsolutePercent;
    if (isDriftBreached) {
      breachedCount += 1;
    }

    const targetValueIdr = Math.round(targetValuesByAsset[item.asset.id] ?? 0);
    const tradeAmountIdr = Math.round(targetValueIdr - item.postShockValIdr);
    const tradeAmountUsd = Number((tradeAmountIdr / Math.max(1, usdIdrRate)).toFixed(2));

    if (tradeAmountIdr > 1000) {
      totalBuyIdr += tradeAmountIdr;
    } else if (tradeAmountIdr < -1000) {
      totalSellIdr += Math.abs(tradeAmountIdr);
    }

    const rawUnits = tradeAmountIdr / item.postShockUnitPriceIdr;
    const tradeUnits = item.asset.allowFractional
      ? Number(rawUnits.toFixed(4))
      : Math.round(rawUnits);

    const tradeLots =
      item.asset.lotSize === 100
        ? Number((rawUnits / 100).toFixed(1))
        : undefined;

    let action: 'BUY' | 'SELL' | 'HOLD' = 'HOLD';
    if (tradeAmountIdr > 10_000) action = 'BUY';
    else if (tradeAmountIdr < -10_000) action = 'SELL';

    return {
      assetId: item.asset.id,
      symbol: item.asset.symbol,
      name: item.asset.name,
      color: item.asset.color,
      targetWeightPercent: normTargetWeight,
      initialValueIdr: Math.round(item.initialValIdr),
      postShockValueIdr: Math.round(item.postShockValIdr),
      currentWeightPercent,
      absoluteDriftPercent,
      relativeDriftPercent,
      isDriftBreached,
      targetValueIdr,
      tradeAmountIdr,
      tradeAmountUsd,
      tradeUnits,
      tradeLots,
      action,
    };
  });

  return {
    initialTotalIdr: Math.round(initialTotalIdr),
    postShockTotalIdr: Math.round(postShockTotalIdr),
    cashInjectionIdr: Math.round(cashInjectionIdr),
    finalTargetTotalIdr: Math.round(finalTargetTotalIdr),
    totalBuyIdr: Math.round(totalBuyIdr),
    totalSellIdr: Math.round(totalSellIdr),
    maxAbsoluteDrift: Number(maxAbsoluteDrift.toFixed(2)),
    breachedCount,
    items,
  };
}

/**
 * Generates a Pre-Planned Rebalance-Driven Crash Buying Ladder (`-10%`, `-20%`, `-35%`, `-50%`)
 * for a chosen target asset (e.g., `BTC`, `ETH`, `PTBA`, `AADI`, `BBCA`, `QQQ`).
 *
 * At each crash tier:
 * - Assumes the chosen asset (and correlated peers in the same category) drops by `dropPercent`,
 *   while defensive anchors (`RDPT`, `RDPU`, `GLD`) remain stable.
 * - Uses `calculateRebalancePlan` to compute the exact Rupiah amount & Units/IDX Lots to BUY
 *   at that limit price by shifting funds out of `RDPT`/`GLD` to restore the target portfolio weight!
 */
export function generateCrashBuyingLadder(params: {
  targetAsset: AssetDefinition;
  allAssets: AssetDefinition[];
  targetWeights: Record<string, number>;
  holdings: Record<string, HoldingEntry>;
  inputMode: 'nominal' | 'units';
  usdIdrRate: number;
  extraCashIdr?: number;
  dropTiers?: number[];
}): CrashLadderStep[] {
  const {
    targetAsset,
    allAssets,
    targetWeights,
    holdings,
    inputMode,
    usdIdrRate,
    extraCashIdr = 0,
    dropTiers = [-10, -20, -35, -50],
  } = params;

  const baseHolding = holdings[targetAsset.id];
  const currentPriceNative =
    baseHolding?.currentPrice && baseHolding.currentPrice > 0
      ? baseHolding.currentPrice
      : targetAsset.defaultPrice;

  return dropTiers.map((dropPercent) => {
    const multiplier = Math.max(0.05, 1 + dropPercent / 100);
    const limitPriceNative = Number((currentPriceNative * multiplier).toFixed(2));
    const limitPriceIdr = Math.round(
      targetAsset.currency === 'USD'
        ? limitPriceNative * usdIdrRate
        : limitPriceNative
    );

    // Simulate holdings where targetAsset (and same-category risky assets) drop by dropPercent
    const simulatedHoldings: Record<string, HoldingEntry> = {};
    for (const a of allAssets) {
      const h = holdings[a.id] ?? {
        assetId: a.id,
        currentValueIdr: 0,
        units: 0,
        currentPrice: a.defaultPrice,
        shockPercent: 0,
      };
      const isSameRiskBucket =
        a.id === targetAsset.id ||
        (a.category === targetAsset.category &&
          a.category !== 'bonds' &&
          a.category !== 'money-market');

      simulatedHoldings[a.id] = {
        ...h,
        shockPercent: isSameRiskBucket
          ? dropPercent
          : a.category === 'idx-equity' || a.category === 'us-equity'
            ? Math.round(dropPercent * 0.35)
            : 0,
      };
    }

    const plan = calculateRebalancePlan({
      assets: allAssets,
      targetWeights,
      holdings: simulatedHoldings,
      inputMode,
      usdIdrRate,
      cashInjectionIdr: extraCashIdr,
      rebalanceMode: 'sell-and-buy',
      driftThresholdAbsolutePercent: 1,
    });

    const targetItem = plan.items.find((i) => i.assetId === targetAsset.id);
    const buyIdr = Math.max(0, targetItem?.tradeAmountIdr ?? 0);
    const rawUnits = buyIdr / Math.max(1, limitPriceIdr);
    const buyUnits = targetAsset.allowFractional
      ? Number(rawUnits.toFixed(4))
      : Math.round(rawUnits);
    const buyLots =
      targetAsset.lotSize === 100
        ? Number((rawUnits / 100).toFixed(1))
        : undefined;

    // How much defensive assets (RDPT / RDPU / GLD) were sold to fund this dip buy
    const fundingFromDefensiveIdr = plan.items
      .filter((i) => {
        const cat = allAssets.find((a) => a.id === i.assetId)?.category;
        return (
          (cat === 'bonds' || cat === 'money-market' || cat === 'gold') &&
          i.tradeAmountIdr < 0
        );
      })
      .reduce((acc, i) => acc + Math.abs(i.tradeAmountIdr), 0);

    return {
      dropPercent,
      limitPriceNative,
      limitPriceIdr,
      rebalanceBuyAmountIdr: buyIdr,
      rebalanceBuyUnits: buyUnits,
      rebalanceBuyLots: buyLots,
      fundingFromDefensiveIdr: Math.round(fundingFromDefensiveIdr),
      postCrashPortfolioIdr: plan.postShockTotalIdr,
    };
  });
}
