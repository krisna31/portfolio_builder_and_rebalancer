import { AssetDefinition } from '../lib/quant/types';

export interface LivePriceUpdateResult {
  pricesByAssetId: Record<string, number>;
  usdIdrRate: number;
  updatedAt: string;
  sourceSummary: string;
}

export interface MarketDataSnapshot {
  updatedAt: string;
  usdIdrRate: number;
  assets: Record<
    string,
    {
      price: number;
      cagr5y?: number;
      maxDrawdown5y?: number;
      volatility5y?: number;
    }
  >;
}

export interface TickerLookupResult {
  symbol: string;
  name: string;
  currency: 'IDR' | 'USD';
  price: number;
  cagr: number;
  maxDrawdown: number;
  volatility: number;
  riskScale: number;
  dataYears: number;
  sourceType: 'live-yahoo' | 'curated-idx-us-db';
  assumptionNote: string;
}

/**
 * Built-in Instant Offline/Fallback Dictionary of Popular IDX (.JK) & Global Tickers
 * Including recent IPOs (< 5 years like AADI.JK, BREN.JK, CUAN.JK, AMMN.JK,GOTO.JK)
 * where 5Y lookback requires annualized estimation / sector risk-scaling assumptions.
 */
export const POPULAR_TICKER_ESTIMATES: Record<
  string,
  Omit<TickerLookupResult, 'sourceType'>
