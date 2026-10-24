/**
 * Core Quantitative Portfolio Builder & Rebalancer Types
 * Based on Leon Hartono's "Cara Dapet Rp10 MILIAR PERTAMA" (Risk Parity & Risk Budgeting)
 */

export type AssetCategory =
  | 'money-market'
  | 'bonds'
  | 'idx-equity'
  | 'gold'
  | 'us-equity'
  | 'crypto'
  | 'custom';

export type CurrencyCode = 'IDR' | 'USD';

export type RiskTier = 'super-high' | 'high' | 'medium' | 'low';

export type AllocationMethod = 'preset' | 'all-in' | 'risk-parity' | 'risk-budgeting' | 'custom';

export type InvestorArchetype = 'all' | 'business-owner' | 'full-time-investor' | 'hybrid-conviction';

export interface AssetDefinition {
  id: string;
  symbol: string;
  name: string;
  shortName: string;
  category: AssetCategory;
  currency: CurrencyCode;
  /** Annualized Compound Annual Growth Rate (%) over 5Y lookback */
  cagr: number;
  /** Maximum historical drawdown (%) over 5Y lookback (positive number e.g. 76.15 means -76.15%) */
  maxDrawdown: number;
  /** Annualized return volatility (%) */
  volatility: number;
  /** Calibrated risk scale used by the Risk Parity / Risk Budgeting solver */
  riskScale: number;
  /** Default latest spot price in asset's native currency */
  defaultPrice: number;
  /** Lot size (e.g., 100 for IDX stocks, 1 for US ETFs/Mutual Funds, fractional for Crypto) */
  lotSize: number;
  /** Whether fractional units are supported (true for Crypto, US ETFs, Mutual Funds) */
  allowFractional: boolean;
  /** Whether this is one of the 8 core video benchmark assets */
  isCoreBenchmark: boolean;
  /** Optional parent benchmark bucket ID if this is a diversification peer (e.g. BMRI -> BBCA) */
  parentBenchmarkId?: string;
  /** CoinGecko ID for live price fetching if crypto/gold */
  coingeckoId?: string;
  /** Yahoo Finance symbol for live price / GitHub Action fetching */
  yahooSymbol?: string;
  /** Color hex for charts */
  color: string;
  /** Brief description of role in portfolio */
  description: string;
  /** Estimated annual gross dividend / coupon yield (%) */
  dividendYield?: number;
  /** Default dividend/coupon withholding tax (%) if not tax-exempt */
  dividendTaxPercent?: number;
  /** If true, asset trades in pure IDR nominals without 100-share BEI lot rounding (e.g. Mutual Funds/Reksa Dana) */
  isNominalOnly?: boolean;
  /** Original base name before user customization */
  originalName?: string;
  /** Original ticker/shortName before user customization */
  originalShortName?: string;
  /** Original lot size before user customization */
  originalLotSize?: number;
  /** Whether this asset has been customized/renamed by user */
  isRenamed?: boolean;
}

export interface PortfolioPreset {
  id: string;
  rank?: number;
  name: string;
  method: 'all-in' | 'risk-parity' | 'risk-budgeting' | 'custom';
  riskTier: RiskTier;
  /** Conviction asset ID if method === 'risk-budgeting' */
  convictionAssetId?: string;
  /** Risk budget % allocated to conviction asset (e.g. 70 or 90) */
  convictionRiskPercent?: number;
  /** Exact CAGR (%) reported in the video or dynamically solved */
  cagr: number;
  /** Exact Max Drawdown (%) reported in the video or dynamically solved */
  maxDrawdown: number;
  /** Whether this portfolio is in the 15 Optimal (Pareto-efficient) set vs dominated */
  isOptimal15: boolean;
  /** Whether this is a user-pinned custom row in the table */
  isCustomRow?: boolean;
  /** Explanation if dominated by another portfolio (mentioned at 10:16 in video) */
  dominatedByReason?: string;
  /** Target capital weights (%) keyed by Asset ID (sums to 100) */
  weights: Record<string, number>;
  /** Notes / commentary from the video */
  videoNote?: string;
}

