import {
  AssetCategory,
  AssetDefinition,
  ValuationSentimentConfig,
} from './types';
import { getSentimentZone } from './tacticalValuationEngine';

export type ComparisonOperator = '<=' | '>=' | '<' | '>';

export interface CycleIndicatorDefinition {
  id: string;
  name: string;
  category: AssetCategory;
  defaultCurrent: number;
  formattedDefaultCurrent: string;
  defaultChange24hPercent: number; // e.g. +0.21 or -0.43
  referenceThreshold: number;
  comparisonOperator: ComparisonOperator;
  formattedReference: string;
  unit?: string; // e.g. '%', '$', 'x', ''
  description: string;
  infoUrl?: string;
  isTriggeredByDefault?: boolean;
}

export interface CycleIndicatorState {
  id: string;
  name: string;
  currentValue: number;
  formattedCurrent: string;
  change24hPercent: number;
  referenceThreshold: number;
  comparisonOperator: ComparisonOperator;
  formattedReference: string;
  unit?: string;
  isTriggered: boolean;
  description: string;
  isManualOverride?: boolean;
}

export interface AssetIndicatorConfluence {
  assetId: string;
  symbol: string;
  name: string;
  category: AssetCategory;
  indicators: CycleIndicatorState[];
  totalIndicators: number;
  triggeredCount: number;
  confluencePercent: number; // 0 - 100
  action:
    | 'AGGRESSIVE_BUY'
    | 'MODERATE_BUY'
    | 'NORMAL_BUY'
    | 'SMALL_BUY'
    | 'HOLD_SKIP';
  actionLabel: string;
  multiplier: number;
  badgeClass: string;
  summary: string;
}

/**
 * Evaluates whether an indicator value triggers the buy/accumulation signal
 */
export function evaluateIndicatorRule(
  current: number,
  operator: ComparisonOperator,
  threshold: number
): boolean {
  switch (operator) {
    case '<=':
      return current <= threshold;
    case '>=':
      return current >= threshold;
    case '<':
      return current < threshold;
    case '>':
      return current > threshold;
    default:
      return false;
  }
}

/**
 * Action Tier mapping from Confluence Percentage (100% Indicator-Driven)
 * - >= 80% Triggered: AGGRESSIVE_BUY (2.0x)
 * - 60% - 79% Triggered: MODERATE_BUY (1.5x)
 * - 40% - 59% Triggered: NORMAL_BUY (1.0x)
 * - 20% - 39% Triggered: SMALL_BUY (0.5x)
 * - < 20% Triggered: HOLD_SKIP (0.0x)
 */
export function getConfluenceActionTier(confluencePercent: number): {
  action:
    | 'AGGRESSIVE_BUY'
    | 'MODERATE_BUY'
    | 'NORMAL_BUY'
    | 'SMALL_BUY'
    | 'HOLD_SKIP';
  actionLabel: string;
  multiplier: number;
  badgeClass: string;
} {
  const cleanPct = Math.max(0, Math.min(100, Math.round(confluencePercent)));

  if (cleanPct >= 80) {
    return {
      action: 'AGGRESSIVE_BUY',
      actionLabel: 'Beli Agresif',
      multiplier: 2.0,
      badgeClass:
        'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border-emerald-500/30',
    };
  }

  if (cleanPct >= 60) {
    return {
      action: 'MODERATE_BUY',
      actionLabel: 'Beli Rutin Plus',
      multiplier: 1.5,
      badgeClass:
        'bg-teal-500/20 text-teal-600 dark:text-teal-400 border-teal-500/30',
    };
  }

  if (cleanPct >= 40) {
    return {
      action: 'NORMAL_BUY',
      actionLabel: 'Beli Normal',
      multiplier: 1.0,
      badgeClass:
        'bg-blue-500/20 text-blue-600 dark:text-blue-400 border-blue-500/30',
    };
  }

  if (cleanPct >= 20) {
    return {
      action: 'SMALL_BUY',
      actionLabel: 'Beli Minimal',
      multiplier: 0.5,
      badgeClass:
        'bg-amber-500/20 text-amber-600 dark:text-amber-400 border-amber-500/30',
    };
  }

  return {
    action: 'HOLD_SKIP',
    actionLabel: 'Tahan / Lewati',
    multiplier: 0.0,
    badgeClass:
      'bg-rose-500/20 text-rose-600 dark:text-rose-400 border-rose-500/30',
  };
}