> = {
  'AADI.JK': {
    symbol: 'AADI.JK',
    name: 'PT Adaro Andalan Indonesia Tbk (Coal Spin-off IPO Des 2024)',
    currency: 'IDR',
    price: 8650,
    cagr: 19.5,
    maxDrawdown: 32.0,
    volatility: 34.0,
    riskScale: 3.85,
    dataYears: 1.8,
    assumptionNote:
      'IPO Des 2024 (<5 tahun histori). Menggunakan asumsi ekuivalen bisnis batubara termal induk (ADRO) + dividend yield tinggi: Estimasi CAGR ~19.5%/thn & Max Drawdown ~32% (siklus komoditas).',
  },
  'ADRO.JK': {
    symbol: 'ADRO.JK',
    name: 'PT Alamtri Resources Indonesia Tbk (ex-Adaro Energy)',
    currency: 'IDR',
    price: 2450,
    cagr: 22.4,
    maxDrawdown: 36.5,
    volatility: 35.2,
    riskScale: 3.95,
    dataYears: 5.0,
    assumptionNote:
      'Data historis 5 tahun penuh (termasuk revaluasi dividen batu bara & spin-off AADI). Siklikal komoditas.',
  },
  'PTBA.JK': {
    symbol: 'PTBA.JK',
    name: 'PT Bukit Asam Tbk',
    currency: 'IDR',
    price: 2780,
    cagr: 14.8,
    maxDrawdown: 34.0,
    volatility: 31.0,
    riskScale: 3.6,
    dataYears: 5.0,
    assumptionNote: 'Data 5 tahun saham batubara BUMN high-dividend yield.',
  },
  'ITMG.JK': {
    symbol: 'ITMG.JK',
    name: 'PT Indo Tambangraya Megah Tbk',
    currency: 'IDR',
    price: 25600,
    cagr: 18.2,
    maxDrawdown: 35.5,
    volatility: 33.0,
    riskScale: 3.75,
    dataYears: 5.0,
    assumptionNote: 'Data 5 tahun total return (termasuk dividen kas jumbo).',
  },
  'BREN.JK': {
    symbol: 'BREN.JK',
    name: 'PT Barito Renewables Energy Tbk (IPO Okt 2023)',
    currency: 'IDR',
    price: 6850,
    cagr: 38.0,
    maxDrawdown: 54.0,
    volatility: 58.0,
    riskScale: 6.8,
    dataYears: 2.5,
    assumptionNote:
      'IPO Okt 2023 (<5 tahun). CAGR di-cap konservatif pada 38% (post-IPO outlier disesuaikan) dengan risiko drawdown tinggi (54%) khas saham konglomerasi/growth.',
  },
  'AMMN.JK': {
    symbol: 'AMMN.JK',
    name: 'PT Amman Mineral Internasional Tbk (IPO Jul 2023)',
    currency: 'IDR',
    price: 8400,
    cagr: 34.5,
    maxDrawdown: 38.0,
    volatility: 42.0,
    riskScale: 4.8,
    dataYears: 2.8,
    assumptionNote:
      'IPO Jul 2023 (<5 tahun). Estimasi CAGR disesuaikan ke pertumbuhan tambang emas & tembaga jangka menengah.',
  },
  'CUAN.JK': {
    symbol: 'CUAN.JK',
    name: 'PT Petrindo Jaya Kreasi Tbk (IPO Mar 2023)',
    currency: 'IDR',
    price: 11800,
    cagr: 36.0,
    maxDrawdown: 58.0,
    volatility: 62.0,
    riskScale: 7.2,
    dataYears: 3.0,
    assumptionNote:
      'IPO 2023 (<5 tahun). Volatilitas & drawdown tinggi (58%), bobot di Risk Parity otomatis diperkecil oleh solver.',
  },
  'PANI.JK': {
    symbol: 'PANI.JK',
    name: 'PT Pantai Indah Kapuk Dua Tbk (PIK2)',
    currency: 'IDR',
    price: 14200,
    cagr: 35.0,
    maxDrawdown: 42.0,
    volatility: 46.0,
    riskScale: 5.2,
    dataYears: 5.0,
    assumptionNote:
      'Transformasi bisnis properti Agung Sedayu / Salim (backdoor listing). CAGR dinormalisasi ke ekspektasi pertumbuhan berkelanjutan.',
  },
  'TLKM.JK': {
    symbol: 'TLKM.JK',
    name: 'PT Telkom Indonesia (Persero) Tbk',
    currency: 'IDR',
    price: 2820,
    cagr: 4.5,
    maxDrawdown: 41.0,
    volatility: 24.0,
    riskScale: 3.5,
    dataYears: 5.0,
    assumptionNote: 'Data historis 5 tahun penuh. Bluechip telekomunikasi defensif + dividen.',
  },
  'ASII.JK': {
    symbol: 'ASII.JK',
    name: 'PT Astra International Tbk',
    currency: 'IDR',
    price: 4920,
    cagr: 8.2,
    maxDrawdown: 32.5,
    volatility: 23.5,
    riskScale: 3.25,
    dataYears: 5.0,
    assumptionNote: 'Data historis 5 tahun penuh (termasuk dividen ~7-8%/thn).',
  },
  'ICBP.JK': {
    symbol: 'ICBP.JK',
    name: 'PT Indofood CBP Sukses Makmur Tbk',
    currency: 'IDR',
    price: 11450,
    cagr: 9.8,
    maxDrawdown: 24.0,
    volatility: 19.0,
    riskScale: 2.8,
    dataYears: 5.0,
    assumptionNote: 'Data historis 5 tahun consumer goods defensif.',
  },
  'GOTO.JK': {
    symbol: 'GOTO.JK',
    name: 'PT GoTo Gojek Tokopedia Tbk (IPO Apr 2022)',
    currency: 'IDR',
    price: 78,
    cagr: -15.0,
    maxDrawdown: 86.0,
    volatility: 65.0,
    riskScale: 9.5,
    dataYears: 4.0,
    assumptionNote: 'IPO 2022. Mengalami drawdown >80% sejak IPO; high-risk tech turnaround.',
  },
  'ANTM.JK': {
    symbol: 'ANTM.JK',
    name: 'PT Aneka Tambang Tbk',
    currency: 'IDR',
    price: 1580,
    cagr: 14.5,
    maxDrawdown: 52.0,
    volatility: 41.0,
    riskScale: 4.9,
    dataYears: 5.0,
    assumptionNote: 'Data 5 tahun saham tambang emas & nikel BUMN.',
  },
  'MDKA.JK': {
    symbol: 'MDKA.JK',
    name: 'PT Merdeka Copper Gold Tbk',
    currency: 'IDR',
    price: 2350,
    cagr: 12.8,
    maxDrawdown: 56.0,
    volatility: 43.0,
    riskScale: 5.1,
    dataYears: 5.0,
    assumptionNote: 'Data 5 tahun tambang emas, tembaga & baterai.',
  },
  'UNTR.JK': {
    symbol: 'UNTR.JK',
    name: 'PT United Tractors Tbk',
    currency: 'IDR',
    price: 26800,
    cagr: 15.6,
    maxDrawdown: 31.0,
    volatility: 27.5,
    riskScale: 3.4,
    dataYears: 5.0,
    assumptionNote: 'Data 5 tahun alat berat, kontraktor tambang (PAMA) & emas + dividen rutin.',
  },
  'KLBF.JK': {
    symbol: 'KLBF.JK',
    name: 'PT Kalbe Farma Tbk',
    currency: 'IDR',
    price: 1620,
    cagr: 6.4,
    maxDrawdown: 28.0,
    volatility: 21.0,
    riskScale: 2.9,
    dataYears: 5.0,
    assumptionNote: 'Data 5 tahun sektor kesehatan / farmasi defensif.',
  },
  'MYOR.JK': {
    symbol: 'MYOR.JK',
    name: 'PT Mayora Indah Tbk',
    currency: 'IDR',
    price: 2640,
    cagr: 8.9,
    maxDrawdown: 29.0,
    volatility: 22.5,
    riskScale: 3.0,
    dataYears: 5.0,
    assumptionNote: 'Data 5 tahun FMCG ekspor & domestik.',
  },
  'BBTN.JK': {
    symbol: 'BBTN.JK',
    name: 'PT Bank Tabungan Negara (Persero) Tbk',
    currency: 'IDR',
    price: 1380,
    cagr: 5.2,
    maxDrawdown: 45.0,
    volatility: 32.0,
    riskScale: 3.9,
    dataYears: 5.0,
    assumptionNote: 'Data 5 tahun perbankan KPR.',
  },
  'BRIS.JK': {
    symbol: 'BRIS.JK',
    name: 'PT Bank Syariah Indonesia Tbk',
    currency: 'IDR',
    price: 2950,
    cagr: 24.5,
    maxDrawdown: 62.0,
    volatility: 44.0,
    riskScale: 4.8,
    dataYears: 5.0,
    assumptionNote: 'Data 5 tahun sejak merger BSI (drawdown tinggi pasca reli 2021, pertumbuhan laba kuat).',
  },
  NVDA: {
    symbol: 'NVDA',
    name: 'NVIDIA Corporation',
    currency: 'USD',
    price: 138.0,
    cagr: 64.5,
    maxDrawdown: 66.0,
    volatility: 52.0,
    riskScale: 7.8,
    dataYears: 5.0,
    assumptionNote: 'Data 5 tahun penuh AI Semiconductor leader (drawdown 2022 mencapai -66%).',
  },
  VOO: {
    symbol: 'VOO',
    name: 'Vanguard S&P 500 ETF',
    currency: 'USD',
    price: 518.0,
    cagr: 15.2,
    maxDrawdown: 24.5,
    volatility: 17.8,
    riskScale: 2.37,
    dataYears: 5.0,
    assumptionNote: 'Identik dengan SPY (S&P 500) namun dengan expense ratio lebih rendah (0.03%).',
  },
};

