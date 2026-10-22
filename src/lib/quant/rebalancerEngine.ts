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
  enableIdxLotRounding?: boolean;
  sweepRemainderToDefensive?: boolean;
  enableBrokerFees?: boolean;
  filterDustTrades?: boolean;
  dustTradeThresholdIdr?: number;
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
    enableIdxLotRounding = true,
    sweepRemainderToDefensive = true,
    enableBrokerFees = false,
    filterDustTrades = true,
    dustTradeThresholdIdr = 25_000,
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

  // Compute textbook ideal targets, deficits (need to buy) and surpluses (need to sell)
  const idealTargets: Record<string, number> = {};
  const deficits: Record<string, number> = {};
  const surpluses: Record<string, number> = {};
  let totalDeficit = 0;
  let totalSurplus = 0;

  for (const item of computedHoldings) {
    const normW =
      rawWeightSum > 0
        ? (Math.max(0, targetWeights[item.asset.id] ?? 0) / rawWeightSum) * 100
        : 0;
    const idealVal = finalTargetTotalIdr * (normW / 100);
    idealTargets[item.asset.id] = idealVal;

    const currentVal = item.postShockValIdr;
    if (idealVal > currentVal) {
      const def = idealVal - currentVal;
      deficits[item.asset.id] = def;
      totalDeficit += def;
      surpluses[item.asset.id] = 0;
    } else {
      const sur = currentVal - idealVal;
      surpluses[item.asset.id] = sur;
      totalSurplus += sur;
      deficits[item.asset.id] = 0;
    }
  }

  if (rebalanceMode === 'sell-and-buy') {
    // Mode 1: Full textbook rebalance (sell all overweight proportionally, buy all underweight)
    for (const item of computedHoldings) {
      targetValuesByAsset[item.asset.id] = idealTargets[item.asset.id];
    }
  } else if (rebalanceMode === 'buy-only-dca') {
    // Mode 2: Buy-Only DCA mode: Never sell existing assets. Distribute cash injection only.
    for (const item of computedHoldings) {
      if (cashInjectionIdr <= 0) {
        // Without cash injection, keep holding untouched (no sells)
        targetValuesByAsset[item.asset.id] = item.postShockValIdr;
      } else {
        const buyAdd =
          totalDeficit > 0
            ? cashInjectionIdr * (deficits[item.asset.id] / totalDeficit)
            : cashInjectionIdr *
              ((targetWeights[item.asset.id] ?? 0) / Math.max(1, rawWeightSum));
        targetValuesByAsset[item.asset.id] = item.postShockValIdr + buyAdd;
      }
    }
  } else if (rebalanceMode === 'selective-profit-trim') {
    // Mode 3: Selective Profit Trim (Jual Untung Saja)
    // Only sell assets that have significant positive drift above tolerance threshold.
    // Minor drifts (< cutoff) remain HOLD without generating annoying micro/dust sell orders!
    const netFundingNeeded = Math.max(0, totalDeficit - cashInjectionIdr);

    // Minimum positive drift to be considered a significant winner
    const minDriftCutoff = Math.max(0.5, Math.min(2.0, driftThresholdAbsolutePercent * 0.5));

    const candidateSellers = computedHoldings.filter((item) => {
      const curW = postShockTotalIdr > 0 ? (item.postShockValIdr / postShockTotalIdr) * 100 : 0;
      const tgtW = rawWeightSum > 0 ? ((targetWeights[item.asset.id] ?? 0) / rawWeightSum) * 100 : 0;
      const drift = curW - tgtW;
      const surplus = surpluses[item.asset.id] ?? 0;
      return drift >= minDriftCutoff && surplus >= 25_000;
    });

    // If no candidate crossed cutoff, pick top 1-2 assets with largest nominal surplus
    const eligibleSellers =
      candidateSellers.length > 0
        ? candidateSellers
        : [...computedHoldings]
            .filter((item) => (surpluses[item.asset.id] ?? 0) > 25_000)
            .sort((a, b) => (surpluses[b.asset.id] ?? 0) - (surpluses[a.asset.id] ?? 0))
            .slice(0, 1);

    const eligibleSurplusTotal = eligibleSellers.reduce(
      (sum, item) => sum + (surpluses[item.asset.id] ?? 0),
      0
    );

    const actualTrimTotal = Math.min(eligibleSurplusTotal, netFundingNeeded);
    const availableBuyBudget = cashInjectionIdr + actualTrimTotal;

    for (const item of computedHoldings) {
      const isEligibleSeller = eligibleSellers.some((s) => s.asset.id === item.asset.id);
      if (isEligibleSeller && eligibleSurplusTotal > 0 && actualTrimTotal > 0) {
        // Trim proportionally from eligible surplus
        const trimShare = (surpluses[item.asset.id] / eligibleSurplusTotal) * actualTrimTotal;
        targetValuesByAsset[item.asset.id] = Math.round(item.postShockValIdr - trimShare);
      } else if (deficits[item.asset.id] > 0 && totalDeficit > 0) {
        // Fund underweight asset up to available buy budget
        const buyShare =
          (deficits[item.asset.id] / totalDeficit) * Math.min(totalDeficit, availableBuyBudget);
        targetValuesByAsset[item.asset.id] = Math.round(item.postShockValIdr + buyShare);
      } else {
        // Keep minor-drift assets untouched (HOLD)
        targetValuesByAsset[item.asset.id] = item.postShockValIdr;
      }
    }
  } else if (rebalanceMode === 'trim-defensive-first') {
    // Mode 4: Prioritas Jual RDPT / RDPU / Kas Dulu (Defensive Buffer First)
    // Sesuai prinsip Risk Parity: gunakan cadangan defensif untuk membeli aset diskon.
    // Lindungi aset pertumbuhan (saham AS/IDX, crypto, emas) dari aksi jual.
    const netFundingNeeded = Math.max(0, totalDeficit - cashInjectionIdr);

    const defensiveHoldings = computedHoldings.filter(
      (item) =>
        item.asset.category === 'money-market' ||
        item.asset.category === 'bonds' ||
        item.asset.id === 'RDPT' ||
        item.asset.id === 'RDPU'
    );

    const defensiveCapitalTotal = defensiveHoldings.reduce(
      (sum, item) => sum + item.postShockValIdr,
      0
    );

    if (defensiveCapitalTotal > 0 && netFundingNeeded > 0) {
      const actualDefensiveTrim = Math.min(defensiveCapitalTotal, netFundingNeeded);
      const availableBuyBudget = cashInjectionIdr + actualDefensiveTrim;

      for (const item of computedHoldings) {
        const isDefensive = defensiveHoldings.some((d) => d.asset.id === item.asset.id);
        if (isDefensive && defensiveCapitalTotal > 0 && actualDefensiveTrim > 0) {
          const drawShare = (item.postShockValIdr / defensiveCapitalTotal) * actualDefensiveTrim;
          targetValuesByAsset[item.asset.id] = Math.round(
            Math.max(0, item.postShockValIdr - drawShare)
          );
        } else if (deficits[item.asset.id] > 0 && totalDeficit > 0) {
          const buyShare =
            (deficits[item.asset.id] / totalDeficit) * Math.min(totalDeficit, availableBuyBudget);
          targetValuesByAsset[item.asset.id] = Math.round(item.postShockValIdr + buyShare);
        } else {
          // Growth assets are protected (HOLD)
          targetValuesByAsset[item.asset.id] = item.postShockValIdr;
        }
      }
    } else {
      // Fallback to selective trim if no defensive assets are held
      for (const item of computedHoldings) {
        targetValuesByAsset[item.asset.id] = idealTargets[item.asset.id];
      }
    }
  }

  // Step 3: Build detailed trade instructions per asset
  let totalBuyIdr = 0;
  let totalSellIdr = 0;
  let maxAbsoluteDrift = 0;
  let breachedCount = 0;
  let totalUnallocatedRemainderIdr = 0;
  let totalEstimatedFeeIdr = 0;

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
    let tradeAmountIdr = Math.round(targetValueIdr - item.postShockValIdr);

    let tradeLots: number | undefined;
    let tradeLotsInteger: number | undefined;
    let tradeLotsRemainderIdr: number | undefined;
    let tradeUnits = 0;

    const isNominalOnly =
      item.holding.isNominalOnly ??
      (item.asset.category === 'bonds' || item.asset.category === 'money-market');

    const rawUnits = tradeAmountIdr / item.postShockUnitPriceIdr;

    if (isNominalOnly) {
      // For nominal-only assets (e.g. bonds, deposits, cash), orders are executed as direct Rupiah amounts
      tradeUnits = tradeAmountIdr;
    } else if (item.asset.lotSize === 100) {
      const rawLots = rawUnits / 100;
      tradeLots = Number(rawLots.toFixed(1));

      if (enableIdxLotRounding) {
        // Integer lot rounding: 1 Lot = 100 lembar
        const intLots =
          tradeAmountIdr >= 0
            ? Math.round(Math.max(0, rawLots))
            : -Math.round(Math.max(0, Math.abs(rawLots)));

        tradeLotsInteger = intLots;
        tradeUnits = intLots * 100;
        const executedValueIdr = Math.round(tradeUnits * item.postShockUnitPriceIdr);
        tradeLotsRemainderIdr = tradeAmountIdr - executedValueIdr;

        // In Buy mode with Lot Rounding, tradeAmountIdr aligns with the executed lot value
        if (Math.abs(tradeUnits) > 0) {
          tradeAmountIdr = executedValueIdr;
        } else {
          tradeLotsRemainderIdr = tradeAmountIdr;
          tradeAmountIdr = 0;
        }
        totalUnallocatedRemainderIdr += tradeLotsRemainderIdr;
      } else {
        tradeUnits = Math.round(rawUnits);
      }
    } else {
      tradeUnits = item.asset.allowFractional
        ? Number(rawUnits.toFixed(4))
        : Math.round(rawUnits);
    }

    const tradeAmountUsd = Number((tradeAmountIdr / Math.max(1, usdIdrRate)).toFixed(2));

    let action: 'BUY' | 'SELL' | 'HOLD' = 'HOLD';
    if (tradeAmountIdr > 10_000) action = 'BUY';
    else if (tradeAmountIdr < -10_000) action = 'SELL';

    if (tradeAmountIdr > 1000) {
      totalBuyIdr += tradeAmountIdr;
    } else if (tradeAmountIdr < -1000) {
      totalSellIdr += Math.abs(tradeAmountIdr);
    }

    // Broker Transaction Fee & Tax Estimation
    let estimatedFeeIdr = 0;
    if (enableBrokerFees && action !== 'HOLD') {
      const absTrade = Math.abs(tradeAmountIdr);
      if (item.asset.category === 'idx-equity') {
        // IDX: Buy ~0.15%, Sell ~0.25% (0.15% fee + 0.10% final PPh tax)
        estimatedFeeIdr = Math.round(absTrade * (action === 'BUY' ? 0.0015 : 0.0025));
      } else if (item.asset.category === 'us-equity') {
        // US ETF / Stocks: ~0.10%
        estimatedFeeIdr = Math.round(absTrade * 0.001);
      } else if (item.asset.category === 'crypto') {
        // Crypto: ~0.15% (tax + exchange fee)
        estimatedFeeIdr = Math.round(absTrade * 0.0015);
      } else if (item.asset.category === 'gold') {
        // Gold: ~0.10%
        estimatedFeeIdr = Math.round(absTrade * 0.001);
      }
      totalEstimatedFeeIdr += estimatedFeeIdr;
    }

    return {
      assetId: item.asset.id,
      symbol: item.asset.symbol,
      name: item.asset.name,
      color: item.asset.color,
      isNominalOnly,
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
      tradeLotsInteger,
      tradeLotsRemainderIdr,
      estimatedFeeIdr,
      action,
    };
  });

  // Optional: Sweep unallocated lot remainder to main defensive anchor (RDPT or RDPU) if active
  if (
    enableIdxLotRounding &&
    sweepRemainderToDefensive &&
    Math.abs(totalUnallocatedRemainderIdr) >= 10_000
  ) {
    const defensiveItem =
      items.find((i) => i.assetId === 'RDPT' && (targetWeights.RDPT ?? 0) > 0) ??
      items.find((i) => i.assetId === 'RDPU' && (targetWeights.RDPU ?? 0) > 0);

    if (defensiveItem) {
      defensiveItem.tradeAmountIdr += totalUnallocatedRemainderIdr;
      const defAsset = assets.find((a) => a.id === defensiveItem.assetId);
      const defHold = holdings[defensiveItem.assetId];
      const defPriceIdr =
        defAsset?.currency === 'USD'
          ? (defHold?.currentPrice ?? defAsset?.defaultPrice ?? 1) * usdIdrRate
          : defHold?.currentPrice ?? defAsset?.defaultPrice ?? 1;

      defensiveItem.tradeUnits = Number(
        (defensiveItem.tradeAmountIdr / Math.max(1, defPriceIdr)).toFixed(4)
      );
      if (defensiveItem.tradeAmountIdr > 10_000) {
        defensiveItem.action = 'BUY';
      } else if (defensiveItem.tradeAmountIdr < -10_000) {
        defensiveItem.action = 'SELL';
      } else {
        defensiveItem.action = 'HOLD';
      }
    }
  }

  // Step 4: Dust Trade Filter (Anti-Dust Protection)
  // Suppresses tiny negligible orders (e.g. < Rp 25.000 / ~$1.5) into clean HOLDs
  let suppressedDustTradesCount = 0;
  if (filterDustTrades) {
    for (const item of items) {
      // Don't suppress IDX stocks that already bought/sold full whole lots (tradeLotsInteger !== 0)
      const hasIdxLot =
        item.tradeLotsInteger !== undefined && Math.abs(item.tradeLotsInteger) >= 1;
      if (
        !hasIdxLot &&
        item.action !== 'HOLD' &&
        Math.abs(item.tradeAmountIdr) < dustTradeThresholdIdr
      ) {
        if (item.action === 'BUY') {
          totalBuyIdr -= item.tradeAmountIdr;
        } else if (item.action === 'SELL') {
          totalSellIdr -= Math.abs(item.tradeAmountIdr);
        }
        item.action = 'HOLD';
        item.isDustFiltered = true;
        item.tradeAmountIdr = 0;
        item.tradeAmountUsd = 0;
        item.tradeUnits = 0;
        item.tradeLots = 0;
        item.tradeLotsInteger = 0;
        item.estimatedFeeIdr = 0;
        suppressedDustTradesCount += 1;
      }
    }
  }

  return {
    initialTotalIdr: Math.round(initialTotalIdr),
    postShockTotalIdr: Math.round(postShockTotalIdr),
    cashInjectionIdr: Math.round(cashInjectionIdr),
    finalTargetTotalIdr: Math.round(finalTargetTotalIdr),
    totalBuyIdr: Math.max(0, Math.round(totalBuyIdr)),
    totalSellIdr: Math.max(0, Math.round(totalSellIdr)),
    maxAbsoluteDrift: Number(maxAbsoluteDrift.toFixed(2)),
    breachedCount,
    lotRoundingEnabled: enableIdxLotRounding,
    unallocatedCashRemainderIdr: Math.round(totalUnallocatedRemainderIdr),
    totalEstimatedFeeIdr: Math.round(totalEstimatedFeeIdr),
    suppressedDustTradesCount,
    rebalanceMode,
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