/**
 * Master catalog of cycle & valuation indicators per asset category
 * (Modeled directly after CoinMarketCap's Crypto Market Cycle Top & Bottom Indicators)
 */
export const MASTER_CYCLE_INDICATORS: Record<
  AssetCategory | 'default',
  CycleIndicatorDefinition[]
> = {
  crypto: [
    {
      id: 'ahr999',
      name: 'Bitcoin Ahr999 Index',
      category: 'crypto',
      defaultCurrent: 0.50,
      formattedDefaultCurrent: '0.50',
      defaultChange24hPercent: 0.0,
      referenceThreshold: 0.45,
      comparisonOperator: '<=',
      formattedReference: '≤ 0.45 (Serok Bawah)',
      unit: '',
      description:
        'Indikator akumulasi DCA matematis berbasis rasio harga terhadap biaya produksi & moving average 200 hari. Nilai < 0.45 adalah zona serok dasar siklus.',
      infoUrl: 'https://coinmarketcap.com/charts/crypto-market-cycle-indicators/',
    },
    {
      id: 'mvrv_zscore',
      name: 'MVRV Z-Score',
      category: 'crypto',
      defaultCurrent: 0.90,
      formattedDefaultCurrent: '0.90',
      defaultChange24hPercent: 1.12,
      referenceThreshold: 0.10,
      comparisonOperator: '<=',
      formattedReference: '≤ 0.10 (Zona Undervalued)',
      unit: '',
      description:
        'Mengukur deviasi nilai pasar terhadap modal terealisasi (realized cap). Nilai mendekati 0 atau negatif menandakan valuasi sangat murah di bawah modal investor rata-rata.',
      infoUrl: 'https://coinmarketcap.com/charts/crypto-market-cycle-indicators/',
    },
    {
      id: 'fear_greed_crypto',
      name: 'Crypto Fear & Greed Index',
      category: 'crypto',
      defaultCurrent: 45,
      formattedDefaultCurrent: '45/100',
      defaultChange24hPercent: -2.17,
      referenceThreshold: 25,
      comparisonOperator: '<=',
      formattedReference: '≤ 25 (Extreme Fear)',
      unit: '/100',
      description:
        'Indeks ketakutan dan keserakahan pasar kripto (Alternative.me). Skor <= 25 menandakan kepanikan ekstrem yang historisnya adalah titik balik akumulasi terbaik.',
      infoUrl: 'https://alternative.me/crypto/fear-and-greed-index/',
    },
    {
      id: 'puell_multiple',
      name: 'Puell Multiple',
      category: 'crypto',
      defaultCurrent: 1.15,
      formattedDefaultCurrent: '1.15',
      defaultChange24hPercent: 8.49,
      referenceThreshold: 0.50,
      comparisonOperator: '<=',
      formattedReference: '≤ 0.50 (Miner Capitulation)',
      unit: '',
      description:
        'Rasio nilai penerbitan koin harian terhadap moving average 365 hari. Nilai <= 0.5 menandakan pendapatan penambang anjlok ekstrem (kapitulasi penambang).',
      infoUrl: 'https://coinmarketcap.com/charts/crypto-market-cycle-indicators/',
    },
    {
      id: 'ma_2y_multiplier',
      name: '2-Year MA Multiplier / 200W MA',
      category: 'crypto',
      defaultCurrent: 0.95,
      formattedDefaultCurrent: '0.95x',
      defaultChange24hPercent: 0.46,
      referenceThreshold: 1.0,
      comparisonOperator: '<=',
      formattedReference: '≤ 1.00x (Di Bawah 2Y MA)',
      unit: 'x',
      description:
        'Membandingkan harga spot dengan moving average 2 tahun (730 hari). Harga di bawah 1.0x menandakan pasar berada di zona akumulasi dasar siklus 4 tahunan.',
      infoUrl: 'https://coinmarketcap.com/charts/crypto-market-cycle-indicators/',
    },
    {
      id: 'ath_drawdown_crypto',
      name: 'Drawdown dari Rekor ATH',
      category: 'crypto',
      defaultCurrent: 28.5,
      formattedDefaultCurrent: '-28.5%',
      defaultChange24hPercent: -0.5,
      referenceThreshold: 35.0,
      comparisonOperator: '>=',
      formattedReference: '≥ 35.0% (Diskon Siklus Besar)',
      unit: '%',
      description:
        'Kedalaman koreksi harga saat ini dari titik rekor tertinggi sepanjang sejarah (All-Time High). Koreksi >= 35% memberikan margin of safety tinggi untuk DCA.',
    },
    {
      id: 'rsi_22d_crypto',
      name: 'RSI (22-Day Relative Strength)',
      category: 'crypto',
      defaultCurrent: 49.52,
      formattedDefaultCurrent: '49.52',
      defaultChange24hPercent: 1.97,
      referenceThreshold: 35.0,
      comparisonOperator: '<=',
      formattedReference: '≤ 35.0 (Oversold)',
      unit: '',
      description:
        'Indikator momentum kejenuhan jual (oversold). Nilai <= 35 mengindikasikan tekanan jual sudah mendekati titik jenuh.',
    },
  ],

  'idx-equity': [
    {
      id: 'pe_vs_5y_idx',
      name: 'P/E vs 5Y Historical Mean',
      category: 'idx-equity',
      defaultCurrent: -18.2,
      formattedDefaultCurrent: '-18.2%',
      defaultChange24hPercent: 0.15,
      referenceThreshold: -10.0,
      comparisonOperator: '<=',
      formattedReference: '≤ -10.0% (Diskon Laba)',
      unit: '%',
      description:
        'Rasio Price-to-Earnings saham saat ini dibandingkan dengan rata-rata historis 5 tahunnya. Nilai minus menandakan harga diperdagangkan diskon dari valuasi laba normalnya.',
    },
    {
      id: 'pbv_vs_5y_idx',
      name: 'PBV vs 5Y Historical Mean',
      category: 'idx-equity',
      defaultCurrent: -12.5,
      formattedDefaultCurrent: '-12.5%',
      defaultChange24hPercent: -0.4,
      referenceThreshold: -8.0,
      comparisonOperator: '<=',
      formattedReference: '≤ -8.0% (Diskon Nilai Buku)',
      unit: '%',
      description:
        'Price-to-Book Value saham dibandingkan rata-rata 5 tahun. Diskon >= 8% menandakan saham blue chip berada di area akumulasi institusi.',
    },
    {
      id: 'drawdown_52w_idx',
      name: '52-Week High Drawdown',
      category: 'idx-equity',
      defaultCurrent: 16.4,
      formattedDefaultCurrent: '-16.4%',
      defaultChange24hPercent: 0.25,
      referenceThreshold: 12.0,
      comparisonOperator: '>=',
      formattedReference: '≥ 12.0% (Koreksi Sehat)',
      unit: '%',
      description:
        'Koreksi harga dari titik tertinggi 52 minggu terakhir di Bursa Efek Indonesia. Koreksi >= 12% menyajikan peluang serok dividen lebih tinggi.',
    },
    {
      id: 'dividend_yield_spread',
      name: 'Dividend Yield vs SBN Spread',
      category: 'idx-equity',
      defaultCurrent: 5.8,
      formattedDefaultCurrent: '5.80%',
      defaultChange24hPercent: 0.0,
      referenceThreshold: 5.0,
      comparisonOperator: '>=',
      formattedReference: '≥ 5.00% (Imbal Hasil Kuat)',
      unit: '%',
      description:
        'Estimasi imbal hasil dividen tunai tahunan. Nilai >= 5.0% menawarkan cashflow pasif yang kompetitif terhadap kupon obligasi negara.',
    },
    {
      id: 'ihsg_sentiment',
      name: 'Sentimen Pasar Modal IHSG',
      category: 'idx-equity',
      defaultCurrent: 38,
      formattedDefaultCurrent: '38/100',
      defaultChange24hPercent: -1.2,
      referenceThreshold: 45,
      comparisonOperator: '<=',
      formattedReference: '≤ 45 (Zona Pesimisme / Fear)',
      unit: '/100',
      description:
        'Indeks sentimen agregat pasar saham domestik. Wilayah Fear (<= 45) adalah momen terbaik melakukan DCA saham-saham perbankan/unggulan.',
    },
  ],

  'us-equity': [
    {
      id: 'fwd_pe_vs_5y_us',
      name: 'Forward P/E vs 5Y Mean',
      category: 'us-equity',
      defaultCurrent: 2.5,
      formattedDefaultCurrent: '+2.5%',
      defaultChange24hPercent: 0.32,
      referenceThreshold: 0.0,
      comparisonOperator: '<=',
      formattedReference: '≤ 0.0% (Di Bawah Rata-Rata)',
      unit: '%',
      description:
        'Forward Price-to-Earnings 12 bulan ke depan dibandingkan rerata 5 tahun S&P 500 / Nasdaq. Di bawah rata-rata menandakan valuasi pertumbuhan masih wajar.',
    },
    {
      id: 'shiller_cape_us',
      name: 'Shiller CAPE Ratio (P/E 10Y Real)',
      category: 'us-equity',
      defaultCurrent: 32.0,
      formattedDefaultCurrent: '32.0x',
      defaultChange24hPercent: -0.18,
      referenceThreshold: 30.0,
      comparisonOperator: '<=',
      formattedReference: '≤ 30.0x (Valuasi Aman)',
      unit: 'x',
      description:
        'Cyclically Adjusted Price-to-Earnings Robert Shiller yang disesuaikan inflasi 10 tahun. Nilai di bawah 30x mengurangi risiko bubble pasar saham AS.',
    },
    {
      id: 'drawdown_52w_us',
      name: '52-Week High Drawdown',
      category: 'us-equity',
      defaultCurrent: 3.5,
      formattedDefaultCurrent: '-3.5%',
      defaultChange24hPercent: 0.45,
      referenceThreshold: 7.5,
      comparisonOperator: '>=',
      formattedReference: '≥ 7.5% (Dip Entry)',
      unit: '%',
      description:
        'Koreksi indeks Wall Street dari puncak 52 minggu. Saham indeks AS jarang terkoreksi dalam, sehingga koreksi >= 7.5% adalah sinyal DCA teruji.',
    },
    {
      id: 'cnn_fear_greed_us',
      name: 'CNN US Market Fear & Greed',
      category: 'us-equity',
      defaultCurrent: 50,
      formattedDefaultCurrent: '50/100',
      defaultChange24hPercent: 1.5,
      referenceThreshold: 40,
      comparisonOperator: '<=',
      formattedReference: '≤ 40 (Fear Zone)',
      unit: '/100',
      description:
        'Indeks sentimen pasar saham AS yang menggabungkan Market Momentum, Stock Price Breadth, Put/Call Ratio, dan Junk Bond Demand.',
    },
    {
      id: 'ma_200d_us',
      name: '200-Day Moving Average Multiplier',
      category: 'us-equity',
      defaultCurrent: 1.02,
      formattedDefaultCurrent: '1.02x',
      defaultChange24hPercent: 0.1,
      referenceThreshold: 1.0,
      comparisonOperator: '<=',
      formattedReference: '≤ 1.00x (Di Bawah 200D SMA)',
      unit: 'x',
      description:
        'Harga relatif terhadap Simple Moving Average 200 hari. Berada di bawah garis 200 hari menandakan peluang diskon tren primer.',
    },
  ],

  gold: [
    {
      id: 'real_yield_10y_gold',
      name: 'US 10-Year Real Yield',
      category: 'gold',
      defaultCurrent: 1.85,
      formattedDefaultCurrent: '1.85%',
      defaultChange24hPercent: -0.05,
      referenceThreshold: 1.65,
      comparisonOperator: '<=',
      formattedReference: '≤ 1.65% (Dukungan Suku Bunga Riil)',
      unit: '%',
      description:
        'Yield obligasi AS 10 tahun dikurangi inflasi tersirat (TIPS). Suku bunga riil yang rendah atau melandai memperkuat daya tarik emas fisik.',
    },
    {
      id: 'ath_drawdown_gold',
      name: 'Drawdown dari Rekor ATH',
      category: 'gold',
      defaultCurrent: 5.4,
      formattedDefaultCurrent: '-5.4%',
      defaultChange24hPercent: 0.12,
      referenceThreshold: 4.5,
      comparisonOperator: '>=',
      formattedReference: '≥ 4.5% (Diskon Emas)',
      unit: '%',
      description:
        'Koreksi harga emas dunia dari level puncak rekor sepanjang masa. Sebagai aset safe haven, koreksi >= 4.5% merupakan peluang beli bertahap.',
    },
    {
      id: 'gold_sp500_ratio',
      name: 'Gold vs Equity Valuation Ratio',
      category: 'gold',
      defaultCurrent: 0.88,
      formattedDefaultCurrent: '0.88x',
      defaultChange24hPercent: -0.3,
      referenceThreshold: 0.95,
      comparisonOperator: '<=',
      formattedReference: '≤ 0.95x (Undervalued vs Saham)',
      unit: 'x',
      description:
        'Rasio komparasi harga emas terhadap indeks saham global. Nilai rendah mengindikasikan emas relatif murah sebagai diversifikasi lindung nilai.',
    },
  ],

  'money-market': [
    {
      id: 'bi_rate_spread_rdpu',
      name: 'RDPU Yield vs BI-Rate Net Spread',
      category: 'money-market',
      defaultCurrent: 5.75,
      formattedDefaultCurrent: '5.75%',
      defaultChange24hPercent: 0.0,
      referenceThreshold: 5.0,
      comparisonOperator: '>=',
      formattedReference: '≥ 5.00% (Yield Kompetitif)',
      unit: '%',
      description:
        'Imbal hasil bersih Reksa Dana Pasar Uang bebas pajak dibandingkan bunga deposito bank buku besar.',
    },
    {
      id: 'war_chest_anchor_rdpu',
      name: 'War Chest Capital Preservation Anchor',
      category: 'money-market',
      defaultCurrent: 75,
      formattedDefaultCurrent: '75%',
      defaultChange24hPercent: 0.0,
      referenceThreshold: 80,
      comparisonOperator: '>=',
      formattedReference: '≥ 80% (Stabil)',
      unit: '%',
      description:
        'Instrumen pelindung nilai pokok (drawdown 0%) yang siap ditarik kapan saja untuk menyerok aset berisiko saat market crash.',
    },
  ],

  bonds: [
    {
      id: 'sbn_real_spread_bonds',
      name: 'SBN 10Y Yield vs BI Rate Spread',
      category: 'bonds',
      defaultCurrent: 6.85,
      formattedDefaultCurrent: '6.85%',
      defaultChange24hPercent: -0.02,
      referenceThreshold: 6.25,
      comparisonOperator: '>=',
      formattedReference: '≥ 6.25% (Yield SBN Menarik)',
      unit: '%',
      description:
        'Kupon obligasi negara Indonesia tenor 10 tahun (FR/ORI). Yield di atas 6.25% menawarkan imbal hasil tetap prima dengan risiko gagal bayar nol.',
    },
    {
      id: 'rdpt_duration_risk',
      name: 'RDPT Fixed Income Stability Factor',
      category: 'bonds',
      defaultCurrent: 95,
      formattedDefaultCurrent: '95/100',
      defaultChange24hPercent: 0.0,
      referenceThreshold: 80,
      comparisonOperator: '>=',
      formattedReference: '≥ 80/100 (Kupon Berkualitas)',
      unit: '/100',
      description:
        'Stabilitas kupon dan durasi portofolio obligasi korporasi & negara berperingkat AAA/AA.',
    },
  ],

  custom: [
    {
      id: 'custom_discount_factor',
      name: 'Custom Asset Discount Factor',
      category: 'custom',
      defaultCurrent: 12.0,
      formattedDefaultCurrent: '-12.0%',
      defaultChange24hPercent: 0.0,
      referenceThreshold: 10.0,
      comparisonOperator: '>=',
      formattedReference: '≥ 10.0% (Diskon Wajar)',
      unit: '%',
      description: 'Estimasi diskon nilai intrinsik wajar aset kustom.',
    },
  ],

  default: [
    {
      id: 'general_discount_factor',
      name: 'General Valuation Discount Factor',
      category: 'idx-equity',
      defaultCurrent: 12.0,
      formattedDefaultCurrent: '-12.0%',
      defaultChange24hPercent: 0.0,
      referenceThreshold: 10.0,
      comparisonOperator: '>=',
      formattedReference: '≥ 10.0% (Diskon Wajar)',
      unit: '%',
      description:
        'Estimasi diskon nilai intrinsik wajar aset terhadap rata-rata pasar.',
    },
  ],
};

