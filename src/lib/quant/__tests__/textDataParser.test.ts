import { describe, expect, it } from 'vitest';
import {
  parseFinancialNumber,
  parseHoldingsText,
  exportHoldingsToText,
  serializeBackupPayload,
  parseBackupPayload,
  utf8ToBase64,
  base64ToUtf8,
} from '../textDataParser';
import { CORE_AND_EXPANDED_ASSETS } from '../../../data/presets';
import { QuantPortoBackupPayload, HoldingEntry } from '../types';

describe('textDataParser - Financial Number Parsing', () => {
  it('parses basic numbers and standard formats correctly', () => {
    expect(parseFinancialNumber('10000000').value).toBe(10_000_000);
    expect(parseFinancialNumber('10.000.000').value).toBe(10_000_000);
    expect(parseFinancialNumber('10,000,000').value).toBe(10_000_000);
    expect(parseFinancialNumber('0.05').value).toBe(0.05);
  });

  it('parses Indonesian informal suffixes (jt, juta, rb, k, m, miliar)', () => {
    expect(parseFinancialNumber('15jt').value).toBe(15_000_000);
    expect(parseFinancialNumber('2.5 juta').value).toBe(2_500_000);
    expect(parseFinancialNumber('500rb').value).toBe(500_000);
    expect(parseFinancialNumber('100k').value).toBe(100_000);
    expect(parseFinancialNumber('1M').value).toBe(1_000_000_000); // 1 Miliar
    expect(parseFinancialNumber('2.5 miliar').value).toBe(2_500_000_000);
  });

  it('detects lots, units, and currency symbols', () => {
    const lotRes = parseFinancialNumber('10 lot');
    expect(lotRes.value).toBe(10);
    expect(lotRes.isLot).toBe(true);

    const unitRes = parseFinancialNumber('500 lbr');
    expect(unitRes.value).toBe(500);
    expect(unitRes.isUnit).toBe(true);

    const usdRes = parseFinancialNumber('$500');
    expect(usdRes.value).toBe(500);
    expect(usdRes.isUsd).toBe(true);

    const rpRes = parseFinancialNumber('Rp 25.000.000');
    expect(rpRes.value).toBe(25_000_000);
  });
});

describe('textDataParser - Holdings Text Parser', () => {
  it('parses natural Indonesian text lines', () => {
    const text = `
      BBCA 15jt
      RDPT Rp 20.000.000
      GLD 10.000.000
    `;
    const res = parseHoldingsText(text, CORE_AND_EXPANDED_ASSETS, 'nominal', 18000);
    expect(res.recognizedCount).toBe(3);
    expect(res.items[0].assetId).toBe('BBCA');
    expect(res.items[0].nominalIdr).toBe(15_000_000);
    expect(res.items[1].assetId).toBe('RDPT');
    expect(res.items[1].nominalIdr).toBe(20_000_000);
    expect(res.items[2].assetId).toBe('GLD');
    expect(res.items[2].nominalIdr).toBe(10_000_000);
  });

  it('parses Excel TSV (tab-separated) lines and lot keywords', () => {
    const tsv = `Symbol\tAsset Name\tValue
BBCA\tBank BCA\t10 lot
BTC\tBitcoin\t0.05
UNKNOWN_COIN\tUnknown\t1.000.000`;

    const res = parseHoldingsText(tsv, CORE_AND_EXPANDED_ASSETS, 'nominal', 18000);
    expect(res.items).toHaveLength(3);
    // BBCA with 10 lot (lotSize=100) -> 1000 shares
    expect(res.items[0].assetId).toBe('BBCA');
    expect(res.items[0].units).toBe(1000);
    expect(res.items[0].lots).toBe(10);

    // BTC 0.05 units
    expect(res.items[1].assetId).toBe('BTC');
    expect(res.items[1].units).toBe(0.05);

    // UNKNOWN_COIN
    expect(res.items[2].assetId).toBeNull();
    expect(res.items[2].isRecognized).toBe(false);
    expect(res.items[2].warning).toBeDefined();
  });

  it('skips comments and headers', () => {
    const text = `
      # Catatan Portofolio Saya
      // Broker Stockbit
      Ticker,Nominal
      BBCA, 5000000
    `;
    const res = parseHoldingsText(text, CORE_AND_EXPANDED_ASSETS, 'nominal', 18000);
    expect(res.items).toHaveLength(1);
    expect(res.items[0].assetId).toBe('BBCA');
    expect(res.items[0].nominalIdr).toBe(5_000_000);
  });
});

