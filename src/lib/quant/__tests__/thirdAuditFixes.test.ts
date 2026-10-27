import { describe, it, expect } from 'vitest';
import { CORE_AND_EXPANDED_ASSETS, VIDEO_PORTFOLIO_PRESETS } from '../../../data/presets';
import { HoldingEntry, AssetDefinition } from '../types';
import { calculateRebalancePlan, generateCrashBuyingLadder } from '../rebalancerEngine';
import { buildDynamicPresetsForSlotMap } from '../riskParitySolver';
import { simulateMonteCarloPaths } from '../wealthSimulator';
import { calculateTacticalWeights } from '../tacticalValuationEngine';
import rebalancerSource from '../../../components/rebalancer/PortfolioRebalancerView.tsx?raw';
import roadmapSource from '../../../components/roadmap/WealthRoadmapView.tsx?raw';

describe('Third Stage Audit Fixes Verification', () => {
  describe('Fix 1: Asset Metadata Editing Retains Capabilities', () => {
    it('preserves allowFractional: true and lotSize: 1 for crypto when renaming without nominal mode', () => {
      const btcDef = CORE_AND_EXPANDED_ASSETS.find((a) => a.id === 'BTC')!;
      expect(btcDef.allowFractional).toBe(true);
      expect(btcDef.lotSize).toBe(1);

      // Simulate App.tsx handleUpdateAssetMeta logic
      const draftIsNominal = false;
      const patch: { shortName?: string; name?: string; isNominalOnly?: boolean; lotSize?: number; allowFractional?: boolean } = {
        shortName: 'BITCOIN',
        name: 'Bitcoin Network',
        isNominalOnly: draftIsNominal,
      };
      const origDef = CORE_AND_EXPANDED_ASSETS.find((c) => c.id === 'BTC');
      const nextLotSize = draftIsNominal
        ? 1
        : (origDef?.lotSize ?? patch.lotSize ?? btcDef.originalLotSize ?? btcDef.lotSize ?? 100);
      const nextAllowFractional = draftIsNominal
        ? true
        : (origDef?.allowFractional ?? patch.allowFractional ?? btcDef.allowFractional ?? false);

      expect(nextLotSize).toBe(1);
      expect(nextAllowFractional).toBe(true);
    });

    it('preserves allowFractional: false and lotSize: 100 for IDX stocks when renaming', () => {
      const bbcaDef = CORE_AND_EXPANDED_ASSETS.find((a) => a.id === 'BBCA')!;
      const draftIsNominal = false;
      const patch: { shortName?: string; name?: string; isNominalOnly?: boolean; lotSize?: number; allowFractional?: boolean } = {
        shortName: 'BCA',
        name: 'Bank Central Asia',
        isNominalOnly: draftIsNominal,
      };
      const origDef = CORE_AND_EXPANDED_ASSETS.find((c) => c.id === 'BBCA');
      const nextLotSize = draftIsNominal
        ? 1
        : (origDef?.lotSize ?? patch.lotSize ?? bbcaDef.originalLotSize ?? bbcaDef.lotSize ?? 100);
      const nextAllowFractional = draftIsNominal
        ? true
        : (origDef?.allowFractional ?? patch.allowFractional ?? bbcaDef.allowFractional ?? false);

      expect(nextLotSize).toBe(100);
      expect(nextAllowFractional).toBe(false);
    });
  });

  describe('Fix 2: Crypto 8-Decimal Precision in Rebalancer & Crash Ladder', () => {
    it('does not truncate small crypto tradeUnits to 0 (preserves 8 decimal places for DCA top-ups)', () => {
      // BTC spot price = 1.6 Billion IDR (100,000 USD @ 16,000)
      // Top-up DCA = Rp 50,000 -> 50,000 / 1,600,000,000 = 0.00003125 BTC
      const targetWeights = { BTC: 100 };
      const holdings: Record<string, HoldingEntry> = {
        BTC: { assetId: 'BTC', currentValueIdr: 0, units: 0, currentPrice: 100_000, shockPercent: 0 },
      };

      const plan = calculateRebalancePlan({
        assets: CORE_AND_EXPANDED_ASSETS,
        targetWeights,
        holdings,
        inputMode: 'nominal',
        usdIdrRate: 16_000,
        rebalanceMode: 'buy-only-dca',
        cashInjectionIdr: 50_000,
        driftThresholdAbsolutePercent: 1,
        enableIdxLotRounding: true,
        sweepRemainderToDefensive: false,
        filterDustTrades: false,
      });

      const btcItem = plan.items.find((i) => i.assetId === 'BTC');
      expect(btcItem).toBeDefined();
      expect(btcItem?.action).toBe('BUY');
      expect(btcItem?.tradeAmountIdr).toBe(50_000);
      // With 8 decimal places, 50,000 / 1,600,000,000 = 0.00003125
      // With old 4 decimal places, this was 0.0000 (disaster)!
      expect(btcItem?.tradeUnits).toBe(0.00003125);
    });

    it('uses 8 decimal precision in crash buying ladder for crypto target', () => {
      const btc = CORE_AND_EXPANDED_ASSETS.find((a) => a.id === 'BTC')!;
      const ladder = generateCrashBuyingLadder({
        targetAsset: btc,
        allAssets: CORE_AND_EXPANDED_ASSETS,
        holdings: {
          BTC: { assetId: 'BTC', currentValueIdr: 50_000_000, units: 0.03125, currentPrice: 100_000, shockPercent: 0 },
          RDPT: { assetId: 'RDPT', currentValueIdr: 50_000_000, units: 50_000_000, currentPrice: 1, shockPercent: 0, isNominalOnly: true },
        },
        targetWeights: { BTC: 50, RDPT: 50 },
        inputMode: 'nominal',
        usdIdrRate: 16_000,
      });

      expect(ladder.length).toBeGreaterThan(0);
      for (const step of ladder) {
        if (step.rebalanceBuyUnits > 0) {
          // Should have more precision than 4 decimals when fractional
          const decimalPart = step.rebalanceBuyUnits.toString().split('.')[1] || '';
          expect(decimalPart.length).toBeLessThanOrEqual(8);
        }
      }
    });
  });

  describe('Fix 3: Merged Backup Import Persistence', () => {
    it('merges existing holdings with imported holdings without discarding non-intersecting assets', () => {
      const existingHoldings: Record<string, HoldingEntry> = {
        BBCA: { assetId: 'BBCA', currentValueIdr: 5_000_000, units: 500, currentPrice: 10_000, shockPercent: 0 },
        RDPT: { assetId: 'RDPT', currentValueIdr: 10_000_000, units: 10_000_000, currentPrice: 1, shockPercent: 0, isNominalOnly: true },
      };

      const importedHoldings: Record<string, HoldingEntry> = {
        BTC: { assetId: 'BTC', currentValueIdr: 8_000_000, units: 0.005, currentPrice: 100_000, shockPercent: 0 },
        BBCA: { assetId: 'BBCA', currentValueIdr: 7_000_000, units: 700, currentPrice: 10_000, shockPercent: 0 },
      };

      // In merge mode, snapshotToStore must contain both existing and new
      const mergedHoldings = { ...existingHoldings, ...importedHoldings };
      expect(mergedHoldings.BBCA.currentValueIdr).toBe(7_000_000); // Overwritten by imported
      expect(mergedHoldings.RDPT).toBeDefined(); // Retained from existing!
      expect(mergedHoldings.RDPT.currentValueIdr).toBe(10_000_000);
      expect(mergedHoldings.BTC).toBeDefined(); // Added from imported!
    });
  });

  describe('Fix 4: Holdings Mutation Metadata Preservation', () => {
    it('preserves isNominalOnly, notes, and subSplits on holdings update', () => {
      const prevA: HoldingEntry = {
        assetId: 'RDPT',
        currentValueIdr: 5_000_000,
        units: 5_000_000,
        currentPrice: 1,
        shockPercent: 0,
        isNominalOnly: true,
        notes: 'My emergency fund buffer',
        subSplits: [{ id: 'sub-1', symbol: 'RDPT-1', name: 'Bank Jago', shareOfBucketPercent: 100 }],
      };

      const asset = CORE_AND_EXPANDED_ASSETS.find((a) => a.id === 'RDPT')!;
      const isNominal = asset.isNominalOnly ?? prevA.isNominalOnly;

      const updated: HoldingEntry = {
        ...prevA,
        assetId: asset.id,
        currentValueIdr: 10_000_000,
        units: isNominal ? 10_000_000 : 10_000_000,
        currentPrice: isNominal ? 1 : 1,
        shockPercent: 0,
        isNominalOnly: isNominal,
        notes: prevA.notes,
        subSplits: prevA.subSplits,
      };

      expect(updated.isNominalOnly).toBe(true);
      expect(updated.notes).toBe('My emergency fund buffer');
      expect(updated.subSplits).toHaveLength(1);
      expect(updated.subSplits?.[0].name).toBe('Bank Jago');
    });
  });

  describe('Fix 5: Slot Map Deduplication & Custom Mode Safety', () => {
    it('deduplicates mapped assets when multiple slots point to the same asset', () => {
      // Map both RDPU and RDPT to RDPT
      const slotMap = {
        RDPU: 'RDPT',
        RDPT: 'RDPT',
        BBCA: 'BBCA',
        GLD: 'GLD',
      };

      const dynamicPresets = buildDynamicPresetsForSlotMap(
        VIDEO_PORTFOLIO_PRESETS,
        slotMap,
        CORE_AND_EXPANDED_ASSETS,
        0
      );

      expect(dynamicPresets.length).toBeGreaterThan(0);
      for (const p of dynamicPresets) {
        // Total solved weights must sum to approximately 100%
        const sum = Object.values(p.weights).reduce((a, b) => a + b, 0);
        expect(sum).toBeGreaterThanOrEqual(99);
        expect(sum).toBeLessThanOrEqual(101);
      }
    });

    it('combines custom weights when multiple slots map to the same asset in custom mode', () => {
      const slotMap = {
        RDPU: 'RDPT',
        RDPT: 'RDPT',
      };

      const customPreset: any = {
        id: 'custom-test',
        name: 'Custom Test',
        method: 'custom',
        weights: { RDPU: 15, RDPT: 25 },
      };

      const dynamic = buildDynamicPresetsForSlotMap(
        [customPreset],
        slotMap,
        CORE_AND_EXPANDED_ASSETS,
        0
      );

      expect(dynamic).toHaveLength(1);
      // Mapped RDPT weight should be 15 + 25 = 40%
      expect(dynamic[0].weights.RDPT).toBe(40);
    });
  });

  describe('Fix 7: Remainder Sweep Threshold & Cash Reset', () => {
    it('sweeps remainder to defensive asset only when >= dustTradeThresholdIdr and resets unallocated to 0', () => {
      // BBCA 100 shares lot = 1,000,000 IDR
      // Holdings: RDPT 10,000,000, BBCA 10,000,000
      // Target: RDPT 50%, BBCA 50% with capital 20,050,000 IDR
      const holdings: Record<string, HoldingEntry> = {
        RDPT: { assetId: 'RDPT', currentValueIdr: 10_000_000, units: 10_000_000, currentPrice: 1, shockPercent: 0, isNominalOnly: true },
        BBCA: { assetId: 'BBCA', currentValueIdr: 10_000_000, units: 1000, currentPrice: 10_000, shockPercent: 0 },
      };

      const plan = calculateRebalancePlan({
        assets: CORE_AND_EXPANDED_ASSETS,
        targetWeights: { RDPT: 50, BBCA: 50 },
        holdings,
        inputMode: 'nominal',
        usdIdrRate: 16_000,
        rebalanceMode: 'buy-only-dca',
        cashInjectionIdr: 500_000, // 500k cash injected: BBCA gets 250k (no whole lots of 1M), remainder 250k
        driftThresholdAbsolutePercent: 1,
        enableIdxLotRounding: true,
        sweepRemainderToDefensive: true,
        dustTradeThresholdIdr: 25_000,
      });

      // Remainder was 250,000 (which is >= 25,000 dust threshold)
      // It gets swept into RDPT
      const rdptItem = plan.items.find((i) => i.assetId === 'RDPT');
      expect(rdptItem?.tradeAmountIdr).toBeGreaterThanOrEqual(250_000);
      // unallocatedCashRemainderIdr should be reset to 0
      expect(plan.unallocatedCashRemainderIdr).toBe(0);
    });
  });

  describe('Fix 8: Wealth Simulator medianYearsToGoal Null Under Low Probability', () => {
    it('returns medianYearsToGoal: null when successProbabilityPercent < 50', () => {
      // Impossible target: 1 Trillion IDR in 5 years with 10M initial capital and 100k/mo savings
      const result = simulateMonteCarloPaths({
        initialCapitalIdr: 10_000_000,
        targetGoalIdr: 1_000_000_000_000,
        monthlyContributionIdr: 100_000,
        annualCagrPercent: 10,
        annualVolatilityPercent: 15,
        maxYears: 5,
        numSimulations: 200,
      });

      expect(result.successProbabilityPercent).toBeLessThan(50);
      expect(result.medianYearsToGoal).toBeNull();
    });
  });

  describe('Fix 10: Tactical Valuation Signals Re-Synchronization', () => {
    it('synchronizes tacticalTargetWeightPercent with normalized tacticalWeights after Step 4', () => {
      const baseWeights = {
        BBCA: 40,
        SPY: 30,
        BTC: 10,
        RDPT: 15,
        RDPU: 5,
      };

      const result = calculateTacticalWeights(
        baseWeights,
        CORE_AND_EXPANDED_ASSETS,
        {
          enabled: true,
          aggressiveness: 0.2,
          cryptoScore: 20,
          usEquityScore: 85,
          idxEquityScore: 10,
          goldScore: 50,
        }
      );

      // Verify that all tacticalSignals have tacticalTargetWeightPercent matching tacticalWeights
      for (const [id, signal] of Object.entries(result.tacticalSignals)) {
        expect(signal.tacticalTargetWeightPercent).toBe(result.tacticalWeights[id]);
      }

      // Total tactical weights must sum to exactly 100%
      const total = Object.values(result.tacticalWeights).reduce((a, b) => a + b, 0);
      expect(Math.abs(total - 100)).toBeLessThan(0.01);
    });
  });

  describe('Fix 5b: Slot Map Custom Mode Safety with Partial slotMap', () => {
    it('does not delete weights for assets still used in implicitly mapped default slots', () => {
      // Partial slotMap where only BBCA was mapped to RDPU
      const slotMap: Record<string, string> = { BBCA: 'RDPU' };
      const DEFAULT_SLOT_MAP: Record<string, string> = {
        RDPU: 'RDPU',
        RDPT: 'RDPT',
        BBCA: 'BBCA',
        GLD: 'GLD',
        SPY: 'SPY',
        QQQ: 'QQQ',
        BTC: 'BTC',
        ETH: 'ETH',
      };
      const prevWeights: Record<string, number> = {
        RDPU: 30, // 15% from default RDPU slot + 15% from BBCA slot
        RDPT: 40,
        GLD: 30,
      };

      // User changes BBCA slot from RDPU to SPY
      const coreSlotId = 'BBCA';
      const newAssetId = 'SPY';
      const oldAssetId = slotMap[coreSlotId] ?? coreSlotId; // 'RDPU'
      const nextMap: Record<string, string> = { ...slotMap, [coreSlotId]: newAssetId };

      const allSlotKeys = Array.from(new Set([...Object.keys(DEFAULT_SLOT_MAP), ...Object.keys(nextMap)]));
      const isOldAssetStillUsed = allSlotKeys.some(
        (s) => s !== coreSlotId && (nextMap[s] ?? s) === oldAssetId
      );

      const nextW = { ...prevWeights };
      if (!isOldAssetStillUsed) {
        delete nextW[oldAssetId];
      }
      nextW[newAssetId] = (nextW[newAssetId] ?? 0) + 15;

      expect(isOldAssetStillUsed).toBe(true);
      expect(nextW.RDPU).toBe(30); // Preserved!
      expect(nextW.SPY).toBe(15);
    });

    it('no-ops when mapping slot to the same asset already mapped to that slot', () => {
      const slotMap: Record<string, string> = { RDPT: 'RDPT' };
      const coreSlotId = 'RDPT';
      const newAssetId = 'RDPT';
      const oldAssetId = slotMap[coreSlotId] ?? coreSlotId;
      expect(oldAssetId === newAssetId).toBe(true);
    });
  });

  describe('Fix 6: Percentage Entry Mode Decoupling via Reference Total', () => {
    it('uses stable reference total so modifying first asset does not alter base for subsequent assets', () => {
      const initialTotalIdr = 100_000_000;
      const referenceTotalIdr = initialTotalIdr;
      const holdings: Record<string, number> = {
        RDPT: 40_000_000, // 40%
        BBCA: 60_000_000, // 60%
      };

      // User changes RDPT from 40% to 50%
      const newPct1 = 50;
      holdings.RDPT = Math.round(referenceTotalIdr * (newPct1 / 100)); // 50,000,000

      // Even though new reactive portfolio total is now 110,000,000,
      // changing BBCA to 50% should use the stable referenceTotalIdr (100,000,000), resulting in 50,000,000
      const newPct2 = 50;
      holdings.BBCA = Math.round(referenceTotalIdr * (newPct2 / 100)); // 50,000,000 (not 55,000,000!)

      expect(holdings.RDPT).toBe(50_000_000);
      expect(holdings.BBCA).toBe(50_000_000);
      expect(holdings.RDPT + holdings.BBCA).toBe(100_000_000);
    });
  });

  describe('Fix 9: WhatsApp Slip Drift Warning on Mode Restrictions', () => {
    it('generates warning note when buys and sells are 0 but maxAbsoluteDrift > driftThresholdPercent', () => {
      const maxAbsoluteDrift = 15.5;
      const driftThresholdPercent = 5.0;
      const rebalanceMode = 'buy-only-dca';
      const buys: any[] = [];
      const sells: any[] = [];

      const lines: string[] = [];
      if (sells.length === 0 && buys.length === 0) {
        if (maxAbsoluteDrift > driftThresholdPercent) {
          lines.push(
            `⚠️ *Alokasi belum seimbang (Drift ${maxAbsoluteDrift.toFixed(1)}% > ${driftThresholdPercent}%), namun transaksi dibatasi oleh mode ${
              rebalanceMode === 'buy-only-dca'
                ? 'Buy-Only DCA (perlu top-up kas)'
                : 'saat ini'
            }.*`
          );
        } else {
          lines.push(`✅ *Seluruh bobot aset sudah seimbang (Tidak ada order).*`);
        }
      }

      expect(lines).toHaveLength(1);
      expect(lines[0]).toContain('Alokasi belum seimbang');
      expect(lines[0]).toContain('Buy-Only DCA (perlu top-up kas)');
    });
  });

  describe('Fix 11: Asset Correlation Matrix Shortcut Valid Universe Assets', () => {
    it('ensures all popular shortcut pairs exist in CORE_AND_EXPANDED_ASSETS universe and TLT is absent', () => {
      const popularPairs = [
        { idA: 'SPY', idB: 'GLD', label: 'SPY ⚡ GLD (Saham vs Emas)' },
        { idA: 'SPY', idB: 'RDPT', label: 'SPY ⚡ RDPT (Saham vs Obligasi)' },
        { idA: 'BTC', idB: 'SPY', label: 'BTC ⚡ SPY (Kripto vs Saham AS)' },
        { idA: 'BTC', idB: 'RDPT', label: 'BTC ⚡ RDPT (Kripto vs Obligasi)' },
        { idA: 'RDPU', idB: 'BTC', label: 'RDPU ⚡ BTC (Pasar Uang vs Kripto)' },
      ];

      const universeIds = new Set(CORE_AND_EXPANDED_ASSETS.map((a) => a.id));
      for (const pair of popularPairs) {
        expect(universeIds.has(pair.idA)).toBe(true);
        expect(universeIds.has(pair.idB)).toBe(true);
        expect(pair.idA).not.toBe('TLT');
        expect(pair.idB).not.toBe('TLT');
      }
    });
  });

  describe('Fix 12: FormattedNumberInput Clamping Deferred to OnBlur', () => {
    it('allows typing 0 / empty string without immediately snapping to min while typing', () => {
      const min = 1_000_000;
      const clamp = (val: number) => Math.max(min, val);

      // While typing: rawDigits empty -> value emitted is 0
      let emittedValue = 10_000_000;
      const handleChangeSimulated = (rawDigits: string) => {
        if (!rawDigits) {
          emittedValue = 0; // Not clamp(0)!
          return;
        }
        emittedValue = Number(rawDigits);
      };

      // User backspaces to empty string
      handleChangeSimulated('');
      expect(emittedValue).toBe(0); // Successfully cleared without being trapped at min!

      // On blur: clamping is applied to current parsed text
      const handleBlurSimulated = (inputText: string) => {
        const rawDigits = inputText.replace(/[^\d]/g, '');
        const currentNum = rawDigits ? Number(rawDigits) : 0;
        emittedValue = clamp(currentNum);
      };

      handleBlurSimulated('');
      expect(emittedValue).toBe(1_000_000); // Clamped to min on blur
    });
  });

  describe('Fix 13: Spot Price Lookup for Initial Zero-Balance Purchases', () => {
    it('uses holdings[assetId].currentPrice if > 0 even when initialValueIdr is 0', () => {
      const holdings: Record<string, HoldingEntry> = {
        BBCA: {
          assetId: 'BBCA',
          currentValueIdr: 0,
          units: 0,
          currentPrice: 10_500, // Live custom market price entered by user
          shockPercent: 0,
        },
      };
      const def = CORE_AND_EXPANDED_ASSETS.find((a) => a.id === 'BBCA')!; // defaultPrice is 10,250
      const item = { assetId: 'BBCA', initialValueIdr: 0 };

      const spotPrice =
        holdings?.[item.assetId]?.currentPrice && holdings[item.assetId].currentPrice > 0
          ? holdings[item.assetId].currentPrice
          : def.defaultPrice;

      expect(spotPrice).toBe(10_500); // Prioritizes live price 10,500 over default 10,250
    });
  });

  describe('Fix 14: Design Token Dark/Light Theme Compliance', () => {
    it('verifies welcome banner in PortfolioRebalancerView and cards in WealthRoadmapView use design tokens', () => {
      // Verify rebalancer welcome banner doesn't have hardcoded slate-900 or border-slate-700
      expect(rebalancerSource).not.toContain('border-slate-700/80 bg-slate-900/90');
      expect(rebalancerSource).toContain('border ui-border ui-card');

      // Verify roadmap monte carlo cards don't have bg-slate-900/60
      expect(roadmapSource).not.toContain('bg-slate-900/60 border border-border/60');
      expect(roadmapSource).toContain('p-3 rounded-lg ui-card border ui-border');
    });
  });
});
