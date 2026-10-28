import {
  AssetDefinition,
  CrashLadderStep,
  HoldingEntry,
  RebalanceItemResult,
  RebalanceMode,
  RebalanceSummaryResult,
  ValuationSentimentConfig,
} from './types';
import { calculateTacticalWeights } from './tacticalValuationEngine';

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
  tacticalConfig?: ValuationSentimentConfig;
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
    tacticalConfig,
  } = params;

  // Apply tactical valuation band multiplier if enabled
  const { tacticalWeights, tacticalSignals, isAnyTiltApplied } = calculateTacticalWeights(
    targetWeights,
    assets,
    tacticalConfig
  );
  const effectiveTargetWeights = isAnyTiltApplied ? tacticalWeights : targetWeights;

  // Consider all assets that either have a target weight > 0 or current holding > 0
  const relevantAssets = assets.filter((asset) => {
    const targetW = effectiveTargetWeights[asset.id] ?? 0;
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

    // For IDX equity stocks (100 shares per lot), ensure unit price conforms to BEI official tick sizes
    const isIdxStock =
      asset.category === 'idx-equity' &&
      asset.lotSize === 100 &&
      !asset.isNominalOnly;
    const rawPostShockUnitPrice = unitPriceIdr * shockMultiplier;
    const postShockUnitPriceIdr = isIdxStock
      ? roundToIdxTick(rawPostShockUnitPrice, 'nearest')
      : Math.max(1e-6, rawPostShockUnitPrice);

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
    (acc, a) => acc + Math.max(0, effectiveTargetWeights[a.id] ?? 0),
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
        ? (Math.max(0, effectiveTargetWeights[item.asset.id] ?? 0) / rawWeightSum) * 100
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
            ? Math.floor(cashInjectionIdr * (deficits[item.asset.id] / totalDeficit))
            : Math.floor(
                cashInjectionIdr *
                ((effectiveTargetWeights[item.asset.id] ?? 0) / Math.max(1, rawWeightSum))
              );
        targetValuesByAsset[item.asset.id] = item.postShockValIdr + buyAdd;
      }
    }
  } else if (rebalanceMode === 'selective-profit-trim') {
    // Mode 3: Selective Profit Trim (Jual Untung Saja)
    // Only sell assets that have significant positive drift above tolerance threshold.
    // Minor drifts (< cutoff) remain HOLD without generating annoying micro/dust sell orders!
    const netFundingNeeded = Math.max(0, totalDeficit - cashInjectionIdr);

    // Decision 2 / Bug 7: Minimum positive drift scales dynamically with driftThresholdAbsolutePercent without 2.0% hard-cap
    const minDriftCutoff = Math.max(0.5, driftThresholdAbsolutePercent * 0.5);

    const candidateSellers = computedHoldings.filter((item) => {
      const curW = postShockTotalIdr > 0 ? (item.postShockValIdr / postShockTotalIdr) * 100 : 0;
      const tgtW = rawWeightSum > 0 ? ((effectiveTargetWeights[item.asset.id] ?? 0) / rawWeightSum) * 100 : 0;
      const drift = curW - tgtW;
      const surplus = surpluses[item.asset.id] ?? 0;
      // Feature 5: If user specified avgBuyPrice, protect underwater positions from profit-trimming
      const isProfitable =
        !item.holding.avgBuyPrice ||
        item.holding.avgBuyPrice <= 0 ||
        ((item.holding.currentPrice || item.asset.defaultPrice) >= item.holding.avgBuyPrice);
      return drift >= minDriftCutoff && surplus >= 25_000 && isProfitable;
    });

    // Decision 2 / Bug 7: Output HOLD (0 sells) when no asset exceeds drift cutoff, only deploying cashInjectionIdr if > 0
    const eligibleSellers = candidateSellers;

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
      } else if (deficits[item.asset.id] > 0 && totalDeficit > 0 && availableBuyBudget > 0) {
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
    const defensiveHoldings = computedHoldings.filter(
      (item) =>
        item.asset.category === 'money-market' ||
        item.asset.category === 'bonds' ||
        item.asset.id === 'RDPT' ||
        item.asset.id === 'RDPU'
    );
    const growthHoldings = computedHoldings.filter(
      (item) => !defensiveHoldings.some((d) => d.asset.id === item.asset.id)
    );

    // Only defensive assets with surplus can be trimmed to fund growth!
    // Underweight defensive assets must NOT be trimmed.
    const defensiveSurplusesTotal = defensiveHoldings.reduce(
      (sum, item) => sum + Math.max(0, surpluses[item.asset.id] ?? 0),
      0
    );

    // Deficit of growth assets that need funding
    const growthDeficitTotal = growthHoldings.reduce(
      (sum, item) => sum + Math.max(0, deficits[item.asset.id] ?? 0),
      0
    );

    // Bug 8: netFundingNeeded must cover all deficits (growth + underweight defensive) less cash injection
    const netFundingNeeded = Math.max(0, totalDeficit - cashInjectionIdr);

    if (defensiveSurplusesTotal > 0 && netFundingNeeded > 0) {
      const actualDefensiveTrim = Math.min(defensiveSurplusesTotal, netFundingNeeded);
      const availableBuyBudget = cashInjectionIdr + actualDefensiveTrim;

      for (const item of computedHoldings) {
        const isDefensive = defensiveHoldings.some((d) => d.asset.id === item.asset.id);
        const itemSurplus = Math.max(0, surpluses[item.asset.id] ?? 0);

        if (isDefensive && itemSurplus > 0 && defensiveSurplusesTotal > 0 && actualDefensiveTrim > 0) {
          // Trim proportionally from defensive surplus
          const drawShare = (itemSurplus / defensiveSurplusesTotal) * actualDefensiveTrim;
          targetValuesByAsset[item.asset.id] = Math.round(item.postShockValIdr - drawShare);
        } else if (deficits[item.asset.id] > 0 && totalDeficit > 0 && availableBuyBudget > 0) {
          // Fund deficit assets (both growth and underweight defensive) using available buy budget
          const buyShare =
            (deficits[item.asset.id] / totalDeficit) * Math.min(totalDeficit, availableBuyBudget);
          targetValuesByAsset[item.asset.id] = Math.round(item.postShockValIdr + buyShare);
        } else {
          // Protected assets stay at post-shock value
          targetValuesByAsset[item.asset.id] = item.postShockValIdr;
        }
      }
    } else {
      // If no defensive surplus available or cash injection is sufficient:
      // Protect all assets from selling, allocate available cash injection to deficits
      const availableBuyBudget = cashInjectionIdr;
      for (const item of computedHoldings) {
        if (deficits[item.asset.id] > 0 && totalDeficit > 0 && availableBuyBudget > 0) {
          const buyShare =
            (deficits[item.asset.id] / totalDeficit) * Math.min(totalDeficit, availableBuyBudget);
          targetValuesByAsset[item.asset.id] = Math.round(item.postShockValIdr + buyShare);
        } else {
          targetValuesByAsset[item.asset.id] = item.postShockValIdr;
        }
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
              (Math.max(0, effectiveTargetWeights[item.asset.id] ?? 0) / rawWeightSum) *
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
      item.asset.isNominalOnly ??
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
        // Use Math.floor for BUY orders to prevent exceeding allocated cash (overdraft)
        // Clamp SELL lots to owned regular lots to prevent retail naked shorting on IDX
        const currentTotalUnits =
          inputMode === 'nominal'
            ? item.postShockValIdr / Math.max(1e-6, item.postShockUnitPriceIdr)
            : (item.holding.units ?? 0);
        const maxSellLots = Math.floor(Math.max(0, currentTotalUnits) / 100);
        const intLots =
          tradeAmountIdr >= 0
            ? Math.floor(Math.max(0, rawLots))
            : -Math.min(Math.round(Math.max(0, Math.abs(rawLots))), maxSellLots) || 0;

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
      const precision = item.asset.category === 'crypto' ? 8 : 4;
      tradeUnits = item.asset.allowFractional
        ? Number(rawUnits.toFixed(precision))
        : Math.round(rawUnits);
    }

    // Bug 6: Eliminate dead zone between Rp 1.000 and Rp 10.000 so phantom HOLD trades are zeroed out
    let action: 'BUY' | 'SELL' | 'HOLD' = 'HOLD';
    if (tradeAmountIdr > 10_000) action = 'BUY';
    else if (tradeAmountIdr < -10_000) action = 'SELL';
    else {
      // Sub-10k orders are HOLD; add leftover positive buy amount to unallocated cash remainder
      if (tradeAmountIdr > 0) {
        totalUnallocatedRemainderIdr += tradeAmountIdr;
      }
      tradeAmountIdr = 0;
      tradeUnits = 0;
      tradeLots = 0;
      tradeLotsInteger = 0;
    }

    // Bug 2: targetValueIdr must reflect executed postShockValIdr + tradeAmountIdr so lot remainders are not double-counted
    const finalTargetValIdr = Math.round(item.postShockValIdr + tradeAmountIdr);
    const tradeAmountUsd = Number((tradeAmountIdr / Math.max(1, usdIdrRate)).toFixed(2));

    if (action === 'BUY') {
      totalBuyIdr += tradeAmountIdr;
    } else if (action === 'SELL') {
      totalSellIdr += Math.abs(tradeAmountIdr);
    }

    // Broker Transaction Fee & Tax Estimation
    let estimatedFeeIdr = 0;
    if (enableBrokerFees && action !== 'HOLD') {
      const absTrade = Math.abs(tradeAmountIdr);
      // Reksa Dana / Nominal assets have 0% broker fee and 0% tax
      if (!isNominalOnly && item.asset.category === 'idx-equity') {
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

    // Feature 5: Unrealized P&L calculation if avgBuyPrice is provided
    let unrealizedGainPercent: number | undefined;
    let unrealizedGainIdr: number | undefined;
    const avgBuyPrice = item.holding.avgBuyPrice;
    if (avgBuyPrice && avgBuyPrice > 0) {
      const spotNative = item.holding.currentPrice > 0 ? item.holding.currentPrice : item.asset.defaultPrice;
      unrealizedGainPercent = Number((((spotNative - avgBuyPrice) / avgBuyPrice) * 100).toFixed(2));
      const unitsHeld =
        inputMode === 'nominal'
          ? item.initialValIdr / Math.max(1e-6, item.postShockUnitPriceIdr)
          : (item.holding.units ?? 0);
      const fxRate = item.asset.currency === 'USD' ? usdIdrRate : 1;
      unrealizedGainIdr = Math.round((spotNative - avgBuyPrice) * unitsHeld * fxRate);
    }

    return {
      assetId: item.asset.id,
      symbol: item.asset.shortName || item.asset.symbol,
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
      targetValueIdr: finalTargetValIdr,
      tradeAmountIdr,
      tradeAmountUsd,
      tradeUnits,
      tradeLots,
      tradeLotsInteger,
      tradeLotsRemainderIdr,
      estimatedFeeIdr,
      action,
      tacticalSignal: tacticalSignals[item.asset.id],
      avgBuyPrice,
      unrealizedGainPercent,
      unrealizedGainIdr,
    };
  });

  // Step 4 (Bug 3): Dust Trade Filter (Anti-Dust Protection) executed BEFORE defensive sweep
  // Suppresses tiny negligible orders (< dustTradeThresholdIdr) into clean HOLDs
  // and adds suppressed dust BUY funds to totalUnallocatedRemainderIdr so they can be swept to defensive anchor or preserved
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
          totalUnallocatedRemainderIdr += item.tradeAmountIdr; // Bug 3 fix: add suppressed buy cash to remainder
        } else if (item.action === 'SELL') {
          totalSellIdr -= Math.abs(item.tradeAmountIdr);
        }
        const suppressedFee = item.estimatedFeeIdr ?? 0;
        if (suppressedFee > 0) {
          totalEstimatedFeeIdr = Math.max(0, totalEstimatedFeeIdr - suppressedFee);
        }
        item.action = 'HOLD';
        item.isDustFiltered = true;
        item.targetValueIdr = item.postShockValueIdr;
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

  // Step 5: Sweep unallocated lot & dust remainder to main defensive anchor (RDPT or RDPU) if active
  if (
    enableIdxLotRounding &&
    sweepRemainderToDefensive &&
    Math.abs(totalUnallocatedRemainderIdr) >= dustTradeThresholdIdr
  ) {
    const defensiveItem =
      items.find((i) => i.assetId === 'RDPT' && (effectiveTargetWeights.RDPT ?? 0) > 0) ??
      items.find((i) => i.assetId === 'RDPU' && (effectiveTargetWeights.RDPU ?? 0) > 0) ??
      items.find((i) => {
        const a = assets.find((asset) => asset.id === i.assetId);
        return (
          (a?.category === 'bonds' || a?.category === 'money-market') &&
          (effectiveTargetWeights[i.assetId] ?? 0) > 0
        );
      });

    if (defensiveItem) {
      const prevTradeAmount = defensiveItem.tradeAmountIdr;
      const proposedTradeAmount = prevTradeAmount + totalUnallocatedRemainderIdr;

      // In buy-only-dca, NEVER allow remainder sweep to turn defensive into a SELL order!
      if (rebalanceMode === 'buy-only-dca' && proposedTradeAmount < 0) {
        // Do not sweep negative remainder into defensive in DCA mode
      } else {
        defensiveItem.tradeAmountIdr = proposedTradeAmount;
        defensiveItem.tradeAmountUsd = Number(
          (proposedTradeAmount / Math.max(1, usdIdrRate)).toFixed(2)
        );
        defensiveItem.targetValueIdr = Math.round(defensiveItem.postShockValueIdr + proposedTradeAmount);
        totalUnallocatedRemainderIdr = 0; // Swept to defensive asset, reset remainder

        // Bug 2 fix: Use postShockUnitPriceIdr for unit-priced defensive assets
        const defComputed = computedHoldings.find((c) => c.asset.id === defensiveItem.assetId);
        const defPriceIdr = defComputed?.postShockUnitPriceIdr ?? 1;

        if (defensiveItem.isNominalOnly) {
          defensiveItem.tradeUnits = defensiveItem.tradeAmountIdr;
        } else {
          defensiveItem.tradeUnits = Number(
            (defensiveItem.tradeAmountIdr / Math.max(1e-6, defPriceIdr)).toFixed(4)
          );
        }

        if (defensiveItem.tradeAmountIdr > 10_000) {
          defensiveItem.action = 'BUY';
        } else if (defensiveItem.tradeAmountIdr < -10_000 && rebalanceMode !== 'buy-only-dca') {
          defensiveItem.action = 'SELL';
        } else {
          defensiveItem.action = 'HOLD';
        }

        // Adjust totals for the delta
        if (prevTradeAmount > 10_000) totalBuyIdr -= prevTradeAmount;
        else if (prevTradeAmount < -10_000) totalSellIdr -= Math.abs(prevTradeAmount);

        if (defensiveItem.tradeAmountIdr > 10_000) totalBuyIdr += defensiveItem.tradeAmountIdr;
        else if (defensiveItem.tradeAmountIdr < -10_000 && rebalanceMode !== 'buy-only-dca') {
          totalSellIdr += Math.abs(defensiveItem.tradeAmountIdr);
        }

        // Bug 2 fix: Recompute defensive fee and update totalEstimatedFeeIdr
        const prevDefFee = defensiveItem.estimatedFeeIdr ?? 0;
        let newDefFee = 0;
        if (enableBrokerFees && defensiveItem.action !== 'HOLD') {
          const absTrade = Math.abs(defensiveItem.tradeAmountIdr);
          const defAsset = assets.find((a) => a.id === defensiveItem.assetId);
          if (!defensiveItem.isNominalOnly && defAsset?.category === 'idx-equity') {
            newDefFee = Math.round(absTrade * (defensiveItem.action === 'BUY' ? 0.0015 : 0.0025));
          } else if (defAsset?.category === 'us-equity') {
            newDefFee = Math.round(absTrade * 0.001);
          } else if (defAsset?.category === 'crypto') {
            newDefFee = Math.round(absTrade * 0.0015);
          } else if (defAsset?.category === 'gold') {
            newDefFee = Math.round(absTrade * 0.001);
          }
        }
        defensiveItem.estimatedFeeIdr = newDefFee;
        totalEstimatedFeeIdr = Math.max(0, totalEstimatedFeeIdr - prevDefFee + newDefFee);
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
    tacticalBandActive: isAnyTiltApplied,
    tacticalAggressiveness: tacticalConfig?.aggressiveness,
    items,
  };
}

/**
 * Official Bursa Efek Indonesia (BEI) Price Tick Size (Fraksi Harga)
 * Regulation: Kep-00023/BEI/03-2020
 * 
 * - Price < Rp 200         : Tick = Rp 1
 * - Rp 200 - < Rp 500      : Tick = Rp 2
 * - Rp 500 - < Rp 2.000    : Tick = Rp 5
 * - Rp 2.000 - < Rp 5.000  : Tick = Rp 10
 * - Rp 5.000 ke atas       : Tick = Rp 25
 */
export function getIdxTickSize(price: number): number {
  if (price < 200) return 1;
  if (price < 500) return 2;
  if (price < 2000) return 5;
  if (price < 5000) return 10;
  return 25;
}

/**
 * Rounds an Indonesian stock price to the nearest valid BEI tick size.
 *
 * @param price Raw stock price in IDR
 * @param roundMode 'nearest' (default), 'floor' (conservative bid), or 'ceil'
 */
export function roundToIdxTick(
  price: number,
  roundMode: 'nearest' | 'floor' | 'ceil' = 'nearest'
): number {
  if (price <= 0) return 0;
  const tick = getIdxTickSize(price);
  if (roundMode === 'floor') {
    return Math.floor(price / tick) * tick;
  }
  if (roundMode === 'ceil') {
    return Math.ceil(price / tick) * tick;
  }
  return Math.round(price / tick) * tick;
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
  enableIdxLotRounding?: boolean;
  filterDustTrades?: boolean;
  tacticalConfig?: ValuationSentimentConfig;
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
    enableIdxLotRounding = true,
    filterDustTrades = true,
    tacticalConfig,
  } = params;

  const baseHolding = holdings[targetAsset.id];
  const currentPriceNative =
    baseHolding?.currentPrice && baseHolding.currentPrice > 0
      ? baseHolding.currentPrice
      : targetAsset.defaultPrice;

  return dropTiers.map((dropPercent) => {
    const multiplier = Math.max(0.05, 1 + dropPercent / 100);
    let limitPriceNative = Number((currentPriceNative * multiplier).toFixed(2));
    if (targetAsset.category === 'idx-equity' && !targetAsset.isNominalOnly) {
      limitPriceNative = roundToIdxTick(limitPriceNative, 'nearest');
    }
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
      enableIdxLotRounding,
      filterDustTrades,
      tacticalConfig,
    });

    const targetItem = plan.items.find((i) => i.assetId === targetAsset.id);
    const buyIdr = Math.max(0, targetItem?.tradeAmountIdr ?? 0);
    const rawUnits = buyIdr / Math.max(1, limitPriceIdr);
    const isNominalOnly = Boolean(
      baseHolding?.isNominalOnly ??
      targetAsset.isNominalOnly ??
      (targetAsset.category === 'bonds' || targetAsset.category === 'money-market')
    );

    // Bug 9 fix: Use already-calculated whole integer lots from plan if available to avoid double rounding down
    const buyLots =
      !isNominalOnly && targetAsset.lotSize === 100
        ? (targetItem?.tradeLotsInteger !== undefined
            ? Math.max(0, targetItem.tradeLotsInteger)
            : Math.floor(rawUnits / 100))
        : undefined;

    const buyUnits =
      isNominalOnly
        ? buyIdr
        : targetAsset.lotSize === 100
          ? (targetItem?.tradeUnits !== undefined
              ? Math.max(0, targetItem.tradeUnits)
              : (buyLots ?? 0) * 100)
          : targetAsset.allowFractional
            ? Number(rawUnits.toFixed(targetAsset.category === 'crypto' ? 8 : 4))
            : Math.round(rawUnits);

    const executedBuyIdr =
      !isNominalOnly && targetAsset.lotSize === 100
        ? (targetItem?.tradeAmountIdr !== undefined
            ? Math.max(0, targetItem.tradeAmountIdr)
            : Math.round(buyUnits * limitPriceIdr))
        : buyIdr;

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
      rebalanceBuyAmountIdr: executedBuyIdr,
      rebalanceBuyUnits: buyUnits,
      rebalanceBuyLots: buyLots,
      fundingFromDefensiveIdr: Math.round(fundingFromDefensiveIdr),
      postCrashPortfolioIdr: plan.postShockTotalIdr,
    };
  });
}