describe('textDataParser - Export Holdings', () => {
  const dummyHoldings: Record<string, HoldingEntry> = {
    BBCA: {
      assetId: 'BBCA',
      currentValueIdr: 20_000_000,
      units: 2000,
      currentPrice: 10000,
      shockPercent: 0,
    },
    BTC: {
      assetId: 'BTC',
      currentValueIdr: 15_000_000,
      units: 0.015,
      currentPrice: 1_000_000_000,
      shockPercent: 0,
    },
  };

  it('exports to TSV for Excel', () => {
    const tsv = exportHoldingsToText(dummyHoldings, CORE_AND_EXPANDED_ASSETS, 'tsv');
    expect(tsv).toContain('Symbol\tAsset Name');
    expect(tsv).toContain('BBCA');
    expect(tsv).toContain('20000000');
    expect(tsv).toContain('BTC');
  });

  it('exports to CSV', () => {
    const csv = exportHoldingsToText(dummyHoldings, CORE_AND_EXPANDED_ASSETS, 'csv');
    expect(csv).toContain('Symbol,Asset Name');
    expect(csv).toContain('BBCA');
    expect(csv).toContain('20000000');
  });

  it('exports to Summary text', () => {
    const summary = exportHoldingsToText(dummyHoldings, CORE_AND_EXPANDED_ASSETS, 'summary');
    expect(summary).toContain('HOLDING PORTOFOLIO');
    expect(summary).toContain('BBCA');
    expect(summary).toContain('20.000.000');
  });
});

describe('textDataParser - Backup Payload Serialization & Parsing', () => {
  const dummyPayload: QuantPortoBackupPayload = {
    version: 2,
    app: 'QuantPorto',
    exportedAt: '2026-10-22T00:00:00.000Z',
    data: {
      menu1_builder: {
        activeWeights: { BBCA: 50, BTC: 50 },
        activePresetId: 'opt-custom',
        allocationMethod: 'risk-parity',
      },
      menu2_rebalancer: {
        holdings: {
          BBCA: {
            assetId: 'BBCA',
            currentValueIdr: 50_000_000,
            units: 5000,
            currentPrice: 10000,
            shockPercent: 0,
          },
        },
        rebalanceHistory: [],
        inputMode: 'nominal',
      },
      menu3_simulator: {
        initialCapitalIdr: 100_000_000,
        targetGoalIdr: 1_000_000_000,
        monthlySavingsIdr: 3_000_000,
      },
      global: {
        usdIdrRate: 18000,
        savedPortfolios: [],
      },
    },
  };

  it('serializes and parses JSON text correctly', () => {
    const jsonStr = serializeBackupPayload(dummyPayload, 'json');
    expect(jsonStr).toContain('"version": 2');

    const parseRes = parseBackupPayload(jsonStr);
    expect(parseRes.success).toBe(true);
    expect(parseRes.format).toBe('json');
    expect(parseRes.version).toBe(2);
    expect(parseRes.summary?.assetCount).toBe(2);
    expect(parseRes.summary?.holdingsCount).toBe(1);
    expect(parseRes.summary?.targetGoalIdr).toBe(1_000_000_000);
  });

  it('serializes and parses Base64 compact token correctly', () => {
    const token = serializeBackupPayload(dummyPayload, 'base64');
    expect(token).not.toContain('{');

    const parseRes = parseBackupPayload(token);
    expect(parseRes.success).toBe(true);
    expect(parseRes.format).toBe('base64');
    expect(parseRes.data?.data.menu1_builder.activeWeights.BBCA).toBe(50);
  });

  it('handles invalid or corrupted text gracefully with descriptive errors', () => {
    const emptyRes = parseBackupPayload('');
    expect(emptyRes.success).toBe(false);
    expect(emptyRes.error).toContain('kosong');

    const garbageRes = parseBackupPayload('random non-json non-base64 garbage 123 !@#$');
    expect(garbageRes.success).toBe(false);
    expect(garbageRes.error).toBeDefined();
  });
});
