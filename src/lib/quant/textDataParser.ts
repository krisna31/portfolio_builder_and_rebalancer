import {
  AssetDefinition,
  HoldingEntry,
  QuantPortoBackupPayload,
} from './types';

export interface ParsedHoldingItem {
  rawLine: string;
  rawTicker: string;
  assetId: string | null;
  assetName: string;
  category?: string;
  nominalIdr: number;
  units: number;
  lots?: number;
  priceNative: number;
  currency: 'IDR' | 'USD';
  mode: 'nominal' | 'units';
  isRecognized: boolean;
  isValid: boolean;
  warning?: string;
}

export interface ParsedHoldingsResult {
  items: ParsedHoldingItem[];
  recognizedCount: number;
  totalNominalIdr: number;
  invalidLines: string[];
  warnings: string[];
}

export interface ParsedBackupResult {
  success: boolean;
  format: 'json' | 'base64' | 'unknown';
  version?: number;
  data?: QuantPortoBackupPayload;
  error?: string;
  summary?: {
    assetCount: number;
    holdingsCount: number;
    savedPortfoliosCount: number;
    rebalanceHistoryCount: number;
    initialCapitalIdr?: number;
    targetGoalIdr?: number;
    monthlySavingsIdr?: number;
    usdIdrRate?: number;
  };
}

/**
 * Robustly parses informal or formatted financial numbers
 * Handles Indonesian abbreviations (jt, juta, m, miliar, rb, k)
 * and decimal/thousand separators (15.000.000 vs 15,000,000 vs 0.05).
 */
export function parseFinancialNumber(rawStr: string): {
  value: number;
  isLot: boolean;
  isUnit: boolean;
  isUsd: boolean;
  hasCurrencyMarker: boolean;
} {
  let s = rawStr.trim();
  let isUsd = false;
  let isLot = false;
  let isUnit = false;
  let hasCurrencyMarker = false;

  // Check currency cues
  if (/^(\$|usd)/i.test(s) || /usd$/i.test(s)) {
    isUsd = true;
    hasCurrencyMarker = true;
  }
  if (/^(rp\.?|idr)/i.test(s) || /(idr|rp)$/i.test(s)) {
    hasCurrencyMarker = true;
  }
  s = s.replace(/^(rp\.?|idr|\$|usd)\s*/i, '').replace(/\s*(idr|usd)$/i, '');

  // Check lot / unit cues
  if (/\b(lots?)\b/i.test(s)) {
    isLot = true;
    s = s.replace(/\b(lots?)\b/i, '').trim();
  } else if (/\b(lbr|lembar|shares?)\b/i.test(s)) {
    isUnit = true;
    s = s.replace(/\b(lbr|lembar|shares?)\b/i, '').trim();
  } else if (/\b(units?)\b/i.test(s)) {
    isUnit = true;
    s = s.replace(/\b(units?)\b/i, '').trim();
  }

  // If there's leading descriptive text before digits (e.g. "Bank Central Asia 10"), strip it
  const digitIndex = s.search(/\d/);
  if (digitIndex > 0) {
    const prefix = s.slice(0, digitIndex);
    if (!/^(rp\.?|idr|\$|usd)\s*$/i.test(prefix)) {
      s = s.slice(digitIndex);
    }
  }

  // Indonesian / English multiplier suffixes
  let multiplier = 1;
  const suffixMatch = s.match(
    /([0-9.,]+)\s*(miliar|milyar|billion|bil|jt|juta|million|mil|rb|ribu|k|b|m)$/i
  );

  if (suffixMatch) {
    const numPart = suffixMatch[1];
    const unitPart = suffixMatch[2].toLowerCase();

    if (['miliar', 'milyar', 'billion', 'bil', 'b', 'm'].includes(unitPart)) {
      // In Indonesian context "M" is Miliar (1 Billion IDR = 1,000,000,000)
      multiplier = 1_000_000_000;
      hasCurrencyMarker = true;
    } else if (['jt', 'juta', 'million', 'mil'].includes(unitPart)) {
      multiplier = 1_000_000;
      hasCurrencyMarker = true;
    } else if (['rb', 'ribu', 'k'].includes(unitPart)) {
      multiplier = 1_000;
    }
    s = numPart;
  }

  // Clean remaining whitespace
  s = s.replace(/\s+/g, '');

  // Detect thousand & decimal separators
  let numericVal = 0;
  if (/^[1-9]\d{0,2}(\.\d{3})+(,\d+)?$/.test(s)) {
    // Indonesian format: 15.000.000,50
    s = s.replace(/\./g, '').replace(',', '.');
  } else if (/^[1-9]\d{0,2}(,\d{3})+(\.\d+)?$/.test(s)) {
    // US format: 15,000,000.50
    s = s.replace(/,/g, '');
  } else if (s.includes(',') && !s.includes('.')) {
    // Single comma e.g. 15,5
    s = s.replace(',', '.');
  }

  numericVal = parseFloat(s);
  if (isNaN(numericVal)) {
    return { value: 0, isLot, isUnit, isUsd, hasCurrencyMarker };
  }

  return {
    value: numericVal * multiplier,
    isLot,
    isUnit,
    isUsd,
    hasCurrencyMarker,
  };
}

