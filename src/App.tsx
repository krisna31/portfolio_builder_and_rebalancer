import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  CORE_AND_EXPANDED_ASSETS,
  VIDEO_PORTFOLIO_PRESETS,
  VIDEO_1B_REBALANCE_EXAMPLE,
} from './data/presets';
import {
  AssetDefinition,
  AllocationMethod,
  HoldingEntry,
  PortfolioPreset,
  RebalanceHistoryEntry,
  RebalanceMode,
  RebalanceSummaryResult,
  QuantPortoBackupPayload,
  ValuationSentimentConfig,
} from './lib/quant/types';
import { formatIdr } from './lib/formatters';
import { Check, X } from 'lucide-react';
import {
  buildDynamicPresetsForSlotMap,
  evaluatePortfolioMetrics,
  normalizeWeightsTo100,
  solveRiskBudgetingWeights,
} from './lib/quant/riskParitySolver';
import {
  calculateRebalancePlan,
  computeUpdatedAverageCostBasis,
} from './lib/quant/rebalancerEngine';
import { fetchLiveMarketPrices } from './services/priceFeed';
import { startInteractiveTour, stopInteractiveTour } from './services/tourGuide';
import { Header, SavedPortfolioSnapshot } from './components/Header';
import { PortfolioBuilderView } from './components/builder/PortfolioBuilderView';
import { PortfolioRebalancerView } from './components/rebalancer/PortfolioRebalancerView';
import { WealthRoadmapView } from './components/roadmap/WealthRoadmapView';
import { SmartPortfolioRecommenderModal } from './components/builder/SmartPortfolioRecommenderModal';
import { PortfolioFactsheetModal } from './components/export/PortfolioFactsheetModal';
import { BrokerOrderSlipModal } from './components/export/BrokerOrderSlipModal';
import { ResetConfirmationModal } from './components/ResetConfirmationModal';
import { DataTransferModal } from './components/export/DataTransferModal';
import {
  SmartDcaOverflowMode,
  SmartDcaAllocationMode,
} from './lib/quant/smartDcaEngine';
import { ParsedHoldingItem, utf8ToBase64, base64ToUtf8 } from './lib/quant/textDataParser';
import { PortfolioRecommendationItem } from './lib/quant/portfolioRecommender';
import { AuthLockScreen } from './components/auth/AuthLockScreen';
import { MissingEnvScreen } from './components/auth/MissingEnvScreen';
import { isSessionAuthenticated, revokeSession } from './lib/auth/authUtils';

const STORAGE_KEY = 'quantporto_state_v2';
const SAVED_PORTFOLIOS_KEY = 'quantporto_saved_portfolios_v1';
const TOUR_SEEN_KEY = 'quantporto_tour_seen_v2';

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

const CONFIGURED_PASSWORD_HASH = (
  (import.meta.env.VITE_APP_PASSWORD_HASH as string | undefined) || ''
).trim();

interface PersistedAppState {
  activeTab?: 'builder' | 'rebalancer' | 'roadmap';
  activeWeights?: Record<string, number>;
  activePresetId?: string | null;
  allocationMethod?: AllocationMethod;
  convictionAssetId?: string;
  convictionRiskPercent?: number;
  solverMode?: 'calibrated-video' | 'euler-covariance';
  selectedUniverseIds?: string[];
  pinnedPresetIds?: string[];
  lockedAssetIds?: string[];
  rdptPromoActive?: boolean;
  initialCapitalIdr?: number;
  targetGoalIdr?: number;
  monthlySavingsIdr?: number;
  usdIdrRate?: number;
  inputMode?: 'nominal' | 'units';
  rebalanceMode?: RebalanceMode;
  cashInjectionIdr?: number;
  isFixedBudgetMode?: boolean;
  fixedTotalBudgetIdr?: number;
  smartDcaMonthlyBudgetIdr?: number;
  smartDcaOverflowMode?: SmartDcaOverflowMode;
  smartDcaAllocationMode?: SmartDcaAllocationMode;
  smartDcaIndicatorOverrides?: Record<string, Record<string, any>>;
  driftThresholdPercent?: number;
  isHoldingsSyncedWithMenu1?: boolean;
  enableIdxLotRounding?: boolean;
  enableBrokerFees?: boolean;
  filterDustTrades?: boolean;
  tacticalConfig?: ValuationSentimentConfig;
  holdings?: Record<string, HoldingEntry>;
  slotMap?: Record<string, string>;
  customTableRows?: PortfolioPreset[];
  rebalanceHistory?: RebalanceHistoryEntry[];
  allAssets?: AssetDefinition[];
}