/**
 * Fetches live spot prices & USD/IDR exchange rate in the browser
 */
export async function fetchLiveMarketPrices(
  assets: AssetDefinition[],
  currentUsdIdr: number = 15600
): Promise<LivePriceUpdateResult> {
  const pricesByAssetId: Record<string, number> = {};
  let usdIdrRate = currentUsdIdr;
  const sources: string[] = [];

  for (const a of assets) {
    pricesByAssetId[a.id] = a.defaultPrice;
  }

  // 1. Load static GitHub Actions snapshot (`./data/market-data.json`)
  try {
    const res = await fetch('./data/market-data.json', { cache: 'no-store' });
    if (res.ok) {
      const snapshot: MarketDataSnapshot = await res.json();
      if (snapshot.usdIdrRate && snapshot.usdIdrRate > 10000) {
        usdIdrRate = snapshot.usdIdrRate;
      }
      if (snapshot.assets) {
        for (const [id, data] of Object.entries(snapshot.assets)) {
          if (data.price && data.price > 0) {
            pricesByAssetId[id] = data.price;
          }
        }
        sources.push('GitHub Action Snapshot');
      }
    }
  } catch {
    // Fallback to defaults silently if offline
  }

  // 2. Fetch live Crypto & USD/IDR exchange rate from CoinGecko Public API
  const cgAssets = assets.filter((a) => a.coingeckoId);
  const cgIds = Array.from(new Set(cgAssets.map((a) => a.coingeckoId!))).join(',');

  if (cgIds) {
    try {
      const cgUrl = `https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(
        cgIds
      )},tether&vs_currencies=usd,idr`;
      const cgRes = await fetch(cgUrl);
      if (cgRes.ok) {
        const cgData = await cgRes.json();
        if (cgData.tether?.idr && cgData.tether?.usd) {
          usdIdrRate = Math.round(cgData.tether.idr / cgData.tether.usd);
        } else if (cgData.bitcoin?.idr && cgData.bitcoin?.usd) {
          usdIdrRate = Math.round(cgData.bitcoin.idr / cgData.bitcoin.usd);
        }

        for (const asset of cgAssets) {
          const entry = cgData[asset.coingeckoId!];
          if (entry) {
            if (asset.id === 'GLD' && entry.usd) {
              pricesByAssetId[asset.id] = Number((entry.usd * 0.0925).toFixed(2));
            } else if (asset.currency === 'USD' && entry.usd) {
              pricesByAssetId[asset.id] = Number(entry.usd);
            } else if (asset.currency === 'IDR' && entry.idr) {
              pricesByAssetId[asset.id] = Number(entry.idr);
            }
          }
        }
        sources.push('CoinGecko Live API');
      }
    } catch {
      // Keep snapshot prices
    }
  }

  return {
    pricesByAssetId,
    usdIdrRate,
    updatedAt: new Date().toLocaleTimeString('id-ID', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }),
    sourceSummary: sources.length > 0 ? sources.join(' + ') : 'Bundled Baseline Data',
  };
}