/**
 * Calculates updated average purchase price (cost basis / avgBuyPrice)
 * using the weighted average method:
 *   newAvg = ((oldUnits * oldCost) + (boughtUnits * buyPrice)) / (oldUnits + boughtUnits)
 *
 * Rules:
 * - Nominal assets (money market / bonds / cash): cost basis is always 1
 * - Liquidated positions (newTotalUnits <= 0): cost basis is cleared (undefined)
 * - SELL or HOLD actions: cost basis per unit remains unchanged
 * - Initial BUY (oldUnits <= 0): cost basis equals buyPrice
 * - Subsequent BUY: weighted average of previous cost basis and new purchase
 */
export function computeUpdatedAverageCostBasis(params: {
  prevUnits: number;
  prevAvgBuyPrice?: number;
  prevCurrentPrice: number;
  boughtUnits: number;
  buyPrice: number;
  newTotalUnits: number;
  isNominal?: boolean;
  category?: string;
}): number | undefined {
  const {
    prevUnits,
    prevAvgBuyPrice,
    prevCurrentPrice,
    boughtUnits,
    buyPrice,
    newTotalUnits,
    isNominal,
    category,
  } = params;

  if (isNominal) {
    return 1;
  }

  if (newTotalUnits <= 0) {
    return undefined;
  }

  // Cost basis does not change on SELL or HOLD
  if (boughtUnits <= 0) {
    return prevAvgBuyPrice;
  }

  const precision = category === 'crypto' ? 4 : 2;

  // Initial buy from zero units
  if (prevUnits <= 0) {
    return Number(buyPrice.toFixed(precision));
  }

  const oldCost =
    prevAvgBuyPrice !== undefined && prevAvgBuyPrice > 0
      ? prevAvgBuyPrice
      : prevCurrentPrice > 0
        ? prevCurrentPrice
        : buyPrice;

  const totalUnits = prevUnits + boughtUnits;
  if (totalUnits <= 0) {
    return Number(buyPrice.toFixed(precision));
  }

  const weightedSum = (prevUnits * oldCost) + (boughtUnits * buyPrice);
  const newAvg = weightedSum / totalUnits;
  return Number(newAvg.toFixed(precision));
}

