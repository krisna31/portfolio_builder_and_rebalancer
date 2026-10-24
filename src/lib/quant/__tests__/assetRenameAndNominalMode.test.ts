import { describe, it, expect } from 'vitest';
import { CORE_AND_EXPANDED_ASSETS } from '../../../data/presets';
import { AssetDefinition, HoldingEntry } from '../types';
import { calculateRebalancePlan, generateCrashBuyingLadder } from '../rebalancerEngine';
import { parseHoldingsText, exportHoldingsToText, utf8ToBase64, base64ToUtf8 } from '../textDataParser';

describe('Asset Rename, Ticker Customization & Mode Reksa Dana Nominal', () => {
  const baseBbca = CORE_AND_EXPANDED_ASSETS.find((a) => a.id === 'BBCA')!;

  it('preserves renamed metadata and original benchmark fields on customization', () => {
    // Simulate user renaming BBCA to RDS (Reksa Dana Saham) and switching to nominal mode
    const customizedBbca: AssetDefinition = {
      ...baseBbca,
      shortName: 'RDS',
      name: 'Reksa Dana Saham',
      isNominalOnly: true,
      lotSize: 1,
      allowFractional: true,
      originalName: baseBbca.name,
      originalShortName: baseBbca.shortName,
      originalLotSize: baseBbca.lotSize,
      isRenamed: true,
    };

    expect(customizedBbca.shortName).toBe('RDS');
    expect(customizedBbca.name).toBe('Reksa Dana Saham');
    expect(customizedBbca.originalShortName).toBe('BBCA');
    expect(customizedBbca.originalName).toBe(baseBbca.name);
    expect(customizedBbca.isNominalOnly).toBe(true);
    expect(customizedBbca.isRenamed).toBe(true);
    expect(customizedBbca.originalLotSize).toBe(100);
  });

  it('bypasses 100-share BEI lot rounding when isNominalOnly is true on an equity proxy', () => {
    // 1. Standard BBCA (IDX Stock): 100-share lots, Rp 10.000 / share = Rp 1.000.000 / lot
    const standardBbca: AssetDefinition = {
      ...baseBbca,
      defaultPrice: 10_000,
      lotSize: 100,
      isNominalOnly: false,
    };

    const assetsWithStandard = [standardBbca];
    const holdingsStandard: Record<string, HoldingEntry> = {
      BBCA: {
        assetId: 'BBCA',
        currentValueIdr: 0,
        units: 0,
        currentPrice: 10_000,
        shockPercent: 0,
      },
    };

    // Allocate Rp 1.500.000 (1.5 lots -> should round down to 1 lot = Rp 1.000.000, leaving Rp 500.000 remainder)
    const planStandard = calculateRebalancePlan({
      assets: assetsWithStandard,
      targetWeights: { BBCA: 100 },
      holdings: holdingsStandard,
      inputMode: 'nominal',
      rebalanceMode: 'sell-and-buy',
      cashInjectionIdr: 1_500_000,
      driftThresholdAbsolutePercent: 5,
      enableIdxLotRounding: true,
      sweepRemainderToDefensive: false,
      usdIdrRate: 16_000,
    });

    const standardItem = planStandard.items.find((i) => i.assetId === 'BBCA')!;
    expect(standardItem.tradeLotsInteger).toBe(1);
    expect(standardItem.tradeUnits).toBe(100);
    expect(standardItem.tradeAmountIdr).toBe(1_000_000);
    expect(standardItem.tradeLotsRemainderIdr).toBe(500_000);
    expect(planStandard.unallocatedCashRemainderIdr).toBe(500_000);

    // 2. Customized BBCA -> RDS (Reksa Dana Saham Nominal Mode): Pure nominal IDR
    const nominalRds: AssetDefinition = {
      ...baseBbca,
      shortName: 'RDS',
      name: 'Reksa Dana Saham',
      isNominalOnly: true,
      lotSize: 1,
      allowFractional: true,
      originalShortName: 'BBCA',
      isRenamed: true,
    };

    const assetsWithRds = [nominalRds];
    const holdingsRds: Record<string, HoldingEntry> = {
      BBCA: {
        assetId: 'BBCA',
        currentValueIdr: 0,
        units: 0,
        currentPrice: 1,
        shockPercent: 0,
        isNominalOnly: true,
      },
    };

    const planRds = calculateRebalancePlan({
      assets: assetsWithRds,
      targetWeights: { BBCA: 100 },
      holdings: holdingsRds,
      inputMode: 'nominal',
      rebalanceMode: 'sell-and-buy',
      cashInjectionIdr: 1_500_000,
      driftThresholdAbsolutePercent: 5,
      enableIdxLotRounding: true,
      sweepRemainderToDefensive: false,
      usdIdrRate: 16_000,
    });

    const rdsItem = planRds.items.find((i) => i.assetId === 'BBCA')!;
    // When isNominalOnly is true:
    // a. Symbol displays the renamed shortName 'RDS'
    expect(rdsItem.symbol).toBe('RDS');
    // b. Trade amount is executed in full without 100-share lot truncations
    expect(rdsItem.tradeAmountIdr).toBe(1_500_000);
    expect(rdsItem.tradeUnits).toBe(1_500_000);
    expect(rdsItem.tradeLots).toBeUndefined();
    expect(rdsItem.tradeLotsInteger).toBeUndefined();
    expect(rdsItem.tradeLotsRemainderIdr).toBeUndefined();
    expect(planRds.unallocatedCashRemainderIdr).toBe(0);
  });

  it('handles crash buying ladder accurately for nominal assets without lot rounding', () => {
    const nominalRds: AssetDefinition = {
      ...baseBbca,
      shortName: 'RDS',
      name: 'Reksa Dana Saham',
      isNominalOnly: true,
      lotSize: 1,
      allowFractional: true,
    };

    const ladder = generateCrashBuyingLadder({
      targetAsset: nominalRds,
      allAssets: [nominalRds],
      targetWeights: { BBCA: 100 },
      holdings: {
        BBCA: {
          assetId: 'BBCA',
          currentValueIdr: 10_000_000,
          units: 10_000_000,
          currentPrice: 1,
          shockPercent: 0,
          isNominalOnly: true,
        },
      },
      inputMode: 'nominal',
      usdIdrRate: 16_000,
      extraCashIdr: 2_000_000,
      dropTiers: [-10, -20],
    });

    expect(ladder.length).toBe(2);
    // For nominal asset, buyLots should be undefined and buyUnits matches IDR amount
    expect(ladder[0].rebalanceBuyLots).toBeUndefined();
    expect(ladder[0].rebalanceBuyUnits).toBeGreaterThan(0);
    expect(ladder[0].rebalanceBuyAmountIdr).toBe(ladder[0].rebalanceBuyUnits);
  });

  it('recognizes both renamed ticker (RDS) and original benchmark (BBCA) in spreadsheet text parser', () => {
    const nominalRds: AssetDefinition = {
      ...baseBbca,
      shortName: 'RDS',
      name: 'Reksa Dana Saham',
      originalShortName: 'BBCA',
      isNominalOnly: true,
      isRenamed: true,
    };

    const assets = [nominalRds];

    // Case 1: User types newly renamed ticker "RDS 15.000.000"
    const text1 = 'RDS 15.000.000';
    const result1 = parseHoldingsText(text1, assets);
    expect(result1.items.length).toBe(1);
    expect(result1.items[0].isRecognized).toBe(true);
    expect(result1.items[0].assetId).toBe('BBCA');
    expect(result1.items[0].nominalIdr).toBe(15_000_000);

    // Case 2: User types original benchmark ticker "BBCA 25 Juta"
    const text2 = 'BBCA 25 Juta';
    const result2 = parseHoldingsText(text2, assets);
    expect(result2.items.length).toBe(1);
    expect(result2.items[0].isRecognized).toBe(true);
    expect(result2.items[0].assetId).toBe('BBCA');
    expect(result2.items[0].nominalIdr).toBe(25_000_000);
  });

  it('serializes and deserializes customizedCoreAssets and allAssets in backup payload', () => {
    const customizedBbca: AssetDefinition = {
      ...baseBbca,
      shortName: 'RDS',
      name: 'Reksa Dana Saham',
      isNominalOnly: true,
      lotSize: 1,
      allowFractional: true,
      originalShortName: 'BBCA',
      originalName: 'Bank Central Asia',
      isRenamed: true,
    };

    const allAssetsList = CORE_AND_EXPANDED_ASSETS.map((a) =>
      a.id === 'BBCA' ? customizedBbca : a
    );

    // Simulated backup export
    const backup = {
      version: 2,
      app: 'QuantPorto',
      exportedAt: new Date().toISOString(),
      data: {
        menu1_builder: {
          activeWeights: { BBCA: 15, RDPT: 85 },
          customizedCoreAssets: [customizedBbca],
          allAssets: allAssetsList,
        },
        menu2_rebalancer: {
          holdings: {},
          rebalanceHistory: [],
        },
        menu3_simulator: {},
        global: {
          usdIdrRate: 16_000,
          savedPortfolios: [],
        },
      },
    };

    // Serialize to JSON and parse back
    const jsonStr = JSON.stringify(backup);
    const parsed = JSON.parse(jsonStr);

    const restoredCustomCore = parsed.data.menu1_builder.customizedCoreAssets[0];
    expect(restoredCustomCore.id).toBe('BBCA');
    expect(restoredCustomCore.shortName).toBe('RDS');
    expect(restoredCustomCore.name).toBe('Reksa Dana Saham');
    expect(restoredCustomCore.isNominalOnly).toBe(true);
    expect(restoredCustomCore.isRenamed).toBe(true);
    expect(restoredCustomCore.originalShortName).toBe('BBCA');

    // Simulate import merge
    const restoredMap = new Map(
      parsed.data.menu1_builder.allAssets.map((a: AssetDefinition) => [a.id, a])
    );
    const merged = CORE_AND_EXPANDED_ASSETS.map((curr) => {
      const s = restoredMap.get(curr.id) as AssetDefinition | undefined;
      if (!s) return curr;
      return {
        ...curr,
        name: s.name ?? curr.name,
        shortName: s.shortName ?? curr.shortName,
        isNominalOnly: s.isNominalOnly !== undefined ? s.isNominalOnly : curr.isNominalOnly,
        originalShortName: s.originalShortName ?? curr.shortName,
        isRenamed: Boolean(s.isRenamed),
      };
    });

    const restoredBbca = merged.find((a) => a.id === 'BBCA')!;
    expect(restoredBbca.shortName).toBe('RDS');
    expect(restoredBbca.name).toBe('Reksa Dana Saham');
    expect(restoredBbca.isNominalOnly).toBe(true);
    expect(restoredBbca.isRenamed).toBe(true);
  });

  it('encodes and restores renamedAssets across URL hash share payload', () => {
    const customizedBbca: AssetDefinition = {
      ...baseBbca,
      shortName: 'RDS',
      name: 'Reksa Dana Saham',
      isNominalOnly: true,
      lotSize: 1,
      allowFractional: true,
      originalShortName: 'BBCA',
      isRenamed: true,
    };

    const renamedAssets = [
      {
        id: customizedBbca.id,
        shortName: customizedBbca.shortName,
        name: customizedBbca.name,
        isNominalOnly: Boolean(customizedBbca.isNominalOnly),
        lotSize: customizedBbca.lotSize,
        allowFractional: customizedBbca.allowFractional,
      },
    ];

    // Encode to base64 share hash
    const sharePayload = {
      weights: { BBCA: 20, RDPT: 80 },
      presetId: null,
      renamedAssets,
    };

    const encoded = utf8ToBase64(JSON.stringify(sharePayload));
    expect(typeof encoded).toBe('string');

    // Decode from base64 share hash
    const decoded = JSON.parse(base64ToUtf8(encoded));
    expect(decoded.renamedAssets).toBeDefined();
    expect(decoded.renamedAssets[0].id).toBe('BBCA');
    expect(decoded.renamedAssets[0].shortName).toBe('RDS');
    expect(decoded.renamedAssets[0].name).toBe('Reksa Dana Saham');
    expect(decoded.renamedAssets[0].isNominalOnly).toBe(true);
  });

  it('formats plain text broker order slip for nominal assets without lot string', () => {
    const item = {
      assetId: 'BBCA',
      symbol: 'RDS',
      tradeAmountIdr: 1_500_000,
      isNominalOnly: true,
      action: 'BUY' as const,
    };
    const isDone = '[ ]';
    const actionStr = item.action === 'BUY' ? 'BELI' : 'JUAL';
    const formatted = `${isDone} ${actionStr} ${item.symbol} - Rp ${item.tradeAmountIdr.toLocaleString('id-ID')}`;

    expect(formatted).toBe('[ ] BELI RDS - Rp 1.500.000');
    expect(formatted).not.toContain('Lot');
    expect(formatted).not.toContain('lembar');
  });

  it('restores lotSize to 100 and allowFractional to false when unchecking nominal mode', () => {
    // 1. Customized to nominal
    const customizedBbca: AssetDefinition = {
      ...baseBbca,
      shortName: 'RDS',
      name: 'Reksa Dana Saham',
      isNominalOnly: true,
      lotSize: 1,
      allowFractional: true,
      originalShortName: 'BBCA',
      originalLotSize: 100,
      isRenamed: true,
    };

    // 2. User unchecks Mode Reksa Dana Nominal
    const nextIsNominal = false;
    const nextLotSize = nextIsNominal ? 1 : (baseBbca.lotSize ?? customizedBbca.originalLotSize ?? 100);
    const nextAllowFractional = nextIsNominal ? true : (baseBbca.allowFractional ?? false);

    expect(nextLotSize).toBe(100);
    expect(nextAllowFractional).toBe(false);
  });

  it('exempts nominal assets from IDX stock broker fees and taxes', () => {
    const nominalRds: AssetDefinition = {
      ...baseBbca,
      shortName: 'RDS',
      name: 'Reksa Dana Saham',
      isNominalOnly: true,
      lotSize: 1,
      allowFractional: true,
    };

    const plan = calculateRebalancePlan({
      assets: [nominalRds],
      targetWeights: { BBCA: 100 },
      holdings: {
        BBCA: {
          assetId: 'BBCA',
          currentValueIdr: 0,
          units: 0,
          currentPrice: 1,
          shockPercent: 0,
          isNominalOnly: true,
        },
      },
      inputMode: 'nominal',
      rebalanceMode: 'sell-and-buy',
      cashInjectionIdr: 10_000_000,
      driftThresholdAbsolutePercent: 5,
      enableBrokerFees: true,
      usdIdrRate: 16_000,
    });

    // Even though category is idx-equity, isNominalOnly bypasses broker fee
    expect(plan.totalEstimatedFeeIdr).toBe(0);
  });

  it('correctly sets priceNative to 1 and units to nominal for nominal-only assets in parseHoldingsText', () => {
    const nominalRds: AssetDefinition = {
      ...baseBbca,
      shortName: 'RDS',
      name: 'Reksa Dana Saham',
      isNominalOnly: true,
    };

    const parsed = parseHoldingsText('RDS 15.000.000', [nominalRds]);
    expect(parsed.items.length).toBe(1);
    expect(parsed.items[0].isRecognized).toBe(true);
    expect(parsed.items[0].nominalIdr).toBe(15_000_000);
    expect(parsed.items[0].priceNative).toBe(1);
    expect(parsed.items[0].units).toBe(15_000_000);
  });

  it('exports renamed ticker and omits unit count for nominal assets in exportHoldingsToText', () => {
    const nominalRds: AssetDefinition = {
      ...baseBbca,
      shortName: 'RDS',
      symbol: 'RDS',
      name: 'Reksa Dana Saham',
      isNominalOnly: true,
    };

    const text = exportHoldingsToText(
      {
        BBCA: {
          assetId: 'BBCA',
          currentValueIdr: 15_000_000,
          units: 15_000_000,
          currentPrice: 1,
          shockPercent: 0,
          isNominalOnly: true,
        },
      },
      [nominalRds],
      'summary'
    );

    expect(text).toContain('*RDS*');
    expect(text).toContain('Rp 15.000.000');
    // Must NOT contain spurious unit count like (15000000 unit)
    expect(text).not.toContain('unit');
    expect(text).not.toContain('Lot');
  });
});