function getInitialSavedState(): PersistedAppState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function App() {
  const [initialSaved] = useState<PersistedAppState | null>(() => getInitialSavedState());

  // Session Authentication State (Strict requirement: locked unless authenticated in current tab)
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => {
    if (!CONFIGURED_PASSWORD_HASH) return false;
    return isSessionAuthenticated();
  });

  const handleLockApp = () => {
    stopInteractiveTour();
    revokeSession();
    setIsAuthenticated(false);
  };

  const [activeTab, setActiveTab] = useState<'builder' | 'rebalancer' | 'roadmap'>(() => {
    if (initialSaved?.activeTab && ['builder', 'rebalancer', 'roadmap'].includes(initialSaved.activeTab)) {
      return initialSaved.activeTab;
    }
    return 'builder';
  });

  // Asset Universe (8 Core Video Benchmarks + Expanded IDX/US/Crypto + User Custom Assets)
  const [allAssets, setAllAssets] = useState<AssetDefinition[]>(() => {
    if (Array.isArray(initialSaved?.allAssets) && initialSaved.allAssets.length > 0) {
      const savedMap = new Map<string, AssetDefinition>(
        initialSaved.allAssets.map((a: AssetDefinition) => [a.id, a])
      );
      const merged = CORE_AND_EXPANDED_ASSETS.map((curr) => {
        const s = savedMap.get(curr.id);
        if (!s) return curr;
        const shortName = s.shortName ?? curr.shortName;
        return {
          ...curr,
          cagr: s.cagr ?? curr.cagr,
          maxDrawdown: s.maxDrawdown ?? curr.maxDrawdown,
          name: s.name ?? curr.name,
          shortName,
          symbol: s.symbol ?? shortName ?? curr.symbol,
          isNominalOnly: s.isNominalOnly !== undefined ? s.isNominalOnly : curr.isNominalOnly,
          lotSize: s.lotSize !== undefined ? s.lotSize : curr.lotSize,
          allowFractional: s.allowFractional !== undefined ? s.allowFractional : curr.allowFractional,
          originalName: s.originalName ?? curr.originalName ?? curr.name,
          originalShortName: s.originalShortName ?? curr.originalShortName ?? curr.shortName,
          originalLotSize: s.originalLotSize !== undefined ? s.originalLotSize : (curr.originalLotSize ?? curr.lotSize),
          isRenamed: Boolean(s.isRenamed),
        };
      });
      const currIds = new Set(CORE_AND_EXPANDED_ASSETS.map((a) => a.id));
      const additions = initialSaved.allAssets.filter(
        (a: AssetDefinition) => !currIds.has(a.id)
      );
      return [...merged, ...additions];
    }
    return CORE_AND_EXPANDED_ASSETS;
  });

  // Dynamic Slot Map for the 8 Table Columns (allows replacing e.g. BBCA -> PTBA across all 15 rows!)
  const [slotMap, setSlotMap] = useState<Record<string, string>>(
    () => initialSaved?.slotMap ?? DEFAULT_SLOT_MAP
  );

  // User-Pinned Custom Rows in the main comparison table
  // Pre-seeded with 1 default custom example row ("Custom Risk Parity: PTBA ganti BBCA") so user immediately sees it in the table!
  const [customTableRows, setCustomTableRows] = useState<PortfolioPreset[]>(() => {
    if (Array.isArray(initialSaved?.customTableRows) && initialSaved.customTableRows.length > 0) {
      return initialSaved.customTableRows;
    }
    const ptbaAssets = CORE_AND_EXPANDED_ASSETS.filter((a) =>
      ['RDPT', 'PTBA', 'GLD', 'SPY', 'QQQ', 'BTC', 'ETH'].includes(a.id)
    );
    const weights = solveRiskBudgetingWeights(ptbaAssets, 'risk-parity');
    const metrics = evaluatePortfolioMetrics(
      weights,
      CORE_AND_EXPANDED_ASSETS,
      VIDEO_PORTFOLIO_PRESETS
    );
    return [
      {
        id: 'custom-default-ptba-rp',
        name: 'Custom Risk Parity (PTBA ganti BBCA)',
        method: 'risk-parity',
        riskTier: metrics.riskTier,
        cagr: metrics.cagr,
        maxDrawdown: metrics.maxDrawdown,
        isOptimal15: true,
        isCustomRow: true,
        weights,
        videoNote:
          'Contoh Default Custom: Mengganti slot BBCA menjadi PTBA.JK di Risk Parity 7 Aset.',
      },
    ];
  });

  // Selected Universe for Quant Solver
  const [selectedUniverseIds, setSelectedUniverseIds] = useState<string[]>(() => {
    if (Array.isArray(initialSaved?.selectedUniverseIds) && initialSaved.selectedUniverseIds.length > 0) {
      return initialSaved.selectedUniverseIds;
    }
    return ['RDPT', 'BBCA', 'GLD', 'SPY', 'QQQ', 'BTC', 'ETH'];
  });

  // Active Preset / Method / Weights
  const defaultPreset = VIDEO_PORTFOLIO_PRESETS.find(
    (p) => p.id === 'opt-4-rb-btc-90'
  )!;
  const [activePresetId, setActivePresetId] = useState<string | null>(() => {
    if (initialSaved?.activePresetId !== undefined) {
      return initialSaved.activePresetId;
    }
    return defaultPreset.id;
  });

  // User-Pinned Preset IDs in the main comparison table (pinned to top)
  const [pinnedPresetIds, setPinnedPresetIds] = useState<string[]>(() => {
    if (Array.isArray(initialSaved?.pinnedPresetIds)) {
      return initialSaved.pinnedPresetIds;
    }
    return ['opt-4-rb-btc-90'];
  });

  const handleTogglePinPreset = (presetId: string) => {
    setPinnedPresetIds((prev) =>
      prev.includes(presetId)
        ? prev.filter((id) => id !== presetId)
        : [presetId, ...prev]
    );
  };
  const [allocationMethod, setAllocationMethod] = useState<AllocationMethod>(
    () => initialSaved?.allocationMethod ?? 'preset'
  );
  const [convictionAssetId, setConvictionAssetId] = useState<string>(
    () => initialSaved?.convictionAssetId ?? 'BTC'
  );
  const [convictionRiskPercent, setConvictionRiskPercent] = useState<number>(
    () => initialSaved?.convictionRiskPercent ?? 90
  );
  const [solverMode, setSolverMode] = useState<
    'calibrated-video' | 'euler-covariance'
  >(() => initialSaved?.solverMode ?? 'calibrated-video');
  const [activeWeights, setActiveWeights] = useState<Record<string, number>>(() => {
    if (initialSaved?.activeWeights) {
      const matchedPreset = initialSaved.activePresetId
        ? VIDEO_PORTFOLIO_PRESETS.find((p) => p.id === initialSaved.activePresetId)
        : null;
      const sumW = Object.values(initialSaved.activeWeights).reduce((a, b) => a + b, 0);
      if (
        matchedPreset &&
        (!initialSaved.allocationMethod || initialSaved.allocationMethod === 'preset') &&
        Math.abs(sumW - 100) >= 0.5
      ) {
        return { ...matchedPreset.weights };
      }
      return initialSaved.activeWeights;
    }
    return defaultPreset.weights;
  });

  const activeWeightsRef = useRef(activeWeights);
  activeWeightsRef.current = activeWeights;

  // User-Locked Asset IDs in manual weight customizer
  const [lockedAssetIds, setLockedAssetIds] = useState<string[]>(() => {
    if (Array.isArray(initialSaved?.lockedAssetIds)) {
      return initialSaved.lockedAssetIds;
    }
    return [];
  });

  // Version counter to trigger remount/rehydration of WealthRoadmapView when settings are imported
  const [roadmapSettingsVersion, setRoadmapSettingsVersion] = useState<number>(0);


  const handleToggleLockAsset = (assetId: string) => {
    setLockedAssetIds((prev) =>
      prev.includes(assetId)
        ? prev.filter((id) => id !== assetId)
        : [...prev, assetId]
    );
  };

  const handleUnlockAllAssets = () => {
    setLockedAssetIds([]);
  };

  // Makmur +3% RDPT Alpha Promo toggle mentioned at 05:04
  const [rdptPromoActive, setRdptPromoActive] = useState<boolean>(
    () => Boolean(initialSaved?.rdptPromoActive ?? false)
  );

  // Synchronized Wealth Simulator Defaults:
  // Default Initial Capital = Rp 100 Juta (100,000,000)
  // Default Target Wealth = Rp 1 Miliar (1,000,000,000), with quick toggle to Rp 10 Miliar
  // Default Custom Monthly DCA = Rp 3 Juta (3,000,000)
  const [initialCapitalIdr, setInitialCapitalIdr] = useState<number>(
    () => initialSaved?.initialCapitalIdr ?? 100_000_000
  );
  const [targetGoalIdr, setTargetGoalIdr] = useState<number>(
    () => initialSaved?.targetGoalIdr ?? 1_000_000_000
  );
  const [monthlySavingsIdr, setMonthlySavingsIdr] = useState<number>(() => {
    if (initialSaved?.monthlySavingsIdr !== undefined) {
      const migratedDca3M = localStorage.getItem('quantporto_dca_3m_default_v1');
      if (!migratedDca3M && initialSaved.monthlySavingsIdr === 10_000_000) {
        localStorage.setItem('quantporto_dca_3m_default_v1', 'true');
        return 3_000_000;
      }
      return initialSaved.monthlySavingsIdr;
    }
    return 3_000_000;
  });

  // Rebalancer State (Default starting holdings scaled to Rp 100 Juta Initial Capital!)
  // Default USD/IDR assumption set to Rp 18,000 per user request
  const [usdIdrRate, setUsdIdrRate] = useState<number>(() => {
    if (initialSaved?.usdIdrRate) {
      const migratedUsd18k = localStorage.getItem('quantporto_usd_18k_default_v1');
      if (!migratedUsd18k && (initialSaved.usdIdrRate === 15600 || initialSaved.usdIdrRate === 15500)) {
        localStorage.setItem('quantporto_usd_18k_default_v1', 'true');
        return 18000;
      }
      return initialSaved.usdIdrRate;
    }
    return 18000;
  });
  const [inputMode, setInputMode] = useState<'nominal' | 'units'>(
    () => initialSaved?.inputMode ?? 'nominal'
  );
  const [rebalanceMode, setRebalanceMode] = useState<RebalanceMode>(
    () => initialSaved?.rebalanceMode ?? 'sell-and-buy'
  );
  const [cashInjectionIdr, setCashInjectionIdr] = useState<number>(
    () => initialSaved?.cashInjectionIdr ?? 0
  );
  const [isFixedBudgetMode, setIsFixedBudgetMode] = useState<boolean>(
    () => Boolean(initialSaved?.isFixedBudgetMode ?? false)
  );
  const [fixedTotalBudgetIdr, setFixedTotalBudgetIdr] = useState<number>(
    () => Number(initialSaved?.fixedTotalBudgetIdr ?? 100_000_000)
  );
  const [driftThresholdPercent, setDriftThresholdPercent] = useState<number>(
    () => initialSaved?.driftThresholdPercent ?? 3
  );
  const [isHoldingsSyncedWithMenu1, setIsHoldingsSyncedWithMenu1] = useState<boolean>(
    () => initialSaved?.isHoldingsSyncedWithMenu1 !== undefined ? Boolean(initialSaved.isHoldingsSyncedWithMenu1) : true
  );
  const [enableIdxLotRounding, setEnableIdxLotRounding] = useState<boolean>(
    () => initialSaved?.enableIdxLotRounding !== undefined ? Boolean(initialSaved.enableIdxLotRounding) : true
  );
  const [enableBrokerFees, setEnableBrokerFees] = useState<boolean>(
    () => Boolean(initialSaved?.enableBrokerFees ?? false)
  );
  const [filterDustTrades, setFilterDustTrades] = useState<boolean>(
    () => initialSaved?.filterDustTrades !== undefined ? Boolean(initialSaved.filterDustTrades) : true
  );
  const [tacticalConfig, setTacticalConfig] = useState<ValuationSentimentConfig>(
    () => initialSaved?.tacticalConfig ?? {
      enabled: false,
      aggressiveness: 0.2,
      cryptoScore: 50,
      usEquityScore: 50,
      idxEquityScore: 50,
      goldScore: 50,
    }
  );

  const [smartDcaMonthlyBudgetIdr, setSmartDcaMonthlyBudgetIdr] = useState<number>(
    () => Number(initialSaved?.smartDcaMonthlyBudgetIdr ?? (initialSaved?.monthlySavingsIdr ?? 3_000_000))
  );
  const [smartDcaOverflowMode, setSmartDcaOverflowMode] = useState<SmartDcaOverflowMode>(
    () => initialSaved?.smartDcaOverflowMode ?? 'park-rdpu'
  );
  const [smartDcaAllocationMode, setSmartDcaAllocationMode] = useState<SmartDcaAllocationMode>(
    () => initialSaved?.smartDcaAllocationMode ?? 'target-weight-multiplier'
  );
  const [smartDcaIndicatorOverrides, setSmartDcaIndicatorOverrides] = useState<
    Record<string, Record<string, any>>
  >(() => initialSaved?.smartDcaIndicatorOverrides ?? {});

  const [holdings, setHoldings] = useState<Record<string, HoldingEntry>>(() => {
    if (initialSaved?.holdings && Object.keys(initialSaved.holdings).length > 0) {
      return initialSaved.holdings;
    }
    const init: Record<string, HoldingEntry> = {};
    for (const a of CORE_AND_EXPANDED_ASSETS) {
      const weightPct = defaultPreset.weights[a.id] ?? 0;
      const valIdr = Math.round(100_000_000 * (weightPct / 100));
      const unitPriceIdr =
        a.currency === 'USD' ? a.defaultPrice * 18000 : a.defaultPrice;
      const isNominalOnly = a.category === 'bonds' || a.category === 'money-market';
      init[a.id] = {
        assetId: a.id,
        currentValueIdr: valIdr,
        units: isNominalOnly ? valIdr : Number((valIdr / Math.max(1, unitPriceIdr)).toFixed(a.category === 'crypto' ? 8 : 4)),
        currentPrice: isNominalOnly ? 1 : a.defaultPrice,
        shockPercent: 0,
        isNominalOnly,
      };
    }
    return init;
  });

  // Auto-Subtract Effect for Fixed Total Budget Mode (Staged Initial Buying)
  useEffect(() => {
    if (!isFixedBudgetMode) return;
    const currentTotalHoldings = allAssets.reduce((sum, a) => {
      const h = holdings[a.id];
      if (!h) return sum;
      const isNominal =
        h.isNominalOnly ?? (a.category === 'bonds' || a.category === 'money-market');
      if (inputMode === 'nominal' || isNominal) {
        return sum + Math.max(0, h.currentValueIdr ?? 0);
      }
      const unitPriceNative = h.currentPrice ?? a.defaultPrice;
      const unitPriceIdr =
        a.currency === 'USD' ? unitPriceNative * usdIdrRate : unitPriceNative;
      return sum + Math.max(0, (h.units ?? 0) * unitPriceIdr);
    }, 0);
    const autoSubtractedCash = Math.max(
      0,
      Math.round(fixedTotalBudgetIdr - currentTotalHoldings)
    );
    setCashInjectionIdr(autoSubtractedCash);
  }, [
    isFixedBudgetMode,
    fixedTotalBudgetIdr,
    holdings,
    allAssets,
    inputMode,
    usdIdrRate,
  ]);

  // Live Price Feed status
  const [priceSourceText, setPriceSourceText] = useState<string>(
    'Bundled Baseline 5Y Data'
  );
  const [lastUpdatedText, setLastUpdatedText] = useState<string>('');
  const [isFetchingPrices, setIsFetchingPrices] = useState<boolean>(false);
  const [shareCopied, setShareCopied] = useState<boolean>(false);

  // Saved Portfolios in LocalStorage
  const [savedPortfolios, setSavedPortfolios] = useState<SavedPortfolioSnapshot[]>(
    () => {
      try {
        const raw = localStorage.getItem(SAVED_PORTFOLIOS_KEY);
        return raw ? JSON.parse(raw) : [];
      } catch {
        return [];
      }
    }
  );

  // Rebalance Execution History Log (persisted inside quantporto_state_v2)
  const [rebalanceHistory, setRebalanceHistory] = useState<
    RebalanceHistoryEntry[]
  >(() => initialSaved?.rebalanceHistory ?? []);

  // Modals state
  const [isRecommenderOpen, setIsRecommenderOpen] = useState<boolean>(false);
  const [isFactsheetOpen, setIsFactsheetOpen] = useState<boolean>(false);
  const [isOrderSlipOpen, setIsOrderSlipOpen] = useState<boolean>(false);
  const [orderSlipPlanOverride, setOrderSlipPlanOverride] = useState<RebalanceSummaryResult | null>(null);
  const [isResetConfirmOpen, setIsResetConfirmOpen] = useState<boolean>(false);
  const [isDataTransferModalOpen, setIsDataTransferModalOpen] = useState<boolean>(false);
  const [quickCopyFeedback, setQuickCopyFeedback] = useState<boolean>(false);

  // Import backup success notification banner state
  const [backupToast, setBackupToast] = useState<{
    message: string;
    details: string[];
  } | null>(null);

  useEffect(() => {
    if (!backupToast) return;
    const t = setTimeout(() => setBackupToast(null), 5000);
    return () => clearTimeout(t);
  }, [backupToast]);

  const handleStartTour = () => {
    if (!isAuthenticated) return;
    startInteractiveTour({ onTabSwitch: setActiveTab });
  };

  const handleConfirmResetAll = () => {
    try {
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem(SAVED_PORTFOLIOS_KEY);
      localStorage.removeItem(TOUR_SEEN_KEY);
      localStorage.removeItem('quantporto_dca_3m_default_v1');
      localStorage.removeItem('quantporto_usd_18k_default_v1');
      localStorage.removeItem('quantporto_asset_dividends');
      localStorage.removeItem('quantporto_roadmap_settings_v1');
      localStorage.removeItem('color-scheme');
      setLockedAssetIds([]);
      setIsFixedBudgetMode(false);
      setFixedTotalBudgetIdr(0);
      setEnableIdxLotRounding(true);
      setFilterDustTrades(true);
      setTacticalConfig({
        enabled: false,
        aggressiveness: 0.2,
        cryptoScore: 50,
        usEquityScore: 50,
        idxEquityScore: 50,
        goldScore: 50,
      });
    } catch {
      // Ignore storage errors
    }
    if (window.location.hash) {
      history.replaceState(null, '', window.location.pathname);
    }
    window.location.reload();
  };

  // Auto-launch interactive tour on first load ONLY AFTER authenticated (if not yet seen)
  useEffect(() => {
    if (!isAuthenticated) return;
    try {
      const tourSeen = localStorage.getItem(TOUR_SEEN_KEY) === 'true';
      if (!tourSeen) {
        const timer = setTimeout(() => {
          handleStartTour();
        }, 800);
        return () => clearTimeout(timer);
      }
    } catch {
      // Ignore storage errors
    }
  }, [isAuthenticated]);

  // Global Keyboard Shortcut: Press '?' anywhere to immediately trigger the interactive guide (only when authenticated)
  useEffect(() => {
    if (!isAuthenticated) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable)
      ) {
        return;
      }

      if (e.key === '?' || (e.key === '/' && e.shiftKey)) {
        e.preventDefault();
        handleStartTour();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isAuthenticated]);

  // Guard ref to prevent the quant solver useEffect from re-solving and overwriting shared weights on mount
  const isRestoringFromHashRef = useRef(false);

  // Restore state from URL Hash (if user navigated to a shared link) on first mount
  useEffect(() => {
    try {
      if (window.location.hash.startsWith('#porto=')) {
        try {
          const encoded = decodeURIComponent(window.location.hash.slice(7));
          const hashParsed = JSON.parse(base64ToUtf8(encoded));
          if (hashParsed?.weights) {
            isRestoringFromHashRef.current = true;
            setActiveWeights(hashParsed.weights);
            setActivePresetId(hashParsed.presetId ?? null);
            setAllocationMethod(hashParsed.method ?? 'custom');
            setTimeout(() => {
              isRestoringFromHashRef.current = false;
            }, 150);
          }
          if (hashParsed?.convictionAssetId) setConvictionAssetId(hashParsed.convictionAssetId);
          if (typeof hashParsed?.convictionRiskPercent === 'number')
            setConvictionRiskPercent(hashParsed.convictionRiskPercent);
          if (hashParsed?.solverMode) setSolverMode(hashParsed.solverMode);
          if (
            Array.isArray(hashParsed?.selectedUniverseIds) &&
            hashParsed.selectedUniverseIds.length > 0
          ) {
            setSelectedUniverseIds(hashParsed.selectedUniverseIds);
          }
          if (hashParsed?.slotMap) setSlotMap(hashParsed.slotMap);
          if (hashParsed?.rdptPromo !== undefined)
            setRdptPromoActive(Boolean(hashParsed.rdptPromo));
          if (hashParsed?.capital !== undefined)
            setInitialCapitalIdr(hashParsed.capital);
          if (hashParsed?.dca !== undefined)
            setMonthlySavingsIdr(hashParsed.dca);
          if (hashParsed?.goal !== undefined)
            setTargetGoalIdr(hashParsed.goal);
          if (hashParsed?.roadmap) {
            try {
              localStorage.setItem(
                'quantporto_roadmap_settings_v1',
                JSON.stringify(hashParsed.roadmap)
              );
              setRoadmapSettingsVersion((v) => v + 1);
            } catch {
              // Ignore
            }
          }

          if (
            Array.isArray(hashParsed?.customAssets) &&
            hashParsed.customAssets.length > 0
          ) {
            setAllAssets((prev) => {
              const prevIds = new Set(prev.map((a) => a.id));
              const additions = hashParsed!.customAssets.filter(
                (a: AssetDefinition) => !prevIds.has(a.id)
              );
              return additions.length > 0 ? [...prev, ...additions] : prev;
            });
          }
          if (
            Array.isArray(hashParsed?.renamedAssets) &&
            hashParsed.renamedAssets.length > 0
          ) {
            setAllAssets((prev) => {
              const renameMap = new Map<string, any>(
                hashParsed!.renamedAssets.map((r: any) => [r.id, r])
              );
              return prev.map((a) => {
                const r = renameMap.get(a.id);
                if (!r) return a;
                const nextShort = r.shortName ?? a.shortName;
                return {
                  ...a,
                  shortName: nextShort,
                  symbol: nextShort,
                  name: r.name ?? a.name,
                  isNominalOnly: r.isNominalOnly !== undefined ? r.isNominalOnly : a.isNominalOnly,
                  lotSize: r.lotSize !== undefined ? r.lotSize : (r.isNominalOnly ? 1 : a.lotSize),
                  allowFractional: r.allowFractional !== undefined ? r.allowFractional : (r.isNominalOnly ? true : a.allowFractional),
                  isRenamed: true,
                };
              });
            });
          }
        } catch {
          // Ignore malformed URL hash
        }
      }
    } catch {
      // Ignore
    }
  }, []);

  // Persist active state to LocalStorage
  useEffect(() => {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          activeTab,
          activeWeights,
          activePresetId,
          allocationMethod,
          convictionAssetId,
          convictionRiskPercent,
          solverMode,
          selectedUniverseIds,
          holdings,
          initialCapitalIdr,
          targetGoalIdr,
          monthlySavingsIdr,
          isHoldingsSyncedWithMenu1,
          usdIdrRate,
          inputMode,
          rebalanceMode,
          cashInjectionIdr,
          isFixedBudgetMode,
          fixedTotalBudgetIdr,
          driftThresholdPercent,
          slotMap,
          customTableRows,
          rebalanceHistory,
          rdptPromoActive,
          enableIdxLotRounding,
          enableBrokerFees,
          filterDustTrades,
          allAssets,
          pinnedPresetIds,
          lockedAssetIds,
          tacticalConfig,
          smartDcaMonthlyBudgetIdr,
          smartDcaOverflowMode,
          smartDcaAllocationMode,
          smartDcaIndicatorOverrides,
        })
      );
    } catch {
      // Ignore quota errors
    }
  }, [
    activeTab,
    activeWeights,
    activePresetId,
    allocationMethod,
    convictionAssetId,
    convictionRiskPercent,
    solverMode,
    selectedUniverseIds,
    holdings,
    initialCapitalIdr,
    targetGoalIdr,
    monthlySavingsIdr,
    isHoldingsSyncedWithMenu1,
    usdIdrRate,
    inputMode,
    rebalanceMode,
    cashInjectionIdr,
    isFixedBudgetMode,
    fixedTotalBudgetIdr,
    driftThresholdPercent,
    slotMap,
    customTableRows,
    rebalanceHistory,
    rdptPromoActive,
    enableIdxLotRounding,
    enableBrokerFees,
    filterDustTrades,
    allAssets,
    pinnedPresetIds,
    lockedAssetIds,
    tacticalConfig,
    smartDcaMonthlyBudgetIdr,
    smartDcaOverflowMode,
    smartDcaAllocationMode,
    smartDcaIndicatorOverrides,
  ]);

  // Check if user customized any asset's assumed CAGR or Max Drawdown relative to baseline 5Y video data
  const hasCustomAssetAssumptions = useMemo(() => {
    const baseMap = new Map(CORE_AND_EXPANDED_ASSETS.map((a) => [a.id, a]));
    return allAssets.some((a) => {
      const base = baseMap.get(a.id);
      if (!base) return true;
      return (
        Math.abs(a.cagr - base.cagr) > 0.01 ||
        Math.abs(a.maxDrawdown - base.maxDrawdown) > 0.01
      );
    });
  }, [allAssets]);

  const handleUpdateAssetAssumption = (
    assetId: string,
    patch: { cagr?: number; maxDrawdown?: number }
  ) => {
    setAllAssets((prev) =>
      prev.map((a) => (a.id === assetId ? { ...a, ...patch } : a))
    );
  };

  const handleResetAssetAssumptions = () => {
    const baseMap = new Map(CORE_AND_EXPANDED_ASSETS.map((a) => [a.id, a]));
    setAllAssets((prev) =>
      prev.map((a) => {
        const base = baseMap.get(a.id);
        return base
          ? { ...a, cagr: base.cagr, maxDrawdown: base.maxDrawdown }
          : a;
      })
    );
  };

  const handleUpdateAssetMeta = (
    assetId: string,
    patch: {
      shortName?: string;
      name?: string;
      isNominalOnly?: boolean;
      lotSize?: number;
      allowFractional?: boolean;
    }
  ) => {
    setAllAssets((prev) =>
      prev.map((a) => {
        if (a.id !== assetId) return a;
        const origDef = CORE_AND_EXPANDED_ASSETS.find((c) => c.id === assetId);
        const originalName = a.originalName ?? origDef?.name ?? a.name;
        const originalShortName = a.originalShortName ?? origDef?.shortName ?? a.shortName;
        const originalLotSize = a.originalLotSize ?? origDef?.lotSize ?? a.lotSize;

        const nextShortName =
          patch.shortName !== undefined ? patch.shortName.trim().toUpperCase() : a.shortName;
        const nextName = patch.name !== undefined ? patch.name.trim() : a.name;
        const nextIsNominal =
          patch.isNominalOnly !== undefined ? patch.isNominalOnly : Boolean(a.isNominalOnly);
        const nextLotSize = nextIsNominal
          ? 1
          : (origDef?.lotSize ?? patch.lotSize ?? a.originalLotSize ?? a.lotSize ?? 100);
        const nextAllowFractional = nextIsNominal
          ? true
          : (origDef?.allowFractional ?? patch.allowFractional ?? a.allowFractional ?? false);

        const isRenamed =
          nextShortName !== originalShortName ||
          nextName !== originalName ||
          nextIsNominal !== Boolean(origDef ? (origDef.category === 'bonds' || origDef.category === 'money-market') : false);

        return {
          ...a,
          shortName: nextShortName,
          symbol: nextShortName,
          name: nextName,
          isNominalOnly: nextIsNominal,
          lotSize: nextLotSize,
          allowFractional: nextAllowFractional,
          originalName,
          originalShortName,
          originalLotSize,
          isRenamed,
        };
      })
    );

    // If isNominalOnly changes on an asset, update holdings[assetId] accordingly
    if (patch.isNominalOnly !== undefined) {
      setHoldings((prev) => {
        const h = prev[assetId];
        if (!h) return prev;
        if (patch.isNominalOnly) {
          return {
            ...prev,
            [assetId]: {
              ...h,
              isNominalOnly: true,
              currentPrice: 1,
              units: h.currentValueIdr,
            },
          };
        } else {
          const asset = allAssets.find((a) => a.id === assetId);
          const origDef = CORE_AND_EXPANDED_ASSETS.find((c) => c.id === assetId);
          const pNative = asset?.defaultPrice ?? origDef?.defaultPrice ?? 1;
          const pIdr = asset?.currency === 'USD' ? pNative * usdIdrRate : pNative;
          return {
            ...prev,
            [assetId]: {
              ...h,
              isNominalOnly: false,
              currentPrice: pNative,
              units: Number((h.currentValueIdr / Math.max(0.0001, pIdr)).toFixed(asset?.category === 'crypto' ? 8 : 4)),
            },
          };
        }
      });
    }
  };

  const handleResetAssetMeta = (assetId: string) => {
    const origDef = CORE_AND_EXPANDED_ASSETS.find((c) => c.id === assetId);

    setAllAssets((prev) =>
      prev.map((a) => {
        if (a.id !== assetId) return a;
        const name = origDef?.name ?? a.originalName ?? a.name;
        const shortName = origDef?.shortName ?? a.originalShortName ?? a.shortName;
        const symbol = origDef?.symbol ?? origDef?.shortName ?? a.originalShortName ?? a.symbol;
        const lotSize = origDef?.lotSize ?? a.originalLotSize ?? a.lotSize;
        const allowFractional = origDef?.allowFractional ?? a.allowFractional ?? false;
        const isNominal = origDef
          ? (origDef.category === 'bonds' || origDef.category === 'money-market')
          : false;
        return {
          ...a,
          name,
          shortName,
          symbol,
          lotSize,
          allowFractional,
          isNominalOnly: isNominal,
          originalName: name,
          originalShortName: shortName,
          originalLotSize: lotSize,
          isRenamed: false,
        };
      })
    );

    setHoldings((prev) => {
      const h = prev[assetId];
      if (!h) return prev;
      const isNominal = origDef
        ? (origDef.category === 'bonds' || origDef.category === 'money-market')
        : false;
      if (isNominal) {
        return {
          ...prev,
          [assetId]: {
            ...h,
            isNominalOnly: true,
            currentPrice: 1,
            units: h.currentValueIdr,
          },
        };
      } else {
        const pNative = origDef?.defaultPrice ?? 1;
        const pIdr = origDef?.currency === 'USD' ? pNative * usdIdrRate : pNative;
        return {
          ...prev,
          [assetId]: {
            ...h,
            isNominalOnly: false,
            currentPrice: pNative,
            units: Number((h.currentValueIdr / Math.max(0.0001, pIdr)).toFixed(origDef?.category === 'crypto' ? 8 : 4)),
          },
        };
      }
    });
  };

  // Dynamically recompute the 25 presets whenever slotMap, RDPT promo, or custom asset return assumptions change
  const dynamicPresets = useMemo(
    () =>
      buildDynamicPresetsForSlotMap(
        VIDEO_PORTFOLIO_PRESETS,
        slotMap,
        allAssets,
        rdptPromoActive ? 3.0 : 0,
        hasCustomAssetAssumptions
      ),
    [slotMap, allAssets, rdptPromoActive, hasCustomAssetAssumptions]
  );

  // Re-run Quant Solver automatically when user changes Risk Parity / Risk Budgeting parameters
  useEffect(() => {
    if (isRestoringFromHashRef.current) {
      return;
    }
    if (
      allocationMethod === 'risk-parity' ||
      allocationMethod === 'risk-budgeting' ||
      allocationMethod === 'all-in'
    ) {
      const activeAssets = allAssets.filter((a) =>
        selectedUniverseIds.includes(a.id)
      );
      const solvedW = solveRiskBudgetingWeights(
        activeAssets,
        allocationMethod,
        convictionAssetId,
        convictionRiskPercent,
        solverMode,
        lockedAssetIds,
        activeWeightsRef.current
      );
      setActiveWeights(solvedW);
      setActivePresetId(null);
    }
  }, [
    allocationMethod,
    selectedUniverseIds,
    convictionAssetId,
    convictionRiskPercent,
    solverMode,
    lockedAssetIds,
    allAssets,
  ]);

  // Decision 4: Dynamically evaluate metrics for custom table rows whenever return assumptions or promo changes
  const effectiveCustomTableRows = useMemo(() => {
    return customTableRows.map((row) => {
      const metrics = evaluatePortfolioMetrics(row.weights, allAssets, dynamicPresets, {
        rdptAlphaPromoBonusPercent: rdptPromoActive ? 3.0 : 0,
        exactPresetMatch: null,
        hasCustomAssetAssumptions,
      });
      return {
        ...row,
        cagr: metrics.cagr,
        maxDrawdown: metrics.maxDrawdown,
        riskTier: metrics.riskTier,
      };
    });
  }, [customTableRows, allAssets, dynamicPresets, rdptPromoActive, hasCustomAssetAssumptions]);

  // Decision 4: Dynamically evaluate saved portfolio snapshots
  const effectiveSavedPortfolios = useMemo(() => {
    return savedPortfolios.map((snap) => {
      const metrics = evaluatePortfolioMetrics(snap.weights, allAssets, dynamicPresets, {
        rdptAlphaPromoBonusPercent: rdptPromoActive ? 3.0 : 0,
        exactPresetMatch: null,
        hasCustomAssetAssumptions,
      });
      return {
        ...snap,
        cagr: metrics.cagr,
        maxDrawdown: metrics.maxDrawdown,
      };
    });
  }, [savedPortfolios, allAssets, dynamicPresets, rdptPromoActive, hasCustomAssetAssumptions]);

  // Evaluate portfolio CAGR, Max Drawdown, Risk Contributions, and Pareto Dominance
  const exactPresetMatch = useMemo(() => {
    if (!activePresetId) return null;
    return (
      dynamicPresets.find((p) => p.id === activePresetId) ??
      effectiveCustomTableRows.find((p) => p.id === activePresetId) ??
      null
    );
  }, [activePresetId, dynamicPresets, effectiveCustomTableRows]);

  const solvedMetrics = useMemo(
    () =>
      evaluatePortfolioMetrics(
        activeWeights,
        allAssets,
        [...dynamicPresets, ...effectiveCustomTableRows],
        {
          rdptAlphaPromoBonusPercent: rdptPromoActive ? 3.0 : 0,
          exactPresetMatch,
          hasCustomAssetAssumptions,
        }
      ),
    [
      activeWeights,
      allAssets,
      dynamicPresets,
      effectiveCustomTableRows,
      rdptPromoActive,
      exactPresetMatch,
      hasCustomAssetAssumptions,
    ]
  );

  // Calculate Rebalance Plan
  const rebalanceResult = useMemo(
    () =>
      calculateRebalancePlan({
        assets: allAssets,
        targetWeights: activeWeights,
        holdings,
        inputMode,
        usdIdrRate,
        cashInjectionIdr,
        rebalanceMode,
        driftThresholdAbsolutePercent: driftThresholdPercent,
        enableIdxLotRounding,
        sweepRemainderToDefensive: true,
        enableBrokerFees,
        filterDustTrades,
        tacticalConfig,
      }),
    [
      allAssets,
      activeWeights,
      holdings,
      inputMode,
      usdIdrRate,
      cashInjectionIdr,
      rebalanceMode,
      driftThresholdPercent,
      enableIdxLotRounding,
      enableBrokerFees,
      filterDustTrades,
      tacticalConfig,
    ]
  );

  // Handler: Select one of the Table Presets (or Custom Pinned Rows)
  const handleSelectPreset = (preset: PortfolioPreset) => {
    setActivePresetId(preset.id);
    setAllocationMethod('preset');
    setActiveWeights({ ...preset.weights });
    const activeIds = Object.entries(preset.weights)
      .filter(([, w]) => w > 0)
      .map(([id]) => id);
    if (activeIds.length > 0) {
      setSelectedUniverseIds(activeIds);
    }
    if (preset.convictionAssetId) {
      setConvictionAssetId(preset.convictionAssetId);
    }
    if (preset.convictionRiskPercent) {
      setConvictionRiskPercent(preset.convictionRiskPercent);
    }
  };

  // Handler: Change a column benchmark slot in the table (e.g. BBCA -> PTBA)
  const handleChangeSlotAsset = (coreSlotId: string, newAssetId: string) => {
    const oldAssetId = slotMap[coreSlotId] ?? coreSlotId;
    if (oldAssetId === newAssetId) return;

    const nextMap = { ...slotMap, [coreSlotId]: newAssetId };
    setSlotMap(nextMap);

    if (activePresetId === null) {
      // User is in Custom mode, remap the weight of the old asset in this slot directly without overwriting with preset 8
      setActiveWeights((prev) => {
        const oldW = prev[oldAssetId] ?? 0;
        const nextW = { ...prev };
        // Check all slots (default core slots + any custom slot keys) to handle implicit mappings
        const allSlotKeys = Array.from(new Set([...Object.keys(DEFAULT_SLOT_MAP), ...Object.keys(nextMap)]));
        const isOldAssetStillUsed = allSlotKeys.some(
          (s) => s !== coreSlotId && (nextMap[s] ?? s) === oldAssetId
        );
        if (!isOldAssetStillUsed) {
          delete nextW[oldAssetId];
        }
        nextW[newAssetId] = (nextW[newAssetId] ?? 0) + oldW;
        return nextW;
      });
      return;
    }

    // If a preset is currently selected, update activeWeights to the newly solved preset weights
    const nextPresets = buildDynamicPresetsForSlotMap(
      VIDEO_PORTFOLIO_PRESETS,
      nextMap,
      allAssets,
      rdptPromoActive ? 3.0 : 0
    );
    const activeRow =
      nextPresets.find((p) => p.id === activePresetId) ?? nextPresets[0];
    if (activeRow) {
      handleSelectPreset(activeRow);
    }
  };

  const handleResetSlotMap = () => {
    setSlotMap(DEFAULT_SLOT_MAP);
    const baseRow =
      VIDEO_PORTFOLIO_PRESETS.find((p) => p.id === activePresetId) ??
      defaultPreset;
    handleSelectPreset(baseRow);
  };

  // Handler: 1-Click Toggle "Contoh Custom: Ubah BBCA -> PTBA"
  const handleQuickSwapBbcaToPtba = () => {
    if (slotMap.BBCA === 'PTBA') {
      handleResetSlotMap();
    } else {
      handleChangeSlotAsset('BBCA', 'PTBA');
    }
  };

  // Handler: Pin Current Quant Lab Portfolio into the Main Table
  const handlePinCurrentToTable = (customName?: string) => {
    const activeAssetSymbols = Object.entries(activeWeights)
      .filter(([, w]) => w > 0)
      .map(([id, w]) => `${id} ${w}%`)
      .slice(0, 4)
      .join(', ');

    const defaultLabel =
      allocationMethod === 'risk-parity'
        ? `Custom Risk Parity (${activeAssetSymbols})`
        : allocationMethod === 'risk-budgeting'
          ? `Custom Risk Budgeting ${convictionAssetId} ${convictionRiskPercent}%`
          : `Custom Racikan (${activeAssetSymbols})`;

    const newRow: PortfolioPreset = {
      id: `custom-row-${Date.now()}`,
      name: customName || defaultLabel,
      method:
        allocationMethod === 'preset' ? 'custom' : allocationMethod,
      convictionAssetId,
      convictionRiskPercent,
      riskTier: solvedMetrics.riskTier,
      cagr: solvedMetrics.cagr,
      maxDrawdown: solvedMetrics.maxDrawdown,
      isOptimal15: !solvedMetrics.isParetoDominated,
      isCustomRow: true,
      weights: { ...activeWeights },
      videoNote: `Dimasukkan dari Custom Quant Lab (${Object.entries(activeWeights)
        .filter(([, w]) => w > 0)
        .map(([id, w]) => `${id}:${w}%`)
        .join(' ')}).`,
    };

    setCustomTableRows((prev) => [newRow, ...prev]);
    setActivePresetId(newRow.id);
  };

  const handleRemoveCustomTableRow = (id: string) => {
    setCustomTableRows((prev) => prev.filter((r) => r.id !== id));
    if (activePresetId === id) {
      setActivePresetId(null);
    }
  };

  // Handler: Toggle asset in universe
  const handleToggleUniverseAsset = (id: string) => {
    setSelectedUniverseIds((prev) => {
      const exists = prev.includes(id);
      const next = exists ? prev.filter((item) => item !== id) : [...prev, id];
      return next.length > 0 ? next : [id];
    });
    if (allocationMethod === 'preset') {
      setAllocationMethod('risk-parity');
    }
  };

  // Handler: Manual weight slider tweak
  const handleManualWeightChange = (assetId: string, newWeight: number) => {
    setAllocationMethod('custom');
    setActivePresetId(null);
    setActiveWeights((prev) => ({
      ...prev,
      [assetId]: newWeight,
    }));
  };

  const handleNormalizeManualWeights = (strategy: 'proportional' | 'equal' = 'proportional') => {
    setActiveWeights((prev) => normalizeWeightsTo100(prev, lockedAssetIds, strategy));
  };

  // Handler: Add Custom / Yahoo Ticker Asset
  const handleAddCustomAsset = (newAsset: AssetDefinition) => {
    setAllAssets((prev) => {
      const filtered = prev.filter((a) => a.id !== newAsset.id);
      return [...filtered, newAsset];
    });
    setSelectedUniverseIds((prev) =>
      prev.includes(newAsset.id) ? prev : [...prev, newAsset.id]
    );
    setHoldings((prev) => ({
      ...prev,
      [newAsset.id]: {
        assetId: newAsset.id,
        currentValueIdr: 0,
        units: 0,
        currentPrice: newAsset.defaultPrice,
        shockPercent: 0,
      },
    }));
    if (allocationMethod === 'preset') {
      setAllocationMethod('risk-parity');
    }
  };

  // Handler: Live Price Sync
  const handleRefreshLivePrices = async () => {
    setIsFetchingPrices(true);
    try {
      const res = await fetchLiveMarketPrices(allAssets, usdIdrRate);
      setUsdIdrRate(res.usdIdrRate);
      setPriceSourceText(res.sourceSummary);
      setLastUpdatedText(res.updatedAt);
      setHoldings((prev) => {
        const next = { ...prev };
        for (const a of allAssets) {
          const livePrice =
            res.pricesByAssetId[a.id] ??
            res.pricesByAssetId[a.symbol] ??
            res.pricesByAssetId[a.yahooSymbol ?? ''];
          if (livePrice && next[a.id]) {
            const h = next[a.id];
            const pIdr = a.currency === 'USD' ? livePrice * res.usdIdrRate : livePrice;
            if (h.isNominalOnly) {
              next[a.id] = { ...h, currentPrice: 1 };
            } else if (inputMode === 'units') {
              const newValIdr = Math.round(h.units * pIdr);
              next[a.id] = { ...h, currentPrice: livePrice, currentValueIdr: newValIdr };
            } else {
              const newUnits = Number((h.currentValueIdr / Math.max(0.0001, pIdr)).toFixed(a.category === 'crypto' ? 8 : 4));
              next[a.id] = { ...h, currentPrice: livePrice, units: newUnits };
            }
          }
        }
        return next;
      });

      // Synchronize defaultPrice in allAssets so anywhere in the app (factsheet, tooltips, builder) uses the latest price
      setAllAssets((prev) =>
        prev.map((a) => {
          const livePrice =
            res.pricesByAssetId[a.id] ??
            res.pricesByAssetId[a.symbol] ??
            res.pricesByAssetId[a.yahooSymbol ?? ''];
          return livePrice ? { ...a, defaultPrice: livePrice } : a;
        })
      );
    } catch (err) {
      console.error('Error syncing live market prices:', err);
    } finally {
      setIsFetchingPrices(false);
    }
  };

  // Smart Auto-Sync: Keep Rebalancer baseline holdings synchronized with Menu 1's initialCapitalIdr & activeWeights
  // whenever isHoldingsSyncedWithMenu1 is true (until user manually edits individual holdings in Rebalancer)
  const isFirstMountRef = useRef(true);
  useEffect(() => {
    // Crucial: Skip initial mount to prevent clobbering restored holdings!
    if (isFirstMountRef.current) {
      isFirstMountRef.current = false;
      return;
    }
    if (!isHoldingsSyncedWithMenu1) return;
    setHoldings((prev) => {
      const next = { ...prev };
      for (const a of allAssets) {
        const w = activeWeights[a.id] ?? 0;
        const valIdr = Math.round(initialCapitalIdr * (w / 100));
        const unitPriceIdr =
          a.currency === 'USD'
            ? (next[a.id]?.currentPrice ?? a.defaultPrice) * usdIdrRate
            : next[a.id]?.currentPrice ?? a.defaultPrice;
        const prevA = next[a.id];
        const isNominal =
          prevA?.isNominalOnly ?? (a.category === 'bonds' || a.category === 'money-market');
        next[a.id] = {
          ...prevA,
          assetId: a.id,
          currentValueIdr: valIdr,
          units: isNominal
            ? valIdr
            : Number((valIdr / Math.max(1, unitPriceIdr)).toFixed(a.category === 'crypto' ? 8 : 4)),
          currentPrice: isNominal ? 1 : (prevA?.currentPrice ?? a.defaultPrice),
          shockPercent: prevA?.shockPercent ?? 0,
          isNominalOnly: isNominal,
          subSplits: prevA?.subSplits,
          notes: prevA?.notes,
        };
      }
      return next;
    });
  }, [
    isHoldingsSyncedWithMenu1,
    initialCapitalIdr,
    activeWeights,
    allAssets,
    usdIdrRate,
  ]);

  // Handler: Update individual holding in Rebalancer
  const handleUpdateHolding = (assetId: string, patch: Partial<HoldingEntry>) => {
    // If user manually edits currentValueIdr, units, currentPrice, or isNominalOnly, lock manual holdings so Menu 1 changes don't overwrite them
    if (
      patch.currentValueIdr !== undefined ||
      patch.units !== undefined ||
      patch.currentPrice !== undefined ||
      patch.isNominalOnly !== undefined
    ) {
      setIsHoldingsSyncedWithMenu1(false);
    }
    setHoldings((prev) => {
      const asset = allAssets.find((a) => a.id === assetId);
      const isCatNominal = asset?.category === 'bonds' || asset?.category === 'money-market';
      const existing = prev[assetId] ?? {
        assetId,
        currentValueIdr: 0,
        units: 0,
        currentPrice: asset?.defaultPrice ?? 1,
        shockPercent: 0,
        isNominalOnly: isCatNominal,
      };

      const updated = { ...existing, ...patch };

      // Case 0: isNominalOnly is explicitly toggled
      if (patch.isNominalOnly !== undefined) {
        if (patch.isNominalOnly) {
          // Switch to nominal-only mode: neutral price 1, units equal nominal rupiah
          updated.isNominalOnly = true;
          updated.currentPrice = 1;
          updated.units = updated.currentValueIdr;
        } else {
          // Switch back to market price mode: restore asset defaultPrice and recalculate units
          updated.isNominalOnly = false;
          const pNative = asset?.defaultPrice ?? 1;
          const pIdr = asset?.currency === 'USD' ? pNative * usdIdrRate : pNative;
          updated.currentPrice = pNative;
          updated.units = Number((updated.currentValueIdr / Math.max(0.0001, pIdr)).toFixed(asset?.category === 'crypto' ? 8 : 4));
        }
      }
      // Case 1: Price is changed -> units are preserved, currentValueIdr is updated: units * newPriceIdr
      else if (patch.currentPrice !== undefined && patch.currentValueIdr === undefined) {
        const pNative = Math.max(0.000001, patch.currentPrice);
        const pIdr = asset?.currency === 'USD' ? pNative * usdIdrRate : pNative;

        let units = existing.units;
        // If units were 0 or not calculated, derive from existing currentValueIdr
        if (units <= 0 && existing.currentValueIdr > 0) {
          const oldPriceNative =
            existing.currentPrice > 0 ? existing.currentPrice : (asset?.defaultPrice ?? 1);
          const oldPriceIdr =
            asset?.currency === 'USD' ? oldPriceNative * usdIdrRate : oldPriceNative;
          units = existing.currentValueIdr / Math.max(0.0001, oldPriceIdr);
        }

        updated.currentPrice = pNative;
        updated.units = Number(units.toFixed(asset?.category === 'crypto' ? 8 : 4));
        updated.currentValueIdr = Math.round(units * pIdr);
      }
      // Case 2: Nominal value is changed -> units are updated: currentValueIdr / priceIdr
      else if (patch.currentValueIdr !== undefined && patch.units === undefined) {
        const isNominal = updated.isNominalOnly ?? isCatNominal;
        if (isNominal) {
          updated.units = patch.currentValueIdr;
        } else {
          const pNative =
            updated.currentPrice > 0 ? updated.currentPrice : (asset?.defaultPrice ?? 1);
          const pIdr = asset?.currency === 'USD' ? pNative * usdIdrRate : pNative;
          updated.units = Number((patch.currentValueIdr / Math.max(0.0001, pIdr)).toFixed(asset?.category === 'crypto' ? 8 : 4));
        }
      }
      // Case 3: Units are changed -> currentValueIdr is updated: units * priceIdr
      else if (patch.units !== undefined && patch.currentValueIdr === undefined) {
        const isNominal = updated.isNominalOnly ?? isCatNominal;
        if (isNominal) {
          updated.currentValueIdr = Math.round(patch.units);
        } else {
          const pNative =
            updated.currentPrice > 0 ? updated.currentPrice : (asset?.defaultPrice ?? 1);
          const pIdr = asset?.currency === 'USD' ? pNative * usdIdrRate : pNative;
          updated.currentValueIdr = Math.round(patch.units * pIdr);
        }
      }

      return {
        ...prev,
        [assetId]: updated,
      };
    });
  };

  // Handler: Reset all asset spot prices back to baseline/default market prices
  const handleResetAllAssetPrices = () => {
    setHoldings((prev) => {
      const next = { ...prev };
      for (const a of allAssets) {
        const existing = next[a.id];
        if (!existing) continue;
        const isNominal =
          existing.isNominalOnly ??
          (a.category === 'bonds' || a.category === 'money-market');
        if (isNominal) continue; // Skip resetting nominal-only assets
        const defaultPrice = a.defaultPrice;
        const pIdr = a.currency === 'USD' ? defaultPrice * usdIdrRate : defaultPrice;
        next[a.id] = {
          ...existing,
          currentPrice: defaultPrice,
          currentValueIdr: Math.round(existing.units * pIdr),
        };
      }
      return next;
    });
  };

  // Handler: Populate Rebalancer Holdings with a specific Capital Amount (e.g. Rp 100 Juta) matching active target weights
  const handlePopulateCapital = (capitalIdr: number) => {
    setInitialCapitalIdr(capitalIdr);
    setCashInjectionIdr(0);
    setIsHoldingsSyncedWithMenu1(true);
    setHoldings((prev) => {
      const next = { ...prev };
      for (const a of allAssets) {
        const prevA = prev[a.id];
        const isNominal =
          a.isNominalOnly ?? prevA?.isNominalOnly ?? (a.category === 'bonds' || a.category === 'money-market');
        const w = activeWeights[a.id] ?? 0;
        const valIdr = Math.round(capitalIdr * (w / 100));
        const unitPriceIdr =
          a.currency === 'USD'
            ? (prevA?.currentPrice ?? a.defaultPrice) * usdIdrRate
            : prevA?.currentPrice ?? a.defaultPrice;
        const precision = a.category === 'crypto' ? 8 : 4;
        next[a.id] = {
          ...prevA,
          assetId: a.id,
          currentValueIdr: valIdr,
          units: isNominal
            ? valIdr
            : Number((valIdr / Math.max(1, unitPriceIdr)).toFixed(precision)),
          currentPrice: isNominal ? 1 : (prevA?.currentPrice ?? a.defaultPrice),
          shockPercent: 0,
          isNominalOnly: isNominal,
          notes: prevA?.notes,
          subSplits: prevA?.subSplits,
        };
      }
      return next;
    });
  };

  // Handler: Clear all holdings to Rp 0 so user can type their real current holdings manually
  const handleClearHoldingsForManualInput = () => {
    setIsHoldingsSyncedWithMenu1(false);
    setCashInjectionIdr(0);
    setHoldings((prev) => {
      const next = { ...prev };
      for (const a of allAssets) {
        const prevA = prev[a.id];
        const isNominal =
          a.isNominalOnly ?? prevA?.isNominalOnly ?? (a.category === 'bonds' || a.category === 'money-market');
        next[a.id] = {
          ...prevA,
          assetId: a.id,
          currentValueIdr: 0,
          units: 0,
          currentPrice: isNominal ? 1 : (prevA?.currentPrice ?? a.defaultPrice),
          shockPercent: 0,
          isNominalOnly: isNominal,
          notes: prevA?.notes,
          subSplits: prevA?.subSplits,
        };
      }
      return next;
    });
  };

  // Handler: Initial Buy Mode — Set existing holdings to Rp 0 and put Menu 1's Initial Capital into Cash Injection (Buy-Only)
  const handleSetupInitialBuyFromMenu1 = () => {
    setIsHoldingsSyncedWithMenu1(false);
    setRebalanceMode('buy-only-dca');
    setIsFixedBudgetMode(true);
    setFixedTotalBudgetIdr(initialCapitalIdr);
    setCashInjectionIdr(initialCapitalIdr);
    setHoldings((prev) => {
      const next = { ...prev };
      for (const a of allAssets) {
        const prevA = prev[a.id];
        const isNominal =
          a.isNominalOnly ?? prevA?.isNominalOnly ?? (a.category === 'bonds' || a.category === 'money-market');
        next[a.id] = {
          ...prevA,
          assetId: a.id,
          currentValueIdr: 0,
          units: 0,
          currentPrice: isNominal ? 1 : (prevA?.currentPrice ?? a.defaultPrice),
          shockPercent: 0,
          isNominalOnly: isNominal,
          notes: prevA?.notes,
          subSplits: prevA?.subSplits,
        };
      }
      return next;
    });
  };

  // Handler: Scale or distribute a new Total Current Portfolio Value across assets
  const handleScaleTotalHoldingsIdr = (
    newTotalIdr: number,
    distributeBy: 'current' | 'target'
  ) => {
    setIsHoldingsSyncedWithMenu1(false);
    setHoldings((prev) => {
      const next = { ...prev };
      const currentSum = allAssets.reduce(
        (acc, a) => acc + (prev[a.id]?.currentValueIdr ?? 0),
        0
      );
      for (const a of allAssets) {
        const ratio =
          distributeBy === 'current' && currentSum > 0
            ? (prev[a.id]?.currentValueIdr ?? 0) / currentSum
            : (activeWeights[a.id] ?? 0) / 100;
        const valIdr = Math.round(newTotalIdr * ratio);
        const unitPriceIdr =
          a.currency === 'USD'
            ? (next[a.id]?.currentPrice ?? a.defaultPrice) * usdIdrRate
            : next[a.id]?.currentPrice ?? a.defaultPrice;
        const prevA = next[a.id];
        const isNominal =
          prevA?.isNominalOnly ?? (a.category === 'bonds' || a.category === 'money-market');
        next[a.id] = {
          ...prevA,
          assetId: a.id,
          currentValueIdr: valIdr,
          units: isNominal
            ? valIdr
            : Number((valIdr / Math.max(1, unitPriceIdr)).toFixed(a.category === 'crypto' ? 8 : 4)),
          currentPrice: isNominal ? 1 : (prevA?.currentPrice ?? a.defaultPrice),
          shockPercent: prevA?.shockPercent ?? 0,
          isNominalOnly: isNominal,
          subSplits: prevA?.subSplits,
          notes: prevA?.notes,
        };
      }
      return next;
    });
  };

  // Handler: Load Video Rp 1 Billion Rebalance Example (14:58)
  const handleLoadVideo1BExample = () => {
    setIsHoldingsSyncedWithMenu1(false);
    const btc90 = VIDEO_PORTFOLIO_PRESETS.find(
      (p) => p.id === 'opt-4-rb-btc-90'
    )!;
    handleSelectPreset(btc90);
    setCashInjectionIdr(0);
    setRebalanceMode('sell-and-buy');
    setHoldings((prev) => {
      const next = { ...prev };
      for (const a of allAssets) {
        const valIdr = VIDEO_1B_REBALANCE_EXAMPLE[a.id] ?? 0;
        const unitPriceIdr =
          a.currency === 'USD'
            ? (next[a.id]?.currentPrice ?? a.defaultPrice) * usdIdrRate
            : next[a.id]?.currentPrice ?? a.defaultPrice;
        const prevA = next[a.id];
        const isNominal =
          prevA?.isNominalOnly ?? (a.category === 'bonds' || a.category === 'money-market');
        next[a.id] = {
          ...prevA,
          assetId: a.id,
          currentValueIdr: valIdr,
          units: isNominal
            ? valIdr
            : Number((valIdr / Math.max(1, unitPriceIdr)).toFixed(a.category === 'crypto' ? 8 : 4)),
          currentPrice: isNominal ? 1 : (prevA?.currentPrice ?? a.defaultPrice),
          shockPercent: 0,
          isNominalOnly: isNominal,
          subSplits: prevA?.subSplits,
          notes: prevA?.notes,
        };
      }
      return next;
    });
  };

  // Handler: Apply Step 1 Peer Diversification (14:17 in video: split BBCA bucket across BBCA, BMRI, BBRI, BBNI, NISP)
  // Bug 11 fix: Sum all 5 banking peers so repeated clicks are idempotent
  const handleApplyPeerDiversification = () => {
    const bankIds = ['BBCA', 'BMRI', 'BBRI', 'BBNI', 'NISP'];
    const totalBankWeight = bankIds.reduce(
      (sum, id) => sum + (activeWeights[id] ?? 0),
      0
    );
    const baseWeight =
      totalBankWeight > 0
        ? totalBankWeight
        : (activeWeights.BBCA ?? 12) > 0
          ? activeWeights.BBCA
          : 15;
    const perBank = Number((baseWeight / 5).toFixed(1));
    setAllocationMethod('custom');
    setActivePresetId(null);
    setSelectedUniverseIds((prev) =>
      Array.from(new Set([...prev, ...bankIds]))
    );
    setActiveWeights((prev) =>
      normalizeWeightsTo100({
        ...prev,
        BBCA: perBank,
        BMRI: perBank,
        BBRI: perBank,
        BBNI: perBank,
        NISP: perBank,
      })
    );
  };

  // Handler: Apply Stress-Test Market Crash / Bull Run Scenarios (15:18 - 16:08)
  // Handler: Apply Stress-Test Market Crash / Bull Run Scenarios (15:18 - 16:08 & Historical Presets)
  const handleApplyShockScenario = (
    scenario:
      | 'reset'
      | 'video-bull-3x'
      | 'video-crash-50'
      | 'global-crisis'
      | 'gfc-2008'
      | 'covid-2020'
      | 'crypto-tech-winter-2022'
  ) => {
    setHoldings((prev) => {
      const next = { ...prev };
      for (const a of allAssets) {
        let shock = 0;
        if (scenario === 'video-bull-3x') {
          if (a.category === 'crypto') shock = 200;
          else if (a.category === 'idx-equity') shock = -10;
        } else if (scenario === 'video-crash-50') {
          if (a.category === 'crypto') shock = -50;
        } else if (scenario === 'global-crisis') {
          if (a.category === 'crypto') shock = -60;
          else if (a.category === 'us-equity' || a.category === 'idx-equity')
            shock = -35;
          else if (a.category === 'gold') shock = 12;
          else if (a.category === 'bonds') shock = 3;
        } else if (scenario === 'gfc-2008') {
          // Feature 2: 2008 Global Financial Crisis
          if (a.category === 'idx-equity') shock = -55;
          else if (a.category === 'us-equity') shock = -50;
          else if (a.category === 'crypto') shock = -70;
          else if (a.category === 'gold') shock = 25;
          else if (a.category === 'bonds') shock = 5;
        } else if (scenario === 'covid-2020') {
          // Feature 2: March 2020 COVID-19 Flash Crash
          if (a.category === 'idx-equity') shock = -37;
          else if (a.category === 'us-equity') shock = -34;
          else if (a.category === 'crypto') shock = -50;
          else if (a.category === 'gold') shock = -5;
        } else if (scenario === 'crypto-tech-winter-2022') {
          // Feature 2: 2022 Tech & Crypto Winter / Fed Rate Hikes
          if (a.category === 'crypto') shock = -75;
          else if (a.category === 'us-equity') shock = -33;
          else if (a.category === 'idx-equity') shock = 4;
          else if (a.category === 'gold') shock = -1;
          else if (a.category === 'bonds') shock = -5;
        }
        next[a.id] = {
          ...(next[a.id] ?? {
            assetId: a.id,
            currentValueIdr: 0,
            units: 0,
            currentPrice: a.defaultPrice,
          }),
          shockPercent: shock,
        };
      }
      return next;
    });
  };

  // Handler: 1-Click Commit Rebalance to Holdings & Record History Snapshot
  const handleCommitRebalanceToHoldings = (
    customNote?: string,
    planOverride?: RebalanceSummaryResult,
    isTopUpConfirmed?: boolean
  ) => {
    // Decision 1 & Bug 4: Preserve leftover unallocated cash remainder, handle overbudget deficit
    // Use planOverride if user adjusted lots manually via Feature 4 steppers
    const plan = planOverride ?? rebalanceResult;
    const rawDeficit = plan.unallocatedCashRemainderIdr ?? 0;
    const hasDeficit = rawDeficit < -100;
    const topUpAmount = hasDeficit ? Math.abs(rawDeficit) : 0;
    const effectiveCashInjected = (plan.cashInjectionIdr ?? 0) + (isTopUpConfirmed ? topUpAmount : 0);
    const leftoverCash = hasDeficit ? 0 : Math.max(0, rawDeficit);

    const actualCommittedHoldingsValueIdr = plan.items.reduce(
      (sum, item) => sum + Math.max(0, Math.round((item.postShockValueIdr ?? 0) + item.tradeAmountIdr)),
      0
    );
    const trueTotalValueAfterIdr = actualCommittedHoldingsValueIdr + leftoverCash;

    const baseNote =
      customNote ||
      `Rebalance ${
        rebalanceMode === 'sell-and-buy'
          ? 'Sell + Buy (Jual Rata)'
          : rebalanceMode === 'selective-profit-trim'
            ? 'Jual Untung Saja (Selective Trim)'
            : rebalanceMode === 'trim-defensive-first'
              ? 'Prioritas RDPT Dulu'
              : 'Buy-Only DCA'
      }`;
    const deficitSuffix =
      hasDeficit && isTopUpConfirmed
        ? ` (+Top-Up Defisit ${formatIdr(topUpAmount, true)})`
        : '';

    const newEntry: RebalanceHistoryEntry = {
      id: `reb-${Date.now()}`,
      timestamp: new Date().toLocaleDateString('id-ID', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      }),

        note: `${baseNote}${deficitSuffix}`,
        totalValueBeforeIdr: plan.postShockTotalIdr,
        cashInjectedIdr: effectiveCashInjected,
        totalValueAfterIdr: trueTotalValueAfterIdr,
        totalBuyIdr: plan.totalBuyIdr,
        totalSellIdr: plan.totalSellIdr,
        tradesSummary: plan.items
          .filter((i) => i.action !== 'HOLD' && Math.abs(i.tradeAmountIdr) >= 1000)
          .map((i) => `${i.action} ${i.symbol} ${formatIdr(Math.abs(i.tradeAmountIdr), true)}`),
        weightsAfter: { ...activeWeights },
      };

    setRebalanceHistory((prev) => [newEntry, ...prev]);

    // Update holdings to the post-rebalance target values & reset shocks to 0%
    setHoldings((prev) => {
      const next = { ...prev };
      for (const item of plan.items) {
        const asset = allAssets.find((a) => a.id === item.assetId);
        if (!asset) continue;
        const prevHold = next[item.assetId];
        const isNominal =
          item.isNominalOnly ??
          prevHold?.isNominalOnly ??
          (asset.category === 'bonds' || asset.category === 'money-market');
        const postShockUnitPriceNative = isNominal
          ? 1
          : (prevHold?.currentPrice ?? asset.defaultPrice) *
            Math.max(0, 1 + (prevHold?.shockPercent ?? 0) / 100);
        const unitPriceIdr = isNominal
          ? 1
          : asset.currency === 'USD'
            ? postShockUnitPriceNative * usdIdrRate
            : postShockUnitPriceNative;

        const postShockVal = item.postShockValueIdr ?? (item as any).postShockValIdr ?? 0;
        const executedValIdr = Math.max(0, Math.round(postShockVal + item.tradeAmountIdr));
        const newUnits = isNominal
          ? executedValIdr
          : Number((executedValIdr / Math.max(1e-6, unitPriceIdr)).toFixed(asset.category === 'crypto' ? 8 : 4));

        const boughtUnits =
          item.action === 'BUY' && item.tradeAmountIdr > 0
            ? (item.tradeUnits > 0 ? item.tradeUnits : (item.tradeAmountIdr / Math.max(1e-6, unitPriceIdr)))
            : 0;
        const buyPrice = postShockUnitPriceNative > 0 ? postShockUnitPriceNative : (asset.defaultPrice || 1);

        // Bug 1: Weighted average cost basis calculation (avgBuyPrice)
        const newAvgBuyPrice = computeUpdatedAverageCostBasis({
          prevUnits: prevHold?.units ?? 0,
          prevAvgBuyPrice: prevHold?.avgBuyPrice,
          prevCurrentPrice: prevHold?.currentPrice ?? asset.defaultPrice ?? 1,
          boughtUnits,
          buyPrice,
          newTotalUnits: newUnits,
          isNominal,
          category: asset.category,
        });


        next[item.assetId] = {
          ...prevHold,
          assetId: item.assetId,
          currentValueIdr: executedValIdr,
          units: newUnits,
          currentPrice: isNominal
            ? 1
            : Number(postShockUnitPriceNative.toFixed(asset.category === 'crypto' ? 8 : 4)),
          avgBuyPrice: newAvgBuyPrice,
          shockPercent: 0,
          isNominalOnly: isNominal,
          subSplits: prevHold?.subSplits,
          notes: prevHold?.notes,
        };
      }
      return next;
    });
    // Decision 1: Keep unallocated cash remainder in cashInjectionIdr so it stays available
    setCashInjectionIdr(leftoverCash);
    setIsHoldingsSyncedWithMenu1(false);
    setOrderSlipPlanOverride(null);
  };

  const handleDeleteRebalanceHistoryEntry = (id: string) => {
    setRebalanceHistory((prev) => prev.filter((item) => item.id !== id));
  };

  // Save / Load / Export / Share handlers
  const handleSaveCurrentPortfolio = (name: string) => {
    const snap: SavedPortfolioSnapshot = {
      id: `snap-${Date.now()}`,
      name,
      createdAt: new Date().toLocaleDateString('id-ID'),
      weights: { ...activeWeights },
      cagr: solvedMetrics.cagr,
      maxDrawdown: solvedMetrics.maxDrawdown,
    };
    const updated = [snap, ...savedPortfolios];
    setSavedPortfolios(updated);
    localStorage.setItem(SAVED_PORTFOLIOS_KEY, JSON.stringify(updated));
  };

  const handleLoadSavedPortfolio = (snap: SavedPortfolioSnapshot) => {
    setActiveWeights({ ...snap.weights });
    setActivePresetId(null);
    setAllocationMethod('custom');
  };

  const handleDeleteSavedPortfolio = (id: string) => {
    const updated = savedPortfolios.filter((s) => s.id !== id);
    setSavedPortfolios(updated);
    localStorage.setItem(SAVED_PORTFOLIOS_KEY, JSON.stringify(updated));
  };

  const getBackupPayload = (): QuantPortoBackupPayload => {
    const customAssets = allAssets.filter(
      (a) => !CORE_AND_EXPANDED_ASSETS.some((c) => c.id === a.id)
    );
    const customizedCoreAssets = allAssets.filter(
      (a) =>
        CORE_AND_EXPANDED_ASSETS.some((c) => c.id === a.id) &&
        (a.isRenamed || a.isNominalOnly || a.originalShortName !== undefined)
    );

    let roadmapSettings: any = null;
    try {
      const raw = localStorage.getItem('quantporto_roadmap_settings_v1');
      if (raw) roadmapSettings = JSON.parse(raw);
    } catch {
      // Ignore
    }

    return {
      version: 2,
      app: 'QuantPorto',
      exportedAt: new Date().toISOString(),
      data: {
        menu1_builder: {
          activeWeights,
          activePresetId,
          allocationMethod,
          convictionAssetId,
          convictionRiskPercent,
          solverMode,
          selectedUniverseIds,
          pinnedPresetIds,
          customTableRows,
          slotMap,
          rdptPromoActive,
          customAssets,
          customizedCoreAssets,
          allAssets,
          lockedAssetIds,
        },
        menu2_rebalancer: {
          holdings,
          rebalanceHistory,
          inputMode,
          rebalanceMode,
          cashInjectionIdr,
          driftThresholdPercent,
          isHoldingsSyncedWithMenu1,
          enableIdxLotRounding,
          enableBrokerFees,
          filterDustTrades,
          isFixedBudgetMode,
          fixedTotalBudgetIdr,
          tacticalConfig,
          smartDcaMonthlyBudgetIdr,
          smartDcaOverflowMode,
          smartDcaAllocationMode,
          smartDcaIndicatorOverrides,
        },
        menu3_simulator: {
          initialCapitalIdr,
          targetGoalIdr,
          monthlySavingsIdr,
          annualInflationPercent: roadmapSettings?.annualInflationPercent,
          annualStepUpPct: roadmapSettings?.annualStepUpPct,
          monthlyLivingCostTargetIdr: roadmapSettings?.monthlyLivingCostTargetIdr,
          simulationViewMode: roadmapSettings?.simulationViewMode,
          monteCarloDisplayMode: roadmapSettings?.monteCarloDisplayMode,
          taxMode: roadmapSettings?.taxMode,
          dividendUsageMode: roadmapSettings?.dividendUsageMode,
          customYieldOverrides: roadmapSettings?.customYieldOverrides,
          reverseDcaTargetYears: roadmapSettings?.reverseDcaTargetYears,
        },
        global: {
          usdIdrRate,
          savedPortfolios,
        },
      },
    };
  };

  const handleExportJson = () => {
    const payload = getBackupPayload();
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `quantporto-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleQuickCopyConfig = async () => {
    try {
      const payload = getBackupPayload();
      const text = JSON.stringify(payload, null, 2);
      await navigator.clipboard.writeText(text);
      setQuickCopyFeedback(true);
      setTimeout(() => setQuickCopyFeedback(false), 2500);
      setBackupToast({
        message: 'Konfigurasi JSON Berhasil Disalin!',
        details: [
          'Seluruh data portofolio siap ditempel ke catatan atau dibagikan',
        ],
      });
    } catch (err) {
      console.error('Failed to copy config to clipboard', err);
    }
  };

  const handleBatchUpdateHoldings = (
    items: ParsedHoldingItem[],
    strategy: 'merge' | 'replace'
  ) => {
    // Lock manual holdings so Menu 1 changes don't overwrite user's imported holdings!
    setIsHoldingsSyncedWithMenu1(false);
    const updatedCount = items.filter((i) => i.isRecognized && i.isValid).length;
    setHoldings((prev) => {
      const next = strategy === 'replace' ? {} : { ...prev };
      for (const item of items) {
        if (!item.assetId || !item.isRecognized) continue;
        const asset = allAssets.find((a) => a.id === item.assetId);
        const isCatNominal = asset?.category === 'bonds' || asset?.category === 'money-market';
        const isNominalOnly = prev[item.assetId]?.isNominalOnly ?? isCatNominal;

        next[item.assetId] = {
          assetId: item.assetId,
          currentValueIdr: item.nominalIdr,
          units: item.units,
          currentPrice: item.priceNative,
          shockPercent: 0,
          isNominalOnly,
        };
      }
      return next;
    });

    setBackupToast({
      message:
        strategy === 'replace'
          ? `Saldo Holding Digantikan (${updatedCount} Aset)!`
          : `Saldo Holding Diperbarui (${updatedCount} Aset)!`,
      details: [
        `Data holding berhasil diparsing dan diterapkan ke kalkulator rebalance.`,
      ],
    });
  };

  const handleImportPayload = (
    raw: any,
    mode: 'overwrite' | 'merge' = 'overwrite'
  ) => {
    try {
      const details: string[] = [];

      // Check whether it's Schema v2 or Legacy v1
      const isV2 = raw.version === 2 && raw.data;
      const d1 = isV2 ? raw.data.menu1_builder : raw;
      const d2 = isV2 ? raw.data.menu2_rebalancer : raw;
      const d3 = isV2 ? raw.data.menu3_simulator : raw;
      const dg = isV2 ? raw.data.global : raw;

      // 1. Menu 1: Builder
      if (d1.activeWeights && typeof d1.activeWeights === 'object') {
        if (mode === 'merge') {
          setActiveWeights((prev) => normalizeWeightsTo100({ ...prev, ...d1.activeWeights }));
        } else {
          setActiveWeights(normalizeWeightsTo100(d1.activeWeights));
        }
        const activeCount = Object.values(d1.activeWeights).filter(
          (w) => typeof w === 'number' && w > 0
        ).length;
        details.push(`Menu 1: ${activeCount} aset aktif dipulihkan`);
      }
      if (d1.activePresetId !== undefined) setActivePresetId(d1.activePresetId);
      if (d1.allocationMethod) setAllocationMethod(d1.allocationMethod);
      if (d1.convictionAssetId) setConvictionAssetId(d1.convictionAssetId);
      if (typeof d1.convictionRiskPercent === 'number')
        setConvictionRiskPercent(d1.convictionRiskPercent);
      if (d1.solverMode) setSolverMode(d1.solverMode);
      if (Array.isArray(d1.selectedUniverseIds))
        setSelectedUniverseIds(d1.selectedUniverseIds);
      if (Array.isArray(d1.pinnedPresetIds))
        setPinnedPresetIds(d1.pinnedPresetIds);
      if (Array.isArray(d1.customTableRows))
        setCustomTableRows(d1.customTableRows);
      if (d1.slotMap) setSlotMap(d1.slotMap);
      if (d1.rdptPromoActive !== undefined)
        setRdptPromoActive(Boolean(d1.rdptPromoActive));
      if (Array.isArray(d1.lockedAssetIds))
        setLockedAssetIds(d1.lockedAssetIds);

      // Restore custom assets
      if (Array.isArray(d1.customAssets) && d1.customAssets.length > 0) {
        setAllAssets((prev) => {
          const existingIds = new Set(prev.map((a) => a.id));
          const newAdditions = d1.customAssets.filter(
            (a: AssetDefinition) => !existingIds.has(a.id)
          );
          return [...prev, ...newAdditions];
        });
        details.push(`Ticker kustom: +${d1.customAssets.length} aset`);
      }

      if (Array.isArray(d1.allAssets) && d1.allAssets.length > 0) {
        setAllAssets((prev) => {
          const importedMap = new Map<string, AssetDefinition>(
            d1.allAssets.map((a: AssetDefinition) => [a.id, a])
          );
          const updated = prev.map((curr) => {
            const imp = importedMap.get(curr.id);
            if (!imp) return curr;
            return {
              ...curr,
              ...imp,
              symbol: imp.shortName ?? imp.symbol ?? curr.symbol,
            };
          });
          const currIds = new Set(updated.map((a) => a.id));
          const additionsFromAll = d1.allAssets.filter((a: AssetDefinition) => !currIds.has(a.id));
          return additionsFromAll.length > 0 ? [...updated, ...additionsFromAll] : updated;
        });
        details.push(`Metadata instrumen dipulihkan`);
      } else if (Array.isArray(d1.customizedCoreAssets) && d1.customizedCoreAssets.length > 0) {
        setAllAssets((prev) => {
          const customMap = new Map<string, AssetDefinition>(
            d1.customizedCoreAssets.map((a: AssetDefinition) => [a.id, a])
          );
          return prev.map((curr) => {
            const c = customMap.get(curr.id);
            if (!c) return curr;
            return {
              ...curr,
              ...c,
              symbol: c.shortName ?? c.symbol ?? curr.symbol,
            };
          });
        });
        details.push(`Kustomisasi aset acuan dipulihkan`);
      }

      // 2. Menu 2: Rebalancer & History
      if (d2.holdings && typeof d2.holdings === 'object') {
        if (mode === 'merge') {
          setHoldings((prev) => ({ ...prev, ...d2.holdings }));
        } else {
          setHoldings(d2.holdings);
        }
        details.push(
          `Menu 2: Saldo holding ${Object.keys(d2.holdings).length} aset`
        );
      }
      if (Array.isArray(d2.rebalanceHistory)) {
        if (mode === 'merge') {
          setRebalanceHistory((prev) => {
            const existingIds = new Set(prev.map((h) => h.id));
            const newEntries = d2.rebalanceHistory.filter(
              (h: any) => !existingIds.has(h.id)
            );
            return [...newEntries, ...prev];
          });
        } else {
          setRebalanceHistory(d2.rebalanceHistory);
        }
        details.push(
          `Jurnal Rebalance: ${d2.rebalanceHistory.length} catatan riwayat`
        );
      }
      if (d2.inputMode === 'nominal' || d2.inputMode === 'units')
        setInputMode(d2.inputMode);
      if (d2.rebalanceMode) setRebalanceMode(d2.rebalanceMode);
      if (typeof d2.cashInjectionIdr === 'number')
        setCashInjectionIdr(d2.cashInjectionIdr);
      if (typeof d2.driftThresholdPercent === 'number')
        setDriftThresholdPercent(d2.driftThresholdPercent);
      if (d2.isHoldingsSyncedWithMenu1 !== undefined)
        setIsHoldingsSyncedWithMenu1(d2.isHoldingsSyncedWithMenu1);
      if (d2.enableIdxLotRounding !== undefined)
        setEnableIdxLotRounding(Boolean(d2.enableIdxLotRounding));
      if (d2.enableBrokerFees !== undefined)
        setEnableBrokerFees(Boolean(d2.enableBrokerFees));
      if (d2.filterDustTrades !== undefined)
        setFilterDustTrades(Boolean(d2.filterDustTrades));
      if (d2.isFixedBudgetMode !== undefined)
        setIsFixedBudgetMode(Boolean(d2.isFixedBudgetMode));
      if (typeof d2.fixedTotalBudgetIdr === 'number')
        setFixedTotalBudgetIdr(d2.fixedTotalBudgetIdr);
      if (d2.tacticalConfig && typeof d2.tacticalConfig === 'object') {
        setTacticalConfig(d2.tacticalConfig);
      }
      if (typeof d2.smartDcaMonthlyBudgetIdr === 'number' && d2.smartDcaMonthlyBudgetIdr > 0) {
        setSmartDcaMonthlyBudgetIdr(d2.smartDcaMonthlyBudgetIdr);
      }
      if (d2.smartDcaOverflowMode === 'park-rdpu' || d2.smartDcaOverflowMode === 'boost-discount') {
        setSmartDcaOverflowMode(d2.smartDcaOverflowMode);
      }
      if (
        d2.smartDcaAllocationMode === 'target-weight-multiplier' ||
        d2.smartDcaAllocationMode === 'pure-confluence-rank'
      ) {
        setSmartDcaAllocationMode(d2.smartDcaAllocationMode);
      }
      if (d2.smartDcaIndicatorOverrides && typeof d2.smartDcaIndicatorOverrides === 'object') {
        setSmartDcaIndicatorOverrides(d2.smartDcaIndicatorOverrides);
      }

      // 3. Menu 3: Simulator & Goals
      if (
        typeof d3.initialCapitalIdr === 'number' &&
        d3.initialCapitalIdr >= 0
      ) {
        setInitialCapitalIdr(d3.initialCapitalIdr);
      }
      if (typeof d3.targetGoalIdr === 'number' && d3.targetGoalIdr > 0) {
        setTargetGoalIdr(d3.targetGoalIdr);
      }
      if (
        typeof d3.monthlySavingsIdr === 'number' &&
        d3.monthlySavingsIdr >= 0
      ) {
        setMonthlySavingsIdr(d3.monthlySavingsIdr);
        details.push(
          `Menu 3: Target & DCA ${formatIdr(d3.monthlySavingsIdr, true)}/bln`
        );
      }

      // Restore Menu 3 Roadmap simulation parameters into local storage
      try {
        const existingRaw = localStorage.getItem('quantporto_roadmap_settings_v1');
        const existing = existingRaw ? JSON.parse(existingRaw) : {};
        const updatedRoadmapSettings = {
          ...existing,
          ...(d3.annualInflationPercent !== undefined ? { annualInflationPercent: d3.annualInflationPercent } : {}),
          ...(d3.annualStepUpPct !== undefined ? { annualStepUpPct: d3.annualStepUpPct } : {}),
          ...(d3.monthlyLivingCostTargetIdr !== undefined ? { monthlyLivingCostTargetIdr: d3.monthlyLivingCostTargetIdr } : {}),
          ...(d3.simulationViewMode !== undefined ? { simulationViewMode: d3.simulationViewMode } : {}),
          ...(d3.monteCarloDisplayMode !== undefined ? { monteCarloDisplayMode: d3.monteCarloDisplayMode } : {}),
          ...(d3.taxMode !== undefined ? { taxMode: d3.taxMode } : {}),
          ...(d3.dividendUsageMode !== undefined ? { dividendUsageMode: d3.dividendUsageMode } : {}),
          ...(d3.customYieldOverrides !== undefined ? { customYieldOverrides: d3.customYieldOverrides } : {}),
          ...(d3.reverseDcaTargetYears !== undefined ? { reverseDcaTargetYears: d3.reverseDcaTargetYears } : {}),
        };
        localStorage.setItem('quantporto_roadmap_settings_v1', JSON.stringify(updatedRoadmapSettings));
        setRoadmapSettingsVersion((v) => v + 1);
      } catch {
        // Ignore storage errors
      }


      // 4. Global
      if (typeof dg.usdIdrRate === 'number' && dg.usdIdrRate > 1000) {
        setUsdIdrRate(dg.usdIdrRate);
      }
      if (Array.isArray(dg.savedPortfolios)) {
        if (mode === 'merge') {
          setSavedPortfolios((prev) => {
            const existingIds = new Set(prev.map((s) => s.id));
            const newSnaps = dg.savedPortfolios.filter(
              (s: any) => !existingIds.has(s.id)
            );
            const combined = [...newSnaps, ...prev];
            localStorage.setItem(
              SAVED_PORTFOLIOS_KEY,
              JSON.stringify(combined)
            );
            return combined;
          });
        } else {
          setSavedPortfolios(dg.savedPortfolios);
          localStorage.setItem(
            SAVED_PORTFOLIOS_KEY,
            JSON.stringify(dg.savedPortfolios)
          );
        }
        details.push(
          `Portofolio tersimpan: ${dg.savedPortfolios.length} snapshot`
        );
      }

      // Instant Atomic Persistence to LocalStorage (STORAGE_KEY)
      try {
        let mergedAllAssets = dg.allAssets ?? allAssets;
        if (Array.isArray(d1.allAssets) && d1.allAssets.length > 0) {
          const impMap = new Map<string, AssetDefinition>(
            d1.allAssets.map((a: AssetDefinition) => [a.id, a])
          );
          const updated = mergedAllAssets.map((curr: AssetDefinition) => {
            const imp = impMap.get(curr.id);
            return imp ? { ...curr, ...imp, symbol: imp.shortName ?? imp.symbol ?? curr.symbol } : curr;
          });
          const currIds = new Set(updated.map((a: AssetDefinition) => a.id));
          const additionsFromAll = d1.allAssets.filter((a: AssetDefinition) => !currIds.has(a.id));
          mergedAllAssets = additionsFromAll.length > 0 ? [...updated, ...additionsFromAll] : updated;
        } else if (Array.isArray(d1.customizedCoreAssets) && d1.customizedCoreAssets.length > 0) {
          const cMap = new Map<string, AssetDefinition>(
            d1.customizedCoreAssets.map((a: AssetDefinition) => [a.id, a])
          );
          mergedAllAssets = mergedAllAssets.map((curr: AssetDefinition) => {
            const c = cMap.get(curr.id);
            return c ? { ...curr, ...c, symbol: c.shortName ?? c.symbol ?? curr.symbol } : curr;
          });
        }
        if (Array.isArray(d1.customAssets) && d1.customAssets.length > 0) {
          const currIds = new Set(mergedAllAssets.map((a: AssetDefinition) => a.id));
          const add = d1.customAssets.filter((a: AssetDefinition) => !currIds.has(a.id));
          mergedAllAssets = [...mergedAllAssets, ...add];
        }

        const mergedHoldings =
          mode === 'merge'
            ? { ...holdings, ...(d2.holdings ?? {}) }
            : (d2.holdings ?? holdings);

        let mergedRebalanceHistory = d2.rebalanceHistory ?? rebalanceHistory;
        if (mode === 'merge' && Array.isArray(d2.rebalanceHistory)) {
          const existingIds = new Set(rebalanceHistory.map((h: any) => h.id));
          const newEntries = d2.rebalanceHistory.filter(
            (h: any) => !existingIds.has(h.id)
          );
          mergedRebalanceHistory = [...newEntries, ...rebalanceHistory];
        }

        const mergedActiveWeights =
          mode === 'merge' && d1.activeWeights
            ? normalizeWeightsTo100({ ...activeWeights, ...d1.activeWeights })
            : d1.activeWeights
              ? normalizeWeightsTo100(d1.activeWeights)
              : activeWeights;

        const mergedSelectedUniverseIds =
          mode === 'merge' && Array.isArray(d1.selectedUniverseIds)
            ? Array.from(new Set([...selectedUniverseIds, ...d1.selectedUniverseIds]))
            : (d1.selectedUniverseIds ?? selectedUniverseIds);

        const snapshotToStore = {
          activeTab,
          activeWeights: mergedActiveWeights,
          activePresetId: d1.activePresetId ?? activePresetId,
          allocationMethod: d1.allocationMethod ?? allocationMethod,
          convictionAssetId: d1.convictionAssetId ?? convictionAssetId,
          convictionRiskPercent:
            d1.convictionRiskPercent ?? convictionRiskPercent,
          solverMode: d1.solverMode ?? solverMode,
          selectedUniverseIds: mergedSelectedUniverseIds,
          initialCapitalIdr: d3.initialCapitalIdr ?? initialCapitalIdr,
          targetGoalIdr: d3.targetGoalIdr ?? targetGoalIdr,
          monthlySavingsIdr: d3.monthlySavingsIdr ?? monthlySavingsIdr,
          holdings: mergedHoldings,
          isHoldingsSyncedWithMenu1:
            d2.isHoldingsSyncedWithMenu1 ?? isHoldingsSyncedWithMenu1,
          enableIdxLotRounding:
            d2.enableIdxLotRounding ?? enableIdxLotRounding,
          enableBrokerFees: d2.enableBrokerFees ?? enableBrokerFees,
          filterDustTrades: d2.filterDustTrades ?? filterDustTrades,
          tacticalConfig: d2.tacticalConfig ?? tacticalConfig,
          inputMode: d2.inputMode ?? inputMode,
          rebalanceMode: d2.rebalanceMode ?? rebalanceMode,
          cashInjectionIdr: d2.cashInjectionIdr ?? cashInjectionIdr,
          isFixedBudgetMode: d2.isFixedBudgetMode ?? isFixedBudgetMode,
          fixedTotalBudgetIdr: d2.fixedTotalBudgetIdr ?? fixedTotalBudgetIdr,
          driftThresholdPercent:
            d2.driftThresholdPercent ?? driftThresholdPercent,
          slotMap: d1.slotMap ?? slotMap,
          rdptPromoActive: d1.rdptPromoActive ?? rdptPromoActive,
          lockedAssetIds: d1.lockedAssetIds ?? lockedAssetIds,
          usdIdrRate: dg.usdIdrRate ?? usdIdrRate,
          customTableRows: d1.customTableRows ?? customTableRows,
          rebalanceHistory: mergedRebalanceHistory,
          pinnedPresetIds: d1.pinnedPresetIds ?? pinnedPresetIds,
          allAssets: mergedAllAssets,
          smartDcaMonthlyBudgetIdr: d2.smartDcaMonthlyBudgetIdr ?? smartDcaMonthlyBudgetIdr,
          smartDcaOverflowMode: d2.smartDcaOverflowMode ?? smartDcaOverflowMode,
          smartDcaAllocationMode: d2.smartDcaAllocationMode ?? smartDcaAllocationMode,
          smartDcaIndicatorOverrides: d2.smartDcaIndicatorOverrides ?? smartDcaIndicatorOverrides,
        };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshotToStore));
      } catch {
        // Ignore storage errors
      }

      setBackupToast({
        message:
          mode === 'merge'
            ? 'Data Backup Berhasil Digabungkan (Merged)!'
            : isV2
              ? 'Backup JSON (v2) Berhasil Dipulihkan!'
              : 'Backup JSON (Legacy) Berhasil Dipulihkan!',
        details:
          details.length > 0
            ? details
            : ['Semua konfigurasi berhasil dipulihkan'],
      });
    } catch (err) {
      console.error('Failed to import backup payload:', err);
      alert(
        'Format data tidak valid atau rusak. Pastikan data berasal dari QuantPorto backup.'
      );
    }
  };

  const handleImportJson = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const raw = JSON.parse(String(reader.result));
        handleImportPayload(raw, 'overwrite');
      } catch (err) {
        console.error('Failed to read file:', err);
        alert('File JSON tidak valid atau rusak.');
      }
    };
    reader.readAsText(file);
  };

  const handleCopyShareUrl = () => {
    const customAssets = allAssets.filter(
      (a) => !CORE_AND_EXPANDED_ASSETS.some((c) => c.id === a.id)
    );
    const renamedAssets = allAssets
      .filter((a) => a.isRenamed || a.isNominalOnly)
      .map((a) => ({
        id: a.id,
        shortName: a.shortName,
        name: a.name,
        isNominalOnly: Boolean(a.isNominalOnly),
        lotSize: a.lotSize,
        allowFractional: a.allowFractional,
      }));
    let roadmapSettings: any = null;
    try {
      const raw = localStorage.getItem('quantporto_roadmap_settings_v1');
      if (raw) roadmapSettings = JSON.parse(raw);
    } catch {
      // Ignore
    }

    const shareData = utf8ToBase64(
      JSON.stringify({
        weights: activeWeights,
        presetId: activePresetId,
        method: allocationMethod,
        convictionAssetId,
        convictionRiskPercent,
        solverMode,
        selectedUniverseIds,
        slotMap,
        rdptPromo: rdptPromoActive,
        capital: initialCapitalIdr,
        dca: monthlySavingsIdr,
        goal: targetGoalIdr,
        customAssets,
        renamedAssets,
        roadmap: roadmapSettings,
      })
    );
    const url = `${window.location.origin}${window.location.pathname}#porto=${encodeURIComponent(
      shareData
    )}`;
    window.history.replaceState(null, '', `#porto=${encodeURIComponent(shareData)}`);
    navigator.clipboard?.writeText(url);
    setShareCopied(true);
    setTimeout(() => setShareCopied(false), 2000);
  };

  // Handler: Apply Recommended Portfolio from Smart Recommender Wizard
  const handleApplyRecommendation = (
    rec: PortfolioRecommendationItem,
    slotMapChoice: Record<string, string>,
    pinToTable: boolean,
    goToRebalancer: boolean
  ) => {
    setSlotMap(slotMapChoice);
    setActiveWeights({ ...rec.weights });

    const activeIds = Object.entries(rec.weights)
      .filter(([, w]) => w > 0)
      .map(([id]) => id);
    if (activeIds.length > 0) {
      setSelectedUniverseIds(activeIds);
    }

    if (rec.matchingPresetId) {
      setActivePresetId(rec.matchingPresetId);
      setAllocationMethod('preset');
    } else {
      setAllocationMethod('custom');
      if (rec.convictionAssetId) {
        setConvictionAssetId(rec.convictionAssetId);
      }
      if (rec.convictionRiskPercent) {
        setConvictionRiskPercent(rec.convictionRiskPercent);
      }
    }

    if (pinToTable && !rec.matchingPresetId) {
      const pinnedRow: PortfolioPreset = {
        id: `custom-rec-${Date.now()}`,
        name: rec.title.replace('Rekomendasi Utama: ', 'Custom '),
        method: rec.method,
        convictionAssetId: rec.convictionAssetId,
        convictionRiskPercent: rec.convictionRiskPercent,
        riskTier: rec.metrics.riskTier,
        cagr: rec.metrics.cagr,
        maxDrawdown: rec.metrics.maxDrawdown,
        isOptimal15: !rec.metrics.isParetoDominated,
        isCustomRow: true,
        weights: { ...rec.weights },
        videoNote:
          rec.rationalePoints[0] ?? 'Hasil estimasi Kuis Tanya Quant sesuai profil Anda.',
      };
      setCustomTableRows((prev) => [pinnedRow, ...prev]);
      setActivePresetId(pinnedRow.id);
    }

    // Also sync Rebalancer holdings to match the recommended weights at Initial Capital
    setHoldings((prev) => {
      const next = { ...prev };
      for (const a of allAssets) {
        const prevA = prev[a.id];
        const isNominal =
          a.isNominalOnly ?? prevA?.isNominalOnly ?? (a.category === 'bonds' || a.category === 'money-market');
        const w = rec.weights[a.id] ?? 0;
        const valIdr = Math.round(initialCapitalIdr * (w / 100));
        const unitPriceIdr =
          a.currency === 'USD'
            ? (prevA?.currentPrice ?? a.defaultPrice) * usdIdrRate
            : prevA?.currentPrice ?? a.defaultPrice;
        const precision = a.category === 'crypto' ? 8 : 4;
        next[a.id] = {
          ...prevA,
          assetId: a.id,
          currentValueIdr: valIdr,
          units: isNominal
            ? valIdr
            : Number((valIdr / Math.max(1, unitPriceIdr)).toFixed(precision)),
          currentPrice: isNominal ? 1 : (prevA?.currentPrice ?? a.defaultPrice),
          shockPercent: 0,
          isNominalOnly: isNominal,
          notes: prevA?.notes,
          subSplits: prevA?.subSplits,
        };
      }
      return next;
    });

    if (goToRebalancer) {
      setActiveTab('rebalancer');
    } else {
      setActiveTab('builder');
    }
  };

  // 1. Strict Security Policy: If VITE_APP_PASSWORD_HASH is missing from .env, block app completely
  if (!CONFIGURED_PASSWORD_HASH) {
    return <MissingEnvScreen />;
  }

  // 2. Tab Session Gate: If not authenticated in current browser tab session, show Lock Screen
  if (!isAuthenticated) {
    return (
      <AuthLockScreen
        expectedHash={CONFIGURED_PASSWORD_HASH}
        onAuthenticated={() => setIsAuthenticated(true)}
      />
    );
  }

  return (
    <div className="ui-page min-h-screen">
      <Header
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        usdIdrRate={usdIdrRate}
        setUsdIdrRate={setUsdIdrRate}
        priceSourceText={priceSourceText}
        lastUpdatedText={lastUpdatedText}
        isFetchingPrices={isFetchingPrices}
        onRefreshLivePrices={handleRefreshLivePrices}
        rdptPromoActive={rdptPromoActive}
        setRdptPromoActive={setRdptPromoActive}
        onExportJson={handleExportJson}
        onImportJson={handleImportJson}
        onCopyShareUrl={handleCopyShareUrl}
        shareCopied={shareCopied}
        savedPortfolios={effectiveSavedPortfolios}
        onSaveCurrentPortfolio={handleSaveCurrentPortfolio}
        onLoadSavedPortfolio={handleLoadSavedPortfolio}
        onDeleteSavedPortfolio={handleDeleteSavedPortfolio}
        onOpenRecommender={() => setIsRecommenderOpen(true)}
        onStartInteractiveTour={handleStartTour}
        onOpenOrderSlip={() => {
          setIsOrderSlipOpen(true);
        }}
        onOpenResetConfirm={() => setIsResetConfirmOpen(true)}
        onOpenDataTransfer={() => setIsDataTransferModalOpen(true)}
        onQuickCopyConfig={handleQuickCopyConfig}
        quickCopyFeedback={quickCopyFeedback}
        onLockApp={handleLockApp}
        activePortfolioName={
          exactPresetMatch
            ? exactPresetMatch.name
            : allocationMethod === 'risk-parity'
              ? 'Custom Equal Risk Parity'
              : allocationMethod === 'risk-budgeting'
                ? `Custom ${convictionRiskPercent}% Risk ${convictionAssetId}`
                : 'Portfolio Custom Anda'
        }
        activeCagr={solvedMetrics.cagr}
        activeMaxDrawdown={solvedMetrics.maxDrawdown}
        rebalanceBreachedCount={rebalanceResult.breachedCount}
        rebalanceMaxDriftPercent={rebalanceResult.maxAbsoluteDrift}
      />

      <main className="mx-auto max-w-7xl px-3 py-4 sm:px-6 sm:py-6">
        {activeTab === 'builder' && (
          <PortfolioBuilderView
            allAssets={allAssets}
            onAddCustomAsset={handleAddCustomAsset}
            presets={dynamicPresets}
            customTableRows={effectiveCustomTableRows}
            onPinCurrentToTable={handlePinCurrentToTable}
            onRemoveCustomTableRow={handleRemoveCustomTableRow}
            slotMap={slotMap}
            onChangeSlotAsset={handleChangeSlotAsset}
            onResetSlotMap={handleResetSlotMap}
            onQuickSwapBbcaToPtba={handleQuickSwapBbcaToPtba}
            activePresetId={activePresetId}
            onSelectPreset={handleSelectPreset}
            allocationMethod={allocationMethod}
            setAllocationMethod={setAllocationMethod}
            selectedUniverseIds={selectedUniverseIds}
            onToggleUniverseAsset={handleToggleUniverseAsset}
            convictionAssetId={convictionAssetId}
            setConvictionAssetId={setConvictionAssetId}
            convictionRiskPercent={convictionRiskPercent}
            setConvictionRiskPercent={setConvictionRiskPercent}
            solverMode={solverMode}
            setSolverMode={setSolverMode}
            activeWeights={activeWeights}
            onManualWeightChange={handleManualWeightChange}
            onNormalizeManualWeights={handleNormalizeManualWeights}
            lockedAssetIds={lockedAssetIds}
            onToggleLockAsset={handleToggleLockAsset}
            onUnlockAllAssets={handleUnlockAllAssets}
            solvedMetrics={solvedMetrics}
            initialCapitalIdr={initialCapitalIdr}
            setInitialCapitalIdr={setInitialCapitalIdr}
            targetGoalIdr={targetGoalIdr}
            setTargetGoalIdr={setTargetGoalIdr}
            monthlySavingsIdr={monthlySavingsIdr}
            setMonthlySavingsIdr={setMonthlySavingsIdr}
            onGoToRebalancer={() => setActiveTab('rebalancer')}
            onOpenRecommender={() => setIsRecommenderOpen(true)}
            rdptPromoActive={rdptPromoActive}
            hasCustomAssetAssumptions={hasCustomAssetAssumptions}
            onUpdateAssetAssumption={handleUpdateAssetAssumption}
            onResetAssetAssumptions={handleResetAssetAssumptions}
            onUpdateAssetMeta={handleUpdateAssetMeta}
            onResetAssetMeta={handleResetAssetMeta}
            pinnedPresetIds={pinnedPresetIds}
            onTogglePinPreset={handleTogglePinPreset}
            onOpenFactsheet={() => setIsFactsheetOpen(true)}
          />
        )}

        {activeTab === 'rebalancer' && (
          <PortfolioRebalancerView
            allAssets={allAssets}
            targetWeights={activeWeights}
            holdings={holdings}
            onUpdateHolding={handleUpdateHolding}
            onPopulateCapital={handlePopulateCapital}
            onLoadVideo1BExample={handleLoadVideo1BExample}
            onApplyShockScenario={handleApplyShockScenario}
            inputMode={inputMode}
            setInputMode={setInputMode}
            rebalanceMode={rebalanceMode}
            setRebalanceMode={setRebalanceMode}
            cashInjectionIdr={cashInjectionIdr}
            setCashInjectionIdr={setCashInjectionIdr}
            driftThresholdPercent={driftThresholdPercent}
            setDriftThresholdPercent={setDriftThresholdPercent}
            usdIdrRate={usdIdrRate}
            rebalanceResult={rebalanceResult}
            onApplyPeerDiversification={handleApplyPeerDiversification}
            rebalanceHistory={rebalanceHistory}
            onCommitRebalanceToHoldings={handleCommitRebalanceToHoldings}
            onDeleteRebalanceHistoryEntry={handleDeleteRebalanceHistoryEntry}
            initialCapitalMenu1Idr={initialCapitalIdr}
            monthlySavingsMenu1Idr={monthlySavingsIdr}
            activePortfolioName={
              exactPresetMatch
                ? exactPresetMatch.name
                : allocationMethod === 'risk-parity'
                  ? 'Custom Equal Risk Parity'
                  : allocationMethod === 'risk-budgeting'
                    ? `Custom ${convictionRiskPercent}% Risk ${convictionAssetId}`
                    : 'Portfolio Custom Anda'
            }
            isHoldingsSyncedWithMenu1={isHoldingsSyncedWithMenu1}
            enableIdxLotRounding={enableIdxLotRounding}
            setEnableIdxLotRounding={setEnableIdxLotRounding}
            enableBrokerFees={enableBrokerFees}
            setEnableBrokerFees={setEnableBrokerFees}
            filterDustTrades={filterDustTrades}
            setFilterDustTrades={setFilterDustTrades}
            isFixedBudgetMode={isFixedBudgetMode}
            setIsFixedBudgetMode={setIsFixedBudgetMode}
            fixedTotalBudgetIdr={fixedTotalBudgetIdr}
            setFixedTotalBudgetIdr={setFixedTotalBudgetIdr}
            onClearHoldingsForManualInput={handleClearHoldingsForManualInput}
            onResetAllAssetPrices={handleResetAllAssetPrices}
            onSetupInitialBuyFromMenu1={handleSetupInitialBuyFromMenu1}
            onScaleTotalHoldingsIdr={handleScaleTotalHoldingsIdr}
            onOpenOrderSlip={(planOverride) => {
              setOrderSlipPlanOverride(planOverride ?? null);
              setIsOrderSlipOpen(true);
            }}
            onPlanOverrideChange={(plan) => setOrderSlipPlanOverride(plan)}
            onBatchUpdateHoldings={handleBatchUpdateHoldings}
            tacticalConfig={tacticalConfig}
            setTacticalConfig={setTacticalConfig}
            smartDcaMonthlyBudgetIdr={smartDcaMonthlyBudgetIdr}
            setSmartDcaMonthlyBudgetIdr={setSmartDcaMonthlyBudgetIdr}
            smartDcaOverflowMode={smartDcaOverflowMode}
            setSmartDcaOverflowMode={setSmartDcaOverflowMode}
            smartDcaAllocationMode={smartDcaAllocationMode}
            setSmartDcaAllocationMode={setSmartDcaAllocationMode}
            smartDcaIndicatorOverrides={smartDcaIndicatorOverrides}
            setSmartDcaIndicatorOverrides={setSmartDcaIndicatorOverrides}
          />
        )}

        {activeTab === 'roadmap' && (
          <WealthRoadmapView
            key={`roadmap-${roadmapSettingsVersion}`}
            allAssets={allAssets}
            activeWeights={activeWeights}
            solvedMetrics={solvedMetrics}
            initialCapitalIdr={initialCapitalIdr}
            setInitialCapitalIdr={setInitialCapitalIdr}
            targetGoalIdr={targetGoalIdr}
            setTargetGoalIdr={setTargetGoalIdr}
            monthlySavingsIdr={monthlySavingsIdr}
            setMonthlySavingsIdr={setMonthlySavingsIdr}
          />
        )}
      </main>

      {/* Institutional 1-Page Factsheet Modal (A4 Print / PNG Download) */}
      {isFactsheetOpen && (() => {
        let roadmapSettings: any = null;
        try {
          const raw = localStorage.getItem('quantporto_roadmap_settings_v1');
          if (raw) roadmapSettings = JSON.parse(raw);
        } catch {
          // Ignore
        }
        return (
          <PortfolioFactsheetModal
            isOpen={isFactsheetOpen}
            onClose={() => setIsFactsheetOpen(false)}
            portfolioName={
              exactPresetMatch
                ? exactPresetMatch.name
                : allocationMethod === 'risk-parity'
                  ? 'Custom Equal Risk Parity'
                  : allocationMethod === 'risk-budgeting'
                    ? `Custom ${convictionRiskPercent}% Risk ${convictionAssetId}`
                    : 'Portfolio Custom Anda'
            }
            activeWeights={activeWeights}
            allAssets={allAssets}
            solvedMetrics={solvedMetrics}
            initialCapitalIdr={initialCapitalIdr}
            monthlySavingsIdr={monthlySavingsIdr}
            targetGoalIdr={targetGoalIdr}
            usdIdrRate={usdIdrRate}
            annualInflationPercent={roadmapSettings?.annualInflationPercent}
            annualStepUpPercent={roadmapSettings?.annualStepUpPct}
          />
        );
      })()}

      {/* Multi-Platform Broker Order Slips Modal (Stockbit / Pluang / Reku / Makmur) */}
      {isOrderSlipOpen && (
        <BrokerOrderSlipModal
          isOpen={isOrderSlipOpen}
          onClose={() => {
            setIsOrderSlipOpen(false);
          }}
          rebalanceResult={orderSlipPlanOverride ?? rebalanceResult}
          allAssets={allAssets}
          holdings={holdings}
          usdIdrRate={usdIdrRate}
          activePortfolioName={
            exactPresetMatch
              ? exactPresetMatch.name
              : allocationMethod === 'risk-parity'
                ? 'Custom Equal Risk Parity'
                : allocationMethod === 'risk-budgeting'
                  ? `Custom ${convictionRiskPercent}% Risk ${convictionAssetId}`
                  : 'Portfolio Custom Anda'
          }
        />
      )}

      {/* Interactive Multiple-Choice Smart Portfolio Diagnostic & Recommender Modal */}
      <SmartPortfolioRecommenderModal
        isOpen={isRecommenderOpen}
        onClose={() => setIsRecommenderOpen(false)}
        allAssets={allAssets}
        presets={dynamicPresets}
        initialCapitalIdr={initialCapitalIdr}
        monthlySavingsIdr={monthlySavingsIdr}
        targetGoalIdr={targetGoalIdr}
        onApplyRecommendation={handleApplyRecommendation}
      />

      {/* Reset to Factory Default Confirmation Modal */}
      <ResetConfirmationModal
        isOpen={isResetConfirmOpen}
        onClose={() => setIsResetConfirmOpen(false)}
        onConfirmReset={handleConfirmResetAll}
      />

      {/* Comprehensive Data Transfer Modal (Text & File) */}
      <DataTransferModal
        isOpen={isDataTransferModalOpen}
        onClose={() => setIsDataTransferModalOpen(false)}
        exportPayload={getBackupPayload()}
        onImportPayload={handleImportPayload}
        onDownloadJsonFile={handleExportJson}
      />

      {/* Import Backup Feedback Notification Toast */}
      {backupToast && (
        <div className="fixed bottom-5 right-5 z-50 max-w-sm rounded-xl border border-emerald-500/40 bg-slate-900/95 p-4 text-xs text-slate-100 shadow-2xl backdrop-blur-md animate-in fade-in slide-in-from-bottom-5 duration-300">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2 font-bold text-emerald-400">
              <Check className="h-4 w-4 shrink-0 text-emerald-400" />
              <span>{backupToast.message}</span>
            </div>
            <button
              type="button"
              onClick={() => setBackupToast(null)}
              className="text-slate-400 hover:text-white p-0.5"
              aria-label="Tutup notifikasi"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          <ul className="mt-2 space-y-1 text-[11px] text-slate-300 border-t border-slate-800 pt-2 font-mono">
            {backupToast.details.map((d, i) => (
              <li key={i} className="flex items-center gap-1.5">
                <span className="text-emerald-500">•</span>
                <span>{d}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <footer className="ui-border ui-text-muted mt-12 border-t py-6 pb-24 text-center text-xs lg:pb-6">
        <div className="mx-auto max-w-7xl px-4">
          QuantPorto — Reverse-Engineered dari{' '}
          <a
            href="https://www.youtube.com/watch?v=O8PShy9d484"
            target="_blank"
            rel="noreferrer"
            className="underline hover:opacity-80"
          >
            &ldquo;Cara Dapet Rp10 MILIAR PERTAMA&rdquo; (Leon Hartono &amp; Sander)
          </a>
          . Data historis 5 tahun bukan jaminan kinerja masa depan.
        </div>
      </footer>
    </div>
  );
}

export default App;