export interface DominatingPresetInfo {
  presetId: string;
  name: string;
  cagr: number;
  maxDrawdown: number;
  cagrDiff: number; // positive means higher CAGR
  maxDdDiff: number; // positive means lower drawdown (safer)
}

export interface SolvedPortfolio {
  weights: Record<string, number>; // Capital weights summing to 100%
  riskContributions: Record<string, number>; // Risk contributions summing to 100%
  cagr: number;
  maxDrawdown: number;
  volatility: number;
  sharpeRatio: number;
  riskTier: RiskTier;
  isParetoDominated: boolean;
  dominatingPresets: string[];
  dominatingPresetItems?: DominatingPresetInfo[];
}

export interface SubAssetSplit {
  id: string;
  symbol: string;
  name: string;
  /** Share of the parent bucket (0 to 100%) */
  shareOfBucketPercent: number;
}

export interface HoldingEntry {
  assetId: string;
  /** Current value in IDR (used when inputMode === 'nominal') */
  currentValueIdr: number;
  /** Number of units / shares held (used when inputMode === 'units') */
  units: number;
  /** Current price per unit in native currency */
  currentPrice: number;
  /** Optional simulated shock percentage (-90% to +500%) for Crash / Bull Run testing */
  shockPercent: number;
  /** Optional sub-asset diversification splits within this bucket */
  subSplits?: SubAssetSplit[];
  /** Optional flag: treat asset as pure nominal value without market price / unit volatility (e.g. bonds, deposits, cash) */
  isNominalOnly?: boolean;
  /** Optional custom notes / allocation memo for this holding */
  notes?: string;
}

export type RebalanceMode =
  | 'sell-and-buy'
  | 'selective-profit-trim'
  | 'trim-defensive-first'
  | 'buy-only-dca';

export interface RebalanceItemResult {
  assetId: string;
  symbol: string;
  name: string;
  color: string;
  targetWeightPercent: number;
  initialValueIdr: number;
  postShockValueIdr: number;
  currentWeightPercent: number;
  /** Absolute drift = currentWeightPercent - targetWeightPercent */
  absoluteDriftPercent: number;
  /** Relative drift = ((currentWeightPercent - targetWeightPercent) / targetWeightPercent) * 100 */
  relativeDriftPercent: number;
  isDriftBreached: boolean;
  targetValueIdr: number;
  /** Positive = BUY, Negative = SELL */
  tradeAmountIdr: number;
  tradeAmountUsd: number;
  /** Number of units/shares to buy or sell */
  tradeUnits: number;
  /** Number of IDX lots (if lotSize === 100) */
  tradeLots?: number;
  /** Whole integer lots for IDX stocks (1 Lot = 100 lembar) */
  tradeLotsInteger?: number;
  /** Unallocated remainder Rupiah from fractional lot rounding */
  tradeLotsRemainderIdr?: number;
  /** Estimated broker transaction fee & taxes (IDR) */
  estimatedFeeIdr?: number;
  /** Whether this asset is handled as nominal-only / price-free (e.g. bonds, deposits, cash) */
  isNominalOnly?: boolean;
  action: 'BUY' | 'SELL' | 'HOLD';
  /** Whether this item was suppressed to HOLD by the anti-dust trade filter */
  isDustFiltered?: boolean;
  /** Optional tactical valuation signal information when Dynamic Valuation Band is enabled */
  tacticalSignal?: TacticalSignalInfo;
}

export type SentimentZone =
  | 'extreme-fear'
  | 'fear'
  | 'neutral'
  | 'greed'
  | 'extreme-greed';

export interface TacticalSignalInfo {
  sentimentZone: SentimentZone;
  sentimentScore: number;
  sentimentLabel: string;
  badgeLabel: string;
  tiltMultiplierPercent: number;
  baseTargetWeightPercent: number;
  tacticalTargetWeightPercent: number;
  reason?: string;
}

export interface ValuationSentimentConfig {
  enabled: boolean;
  aggressiveness: number;
  cryptoScore: number;
  usEquityScore: number;
  idxEquityScore: number;
  goldScore?: number;
}