/**
 * Parses freeform, Excel TSV, CSV, or colon-delimited lines of holdings
 */
export function parseHoldingsText(
  rawText: string,
  allAssets: AssetDefinition[],
  defaultMode: 'nominal' | 'units' = 'nominal',
  usdIdrRate: number = 18000
): ParsedHoldingsResult {
  const lines = rawText.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const items: ParsedHoldingItem[] = [];
  const invalidLines: string[] = [];
  const warnings: string[] = [];

  // Build quick ticker lookup map
  const assetLookup = new Map<string, AssetDefinition>();
  for (const asset of allAssets) {
    assetLookup.set(asset.id.toUpperCase(), asset);
    assetLookup.set(asset.symbol.toUpperCase(), asset);
    if (asset.shortName) {
      assetLookup.set(asset.shortName.toUpperCase(), asset);
    }
    if (asset.originalShortName) {
      assetLookup.set(asset.originalShortName.toUpperCase(), asset);
    }
    if (asset.yahooSymbol) {
      assetLookup.set(asset.yahooSymbol.toUpperCase(), asset);
      const stripped = asset.yahooSymbol.replace(/\.[A-Z]+$/i, '').toUpperCase();
      if (!assetLookup.has(stripped)) {
        assetLookup.set(stripped, asset);
      }
    }
  }

  for (const line of lines) {
    // Skip comment lines or obvious headers
    if (line.startsWith('#') || line.startsWith('//')) continue;
    if (
      /^(symbol|ticker|asset|kode|nama|name)\b/i.test(line) &&
      /(nominal|value|units?|jumlah|harga|price|lots?)/i.test(line)
    ) {
      continue;
    }

    // Split line by Tab, Semicolon, Comma, Equals, Colon, or Multiple Spaces
    let tokens: string[] = [];
    if (line.includes('\t')) {
      tokens = line.split('\t').map((t) => t.trim()).filter(Boolean);
    } else if (line.includes(';')) {
      tokens = line.split(';').map((t) => t.trim()).filter(Boolean);
    } else if (line.includes(',')) {
      tokens = line.split(',').map((t) => t.trim()).filter(Boolean);
    } else if (line.includes(':') || line.includes('=')) {
      tokens = line.split(/[:=]/).map((t) => t.trim()).filter(Boolean);
    } else {
      // Space separated
      tokens = line.split(/\s+/).map((t) => t.trim()).filter(Boolean);
    }

    if (tokens.length === 0) continue;

    // First token is usually the ticker or symbol
    let rawTicker = tokens[0].replace(/[^\w.-]/g, '').toUpperCase();
    if (!rawTicker && tokens.length > 1) {
      rawTicker = tokens[1].replace(/[^\w.-]/g, '').toUpperCase();
    }

    // Attempt to match asset
    let matchedAsset = assetLookup.get(rawTicker);
    if (!matchedAsset) {
      const cleaned = rawTicker.replace(/\.(JK|US|O|N)$/i, '').replace(/-(USD|IDR)$/i, '');
      matchedAsset = assetLookup.get(cleaned);
    }

    // Remaining tokens contain quantity / value / units / price
    const remainingTokens = tokens.slice(1);
    const digitTokenIdx = remainingTokens.findIndex(
      (t) => /^(rp\.?|idr|\$|usd)/i.test(t) || /\d/.test(t)
    );
    const valueTokens =
      digitTokenIdx !== -1
        ? remainingTokens.slice(digitTokenIdx).join(' ')
        : remainingTokens.join(' ');

    if (!valueTokens) {
      invalidLines.push(line);
      continue;
    }

    const parsedNum = parseFinancialNumber(valueTokens);
    if (parsedNum.value <= 0) {
      invalidLines.push(line);
      continue;
    }

    const isNominalAsset =
      Boolean(matchedAsset?.isNominalOnly) ||
      matchedAsset?.category === 'money-market' ||
      matchedAsset?.category === 'bonds';
    const assetPrice = isNominalAsset ? 1 : (matchedAsset?.defaultPrice || 1);
    const isAssetUsd = matchedAsset?.currency === 'USD';
    const lotSize = isNominalAsset ? 1 : (matchedAsset?.lotSize || 1);

    let nominalIdr = 0;
    let units = 0;
    let lots: number | undefined;
    let mode: 'nominal' | 'units' = defaultMode;

    if (parsedNum.isLot) {
      // Specified in Lots (e.g. 10 lot)
      lots = parsedNum.value;
      units = parsedNum.value * lotSize;
      const priceInIdr = isAssetUsd ? assetPrice * usdIdrRate : assetPrice;
      nominalIdr = Math.round(units * priceInIdr);
      mode = 'units';
    } else if (parsedNum.isUnit) {
      // Specified in Units / shares (e.g. 500 lbr)
      units = parsedNum.value;
      if (lotSize > 1) lots = +(units / lotSize).toFixed(2);
      const priceInIdr = isAssetUsd ? assetPrice * usdIdrRate : assetPrice;
      nominalIdr = Math.round(units * priceInIdr);
      mode = 'units';
    } else if (defaultMode === 'units') {
      // In Unit mode, preserve units unless currency markers (rp, idr, jt, m, $) are explicitly present
      if (parsedNum.hasCurrencyMarker) {
        nominalIdr = Math.round(
          parsedNum.isUsd ? parsedNum.value * usdIdrRate : parsedNum.value
        );
        const priceInIdr = isAssetUsd ? assetPrice * usdIdrRate : assetPrice;
        units = +(nominalIdr / (priceInIdr || 1)).toFixed(matchedAsset?.category === 'crypto' ? 8 : 4);
        if (lotSize > 1) lots = +(units / lotSize).toFixed(2);
        mode = 'nominal';
      } else {
        units = parsedNum.value;
        if (lotSize > 1) lots = +(units / lotSize).toFixed(2);
        const priceInIdr = isAssetUsd ? assetPrice * usdIdrRate : assetPrice;
        nominalIdr = Math.round(units * priceInIdr);
        mode = 'units';
      }
    } else if (parsedNum.value < 1000 && !parsedNum.hasCurrencyMarker) {
      // In nominal mode, values < 1000 without currency cues are likely small unit counts (e.g. 0.05 BTC)
      units = parsedNum.value;
      if (lotSize > 1) lots = +(units / lotSize).toFixed(2);
      const priceInIdr = isAssetUsd ? assetPrice * usdIdrRate : assetPrice;
      nominalIdr = Math.round(units * priceInIdr);
      mode = 'units';
    } else {
      // Nominal IDR
      nominalIdr = Math.round(
        parsedNum.isUsd ? parsedNum.value * usdIdrRate : parsedNum.value
      );
      const priceInIdr = isAssetUsd ? assetPrice * usdIdrRate : assetPrice;
      units = +(nominalIdr / (priceInIdr || 1)).toFixed(matchedAsset?.category === 'crypto' ? 8 : 4);
      if (lotSize > 1) lots = +(units / lotSize).toFixed(2);
      mode = 'nominal';
    }

    const item: ParsedHoldingItem = {
      rawLine: line,
      rawTicker,
      assetId: matchedAsset?.id || null,
      assetName: matchedAsset?.name || rawTicker,
      category: matchedAsset?.category,
      nominalIdr,
      units,
      lots,
      priceNative: assetPrice,
      currency: matchedAsset?.currency || 'IDR',
      mode,
      isRecognized: Boolean(matchedAsset),
      isValid: nominalIdr > 0,
      warning: !matchedAsset
        ? `Ticker "${rawTicker}" tidak ditemukan di database aset.`
        : undefined,
    };

    items.push(item);
  }

  const recognizedCount = items.filter((i) => i.isRecognized).length;
  const totalNominalIdr = items.reduce((acc, cur) => acc + cur.nominalIdr, 0);

  if (items.length === 0 && invalidLines.length > 0) {
    warnings.push('Tidak ada baris yang dapat diparsing sebagai aset dan nilai holding.');
  }

  return {
    items,
    recognizedCount,
    totalNominalIdr,
    invalidLines,
    warnings,
  };
}

