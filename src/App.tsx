import React, { useEffect, useMemo, useState } from 'react';
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
import { calculateRebalancePlan } from './lib/quant/rebalancerEngine';
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
import { ParsedHoldingItem } from './lib/quant/textDataParser';
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

export function App() {
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

  const [activeTab, setActiveTab] = useState<'builder' | 'rebalancer' | 'roadmap'>(
    'builder'
  );

  // Asset Universe (8 Core Video Benchmarks + Expanded IDX/US/Crypto + User Custom Assets)
  const [allAssets, setAllAssets] = useState<AssetDefinition[]>(
    CORE_AND_EXPANDED_ASSETS
  );

  // Dynamic Slot Map for the 8 Table Columns (allows replacing e.g. BBCA -> PTBA across all 15 rows!)
  const [slotMap, setSlotMap] = useState<Record<string, string>>(DEFAULT_SLOT_MAP);

  // User-Pinned Custom Rows in the main comparison table
  // Pre-seeded with 1 default custom example row ("Custom Risk Parity: PTBA ganti BBCA") so user immediately sees it in the table!
  const [customTableRows, setCustomTableRows] = useState<PortfolioPreset[]>(() => {
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
  const [selectedUniverseIds, setSelectedUniverseIds] = useState<string[]>([
    'RDPT',
    'BBCA',
    'GLD',
    'SPY',
    'QQQ',
    'BTC',
    'ETH',
  ]);

  // Active Preset / Method / Weights
  const defaultPreset = VIDEO_PORTFOLIO_PRESETS.find(
    (p) => p.id === 'opt-4-rb-btc-90'
  )!;
  const [activePresetId, setActivePresetId] = useState<string | null>(
    defaultPreset.id
  );

  // User-Pinned Preset IDs in the main comparison table (pinned to top)
  const [pinnedPresetIds, setPinnedPresetIds] = useState<string[]>(['opt-4-rb-btc-90']);

  const handleTogglePinPreset = (presetId: string) => {
    setPinnedPresetIds((prev) =>
      prev.includes(presetId)
        ? prev.filter((id) => id !== presetId)
        : [presetId, ...prev]
    );
  };
  const [allocationMethod, setAllocationMethod] =
    useState<AllocationMethod>('preset');
  const [convictionAssetId, setConvictionAssetId] = useState<string>('BTC');
  const [convictionRiskPercent, setConvictionRiskPercent] = useState<number>(90);
  const [solverMode, setSolverMode] = useState<
    'calibrated-video' | 'euler-covariance'
  >('calibrated-video');
  const [activeWeights, setActiveWeights] = useState<Record<string, number>>(
    defaultPreset.weights
  );

  // User-Locked Asset IDs in manual weight customizer
  const [lockedAssetIds, setLockedAssetIds] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed.lockedAssetIds)) return parsed.lockedAssetIds;
      }
    } catch {
      // Ignore
    }
    return [];
  });

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
  const [rdptPromoActive, setRdptPromoActive] = useState<boolean>(false);

  // Synchronized Wealth Simulator Defaults:
  // Default Initial Capital = Rp 100 Juta (100,000,000)
  // Default Target Wealth = Rp 1 Miliar (1,000,000,000), with quick toggle to Rp 10 Miliar
  // Default Custom Monthly DCA = Rp 3 Juta (3,000,000)
  const [initialCapitalIdr, setInitialCapitalIdr] =
    useState<number>(100_000_000);
  const [targetGoalIdr, setTargetGoalIdr] = useState<number>(1_000_000_000);
  const [monthlySavingsIdr, setMonthlySavingsIdr] = useState<number>(3_000_000);

  // Rebalancer State (Default starting holdings scaled to Rp 100 Juta Initial Capital!)
  // Default USD/IDR assumption set to Rp 18,000 per user request
  const [usdIdrRate, setUsdIdrRate] = useState<number>(18000);
  const [inputMode, setInputMode] = useState<'nominal' | 'units'>('nominal');
  const [rebalanceMode, setRebalanceMode] =
    useState<RebalanceMode>('sell-and-buy');
  const [cashInjectionIdr, setCashInjectionIdr] = useState<number>(0);
  const [isFixedBudgetMode, setIsFixedBudgetMode] = useState<boolean>(false);
  const [fixedTotalBudgetIdr, setFixedTotalBudgetIdr] = useState<number>(100_000_000);
  const [driftThresholdPercent, setDriftThresholdPercent] = useState<number>(3);
  const [isHoldingsSyncedWithMenu1, setIsHoldingsSyncedWithMenu1] =
    useState<boolean>(true);
  const [enableIdxLotRounding, setEnableIdxLotRounding] = useState<boolean>(true);
  const [enableBrokerFees, setEnableBrokerFees] = useState<boolean>(false);
  const [filterDustTrades, setFilterDustTrades] = useState<boolean>(true);
  const [tacticalConfig, setTacticalConfig] = useState<ValuationSentimentConfig>({
    enabled: false,
    aggressiveness: 0.2,
    cryptoScore: 50,
    usEquityScore: 50,
    idxEquityScore: 50,
    goldScore: 50,
  });

  const [holdings, setHoldings] = useState<Record<string, HoldingEntry>>(() => {
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
        units: isNominalOnly ? valIdr : Number((valIdr / Math.max(1, unitPriceIdr)).toFixed(4)),
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
      return sum + (h?.currentValueIdr ?? 0);
    }, 0);
    const autoSubtractedCash = Math.max(0, fixedTotalBudgetIdr - currentTotalHoldings);
    setCashInjectionIdr(autoSubtractedCash);
  }, [isFixedBudgetMode, fixedTotalBudgetIdr, holdings, allAssets]);

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
  >([]);

  // Modals state
  const [isRecommenderOpen, setIsRecommenderOpen] = useState<boolean>(false);
  const [isFactsheetOpen, setIsFactsheetOpen] = useState<boolean>(false);
  const [isOrderSlipOpen, setIsOrderSlipOpen] = useState<boolean>(false);
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
      localStorage.removeItem('color-scheme');
      setLockedAssetIds([]);
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

  // Restore state from URL Hash (if shared link) or LocalStorage on first mount
  useEffect(() => {
    try {
      let hashParsed: Record<string, any> | null = null;
      if (window.location.hash.startsWith('#porto=')) {
        try {
          const encoded = decodeURIComponent(window.location.hash.slice(7));
          hashParsed = JSON.parse(atob(encoded));
          if (hashParsed?.weights) {
            setActiveWeights(hashParsed.weights);
            setActivePresetId(hashParsed.presetId ?? null);
            setAllocationMethod(hashParsed.method ?? 'custom');
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
        } catch {
          // Ignore malformed URL hash
        }
      }

      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const saved = JSON.parse(raw);
        if (!hashParsed) {
          if (saved.activeWeights) {
            const matchedPreset = saved.activePresetId
              ? VIDEO_PORTFOLIO_PRESETS.find((p) => p.id === saved.activePresetId)
              : null;
            const sumW = Object.values(
              saved.activeWeights as Record<string, number>
            ).reduce((a, b) => a + b, 0);
            if (
              matchedPreset &&
              (!saved.allocationMethod || saved.allocationMethod === 'preset') &&
              Math.abs(sumW - 100) >= 0.5
            ) {
              setActiveWeights({ ...matchedPreset.weights });
            } else {
              setActiveWeights(saved.activeWeights);
            }
          }
          if (saved.activePresetId !== undefined)
            setActivePresetId(saved.activePresetId);
          if (saved.allocationMethod) setAllocationMethod(saved.allocationMethod);
          if (saved.initialCapitalIdr !== undefined)
            setInitialCapitalIdr(saved.initialCapitalIdr);
          if (saved.targetGoalIdr !== undefined)
            setTargetGoalIdr(saved.targetGoalIdr);
          if (saved.monthlySavingsIdr !== undefined) {
            const migratedDca3M = localStorage.getItem(
              'quantporto_dca_3m_default_v1'
            );
            if (!migratedDca3M && saved.monthlySavingsIdr === 10_000_000) {
              setMonthlySavingsIdr(3_000_000);
              localStorage.setItem('quantporto_dca_3m_default_v1', 'true');
            } else {
              setMonthlySavingsIdr(saved.monthlySavingsIdr);
            }
          }
          if (saved.slotMap) setSlotMap(saved.slotMap);
          if (saved.rdptPromoActive !== undefined)
            setRdptPromoActive(Boolean(saved.rdptPromoActive));
        }

        if (saved.holdings) setHoldings((prev) => ({ ...prev, ...saved.holdings }));
        if (saved.isHoldingsSyncedWithMenu1 !== undefined)
          setIsHoldingsSyncedWithMenu1(saved.isHoldingsSyncedWithMenu1);
        if (saved.enableIdxLotRounding !== undefined)
          setEnableIdxLotRounding(Boolean(saved.enableIdxLotRounding));
        if (saved.enableBrokerFees !== undefined)
          setEnableBrokerFees(Boolean(saved.enableBrokerFees));
        if (saved.isFixedBudgetMode !== undefined)
          setIsFixedBudgetMode(Boolean(saved.isFixedBudgetMode));
        if (saved.fixedTotalBudgetIdr !== undefined)
          setFixedTotalBudgetIdr(Number(saved.fixedTotalBudgetIdr));
        if (saved.tacticalConfig) setTacticalConfig(saved.tacticalConfig);

        if (saved.usdIdrRate) {
          const migratedUsd18k = localStorage.getItem(
            'quantporto_usd_18k_default_v1'
          );
          if (
            !migratedUsd18k &&
            (saved.usdIdrRate === 15600 || saved.usdIdrRate === 15500)
          ) {
            setUsdIdrRate(18000);
            localStorage.setItem('quantporto_usd_18k_default_v1', 'true');
          } else {
            setUsdIdrRate(saved.usdIdrRate);
          }
        }
        if (saved.customTableRows) setCustomTableRows(saved.customTableRows);
        if (saved.rebalanceHistory) setRebalanceHistory(saved.rebalanceHistory);
        if (Array.isArray(saved.pinnedPresetIds))
          setPinnedPresetIds(saved.pinnedPresetIds);
        if (Array.isArray(saved.lockedAssetIds))
          setLockedAssetIds(saved.lockedAssetIds);

        // Restore custom tickers and modified CAGR/MaxDD return assumptions
        if (Array.isArray(saved.allAssets) && saved.allAssets.length > 0) {
          setAllAssets((prev) => {
            const savedMap = new Map<string, AssetDefinition>(
              saved.allAssets.map((a: AssetDefinition) => [a.id, a])
            );
            const merged = prev.map((curr) => {
              const s = savedMap.get(curr.id);
              return s
                ? { ...curr, cagr: s.cagr, maxDrawdown: s.maxDrawdown }
                : curr;
            });
            const currIds = new Set(prev.map((a) => a.id));
            const additions = saved.allAssets.filter(
              (a: AssetDefinition) => !currIds.has(a.id)
            );
            return [...merged, ...additions];
          });
        }
      }
    } catch {
      // Ignore malformed storage
    }
  }, []);

  // Persist active state to LocalStorage
  useEffect(() => {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          activeWeights,
          activePresetId,
          allocationMethod,
          holdings,
          initialCapitalIdr,
          targetGoalIdr,
          monthlySavingsIdr,
          isHoldingsSyncedWithMenu1,
          usdIdrRate,
          slotMap,
          customTableRows,
          rebalanceHistory,
          rdptPromoActive,
          enableIdxLotRounding,
          enableBrokerFees,
          allAssets,
          pinnedPresetIds,
          lockedAssetIds,
          isFixedBudgetMode,
          fixedTotalBudgetIdr,
          tacticalConfig,
        })
      );
    } catch {
      // Ignore quota errors
    }
  }, [
    activeWeights,
    activePresetId,
    allocationMethod,
    holdings,
    initialCapitalIdr,
    targetGoalIdr,
    monthlySavingsIdr,
    isHoldingsSyncedWithMenu1,
    usdIdrRate,
    slotMap,
    customTableRows,
    rebalanceHistory,
    rdptPromoActive,
    enableIdxLotRounding,
    enableBrokerFees,
    allAssets,
    isFixedBudgetMode,
    fixedTotalBudgetIdr,
    tacticalConfig,
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
        solverMode
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
    allAssets,
  ]);

  // Evaluate portfolio CAGR, Max Drawdown, Risk Contributions, and Pareto Dominance
  const exactPresetMatch = useMemo(() => {
    if (!activePresetId) return null;
    return (
      dynamicPresets.find((p) => p.id === activePresetId) ??
      customTableRows.find((p) => p.id === activePresetId) ??
      null
    );
  }, [activePresetId, dynamicPresets, customTableRows]);

  const solvedMetrics = useMemo(
    () =>
      evaluatePortfolioMetrics(
        activeWeights,
        allAssets,
        [...dynamicPresets, ...customTableRows],
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
      customTableRows,
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
    const nextMap = { ...slotMap, [coreSlotId]: newAssetId };
    setSlotMap(nextMap);

    // If a preset is currently selected, update activeWeights to the newly solved preset weights
    const nextPresets = buildDynamicPresetsForSlotMap(
      VIDEO_PORTFOLIO_PRESETS,
      nextMap,
      allAssets,
      rdptPromoActive ? 3.0 : 0
    );
    const activeRow =
      nextPresets.find((p) => p.id === activePresetId) ?? nextPresets[8];
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
            next[a.id] = { ...next[a.id], currentPrice: livePrice };
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
  useEffect(() => {
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
        next[a.id] = {
          assetId: a.id,
          currentValueIdr: valIdr,
          units: Number((valIdr / Math.max(1, unitPriceIdr)).toFixed(4)),
          currentPrice: next[a.id]?.currentPrice ?? a.defaultPrice,
          shockPercent: next[a.id]?.shockPercent ?? 0,
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
          updated.units = Number((updated.currentValueIdr / Math.max(0.0001, pIdr)).toFixed(6));
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
        updated.units = Number(units.toFixed(6));
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
          updated.units = Number((patch.currentValueIdr / Math.max(0.0001, pIdr)).toFixed(6));
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
        const w = activeWeights[a.id] ?? 0;
        const valIdr = Math.round(capitalIdr * (w / 100));
        const unitPriceIdr =
          a.currency === 'USD'
            ? (next[a.id]?.currentPrice ?? a.defaultPrice) * usdIdrRate
            : next[a.id]?.currentPrice ?? a.defaultPrice;
        next[a.id] = {
          assetId: a.id,
          currentValueIdr: valIdr,
          units: Number((valIdr / Math.max(1, unitPriceIdr)).toFixed(4)),
          currentPrice: next[a.id]?.currentPrice ?? a.defaultPrice,
          shockPercent: 0,
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
        next[a.id] = {
          assetId: a.id,
          currentValueIdr: 0,
          units: 0,
          currentPrice: next[a.id]?.currentPrice ?? a.defaultPrice,
          shockPercent: 0,
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
        next[a.id] = {
          assetId: a.id,
          currentValueIdr: 0,
          units: 0,
          currentPrice: next[a.id]?.currentPrice ?? a.defaultPrice,
          shockPercent: 0,
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
        next[a.id] = {
          assetId: a.id,
          currentValueIdr: valIdr,
          units: Number((valIdr / Math.max(1, unitPriceIdr)).toFixed(4)),
          currentPrice: next[a.id]?.currentPrice ?? a.defaultPrice,
          shockPercent: next[a.id]?.shockPercent ?? 0,
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
        next[a.id] = {
          assetId: a.id,
          currentValueIdr: valIdr,
          units: Number((valIdr / Math.max(1, unitPriceIdr)).toFixed(4)),
          currentPrice: next[a.id]?.currentPrice ?? a.defaultPrice,
          shockPercent: 0,
        };
      }
      return next;
    });
  };

  // Handler: Apply Step 1 Peer Diversification (14:17 in video: split BBCA bucket across BBCA, BMRI, BBRI, BBNI, NISP)
  const handleApplyPeerDiversification = () => {
    const currentBbcaWeight = activeWeights.BBCA ?? 12;
    const baseWeight = currentBbcaWeight > 0 ? currentBbcaWeight : 15;
    const perBank = Number((baseWeight / 5).toFixed(1));
    setAllocationMethod('custom');
    setActivePresetId(null);
    setSelectedUniverseIds((prev) =>
      Array.from(new Set([...prev, 'BBCA', 'BMRI', 'BBRI', 'BBNI', 'NISP']))
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
  const handleApplyShockScenario = (
    scenario: 'reset' | 'video-bull-3x' | 'video-crash-50' | 'global-crisis'
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
  const handleCommitRebalanceToHoldings = (customNote?: string) => {
    const newEntry: RebalanceHistoryEntry = {
      id: `reb-${Date.now()}`,
      timestamp: new Date().toLocaleDateString('id-ID', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      }),
      note:
        customNote ||
        `Rebalance ${
          rebalanceMode === 'sell-and-buy'
            ? 'Sell + Buy (Jual Rata)'
            : rebalanceMode === 'selective-profit-trim'
              ? 'Jual Untung Saja (Selective Trim)'
              : rebalanceMode === 'trim-defensive-first'
                ? 'Prioritas RDPT Dulu'
                : 'Buy-Only DCA'
        }`,
      totalValueBeforeIdr: rebalanceResult.postShockTotalIdr,
      cashInjectedIdr: rebalanceResult.cashInjectionIdr,
      totalValueAfterIdr: rebalanceResult.finalTargetTotalIdr,
      totalBuyIdr: rebalanceResult.totalBuyIdr,
      totalSellIdr: rebalanceResult.totalSellIdr,
      tradesSummary: rebalanceResult.items
        .filter((i) => i.action !== 'HOLD' && Math.abs(i.tradeAmountIdr) >= 1000)
        .map(
          (i) =>
            `${i.action} ${i.symbol} Rp ${Math.round(
              Math.abs(i.tradeAmountIdr) / 1_000_000
            )}Jt`
        ),
      weightsAfter: { ...activeWeights },
    };

    setRebalanceHistory((prev) => [newEntry, ...prev]);

    // Update holdings to the post-rebalance target values & reset shocks to 0%
    setHoldings((prev) => {
      const next = { ...prev };
      for (const item of rebalanceResult.items) {
        const asset = allAssets.find((a) => a.id === item.assetId);
        if (!asset) continue;
        const prevHold = next[item.assetId];
        const postShockUnitPriceNative =
          (prevHold?.currentPrice ?? asset.defaultPrice) *
          Math.max(0.01, 1 + (prevHold?.shockPercent ?? 0) / 100);
        const unitPriceIdr =
          asset.currency === 'USD'
            ? postShockUnitPriceNative * usdIdrRate
            : postShockUnitPriceNative;

        next[item.assetId] = {
          assetId: item.assetId,
          currentValueIdr: item.targetValueIdr,
          units: Number(
            (item.targetValueIdr / Math.max(1, unitPriceIdr)).toFixed(4)
          ),
          currentPrice: Number(postShockUnitPriceNative.toFixed(4)),
          shockPercent: 0,
        };
      }
      return next;
    });
    setCashInjectionIdr(0);
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
        },
        menu3_simulator: {
          initialCapitalIdr,
          targetGoalIdr,
          monthlySavingsIdr,
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
    const updatedCount = items.filter((i) => i.isRecognized && i.isValid).length;
    setHoldings((prev) => {
      const next = strategy === 'replace' ? {} : { ...prev };
      for (const item of items) {
        if (!item.assetId || !item.isRecognized) continue;
        next[item.assetId] = {
          assetId: item.assetId,
          currentValueIdr: item.nominalIdr,
          units: item.units,
          currentPrice: item.priceNative,
          shockPercent: 0,
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
          setActiveWeights((prev) => ({ ...prev, ...d1.activeWeights }));
        } else {
          setActiveWeights(d1.activeWeights);
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

      // 3. Menu 3: Simulator & Goals
      if (
        typeof d3.initialCapitalIdr === 'number' &&
        d3.initialCapitalIdr > 0
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
        const snapshotToStore = {
          activeWeights: d1.activeWeights ?? activeWeights,
          activePresetId: d1.activePresetId ?? activePresetId,
          allocationMethod: d1.allocationMethod ?? allocationMethod,
          initialCapitalIdr: d3.initialCapitalIdr ?? initialCapitalIdr,
          targetGoalIdr: d3.targetGoalIdr ?? targetGoalIdr,
          monthlySavingsIdr: d3.monthlySavingsIdr ?? monthlySavingsIdr,
          holdings: d2.holdings ?? holdings,
          isHoldingsSyncedWithMenu1:
            d2.isHoldingsSyncedWithMenu1 ?? isHoldingsSyncedWithMenu1,
          enableIdxLotRounding:
            d2.enableIdxLotRounding ?? enableIdxLotRounding,
          enableBrokerFees: d2.enableBrokerFees ?? enableBrokerFees,
          slotMap: d1.slotMap ?? slotMap,
          rdptPromoActive: d1.rdptPromoActive ?? rdptPromoActive,
          lockedAssetIds: d1.lockedAssetIds ?? lockedAssetIds,
          usdIdrRate: dg.usdIdrRate ?? usdIdrRate,
          customTableRows: d1.customTableRows ?? customTableRows,
          rebalanceHistory: d2.rebalanceHistory ?? rebalanceHistory,
          pinnedPresetIds: d1.pinnedPresetIds ?? pinnedPresetIds,
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
    const shareData = btoa(
      JSON.stringify({
        weights: activeWeights,
        presetId: activePresetId,
        method: allocationMethod,
        slotMap,
        rdptPromo: rdptPromoActive,
        capital: initialCapitalIdr,
        dca: monthlySavingsIdr,
        goal: targetGoalIdr,
        customAssets,
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
        const w = rec.weights[a.id] ?? 0;
        const valIdr = Math.round(initialCapitalIdr * (w / 100));
        const unitPriceIdr =
          a.currency === 'USD'
            ? (next[a.id]?.currentPrice ?? a.defaultPrice) * usdIdrRate
            : next[a.id]?.currentPrice ?? a.defaultPrice;
        next[a.id] = {
          assetId: a.id,
          currentValueIdr: valIdr,
          units: Number((valIdr / Math.max(1, unitPriceIdr)).toFixed(4)),
          currentPrice: next[a.id]?.currentPrice ?? a.defaultPrice,
          shockPercent: 0,
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
        savedPortfolios={savedPortfolios}
        onSaveCurrentPortfolio={handleSaveCurrentPortfolio}
        onLoadSavedPortfolio={handleLoadSavedPortfolio}
        onDeleteSavedPortfolio={handleDeleteSavedPortfolio}
        onOpenRecommender={() => setIsRecommenderOpen(true)}
        onStartInteractiveTour={handleStartTour}
        onOpenFactsheet={() => setIsFactsheetOpen(true)}
        onOpenOrderSlip={() => setIsOrderSlipOpen(true)}
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
      />

      <main className="mx-auto max-w-7xl px-3 py-4 sm:px-6 sm:py-6">
        {activeTab === 'builder' && (
          <PortfolioBuilderView
            allAssets={allAssets}
            onAddCustomAsset={handleAddCustomAsset}
            presets={dynamicPresets}
            customTableRows={customTableRows}
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
            onOpenOrderSlip={() => setIsOrderSlipOpen(true)}
            onBatchUpdateHoldings={handleBatchUpdateHoldings}
            tacticalConfig={tacticalConfig}
            setTacticalConfig={setTacticalConfig}
          />
        )}

        {activeTab === 'roadmap' && (
          <WealthRoadmapView
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
      {isFactsheetOpen && (
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
        />
      )}

      {/* Multi-Platform Broker Order Slips Modal (Stockbit / Pluang / Reku / Makmur) */}
      {isOrderSlipOpen && (
        <BrokerOrderSlipModal
          isOpen={isOrderSlipOpen}
          onClose={() => setIsOrderSlipOpen(false)}
          rebalanceResult={rebalanceResult}
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