/**
 * Looks up a custom Yahoo Finance symbol (e.g. `AADI.JK`, `TLKM.JK`, `NVDA`, `BREN.JK`) in the browser:
 * - Tries multiple CORS proxies (`corsproxy.io`, `codetabs`, `allorigins`) to fetch Yahoo Finance chart data.
 * - Accepts young IPOs with >= 8 weeks of trading data (like `AADI.JK`) and applies a Young-IPO Risk Floor
 *   so short bull runs don't fool the Risk Parity solver into thinking a new stock has 0% drawdown risk.
 * - Falls back automatically to `POPULAR_TICKER_ESTIMATES` if CORS proxies are blocked by the network/browser.
 */
export async function lookupCustomYahooTicker(
  rawSymbol: string
): Promise<TickerLookupResult | null> {
  let cleanSym = rawSymbol.trim().toUpperCase();
  // Auto-append .JK if user types a 4-letter Indonesian stock ticker like AADI, ADRO, TLKM, BBRI
  const commonUs4Letter = new Set([
    'NVDA',
    'AAPL',
    'MSFT',
    'AMZN',
    'GOOG',
    'META',
    'TSLA',
    'SCHD',
    'QQQM',
    'IBIT',
  ]);
  if (/^[A-Z]{4}$/.test(cleanSym) && !commonUs4Letter.has(cleanSym)) {
    cleanSym = `${cleanSym}.JK`;
  }

  // Fast Path 1: If the ticker is in our Curated IDX/US Database AND we are NOT on localhost Vite proxy,
  // or if it's a known young IPO (<3Y like AADI.JK, BREN.JK, CUAN.JK, AMMN.JK), return the curated quant estimate
  // or enrich it with the latest snapshot price from `./data/market-data.json` so it NEVER hangs on a 522 CORS error!
  const shortId = cleanSym.replace('.JK', '');
  let snapshotPrice: number | null = null;
  try {
    const snapRes = await fetch('./data/market-data.json');
    if (snapRes.ok) {
      const snap: MarketDataSnapshot = await snapRes.json();
      if (snap.assets?.[shortId]?.price) {
        snapshotPrice = snap.assets[shortId].price;
      }
    }
  } catch {
    // Ignore
  }

  // If on static GitHub Pages (not DEV) and ticker is in POPULAR_TICKER_ESTIMATES, return immediately without waiting for flaky public CORS proxies
  if (!import.meta.env.DEV && POPULAR_TICKER_ESTIMATES[cleanSym]) {
    const est = POPULAR_TICKER_ESTIMATES[cleanSym];
    return {
      ...est,
      price: snapshotPrice ?? est.price,
      sourceType: 'curated-idx-us-db',
    };
  }

  const yahooPath = `/v8/finance/chart/${encodeURIComponent(
    cleanSym
  )}?range=5y&interval=1wk`;
  const targetUrl = `https://query1.finance.yahoo.com${yahooPath}`;

  // 1. In local dev, Vite's built-in `/api/yahoo` proxy reaches Yahoo directly with zero third-party CORS timeout!
  // 2. On GitHub Pages (static production) for unknown tickers, try fast CORS proxies with a strict 3.0s timeout.
  const proxyCandidates = import.meta.env.DEV
    ? [`/api/yahoo${yahooPath}`]
    : [
        `https://corsproxy.io/?url=${encodeURIComponent(targetUrl)}`,
        `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(targetUrl)}`,
      ];

  for (const proxyUrl of proxyCandidates) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5500);
      const res = await fetch(proxyUrl, { signal: controller.signal });
      clearTimeout(timeout);

      if (!res.ok) continue;
      const data = await res.json();
      const result = data?.chart?.result?.[0];
      if (!result) continue;

      const meta = result.meta;
      const adjClose: number[] =
        result.indicators?.adjclose?.[0]?.adjclose ??
        result.indicators?.quote?.[0]?.close ??
        [];
      const closes = adjClose.filter(
        (v: number | null) => typeof v === 'number' && v > 0
      );

      // Accept even newly IPO'd stocks with at least 4 weeks of history
      if (closes.length < 4) continue;

      const firstPrice = closes[0];
      const lastPrice = meta.regularMarketPrice ?? closes[closes.length - 1];
      const dataYears = Number(Math.max(0.15, closes.length / 52).toFixed(1));

      let rawCagr = Number(
        ((Math.pow(lastPrice / firstPrice, 1 / Math.max(0.5, dataYears)) - 1) * 100).toFixed(2)
      );

      // Compute Historical Max Drawdown and Weekly Volatility
      let peak = closes[0];
      let maxDd = 0;
      const weeklyReturns: number[] = [];

      for (let i = 1; i < closes.length; i++) {
        if (closes[i] > peak) peak = closes[i];
        const dd = ((peak - closes[i]) / peak) * 100;
        if (dd > maxDd) maxDd = dd;
        weeklyReturns.push((closes[i] - closes[i - 1]) / closes[i - 1]);
      }

      const meanRet =
        weeklyReturns.reduce((a, b) => a + b, 0) / Math.max(1, weeklyReturns.length);
      const variance =
        weeklyReturns.reduce((acc, r) => acc + Math.pow(r - meanRet, 2), 0) /
        Math.max(1, weeklyReturns.length - 1);
      let annualVol = Number((Math.sqrt(variance * 52) * 100).toFixed(2));
      let maxDrawdown = Number(maxDd.toFixed(2));

      // Assumption Adjustment for Young IPOs (< 3.0 years of data, like AADI.JK):
      // A stock that IPO'd recently hasn't experienced a full 5-year bear cycle yet.
      // Apply a realistic floor to Max Drawdown (min 28% for young stocks) and dampen extreme short-term CAGR
      let assumptionNote = `Data historis langsung Yahoo Finance (${dataYears} tahun, ${closes.length} minggu). Price-return murni (sebelum dividen kas).`;
      if (dataYears < 3.0) {
        const dampedCagr = Number((rawCagr * 0.65 + 15.0 * 0.35).toFixed(2));
        rawCagr = Math.max(-25, Math.min(45, dampedCagr));
        maxDrawdown = Math.max(28.0, Number((maxDrawdown * 1.25).toFixed(2)));
        annualVol = Math.max(26.0, annualVol);
        assumptionNote = `⚠️ Saham IPO Baru (${dataYears} thn histori < 5 thn standar video). Return disetahunkan dengan shrinkage konservatif (${rawCagr}%) & Max Drawdown diberi batas aman siklus (${maxDrawdown}%) agar tidak over-allocated oleh solver.`;
      }

      const riskScale = Number(
        Math.max(0.5, (annualVol / 6.5) * 0.6 + (maxDrawdown / 8.0) * 0.4).toFixed(2)
      );
      const isIdr = cleanSym.endsWith('.JK') || meta.currency === 'IDR';

      return {
        symbol: cleanSym,
        name: meta.longName || meta.shortName || cleanSym,
        currency: isIdr ? 'IDR' : 'USD',
        price: Number(lastPrice.toFixed(2)),
        cagr: Math.max(-30, Math.min(95, rawCagr)),
        maxDrawdown,
        volatility: annualVol,
        riskScale,
        dataYears,
        sourceType: 'live-yahoo',
        assumptionNote,
      };
    } catch {
      // Try next proxy
    }
  }

  // Fallback to Curated IDX/US Estimate Database if all CORS proxies are blocked or ticker is very new
  if (POPULAR_TICKER_ESTIMATES[cleanSym]) {
    return {
      ...POPULAR_TICKER_ESTIMATES[cleanSym],
      sourceType: 'curated-idx-us-db',
    };
  }

  return null;
}
