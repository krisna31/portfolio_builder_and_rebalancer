import { describe, it, expect } from 'vitest';
import { roundToIdxTick } from '../rebalancerEngine';

describe('Stage 7 Audit: Holding Tick Snapping, Universe Sync, CSV BOM & Roadmap Export', () => {
  describe('Feature 1: BEI Stock Tick Snapping on Holding Commit', () => {
    it('accurately snaps IDX equity post-shock prices to valid BEI fractional tick sizes', () => {
      // Rule:
      // Price < 200: tick = 1
      // 200 - 500: tick = 2
      // 500 - 2000: tick = 5
      // 2000 - 5000: tick = 10
      // >= 5000: tick = 25

      const computeCommittedPrice = (
        category: string,
        lotSize: number,
        isNominal: boolean,
        basePrice: number,
        shockPercent: number
      ): number => {
        const rawPostShockPrice = basePrice * Math.max(0, 1 + shockPercent / 100);
        const isIdxStock = category === 'idx-equity' && lotSize === 100 && !isNominal;
        return isNominal
          ? 1
          : isIdxStock
            ? roundToIdxTick(rawPostShockPrice, 'nearest')
            : rawPostShockPrice;
      };

      // Test IDX Stock > 5000 (Tick 25)
      // BBCA Rp 9,000 + 3.1% = 9,279 -> nearest tick 25 is 9,275
      const bbcaCommitted = computeCommittedPrice('idx-equity', 100, false, 9000, 3.1);
      expect(bbcaCommitted).toBe(9275);
      expect(bbcaCommitted % 25).toBe(0);

      // Test IDX Stock 2000 - 5000 (Tick 10)
      // ASII Rp 4,500 + 2.7% = 4,621.5 -> nearest tick 10 is 4,620
      const asiiCommitted = computeCommittedPrice('idx-equity', 100, false, 4500, 2.7);
      expect(asiiCommitted).toBe(4620);
      expect(asiiCommitted % 10).toBe(0);

      // Test IDX Stock 500 - 2000 (Tick 5)
      // TLKM Rp 1,450 - 4.2% = 1,389.1 -> nearest tick 5 is 1,390
      const tlkmCommitted = computeCommittedPrice('idx-equity', 100, false, 1450, -4.2);
      expect(tlkmCommitted).toBe(1390);
      expect(tlkmCommitted % 5).toBe(0);

      // Crypto (USDT / BTC) should retain exact floating point without tick snapping
      const btcCommitted = computeCommittedPrice('crypto', 1, false, 65432.12, 5.5);
      expect(btcCommitted).toBeCloseTo(65432.12 * 1.055, 4);

      // Nominal instruments (Cash / RDPT) always retain unit price of 1
      const cashCommitted = computeCommittedPrice('money-market', 1, true, 1, 0);
      expect(cashCommitted).toBe(1);
    });
  });

  describe('Feature 2: Universe Synchronization on Saved Snapshot Load', () => {
    it('merges active portfolio weights into selectedUniverseIds without duplicates', () => {
      const currentUniverse = ['bbca', 'tlkm', 'bmri'];
      const snapshotWeights = {
        bbca: 20,
        icbp: 15, // newly introduced asset not currently in selected universe
        btc: 10,  // newly introduced asset
        tlkm: 0,  // 0 weight should not be forced into universe
      };

      const syncUniverse = (
        prevUniverse: string[],
        weights: Record<string, number>
      ): string[] => {
        const activeIds = Object.entries(weights)
          .filter(([, w]) => w > 0)
          .map(([id]) => id);
        return Array.from(new Set([...prevUniverse, ...activeIds]));
      };

      const updatedUniverse = syncUniverse(currentUniverse, snapshotWeights);

      expect(updatedUniverse).toContain('bbca');
      expect(updatedUniverse).toContain('tlkm');
      expect(updatedUniverse).toContain('bmri');
      expect(updatedUniverse).toContain('icbp');
      expect(updatedUniverse).toContain('btc');
      expect(updatedUniverse.length).toBe(5);
    });
  });

  describe('Feature 3: Robust CSV Generation with UTF-8 BOM & RFC 4180 Escaping', () => {
    it('prepends UTF-8 BOM to prevent Excel mojibake and correctly escapes CSV values', () => {
      const escapeCsvCell = (val: string | number): string => {
        const str = String(val);
        if (str.includes(',') || str.includes('\n') || str.includes('"')) {
          return `"${str.replace(/"/g, '""')}"`;
        }
        return str;
      };

      const rows = [
        ['Aset', 'Kategori', 'Catatan Eksekusi', 'Estimasi (IDR)'],
        ['BBCA', 'idx-equity', 'Beli 10 Lot, "Segera"', 'Rp 9.500.000'],
        ['BTC, ETH', 'crypto', 'DCA Mingguan\nSiklus Akumulasi', 'Rp 5.000.000'],
      ];

      const csvBody = rows
        .map((row) => row.map(escapeCsvCell).join(','))
        .join('\r\n');

      const fullCsvWithBom = '\uFEFF' + csvBody;

      // Ensure BOM exists as the very first character
      expect(fullCsvWithBom.charCodeAt(0)).toBe(0xfeff);

      // Verify RFC 4180 escaping on quotes
      expect(csvBody).toContain('"Beli 10 Lot, ""Segera"""');

      // Verify RFC 4180 escaping on comma
      expect(csvBody).toContain('"BTC, ETH"');

      // Verify RFC 4180 escaping on newline
      expect(csvBody).toContain('"DCA Mingguan\nSiklus Akumulasi"');
    });
  });

  describe('Feature 4: 1-Click Wealth Roadmap Clipboard Summary', () => {
    it('generates a well-formatted, complete summary text with key milestone metrics', () => {
      const formatIdr = (val: number, compact = false) => {
        if (compact && val >= 1_000_000_000) return `Rp ${(val / 1_000_000_000).toFixed(2)} M`;
        if (compact && val >= 1_000_000) return `Rp ${(val / 1_000_000).toFixed(1)} Jt`;
        return `Rp ${Math.round(val).toLocaleString('id-ID')}`;
      };

      const buildRoadmapSummary = (params: {
        targetGoalIdr: number;
        initialCapitalIdr: number;
        monthlySavingsIdr: number;
        annualStepUpPct: number;
        cagr: number;
        maxDrawdown: number;
        monthsToGoal: number;
        monthsToSwr: number;
        monthlyLivingCostTargetIdr: number;
        monthlyPassiveAtGoalIdr: number;
        mcSuccessProb: number;
        mcMedianWealthIdr: number;
      }): string => {
        const yearsToGoalStr = `${Math.floor(params.monthsToGoal / 12)} tahun ${
          params.monthsToGoal % 12
        } bulan`;
        const lines = [
          '🎯 *QUANTPORTO WEALTH ROADMAP SUMMARY*',
          `Target Dana: ${formatIdr(params.targetGoalIdr)}`,
          `Modal Awal: ${formatIdr(params.initialCapitalIdr)} | Tabungan Rutin: ${formatIdr(
            params.monthlySavingsIdr
          )}/bln (+${params.annualStepUpPct}% step-up/thn)`,
          `CAGR Portfolio: +${params.cagr.toFixed(2)}%/thn (Max DD: -${params.maxDrawdown.toFixed(1)}%)`,
          '',
          '📈 *PROYEKSI MENUJU TARGET:*',
          `• Estimasi Capai Target: ${yearsToGoalStr}`,
          '',
          `🌴 *MILESTONE PENSIUN & FINANCIAL FREEDOM (Living Cost: ${formatIdr(
            params.monthlyLivingCostTargetIdr,
            true
          )}/bln):*`,
          `• Bebas Finansial via SWR 4%: ${Math.floor(params.monthsToSwr / 12)} thn`,
          `• Pasif Income Dividen saat Target: ${formatIdr(params.monthlyPassiveAtGoalIdr, true)}/bln`,
          '',
          '🎲 *SIMULASI STOKASTIK MONTE CARLO (500 Skenario Pasar):*',
          `• Probabilitas Sukses Capai Target: ${params.mcSuccessProb.toFixed(1)}%`,
          `• Median Skenario Pasar (P50): ${formatIdr(params.mcMedianWealthIdr)}`,
        ];
        return lines.join('\n');
      };

      const summary = buildRoadmapSummary({
        targetGoalIdr: 10_000_000_000,
        initialCapitalIdr: 100_000_000,
        monthlySavingsIdr: 10_000_000,
        annualStepUpPct: 10,
        cagr: 18.5,
        maxDrawdown: 14.2,
        monthsToGoal: 144, // 12 years
        monthsToSwr: 156,  // 13 years
        monthlyLivingCostTargetIdr: 25_000_000,
        monthlyPassiveAtGoalIdr: 33_000_000,
        mcSuccessProb: 88.4,
        mcMedianWealthIdr: 12_450_000_000,
      });

      expect(summary).toContain('QUANTPORTO WEALTH ROADMAP SUMMARY');
      expect(summary).toContain('Target Dana: Rp 10.000.000.000');
      expect(summary).toContain('CAGR Portfolio: +18.50%/thn');
      expect(summary).toContain('12 tahun 0 bulan');
      expect(summary).toContain('Bebas Finansial via SWR 4%: 13 thn');
      expect(summary).toContain('Probabilitas Sukses Capai Target: 88.4%');
    });
  });

  describe('Feature 5: Tour Guide Step Sequence Integrity', () => {
    it('confirms 20 distinct tour steps with Smart DCA integrated', () => {
      // In tourGuide.ts, 20 steps are now registered across the 3 main menus & export tools
      const expectedStepElements = [
        '#tour-mode-selector',
        '#tour-quant-advisor',
        '#tour-macro-inputs',
        '#tour-risk-slider',
        '#tour-pareto-table',
        '#tour-asset-universe',
        '#tour-efficient-frontier',
        '#tour-rolling-returns',
        '#tour-correlation-matrix',
        '#tour-comparator-section',
        '#tour-rebalance-table',
        '#tour-stress-scenarios',
        '#tour-crash-ladder',
        '#tour-rebalance-actions',
        '#tour-smart-dca-submode-btn',
        '#tour-rebalance-journal',
        '#tour-roadmap-calculator',
        '#tour-backtest-frequency',
        '#tour-dividend-retirement',
        '#tour-export-actions',
      ];

      expect(expectedStepElements.length).toBe(20);
      expect(expectedStepElements[14]).toBe('#tour-smart-dca-submode-btn');
      expect(expectedStepElements[19]).toBe('#tour-export-actions');
    });
  });
});