export const CRYPTO_CYCLE_INDICATORS = MASTER_CYCLE_INDICATORS.crypto;
export const IDX_CYCLE_INDICATORS = MASTER_CYCLE_INDICATORS['idx-equity'];
export const US_CYCLE_INDICATORS = MASTER_CYCLE_INDICATORS['us-equity'];
export const GOLD_CYCLE_INDICATORS = MASTER_CYCLE_INDICATORS.gold;

export interface MarketDataOverrideLike {
  fearGreedScore?: number;
  drawdownAth?: number;
  drawdown52w?: number;
  peRatio?: number;
  pe5yAvg?: number;
  pbvRatio?: number;
  tenYearYield?: number;
  threeMonthYield?: number;
}

/**
 * Computes the full CoinMarketCap-styled indicator confluence for an asset,
 * taking into account any manual overrides or live tactical feeds.
 */
export function getAssetIndicatorConfluence(params: {
  asset: AssetDefinition;
  overrides?: Record<string, Partial<CycleIndicatorState>>;
  marketDataOverride?: MarketDataOverrideLike;
  tacticalConfig?: ValuationSentimentConfig;
  currentPriceNative?: number;
  usdIdrRate?: number;
}): AssetIndicatorConfluence {
  const {
    asset,
    overrides = {},
    marketDataOverride,
    tacticalConfig,
    currentPriceNative,
    usdIdrRate = 16000,
  } = params;

  // Resolve category template
  let baseList = MASTER_CYCLE_INDICATORS[asset.category];
  if (!baseList || baseList.length === 0) {
    baseList = MASTER_CYCLE_INDICATORS.default;
  }

  // Populate indicator states
  const indicatorStates: CycleIndicatorState[] = baseList.map((def) => {
    const override = overrides[def.id];
    let currentVal = override?.currentValue ?? def.defaultCurrent;
    let change24h = override?.change24hPercent ?? def.defaultChange24hPercent;
    let threshold = override?.referenceThreshold ?? def.referenceThreshold;
    let operator = override?.comparisonOperator ?? def.comparisonOperator;

    // Apply live dynamic hooks or marketDataOverride if available and not manually overridden
    if (override?.currentValue === undefined) {
      if (marketDataOverride) {
        if (asset.category === 'crypto') {
          if (def.id === 'fear_greed_crypto' && marketDataOverride.fearGreedScore !== undefined) {
            currentVal = marketDataOverride.fearGreedScore;
          } else if (def.id === 'ath_drawdown_crypto' && marketDataOverride.drawdownAth !== undefined) {
            currentVal = marketDataOverride.drawdownAth;
          } else if (marketDataOverride.fearGreedScore !== undefined || marketDataOverride.drawdownAth !== undefined) {
            const isDeepDiscount =
              (marketDataOverride.fearGreedScore !== undefined && marketDataOverride.fearGreedScore <= 25) ||
              (marketDataOverride.drawdownAth !== undefined && marketDataOverride.drawdownAth >= 40);
            const isDeepGreed =
              (marketDataOverride.fearGreedScore !== undefined && marketDataOverride.fearGreedScore >= 75) ||
              (marketDataOverride.drawdownAth !== undefined && marketDataOverride.drawdownAth < 10);

            if (isDeepDiscount) {
              if (def.id === 'ahr999') currentVal = 0.35;
              if (def.id === 'mvrv_zscore') currentVal = -0.20;
              if (def.id === 'puell_multiple') currentVal = 0.40;
              if (def.id === 'ma_2y_multiplier') currentVal = 0.85;
              if (def.id === 'rsi_22d_crypto') currentVal = 28;
            } else if (isDeepGreed) {
              if (def.id === 'ahr999') currentVal = 2.20;
              if (def.id === 'mvrv_zscore') currentVal = 3.50;
              if (def.id === 'puell_multiple') currentVal = 2.20;
              if (def.id === 'ma_2y_multiplier') currentVal = 1.45;
              if (def.id === 'rsi_22d_crypto') currentVal = 75;
            }
          }
        } else if (asset.category === 'idx-equity') {
          const isExpensiveTop =
            (marketDataOverride.peRatio !== undefined &&
              marketDataOverride.pe5yAvg !== undefined &&
              marketDataOverride.peRatio >= marketDataOverride.pe5yAvg * 1.25) ||
            (marketDataOverride.drawdown52w !== undefined &&
              marketDataOverride.drawdown52w <= 3);

          const isBargainDiscount =
            (marketDataOverride.peRatio !== undefined &&
              marketDataOverride.pe5yAvg !== undefined &&
              marketDataOverride.peRatio <= marketDataOverride.pe5yAvg * 0.85) ||
            (marketDataOverride.drawdown52w !== undefined &&
              marketDataOverride.drawdown52w >= 18);

          if (
            def.id === 'pe_vs_5y_idx' &&
            marketDataOverride.peRatio !== undefined &&
            marketDataOverride.pe5yAvg !== undefined
          ) {
            const diffPct =
              ((marketDataOverride.peRatio - marketDataOverride.pe5yAvg) /
                marketDataOverride.pe5yAvg) *
              100;
            currentVal = Number(diffPct.toFixed(1));
          } else if (
            def.id === 'drawdown_52w_idx' &&
            marketDataOverride.drawdown52w !== undefined
          ) {
            currentVal = marketDataOverride.drawdown52w;
          } else if (def.id === 'pbv_vs_5y_idx') {
            if (isExpensiveTop) currentVal = 25.0;
            else if (isBargainDiscount) currentVal = -15.0;
          } else if (def.id === 'dividend_yield_spread') {
            if (isExpensiveTop) currentVal = 2.5;
            else if (isBargainDiscount) currentVal = 6.8;
          } else if (def.id === 'ihsg_sentiment') {
            if (isExpensiveTop) currentVal = 72;
            else if (isBargainDiscount) currentVal = 24;
          }
        } else if (asset.category === 'us-equity') {
          if (def.id === 'cnn_fear_greed_us' && marketDataOverride.fearGreedScore !== undefined) {
            currentVal = marketDataOverride.fearGreedScore;
          } else if (def.id === 'drawdown_52w_us' && marketDataOverride.drawdown52w !== undefined) {
            currentVal = marketDataOverride.drawdown52w;
          }
        }
      }

      if (def.id === 'fear_greed_crypto' && tacticalConfig?.cryptoScore !== undefined && marketDataOverride?.fearGreedScore === undefined) {
        currentVal = tacticalConfig.cryptoScore;
      } else if (def.id === 'ihsg_sentiment' && tacticalConfig?.idxEquityScore !== undefined) {
        currentVal = tacticalConfig.idxEquityScore;
      } else if (def.id === 'cnn_fear_greed_us' && tacticalConfig?.usEquityScore !== undefined && marketDataOverride?.fearGreedScore === undefined) {
        currentVal = tacticalConfig.usEquityScore;
      }

      // Tactical slider modulation across cycle indicator families
      if (tacticalConfig && override?.currentValue === undefined) {
        if (asset.category === 'crypto' && tacticalConfig.cryptoScore !== undefined && tacticalConfig.cryptoScore <= 25) {
          if (def.id === 'ahr999') currentVal = 0.35;
          if (def.id === 'mvrv_zscore') currentVal = -0.20;
          if (def.id === 'puell_multiple') currentVal = 0.40;
          if (def.id === 'ma_2y_multiplier') currentVal = 0.85;
          if (def.id === 'ath_drawdown_crypto') currentVal = 45.0;
          if (def.id === 'rsi_22d_crypto') currentVal = 28;
        } else if (
          asset.category === 'us-equity' &&
          tacticalConfig.usEquityScore !== undefined &&
          tacticalConfig.usEquityScore <= 40
        ) {
          if (def.id === 'fwd_pe_vs_5y_us') currentVal = -6.5;
          if (def.id === 'shiller_cape_us') currentVal = 26.0;
          if (def.id === 'drawdown_52w_us') currentVal = 10.5;
          if (def.id === 'ma_200d_us') currentVal = 0.95;
        } else if (
          asset.category === 'idx-equity' &&
          tacticalConfig.idxEquityScore !== undefined &&
          tacticalConfig.idxEquityScore <= 35
        ) {
          if (def.id === 'pe_vs_5y_idx') currentVal = -18.0;
          if (def.id === 'pbv_vs_5y_idx') currentVal = -15.0;
          if (def.id === 'drawdown_52w_idx') currentVal = 18.0;
          if (def.id === 'dividend_yield_spread') currentVal = 6.5;
        }
      }

      if (
        (def.id === 'ath_drawdown_crypto' || def.id === 'ath_drawdown_gold') &&
        currentPriceNative &&
        asset.defaultPrice &&
        marketDataOverride?.drawdownAth === undefined &&
        (tacticalConfig?.cryptoScore === undefined || tacticalConfig.cryptoScore > 25)
      ) {
        // Estimate live ATH drawdown
        const peak = Math.max(currentPriceNative, asset.defaultPrice * 1.25);
        if (peak > 0) {
          const dd = Math.max(0, ((peak - currentPriceNative) / peak) * 100);
          currentVal = Number(dd.toFixed(1));
        }
      }
    }

    const isTriggered = evaluateIndicatorRule(currentVal, operator, threshold);

    // Format strings
    let formattedCurrent = `${currentVal}${def.unit || ''}`;
    if (def.id.includes('drawdown') || def.id.includes('pe_vs_5y')) {
      formattedCurrent = `-${Math.abs(currentVal).toFixed(1)}%`;
    } else if (def.id.includes('fear_greed')) {
      formattedCurrent = `${currentVal}/100 (${getSentimentZone(currentVal)})`;
    } else if (def.unit === 'x') {
      formattedCurrent = `${currentVal.toFixed(2)}x`;
    }

    const opSymbol = operator === '<=' ? '≤' : operator === '>=' ? '≥' : operator;
    const formattedReference = `${opSymbol} ${threshold}${def.unit || ''}`;

    return {
      id: def.id,
      name: def.name,
      currentValue: currentVal,
      formattedCurrent,
      change24hPercent: change24h,
      referenceThreshold: threshold,
      comparisonOperator: operator,
      formattedReference,
      unit: def.unit,
      isTriggered,
      description: def.description,
      isManualOverride: Boolean(override?.currentValue !== undefined || override?.referenceThreshold !== undefined),
    };
  });

  const totalIndicators = indicatorStates.length;
  const triggeredCount = indicatorStates.filter((i) => i.isTriggered).length;
  const confluencePercent =
    totalIndicators > 0 ? Number(((triggeredCount / totalIndicators) * 100).toFixed(1)) : 0;

  const tier = getConfluenceActionTier(confluencePercent);

  const summary = `${triggeredCount} dari ${totalIndicators} indikator siklus Triggered (${confluencePercent}%). Rekomendasi: ${tier.actionLabel} (${tier.multiplier}x Multiplier).`;

  return {
    assetId: asset.id,
    symbol: asset.symbol,
    name: asset.name,
    category: asset.category,
    indicators: indicatorStates,
    totalIndicators,
    triggeredCount,
    confluencePercent,
    action: tier.action,
    actionLabel: tier.actionLabel,
    multiplier: tier.multiplier,
    badgeClass: tier.badgeClass,
    summary,
  };
}