export interface RebalanceSummaryResult {
  initialTotalIdr: number;
  postShockTotalIdr: number;
  cashInjectionIdr: number;
  finalTargetTotalIdr: number;
  totalBuyIdr: number;
  totalSellIdr: number;
  maxAbsoluteDrift: number;
  breachedCount: number;
  lotRoundingEnabled?: boolean;
  unallocatedCashRemainderIdr?: number;
  totalEstimatedFeeIdr?: number;
  /** Count of small dust trades suppressed into HOLD */
  suppressedDustTradesCount?: number;
  /** Human-readable strategy name */
  rebalanceMode?: RebalanceMode;
  /** Whether Dynamic Valuation Band (Fear & Greed Tactical Allocation) is active */
  tacticalBandActive?: boolean;
  tacticalAggressiveness?: number;
  items: RebalanceItemResult[];
}

export interface WealthProjectionPoint {
  year: number;
  month: number;
  totalPrincipalIdr: number;
  totalValueIdr: number;
  totalGainIdr: number;
  drawdownFloorIdr: number;
  /** Real purchasing power adjusted for annual inflation */
  realPurchasingPowerIdr?: number;
}

export interface WealthSimulationResult {
  yearsToGoal: number;
  monthsToGoal: number;
  exactYearsFloat: number;
  reachedGoal: boolean;
  finalValueAfter25YIdr: number;
  totalPrincipalAtGoalIdr: number;
  totalGainAtGoalIdr: number;
  realInflationRatePercent?: number;
  realPurchasingPowerAtGoalIdr?: number;
  realYearsToGoalFloat?: number;
  monthlyLivingCostTargetIdr?: number;
  requiredNestEggSWRIdr?: number;
  monthsToFinancialFreedomDividends?: number | null;
  monthsToFinancialFreedomSWR?: number | null;
  yearsToFinancialFreedomDividendsFloat?: number | null;
  yearsToFinancialFreedomSWRFloat?: number | null;
  timeline: WealthProjectionPoint[];
}

export interface RebalanceHistoryEntry {
  id: string;
  timestamp: string;
  note: string;
  totalValueBeforeIdr: number;
  cashInjectedIdr: number;
  totalValueAfterIdr: number;
  totalBuyIdr: number;
  totalSellIdr: number;
  tradesSummary: string[];
  weightsAfter: Record<string, number>;
}

export interface CrashLadderStep {
  dropPercent: number; // e.g. -10, -20, -35, -50
  limitPriceNative: number;
  limitPriceIdr: number;
  rebalanceBuyAmountIdr: number;
  rebalanceBuyUnits: number;
  rebalanceBuyLots?: number;
  fundingFromDefensiveIdr: number;
  postCrashPortfolioIdr: number;
}

export interface QuantPortoBackupPayload {
  version: 2;
  app: 'QuantPorto';
  exportedAt: string;
  data: {
    menu1_builder: {
      activeWeights: Record<string, number>;
      activePresetId?: string | null;
      allocationMethod?: AllocationMethod;
      convictionAssetId?: string;
      convictionRiskPercent?: number;
      solverMode?: 'calibrated-video' | 'euler-covariance';
      selectedUniverseIds?: string[];
      pinnedPresetIds?: string[];
      customTableRows?: PortfolioPreset[];
      slotMap?: Record<string, string>;
      customAssets?: AssetDefinition[];
      customizedCoreAssets?: AssetDefinition[];
      allAssets?: AssetDefinition[];
      rdptPromoActive?: boolean;
      lockedAssetIds?: string[];
    };
    menu2_rebalancer: {
      holdings: Record<string, HoldingEntry>;
      rebalanceHistory: RebalanceHistoryEntry[];
      inputMode?: 'nominal' | 'units';
      rebalanceMode?: RebalanceMode;
      cashInjectionIdr?: number;
      driftThresholdPercent?: number;
      isHoldingsSyncedWithMenu1?: boolean;
      enableIdxLotRounding?: boolean;
      enableBrokerFees?: boolean;
      filterDustTrades?: boolean;
      isFixedBudgetMode?: boolean;
      fixedTotalBudgetIdr?: number;
      tacticalConfig?: ValuationSentimentConfig;
    };
    menu3_simulator: {
      initialCapitalIdr?: number;
      targetGoalIdr?: number;
      monthlySavingsIdr?: number;
    };
    global: {
      usdIdrRate: number;
      savedPortfolios: any[];
    };
  };
}


