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
} from './lib/quant/types';
import {
  buildDynamicPresetsForSlotMap,
  evaluatePortfolioMetrics,
  normalizeWeightsTo100,
  solveRiskBudgetingWeights,
} from './lib/quant/riskParitySolver';
import { calculateRebalancePlan } from './lib/quant/rebalancerEngine';
import { fetchLiveMarketPrices } from './services/priceFeed';
import { Header, SavedPortfolioSnapshot } from './components/Header';
import { PortfolioBuilderView } from './components/builder/PortfolioBuilderView';
import { PortfolioRebalancerView } from './components/rebalancer/PortfolioRebalancerView';
import { WealthRoadmapView } from './components/roadmap/WealthRoadmapView';
import { WalkthroughModal } from './components/onboarding/WalkthroughModal';
import { SmartPortfolioRecommenderModal } from './components/builder/SmartPortfolioRecommenderModal';
import { PortfolioRecommendationItem } from './lib/quant/portfolioRecommender';

const STORAGE_KEY = 'quantporto_state_v2';
const SAVED_PORTFOLIOS_KEY = 'quantporto_saved_portfolios_v1';
const WALKTHROUGH_SEEN_KEY = 'quantporto_walkthrough_seen_v1';

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

export function App() {
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
  const [driftThresholdPercent, setDriftThresholdPercent] = useState<number>(3);
  const [isHoldingsSyncedWithMenu1, setIsHoldingsSyncedWithMenu1] =
    useState<boolean>(true);
  const [enableIdxLotRounding, setEnableIdxLotRounding] = useState<boolean>(true);
  const [enableBrokerFees, setEnableBrokerFees] = useState<boolean>(false);

  const [holdings, setHoldings] = useState<Record<string, HoldingEntry>>(() => {
    const init: Record<string, HoldingEntry> = {};
    for (const a of CORE_AND_EXPANDED_ASSETS) {
      const weightPct = defaultPreset.weights[a.id] ?? 0;
      const valIdr = Math.round(100_000_000 * (weightPct / 100));
      const unitPriceIdr =
        a.currency === 'USD' ? a.defaultPrice * 18000 : a.defaultPrice;
      init[a.id] = {
        assetId: a.id,
        currentValueIdr: valIdr,
        units: Number((valIdr / Math.max(1, unitPriceIdr)).toFixed(4)),
        currentPrice: a.defaultPrice,
        shockPercent: 0,
      };
    }
    return init;
  });

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

  // First-Load Walkthrough Tour & Smart Portfolio Recommender Modal states
  const [isWalkthroughOpen, setIsWalkthroughOpen] = useState<boolean>(() => {
    try {
      return localStorage.getItem(WALKTHROUGH_SEEN_KEY) !== 'true';
    } catch {
      return false;
    }
  });
  const [isRecommenderOpen, setIsRecommenderOpen] = useState<boolean>(false);

  const handleCloseWalkthrough = () => {
    setIsWalkthroughOpen(false);
    try {
      localStorage.setItem(WALKTHROUGH_SEEN_KEY, 'true');
    } catch {
      // Ignore storage errors
    }
  };

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

  const handleNormalizeManualWeights = () => {
    setActiveWeights((prev) => normalizeWeightsTo100(prev));
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
    const res = await fetchLiveMarketPrices(allAssets, usdIdrRate);
    setUsdIdrRate(res.usdIdrRate);
    setPriceSourceText(res.sourceSummary);
    setLastUpdatedText(res.updatedAt);
    setHoldings((prev) => {
      const next = { ...prev };
      for (const [assetId, price] of Object.entries(res.pricesByAssetId)) {
        if (next[assetId]) {
          next[assetId] = { ...next[assetId], currentPrice: price };
        }
      }
      return next;
    });
    setIsFetchingPrices(false);
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
    // If user manually edits currentValueIdr or units, lock manual holdings so Menu 1 changes don't overwrite them
    if (patch.currentValueIdr !== undefined || patch.units !== undefined) {
      setIsHoldingsSyncedWithMenu1(false);
    }
    setHoldings((prev) => ({
      ...prev,
      [assetId]: {
        ...(prev[assetId] ?? {
          assetId,
          currentValueIdr: 0,
          units: 0,
          currentPrice:
            allAssets.find((a) => a.id === assetId)?.defaultPrice ?? 1,
          shockPercent: 0,
        }),
        ...patch,
      },
    }));
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
          rebalanceMode === 'sell-and-buy' ? 'Sell + Buy' : 'Buy-Only DCA'
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

  const handleExportJson = () => {
    const payload = {
      exportedAt: new Date().toISOString(),
      activeWeights,
      holdings,
      savedPortfolios,
      customTableRows,
      slotMap,
      initialCapitalIdr,
      targetGoalIdr,
      usdIdrRate,
    };
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

  const handleImportJson = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(String(reader.result));
        if (data.activeWeights) setActiveWeights(data.activeWeights);
        if (data.holdings) setHoldings(data.holdings);
        if (data.customTableRows) setCustomTableRows(data.customTableRows);
        if (data.slotMap) setSlotMap(data.slotMap);
        if (data.savedPortfolios) {
          setSavedPortfolios(data.savedPortfolios);
          localStorage.setItem(
            SAVED_PORTFOLIOS_KEY,
            JSON.stringify(data.savedPortfolios)
          );
        }
      } catch {
        alert('Format file JSON tidak valid.');
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
        onOpenWalkthrough={() => setIsWalkthroughOpen(true)}
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
            onClearHoldingsForManualInput={handleClearHoldingsForManualInput}
            onSetupInitialBuyFromMenu1={handleSetupInitialBuyFromMenu1}
            onScaleTotalHoldingsIdr={handleScaleTotalHoldingsIdr}
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

      {/* First-Load Interactive Walkthrough Tour Modal */}
      <WalkthroughModal
        isOpen={isWalkthroughOpen}
        onClose={handleCloseWalkthrough}
        onOpenRecommender={() => {
          handleCloseWalkthrough();
          setIsRecommenderOpen(true);
        }}
      />

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