/**
 * Export current holdings into TSV, CSV, or Human-Readable Summary text
 */
export function exportHoldingsToText(
  holdings: Record<string, HoldingEntry>,
  allAssets: AssetDefinition[],
  format: 'tsv' | 'csv' | 'summary',
  usdIdrRate: number = 18000
): string {
  const assetMap = new Map(allAssets.map((a) => [a.id, a]));
  const holdingEntries = Object.entries(holdings).filter(
    ([, h]) => h && (h.currentValueIdr > 0 || h.units > 0)
  );

  if (holdingEntries.length === 0) {
    return 'Belum ada holding aset yang diisi.';
  }

  if (format === 'tsv') {
    const headers = ['Symbol', 'Asset Name', 'Value (IDR)', 'Units', 'Lots (IDX)', 'Price'];
    const rows = holdingEntries.map(([assetId, h]) => {
      const asset = assetMap.get(assetId);
      const symbol = asset?.shortName || asset?.symbol || assetId;
      const name = asset?.name || assetId;
      const nominal = h.currentValueIdr || 0;
      const units = h.units || 0;
      const isNominalOnly =
        h.isNominalOnly ??
        asset?.isNominalOnly ??
        (asset?.category === 'bonds' || asset?.category === 'money-market');
      const lots = isNominalOnly ? '-' : (asset?.lotSize && asset.lotSize > 1 ? +(units / asset.lotSize).toFixed(2) : '-');
      const price = isNominalOnly ? 1 : (h.currentPrice || asset?.defaultPrice || 0);
      const curr = asset?.currency || 'IDR';
      return [symbol, name, nominal, units, lots, `${curr} ${price}`].join('\t');
    });
    return [headers.join('\t'), ...rows].join('\n');
  }

  if (format === 'csv') {
    const headers = ['Symbol', 'Asset Name', 'Value (IDR)', 'Units', 'Lots (IDX)', 'Price'];
    const rows = holdingEntries.map(([assetId, h]) => {
      const asset = assetMap.get(assetId);
      const symbol = asset?.shortName || asset?.symbol || assetId;
      const name = `"${(asset?.name || assetId).replace(/"/g, '""')}"`;
      const nominal = h.currentValueIdr || 0;
      const units = h.units || 0;
      const isNominalOnly =
        h.isNominalOnly ??
        asset?.isNominalOnly ??
        (asset?.category === 'bonds' || asset?.category === 'money-market');
      const lots = isNominalOnly ? '' : (asset?.lotSize && asset.lotSize > 1 ? +(units / asset.lotSize).toFixed(2) : '');
      const price = isNominalOnly ? 1 : (h.currentPrice || asset?.defaultPrice || 0);
      return [symbol, name, nominal, units, lots, price].join(',');
    });
    return [headers.join(','), ...rows].join('\n');
  }

  // Summary format (WhatsApp / Notes friendly)
  const today = new Date().toLocaleDateString('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
  const totalValue = holdingEntries.reduce((sum, [, h]) => sum + (h.currentValueIdr || 0), 0);

  const lines: string[] = [
    `📊 *HOLDING PORTOFOLIO — QUANTPORTO*`,
    `📅 Tanggal: ${today}`,
    `💰 Total Saldo: Rp ${totalValue.toLocaleString('id-ID')}`,
    '',
    `Daftar Aset:`,
  ];

  for (const [assetId, h] of holdingEntries) {
    const asset = assetMap.get(assetId);
    const symbol = asset?.shortName || asset?.symbol || assetId;
    const name = asset?.name || assetId;
    const nominalStr = `Rp ${(h.currentValueIdr || 0).toLocaleString('id-ID')}`;
    const isNominalOnly =
      h.isNominalOnly ??
      asset?.isNominalOnly ??
      (asset?.category === 'bonds' || asset?.category === 'money-market');
    let unitStr = '';
    if (isNominalOnly) {
      unitStr = '';
    } else if (asset?.lotSize && asset.lotSize === 100) {
      const lots = +(h.units / 100).toFixed(1);
      unitStr = ` (≈ ${lots} Lot / ${h.units.toLocaleString('id-ID')} lbr)`;
    } else if (h.units > 0) {
      unitStr = ` (${h.units} unit)`;
    }
    lines.push(`• *${symbol}* (${name}): ${nominalStr}${unitStr}`);
  }

  return lines.join('\n');
}

/**
 * Safely encodes a string into UTF-8 Base64
 */
export function utf8ToBase64(str: string): string {
  return btoa(
    encodeURIComponent(str).replace(/%([0-9A-F]{2})/g, (_, p1) =>
      String.fromCharCode(parseInt(p1, 16))
    )
  );
}

/**
 * Safely decodes a UTF-8 Base64 string
 */
export function base64ToUtf8(b64: string): string {
  const binary = atob(b64.trim());
  return decodeURIComponent(
    Array.prototype.map
      .call(binary, (ch: string) => '%' + ('00' + ch.charCodeAt(0).toString(16)).slice(-2))
      .join('')
  );
}

/**
 * Serializes a full backup payload into JSON or Compact Base64
 */
export function serializeBackupPayload(
  payload: QuantPortoBackupPayload,
  format: 'json' | 'base64'
): string {
  const json = JSON.stringify(payload, null, 2);
  if (format === 'base64') {
    return utf8ToBase64(JSON.stringify(payload));
  }
  return json;
}

/**
 * Parses raw text input into a QuantPortoBackupPayload (supporting both JSON and Base64)
 */
export function parseBackupPayload(text: string): ParsedBackupResult {
  const trimmed = text.trim();
  if (!trimmed) {
    return {
      success: false,
      format: 'unknown',
      error: 'Teks input kosong. Silakan tempel (paste) kode backup JSON atau Token Base64.',
    };
  }

  let jsonStr = trimmed;
  let detectedFormat: 'json' | 'base64' = 'json';

  // If text does not start with '{', attempt Base64 decode
  if (!trimmed.startsWith('{')) {
    try {
      jsonStr = base64ToUtf8(trimmed);
      detectedFormat = 'base64';
    } catch {
      return {
        success: false,
        format: 'unknown',
        error: 'Format data tidak valid. Teks bukan JSON yang valid maupun Base64 Token yang valid.',
      };
    }
  }

  try {
    const raw = JSON.parse(jsonStr);
    const isV2 = raw.version === 2 && raw.data;
    const isLegacyV1 = raw.activeWeights || raw.holdings || (raw.version === 1 && raw.data);

    if (!isV2 && !isLegacyV1) {
      return {
        success: false,
        format: detectedFormat,
        error: 'Struktur data tidak cocok dengan schema backup QuantPorto.',
      };
    }

    const d1 = isV2 ? raw.data.menu1_builder : raw;
    const d2 = isV2 ? raw.data.menu2_rebalancer : raw;
    const d3 = isV2 ? raw.data.menu3_simulator : raw;
    const dg = isV2 ? raw.data.global : raw;

    const assetCount = d1?.activeWeights ? Object.keys(d1.activeWeights).length : 0;
    const holdingsCount = d2?.holdings ? Object.keys(d2.holdings).length : 0;
    const savedPortfoliosCount = Array.isArray(dg?.savedPortfolios) ? dg.savedPortfolios.length : 0;
    const rebalanceHistoryCount = Array.isArray(d2?.rebalanceHistory) ? d2.rebalanceHistory.length : 0;

    return {
      success: true,
      format: detectedFormat,
      version: raw.version || 1,
      data: isV2
        ? raw
        : {
            version: 2,
            app: 'QuantPorto',
            exportedAt: new Date().toISOString(),
            data: {
              menu1_builder: {
                activeWeights: d1.activeWeights || {},
                activePresetId: d1.activePresetId,
                allocationMethod: d1.allocationMethod,
                slotMap: d1.slotMap,
                customAssets: d1.customAssets,
              },
              menu2_rebalancer: {
                holdings: d2.holdings || {},
                rebalanceHistory: d2.rebalanceHistory || [],
                inputMode: d2.inputMode,
                rebalanceMode: d2.rebalanceMode,
                cashInjectionIdr: d2.cashInjectionIdr,
              },
              menu3_simulator: {
                initialCapitalIdr: d3.initialCapitalIdr,
                targetGoalIdr: d3.targetGoalIdr,
                monthlySavingsIdr: d3.monthlySavingsIdr,
                annualInflationPercent: d3.annualInflationPercent,
                annualStepUpPct: d3.annualStepUpPct,
                monthlyLivingCostTargetIdr: d3.monthlyLivingCostTargetIdr,
                simulationViewMode: d3.simulationViewMode,
                taxMode: d3.taxMode,
                dividendUsageMode: d3.dividendUsageMode,
                customYieldOverrides: d3.customYieldOverrides,
                reverseDcaTargetYears: d3.reverseDcaTargetYears,
              },
              global: {
                usdIdrRate: dg.usdIdrRate || 18000,
                savedPortfolios: dg.savedPortfolios || [],
              },
            },
          },
      summary: {
        assetCount,
        holdingsCount,
        savedPortfoliosCount,
        rebalanceHistoryCount,
        initialCapitalIdr: d3?.initialCapitalIdr,
        targetGoalIdr: d3?.targetGoalIdr,
        monthlySavingsIdr: d3?.monthlySavingsIdr,
        usdIdrRate: dg?.usdIdrRate,
      },
    };
  } catch (err: any) {
    return {
      success: false,
      format: detectedFormat,
      error: `Gagal membaca JSON: ${err.message || 'Syntax error'}`,
    };
  }
}
