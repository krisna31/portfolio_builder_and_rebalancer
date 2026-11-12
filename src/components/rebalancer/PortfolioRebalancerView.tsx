import React, { useEffect, useMemo, useState } from 'react';
import {
  AssetDefinition,
  HoldingEntry,
  RebalanceHistoryEntry,
  RebalanceMode,
  RebalanceSummaryResult,
  ValuationSentimentConfig,
} from '../../lib/quant/types';
import {
  getSentimentZone,
  getSentimentDescription,
  fetchLiveCryptoFearAndGreed,
} from '../../lib/quant/tacticalValuationEngine';
import {
  generateCrashBuyingLadder,
  roundToIdxTick,
} from '../../lib/quant/rebalancerEngine';
import { formatIdr, formatUsd } from '../../lib/formatters';
const HoldingsTextImportModal = React.lazy(() =>
  import('./HoldingsTextImportModal').then((m) => ({
    default: m.HoldingsTextImportModal,
  }))
);
const RebalanceExecutionGuideModal = React.lazy(() =>
  import('./RebalanceExecutionGuideModal').then((m) => ({
    default: m.RebalanceExecutionGuideModal,
  }))
);
import { SmartDcaAdvisorPanel } from './SmartDcaAdvisorPanel';
import { SmartDcaAllocationMode } from '../../lib/quant/smartDcaEngine';
import { ParsedHoldingItem } from '../../lib/quant/textDataParser';
import { FormattedNumberInput } from '../FormattedNumberInput';
import {
  Scale,
  TrendingDown,
  TrendingUp,
  RotateCcw,
  Coins,
  Split,
  ArrowUpRight,
  ArrowDownRight,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  Download,
  Activity,
  History,
  Check,
  Trash2,
  ListOrdered,
  Copy,
  LayoutGrid,
  Table2,
  Building2,
  Tag,
  FileSpreadsheet,
  Lightbulb,
  HelpCircle,
  X,
  Lock,
  SlidersHorizontal,
  ChevronDown,
  Compass,
  RefreshCw,
  Target,
  Zap,
} from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  AreaChart,
  Area,
} from 'recharts';

interface PortfolioRebalancerViewProps {
  allAssets: AssetDefinition[];
  targetWeights: Record<string, number>;
  holdings: Record<string, HoldingEntry>;
  onUpdateHolding: (assetId: string, patch: Partial<HoldingEntry>) => void;
  onPopulateCapital: (capitalIdr: number) => void;
  onLoadVideo1BExample: () => void;
  onApplyShockScenario: (
    scenario:
      | 'reset'
      | 'video-bull-3x'
      | 'video-crash-50'
      | 'global-crisis'
      | 'gfc-2008'
      | 'covid-2020'
      | 'crypto-tech-winter-2022'
  ) => void;
  inputMode: 'nominal' | 'units';
  setInputMode: (m: 'nominal' | 'units') => void;
  rebalanceMode: RebalanceMode;
  setRebalanceMode: (m: RebalanceMode) => void;
  cashInjectionIdr: number;
  setCashInjectionIdr: (val: number) => void;
  driftThresholdPercent: number;
  setDriftThresholdPercent: (val: number) => void;
  usdIdrRate: number;
  rebalanceResult: RebalanceSummaryResult;
  onApplyPeerDiversification: () => void;
  rebalanceHistory: RebalanceHistoryEntry[];
  onCommitRebalanceToHoldings: (note?: string, planOverride?: RebalanceSummaryResult, isTopUpConfirmed?: boolean) => void;
  onDeleteRebalanceHistoryEntry: (id: string) => void;
  onUndoRebalanceHistoryEntry?: (id: string) => void;
  initialCapitalMenu1Idr: number;
  monthlySavingsMenu1Idr: number;
  activePortfolioName: string;
  isHoldingsSyncedWithMenu1: boolean;
  enableIdxLotRounding?: boolean;
  setEnableIdxLotRounding?: (val: boolean) => void;
  enableBrokerFees?: boolean;
  setEnableBrokerFees?: (val: boolean) => void;
  filterDustTrades?: boolean;
  setFilterDustTrades?: (val: boolean) => void;
  isFixedBudgetMode?: boolean;
  setIsFixedBudgetMode?: (val: boolean) => void;
  fixedTotalBudgetIdr?: number;
  setFixedTotalBudgetIdr?: (val: number) => void;
  onClearHoldingsForManualInput: () => void;
  onResetAllAssetPrices?: () => void;
  onSetupInitialBuyFromMenu1: () => void;
  onScaleTotalHoldingsIdr: (
    newTotalIdr: number,
    distributeBy: 'current' | 'target'
  ) => void;
  onOpenOrderSlip?: (planOverride?: RebalanceSummaryResult) => void;
  onPlanOverrideChange?: (plan: RebalanceSummaryResult | null) => void;
  onBatchUpdateHoldings?: (items: ParsedHoldingItem[], strategy: 'merge' | 'replace') => void;
  tacticalConfig?: ValuationSentimentConfig;
  setTacticalConfig?: React.Dispatch<React.SetStateAction<ValuationSentimentConfig>>;
  smartDcaMonthlyBudgetIdr?: number;
  setSmartDcaMonthlyBudgetIdr?: (val: number) => void;
  smartDcaOverflowMode?: 'park-rdpu' | 'boost-discount';
  setSmartDcaOverflowMode?: (mode: 'park-rdpu' | 'boost-discount') => void;
  smartDcaAllocationMode?: SmartDcaAllocationMode;
  setSmartDcaAllocationMode?: (mode: SmartDcaAllocationMode) => void;
  smartDcaIndicatorOverrides?: Record<string, Record<string, any>>;
  setSmartDcaIndicatorOverrides?: (
    overrides: Record<string, Record<string, any>>
  ) => void;
  smartDcaLastRefreshSuccessAt?: string;
  onUnifiedSync?: () => Promise<void>;
  isSyncingPrices?: boolean;
}

export const PortfolioRebalancerView: React.FC<PortfolioRebalancerViewProps> = ({
  allAssets,
  targetWeights,
  holdings,
  onUpdateHolding,
  onPopulateCapital,
  onLoadVideo1BExample,
  onApplyShockScenario,
  inputMode,
  setInputMode,
  rebalanceMode,
  setRebalanceMode,
  cashInjectionIdr,
  setCashInjectionIdr,
  driftThresholdPercent,
  setDriftThresholdPercent,
  usdIdrRate,
  rebalanceResult: baseRebalanceResult,
  onApplyPeerDiversification,
  rebalanceHistory,
  onCommitRebalanceToHoldings,
  onDeleteRebalanceHistoryEntry,
  onUndoRebalanceHistoryEntry,
  initialCapitalMenu1Idr,
  monthlySavingsMenu1Idr,
  activePortfolioName,
  isHoldingsSyncedWithMenu1,
  enableIdxLotRounding = true,
  setEnableIdxLotRounding,
  enableBrokerFees = false,
  setEnableBrokerFees,
  filterDustTrades = true,
  setFilterDustTrades,
  isFixedBudgetMode = false,
  setIsFixedBudgetMode,
  fixedTotalBudgetIdr,
  setFixedTotalBudgetIdr,
  onClearHoldingsForManualInput,
  onResetAllAssetPrices,
  onSetupInitialBuyFromMenu1,
  onScaleTotalHoldingsIdr,
  onOpenOrderSlip,
  onPlanOverrideChange,
  onBatchUpdateHoldings,
  tacticalConfig,
  setTacticalConfig,
  smartDcaMonthlyBudgetIdr,
  setSmartDcaMonthlyBudgetIdr,
  smartDcaOverflowMode,
  setSmartDcaOverflowMode,
  smartDcaAllocationMode,
  setSmartDcaAllocationMode,
  smartDcaIndicatorOverrides,
  setSmartDcaIndicatorOverrides,
  smartDcaLastRefreshSuccessAt,
  onUnifiedSync,
  isSyncingPrices,
}) => {
  const [rebalancerSubMode, setRebalancerSubMode] = useState<'rebalance' | 'smart-dca'>('rebalance');
  const [showShockSliders, setShowShockSliders] = useState(false);
  const [showPriceSimControls, setShowPriceSimControls] = useState(false);
  const [isHoldingsTextModalOpen, setIsHoldingsTextModalOpen] = useState(false);
  const [isGuideModalOpen, setIsGuideModalOpen] = useState(false);
  const [isWelcomeBannerDismissed, setIsWelcomeBannerDismissed] = useState(false);
  const [isOptionsMenuOpen, setIsOptionsMenuOpen] = useState(false);
  const [optionsActiveTab, setOptionsActiveTab] = useState<'crisis' | 'broker' | 'balance'>('crisis');
  const [isSyncingFng, setIsSyncingFng] = useState(false);
  const [fngSyncMessage, setFngSyncMessage] = useState<string | null>(null);
  const [showDeficitConfirmModal, setShowDeficitConfirmModal] = useState(false);
  const optionsMenuRef = React.useRef<HTMLDivElement>(null);

  const handleSyncCryptoFearAndGreed = async () => {
    setIsSyncingFng(true);
    setFngSyncMessage(null);
    const data = await fetchLiveCryptoFearAndGreed();
    setIsSyncingFng(false);
    if (data && setTacticalConfig) {
      setTacticalConfig((prev) => ({
        ...prev,
        cryptoScore: data.score,
      }));
      setFngSyncMessage(`Live: ${data.score} (${data.classification})`);
      setTimeout(() => setFngSyncMessage(null), 3500);
    } else if (!data) {
      setFngSyncMessage('Gagal mengambil data live API Crypto Fear & Greed');
      setTimeout(() => setFngSyncMessage(null), 3500);
    }
  };

  // Close options menu on click outside
  React.useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        optionsMenuRef.current &&
        !optionsMenuRef.current.contains(e.target as Node)
      ) {
        setIsOptionsMenuOpen(false);
      }
    };
    if (isOptionsMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOptionsMenuOpen]);

  // Listen for programmatic event to open options menu (e.g. from Tour Guide Step 12)
  React.useEffect(() => {
    const handleSetOptions = (e: Event) => {
      const customEvent = e as CustomEvent<{ open?: boolean }>;
      setIsOptionsMenuOpen(Boolean(customEvent.detail?.open));
    };
    window.addEventListener('quantporto:set-rebalance-options', handleSetOptions);
    return () => {
      window.removeEventListener('quantporto:set-rebalance-options', handleSetOptions);
    };
  }, []);
  const [rebalanceNoteInput, setRebalanceNoteInput] = useState('');
  const [committedBanner, setCommittedBanner] = useState(false);
  const [activePriceToolAssetId, setActivePriceToolAssetId] = useState<string | null>(null);

  // Close price tool popover on click outside
  React.useEffect(() => {
    if (!activePriceToolAssetId) return;
    const handleClosePriceTool = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('.price-tool-container')) {
        setActivePriceToolAssetId(null);
      }
    };
    document.addEventListener('mousedown', handleClosePriceTool);
    return () => document.removeEventListener('mousedown', handleClosePriceTool);
  }, [activePriceToolAssetId]);

  // Collapsible cards state
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>(() => {
    try {
      const stored = localStorage.getItem('quantporto_rebalancer_collapsed_v1');
      return stored ? JSON.parse(stored) : {};
    } catch {
      return {};
    }
  });

  const toggleSectionCollapse = (key: string) => {
    setCollapsedSections((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      try {
        localStorage.setItem('quantporto_rebalancer_collapsed_v1', JSON.stringify(next));
      } catch {
        // Ignore
      }
      return next;
    });
  };

  const [rebalanceViewMode, setRebalanceViewMode] = useState<'table' | 'cards'>(() => {
    if (typeof window !== 'undefined' && window.innerWidth < 768) {
      return 'cards';
    }
    return 'table';
  });
  const [slipCopied, setSlipCopied] = useState(false);
  const [holdingEntryMode, setHoldingEntryMode] = useState<
    'nominal' | 'units' | 'percent'
  >(inputMode);
  const [quickTotalIdr, setQuickTotalIdr] = useState<number>(initialCapitalMenu1Idr);
  // Feature 4: Interactive +1 Lot / -1 Lot lot overrides for IDX stocks
  const [lotOverrides, setLotOverrides] = useState<Record<string, number>>({});
  const [undoTargetEntry, setUndoTargetEntry] = useState<RebalanceHistoryEntry | null>(null);

  type TableActionFilter = 'all' | 'active' | 'buy' | 'sell' | 'hold';
  const [tableActionFilter, setTableActionFilter] = useState<TableActionFilter>('all');

  // Reset lot overrides when user changes input holdings or rebalance parameters
  useEffect(() => {
    setLotOverrides({});
  }, [holdings, rebalanceMode, cashInjectionIdr, driftThresholdPercent]);

  const handleAdjustLotOverride = (assetId: string, delta: number) => {
    setLotOverrides((prev) => {
      const current = prev[assetId] ?? 0;
      const baseItem = baseRebalanceResult.items.find((i) => i.assetId === assetId);
      const baseLots = Math.abs(baseItem?.tradeLotsInteger ?? 0);
      const isBaseSell = baseItem?.action === 'SELL';
      const holdingUnits = holdings[assetId]?.units ?? 0;
      const maxSellLots = Math.floor(holdingUnits / 100);

      let nextDelta = current + delta;
      const candidateLots = baseLots + nextDelta;

      // Prevent negative lots (dead-zone clicks when repeatedly clicking -)
      if (candidateLots < 0) {
        nextDelta = -baseLots;
      }

      // Prevent selling more lots than held physically (anti short-selling)
      if (isBaseSell && candidateLots > maxSellLots) {
        nextDelta = maxSellLots - baseLots;
      }

      if (nextDelta === 0) {
        const next = { ...prev };
        delete next[assetId];
        return next;
      }

      return { ...prev, [assetId]: nextDelta };
    });
  };

  const handleResetLotOverride = (assetId: string) => {
    setLotOverrides((prev) => {
      const next = { ...prev };
      delete next[assetId];
      return next;
    });
  };

  // Feature 4: Compute effective rebalance plan reflecting manual lot overrides
  const rebalanceResult = useMemo(() => {
    if (Object.keys(lotOverrides).length === 0) return baseRebalanceResult;

    let totalBuyIdr = 0;
    let totalSellIdr = 0;
    let totalUnallocatedDelta = 0;

    const newItems = baseRebalanceResult.items.map((item) => {
      const deltaLots = lotOverrides[item.assetId];
      if (!deltaLots || item.tradeLotsInteger === undefined) {
        if (item.action === 'BUY') totalBuyIdr += item.tradeAmountIdr;
        if (item.action === 'SELL') totalSellIdr += Math.abs(item.tradeAmountIdr);
        return item;
      }

      // Distinguish buy vs sell direction from original action, or positive delta on HOLD
      const isBuy = item.action === 'BUY' || (item.action === 'HOLD' && deltaLots > 0);
      const baseLotsMagnitude = Math.abs(item.tradeLotsInteger);
      const newLotsMagnitude = Math.max(0, baseLotsMagnitude + deltaLots);
      const h = holdings[item.assetId];
      const assetDef = allAssets.find((a) => a.id === item.assetId);
      const rawPrice =
        h?.currentPrice && h.currentPrice > 0 ? h.currentPrice : (assetDef?.defaultPrice ?? 1);
      const shockMultiplier = Math.max(0, 1 + (h?.shockPercent ?? 0) / 100);
      const isIdxStock =
        assetDef?.category === 'idx-equity' &&
        assetDef?.lotSize === 100 &&
        !assetDef?.isNominalOnly;
      const rawSpot = rawPrice * shockMultiplier;
      const postShockPrice = isIdxStock
        ? roundToIdxTick(rawSpot, 'nearest')
        : (Math.round(rawSpot) || 1);

      const newTradeAmount = newLotsMagnitude * 100 * postShockPrice;
      const signedNewTradeAmount = isBuy ? newTradeAmount : -newTradeAmount;

      const deltaCost = signedNewTradeAmount - item.tradeAmountIdr;
      totalUnallocatedDelta -= deltaCost;

      if (isBuy && newLotsMagnitude > 0) {
        totalBuyIdr += newTradeAmount;
      } else if (!isBuy && newLotsMagnitude > 0) {
        totalSellIdr += newTradeAmount;
      }

      // Recompute broker transaction fee for overridden lot trades
      let estimatedFeeIdr = 0;
      if (enableBrokerFees && newLotsMagnitude > 0) {
        estimatedFeeIdr = Math.round(newTradeAmount * (isBuy ? 0.0015 : 0.0025));
      }

      const signedLots = isBuy ? newLotsMagnitude : -newLotsMagnitude;
      const action =
        newLotsMagnitude > 0
          ? isBuy
            ? ('BUY' as const)
            : ('SELL' as const)
          : ('HOLD' as const);

      return {
        ...item,
        tradeLotsInteger: newLotsMagnitude > 0 ? signedLots : 0,
        tradeLots: newLotsMagnitude > 0 ? signedLots : 0,
        tradeUnits: newLotsMagnitude > 0 ? signedLots * 100 : 0,
        tradeAmountIdr: newLotsMagnitude > 0 ? signedNewTradeAmount : 0,
        tradeAmountUsd: Number(
          ((newLotsMagnitude > 0 ? signedNewTradeAmount : 0) / Math.max(1, usdIdrRate)).toFixed(2)
        ),
        action,
        estimatedFeeIdr,
        targetValueIdr: Math.round(
          item.postShockValueIdr + (newLotsMagnitude > 0 ? signedNewTradeAmount : 0)
        ),
      };
    });

    const unallocatedCashRemainderIdr =
      (baseRebalanceResult.unallocatedCashRemainderIdr ?? 0) + totalUnallocatedDelta;
    const totalEstimatedFeeIdr = newItems.reduce(
      (sum, i) => sum + (i.estimatedFeeIdr ?? 0),
      0
    );

    return {
      ...baseRebalanceResult,
      items: newItems,
      totalBuyIdr,
      totalSellIdr,
      totalEstimatedFeeIdr,
      unallocatedCashRemainderIdr,
    };
  }, [baseRebalanceResult, lotOverrides, holdings, allAssets]);

  // Synchronize manual lot adjustments with parent order slip state in real-time
  useEffect(() => {
    if (Object.keys(lotOverrides).length > 0) {
      onPlanOverrideChange?.(rebalanceResult);
    } else {
      onPlanOverrideChange?.(null);
    }
  }, [rebalanceResult, lotOverrides, onPlanOverrideChange]);

  const actionCounts = useMemo(() => {
    const items = rebalanceResult?.items ?? [];
    return {
      all: items.length,
      active: items.filter((i) => i.action === 'BUY' || i.action === 'SELL').length,
      buy: items.filter((i) => i.action === 'BUY').length,
      sell: items.filter((i) => i.action === 'SELL').length,
      hold: items.filter((i) => i.action === 'HOLD').length,
    };
  }, [rebalanceResult?.items]);

  const filteredTableItems = useMemo(() => {
    const items = rebalanceResult?.items ?? [];
    if (tableActionFilter === 'active') {
      return items.filter((i) => i.action === 'BUY' || i.action === 'SELL');
    }
    if (tableActionFilter === 'buy') {
      return items.filter((i) => i.action === 'BUY');
    }
    if (tableActionFilter === 'sell') {
      return items.filter((i) => i.action === 'SELL');
    }
    if (tableActionFilter === 'hold') {
      return items.filter((i) => i.action === 'HOLD');
    }
    return items;
  }, [rebalanceResult?.items, tableActionFilter]);

  const [percentReferenceTotalIdr, setPercentReferenceTotalIdr] = useState<number>(() => {
    return baseRebalanceResult?.initialTotalIdr > 0
      ? baseRebalanceResult.initialTotalIdr
      : initialCapitalMenu1Idr;
  });

  const anyPriceModified = useMemo(() => {
    return allAssets.some((a) => {
      const h = holdings[a.id];
      if (!h || !h.currentPrice) return false;
      const isNominal =
        h.isNominalOnly ?? (a.category === 'bonds' || a.category === 'money-market');
      if (isNominal) return false;
      return Math.abs(h.currentPrice - a.defaultPrice) > 0.0001;
    });
  }, [allAssets, holdings]);

  const formatPriceDisplay = (price: number, currency?: string) => {
    if (currency === 'USD') {
      return price < 10 ? `$${price.toFixed(4)}` : `$${price.toLocaleString()}`;
    }
    return `Rp ${price.toLocaleString('id-ID')}`;
  };

  // Active assets for the Crash Limit Order Ladder
  const activeCandidateAssets = useMemo(() => {
    const list = allAssets.filter(
      (a) =>
        (targetWeights[a.id] ?? 0) > 0 &&
        a.category !== 'money-market' &&
        a.category !== 'bonds'
    );
    return list.length > 0 ? list : allAssets.filter((a) => a.id !== 'RDPU');
  }, [allAssets, targetWeights]);

  const [ladderAssetId, setLadderAssetId] = useState<string>(() => {
    return (
      activeCandidateAssets.find((a) => a.id === 'BTC')?.id ??
      activeCandidateAssets[0]?.id ??
      'BTC'
    );
  });

  const effectiveLadderAssetId = activeCandidateAssets.some(
    (a) => a.id === ladderAssetId
  )
    ? ladderAssetId
    : activeCandidateAssets[0]?.id ?? 'BTC';

  const selectedLadderAsset =
    allAssets.find((a) => a.id === effectiveLadderAssetId) ?? allAssets[0];

  const crashLadderSteps = useMemo(
    () =>
      generateCrashBuyingLadder({
        targetAsset: selectedLadderAsset,
        allAssets,
        targetWeights,
        holdings,
        inputMode,
        usdIdrRate,
        extraCashIdr: cashInjectionIdr,
        dropTiers: [-10, -20, -35, -50],
        enableIdxLotRounding,
        filterDustTrades,
        tacticalConfig,
      }),
    [
      selectedLadderAsset,
      allAssets,
      targetWeights,
      holdings,
      inputMode,
      usdIdrRate,
      cashInjectionIdr,
      enableIdxLotRounding,
      filterDustTrades,
      tacticalConfig,
    ]
  );

  const handleApplyHoldingsFromText = (
    items: ParsedHoldingItem[],
    strategy: 'merge' | 'replace'
  ) => {
    if (onBatchUpdateHoldings) {
      onBatchUpdateHoldings(items, strategy);
    } else {
      if (strategy === 'replace') {
        onClearHoldingsForManualInput();
      }
      for (const item of items) {
        if (!item.assetId || !item.isRecognized) continue;
        const matchedAsset = allAssets.find((a) => a.id === item.assetId);
        const isNominal =
          Boolean(matchedAsset?.isNominalOnly) ||
          matchedAsset?.category === 'money-market' ||
          matchedAsset?.category === 'bonds';
        onUpdateHolding(item.assetId, {
          currentValueIdr: item.nominalIdr,
          units: isNominal ? item.nominalIdr : item.units,
          currentPrice: isNominal ? 1 : item.priceNative,
          shockPercent: 0,
          isNominalOnly: isNominal,
        });
      }
    }
  };

  const handleApplyAndRecord = () => {
    const rawDeficit = rebalanceResult.unallocatedCashRemainderIdr ?? 0;
    if (rawDeficit < -100) {
      setShowDeficitConfirmModal(true);
      return;
    }
    onCommitRebalanceToHoldings(rebalanceNoteInput.trim() || undefined, rebalanceResult);
    setRebalanceNoteInput('');
    setCommittedBanner(true);
    setTimeout(() => setCommittedBanner(false), 2500);
  };

  const handleConfirmDeficitTopUpAndCommit = () => {
    onCommitRebalanceToHoldings(rebalanceNoteInput.trim() || undefined, rebalanceResult, true);
    setShowDeficitConfirmModal(false);
    setRebalanceNoteInput('');
    setCommittedBanner(true);
    setTimeout(() => setCommittedBanner(false), 2500);
  };

  const downloadCsvBlob = (filename: string, csvContent: string) => {
    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const exportCsvTrades = () => {
    const headers = [
      'Symbol',
      'Asset Name',
      'Target Weight (%)',
      'Current Weight (%)',
      'Drift (%)',
      'Current Value (IDR)',
      'Target Value (IDR)',
      'Action',
      'Trade Amount (IDR)',
      'Trade Amount (USD)',
      'Trade Units',
      'Trade IDX Lots',
      'Trade Lots Integer',
      'Lot Remainder (IDR)',
      'Estimated Fee (IDR)',
    ];
    const rows = rebalanceResult.items.map((i) => [
      i.symbol,
      `"${i.name.replace(/"/g, '""')}"`,
      i.targetWeightPercent,
      i.currentWeightPercent,
      i.absoluteDriftPercent,
      i.postShockValueIdr,
      i.targetValueIdr,
      i.action,
      i.tradeAmountIdr,
      i.tradeAmountUsd,
      i.tradeUnits,
      i.tradeLots ?? '',
      i.tradeLotsInteger ?? '',
      i.tradeLotsRemainderIdr ?? 0,
      i.estimatedFeeIdr ?? 0,
    ]);
    const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    downloadCsvBlob(
      `quantporto-rebalance-${new Date().toISOString().slice(0, 10)}.csv`,
      csvContent
    );
  };

  const exportCsvHistory = () => {
    if (rebalanceHistory.length === 0) return;
    const headers = [
      'Timestamp',
      'Catatan Rebalance',
      'Nilai Sebelum (IDR)',
      'Top-Up Kas (IDR)',
      'Nilai Sesudah (IDR)',
      'Total Beli (IDR)',
      'Total Jual (IDR)',
      'Rincian Transaksi',
    ];
    const rows = rebalanceHistory.map((h) => [
      `"${h.timestamp}"`,
      `"${(h.note || '').replace(/"/g, '""')}"`,
      h.totalValueBeforeIdr,
      h.cashInjectedIdr,
      h.totalValueAfterIdr,
      h.totalBuyIdr,
      h.totalSellIdr,
      `"${(h.tradesSummary || []).join('; ').replace(/"/g, '""')}"`,
    ]);
    const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    downloadCsvBlob(
      `quantporto-audit-journal-${new Date().toISOString().slice(0, 10)}.csv`,
      csvContent
    );
  };

  // Format and copy an actionable WhatsApp / Telegram / Notes Order Slip
  const copyWhatsAppOrderSlip = () => {
    const today = new Date().toLocaleDateString('id-ID', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });

    const sells = rebalanceResult.items.filter(
      (i) => i.action === 'SELL' && Math.abs(i.tradeAmountIdr) >= 1000
    );
    const buys = rebalanceResult.items.filter(
      (i) => i.action === 'BUY' && Math.abs(i.tradeAmountIdr) >= 1000
    );

    const formatOrderUnit = (item: (typeof rebalanceResult.items)[number]) => {
      if (item.isNominalOnly) {
        return 'Nominal Murni';
      }
      const asset = allAssets.find((a) => a.id === item.assetId);
      if (asset?.currency === 'USD') {
        return `${formatUsd(Math.abs(item.tradeAmountUsd))} / ${Math.abs(item.tradeUnits)} unit`;
      }
      if (item.tradeLotsInteger !== undefined) {
        return `≈ ${Math.abs(item.tradeLotsInteger)} Lot (${Math.abs(item.tradeLotsInteger * 100)} lbr)`;
      }
      if (item.tradeLots !== undefined) {
        return `≈ ${Math.abs(item.tradeLots)} Lot (${Math.abs(item.tradeUnits)} lbr)`;
      }
      return `≈ ${Math.abs(item.tradeUnits)} unit`;
    };

    const lines: string[] = [
      `📋 *SLIP EKSEKUSI ORDER — QUANTPORTO*`,
      `📅 Tanggal: ${today}`,
      `💰 Total Portfolio: ${formatIdr(rebalanceResult.finalTargetTotalIdr)}${
        rebalanceResult.cashInjectionIdr > 0
          ? ` (Termasuk Top-Up Kas ${formatIdr(rebalanceResult.cashInjectionIdr)})`
          : ''
      }`,
      `⚙️ Mode: ${
        rebalanceMode === 'sell-and-buy'
          ? 'Jual Rata (Proporsional)'
          : rebalanceMode === 'selective-profit-trim'
            ? 'Jual Untung Saja'
            : rebalanceMode === 'trim-defensive-first'
              ? 'Prioritas Kas/RDPT'
              : 'Beli Saja (DCA)'
      }`,
      enableIdxLotRounding ? `📦 Pembulatan: Lot Bulat BEI (1 Lot = 100 lbr)` : '',
      rebalanceResult.tacticalBandActive
        ? `🎯 Mode Taktis: Dynamic Valuation Band Aktif (Agresivitas: ±${((rebalanceResult.tacticalAggressiveness || 0.15) * 100).toFixed(0)}%)`
        : '',
      filterDustTrades &&
      rebalanceResult.suppressedDustTradesCount !== undefined &&
      rebalanceResult.suppressedDustTradesCount > 0
        ? `🧹 Anti-Dust: ${rebalanceResult.suppressedDustTradesCount} order receh disaring jadi HOLD`
        : '',
      enableBrokerFees &&
      rebalanceResult.totalEstimatedFeeIdr !== undefined &&
      rebalanceResult.totalEstimatedFeeIdr > 0
        ? `💸 Estimasi Fee Broker & Pajak: ≈ ${formatIdr(rebalanceResult.totalEstimatedFeeIdr)}`
        : '',
      rebalanceResult.unallocatedCashRemainderIdr && Math.abs(rebalanceResult.unallocatedCashRemainderIdr) > 100
        ? `🪙 Sisa Kas Pecahan Lot (ke RDPT/Kas): ${formatIdr(rebalanceResult.unallocatedCashRemainderIdr)}`
        : '',
      '',
    ].filter(Boolean);

    if (sells.length > 0) {
      lines.push(`🔴 *INSTRUKSI JUAL (TAKE PROFIT):*`);
      for (const s of sells) {
        const tacticalTag = s.tacticalSignal ? ` [${s.tacticalSignal.badgeLabel}]` : '';
        lines.push(
          `• *${s.symbol}*${tacticalTag}: JUAL *${formatIdr(Math.abs(s.tradeAmountIdr))}* (${formatOrderUnit(
            s
          )}) ➔ Target ${s.targetWeightPercent.toFixed(1)}%`
        );
      }
      lines.push('');
    }

    if (buys.length > 0) {
      lines.push(`🟢 *INSTRUKSI BELI (TOP UP / REBALANCE):*`);
      for (const b of buys) {
        const tacticalTag = b.tacticalSignal ? ` [${b.tacticalSignal.badgeLabel}]` : '';
        lines.push(
          `• *${b.symbol}*${tacticalTag}: BELI *${formatIdr(b.tradeAmountIdr)}* (${formatOrderUnit(
            b
          )}) ➔ Target ${b.targetWeightPercent.toFixed(1)}%`
        );
      }
      lines.push('');
    }

    if (sells.length === 0 && buys.length === 0) {
      if (rebalanceResult.maxAbsoluteDrift > driftThresholdPercent) {
        lines.push(
          `⚠️ *Alokasi belum seimbang (Drift ${rebalanceResult.maxAbsoluteDrift.toFixed(1)}% > ${driftThresholdPercent}%), namun transaksi dibatasi oleh mode ${
            rebalanceMode === 'buy-only-dca'
              ? 'Buy-Only DCA (perlu top-up kas)'
              : rebalanceMode === 'trim-defensive-first'
                ? 'Trim Defensive First (tidak ada surplus defensif)'
                : rebalanceMode === 'selective-profit-trim'
                  ? 'Selective Profit Trim (tidak ada aset profit)'
                  : 'saat ini'
          }.*`
        );
      } else {
        lines.push(`✅ *Seluruh bobot aset sudah seimbang (Tidak ada order).*`);
      }
      lines.push('');
    }

    if (crashLadderSteps.length > 0 && selectedLadderAsset) {
      lines.push(
        `🎯 *JARING LIMIT ORDER CRASH (${selectedLadderAsset.shortName}):*`
      );
      for (const step of crashLadderSteps) {
        const triggerStr =
          selectedLadderAsset.currency === 'USD'
            ? `$${step.limitPriceNative.toLocaleString()}`
            : `Rp ${Math.round(step.limitPriceNative).toLocaleString('id-ID')}`;

        let unitInfo = '';
        if (selectedLadderAsset.lotSize === 100 && step.rebalanceBuyLots !== undefined) {
          unitInfo = ` (${step.rebalanceBuyLots} Lot / ${(step.rebalanceBuyLots * 100).toLocaleString('id-ID')} lbr)`;
        } else if (selectedLadderAsset.currency === 'USD') {
          unitInfo = ` (${formatUsd(step.rebalanceBuyAmountIdr / Math.max(1, usdIdrRate))} ~ ${step.rebalanceBuyUnits} unit)`;
        } else if (!selectedLadderAsset.isNominalOnly && step.rebalanceBuyUnits > 0) {
          unitInfo = ` (${step.rebalanceBuyUnits} unit)`;
        }

        lines.push(
          `• Crash ${step.dropPercent}% (@ ${triggerStr}): Pasang BELI *${formatIdr(
            step.rebalanceBuyAmountIdr
          )}*${unitInfo}`
        );
      }
    }

    navigator.clipboard?.writeText(lines.join('\n'));
    setSlipCopied(true);
    setTimeout(() => setSlipCopied(false), 2500);
  };

  const chartData = rebalanceResult.items.map((item) => ({
    symbol: item.assetId,
    Target: item.targetWeightPercent,
    Current: item.currentWeightPercent,
  }));

  const pnlFromShockIdr =
    rebalanceResult.postShockTotalIdr - rebalanceResult.initialTotalIdr;
  const pnlPercent =
    rebalanceResult.initialTotalIdr > 0
      ? (pnlFromShockIdr / rebalanceResult.initialTotalIdr) * 100
      : 0;

  // Escape closes the options popover and the deficit confirmation dialog (standard menu/dialog keyboard contract)
  useEffect(() => {
    if (!isOptionsMenuOpen && !showDeficitConfirmModal) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      setIsOptionsMenuOpen(false);
      setShowDeficitConfirmModal(false);
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOptionsMenuOpen, showDeficitConfirmModal]);

  const historyChartData = [...rebalanceHistory]
    .reverse()
    .map((entry, idx) => ({
      step: `#${idx + 1} (${entry.timestamp})`,
      NetWorthJuta: Math.round(entry.totalValueAfterIdr / 1_000_000),
    }));

  return (
    <div className="space-y-6">
      {/* SUB-MODE SWITCHER TABS: STANDARD REBALANCER vs SMART DCA ADVISOR */}
      <div className="flex items-center justify-between flex-wrap gap-2 border-b ui-border pb-3">
        <div className="ui-subtle inline-flex rounded-xl p-1 border ui-border shadow-xs">
          <button
            type="button"
            onClick={() => setRebalancerSubMode('rebalance')}
            className={`flex items-center gap-2 rounded-lg px-3.5 py-1.5 text-xs font-bold transition ${
              rebalancerSubMode === 'rebalance'
                ? 'bg-emerald-600 text-white shadow-xs'
                : 'ui-text-secondary hover:ui-text-main'
            }`}
          >
            <Scale className="h-3.5 w-3.5" />
            <span>Rebalancer Portofolio</span>
          </button>
          <button
            type="button"
            id="tour-smart-dca-submode-btn"
            onClick={() => setRebalancerSubMode('smart-dca')}
            className={`flex items-center gap-2 rounded-lg px-3.5 py-1.5 text-xs font-bold transition ${
              rebalancerSubMode === 'smart-dca'
                ? 'bg-emerald-600 text-white shadow-xs'
                : 'ui-text-secondary hover:ui-text-main'
            }`}
          >
            <SlidersHorizontal className="h-3.5 w-3.5 text-amber-600 dark:text-amber-300" />
            <span>Smart DCA Advisor</span>
            <span className="rounded bg-amber-400/20 text-amber-700 dark:text-amber-300 text-[10px] px-1.5 py-0.5 font-mono font-semibold">
              2-Pillar
            </span>
          </button>
        </div>
      </div>

      {rebalancerSubMode === 'smart-dca' ? (
        <SmartDcaAdvisorPanel
          allAssets={allAssets}
          targetWeights={targetWeights}
          holdings={holdings}
          inputMode={inputMode}
          usdIdrRate={usdIdrRate}
          monthlySavingsMenu1Idr={monthlySavingsMenu1Idr}
          enableIdxLotRounding={enableIdxLotRounding}
          filterDustTrades={filterDustTrades}
          dustTradeThresholdIdr={25_000}
          tacticalConfig={tacticalConfig}
          cashInjectionIdr={cashInjectionIdr}
          smartDcaMonthlyBudgetIdr={smartDcaMonthlyBudgetIdr}
          onUpdateSmartDcaMonthlyBudgetIdr={setSmartDcaMonthlyBudgetIdr}
          smartDcaOverflowMode={smartDcaOverflowMode}
          onUpdateSmartDcaOverflowMode={setSmartDcaOverflowMode}
          smartDcaAllocationMode={smartDcaAllocationMode}
          onUpdateSmartDcaAllocationMode={setSmartDcaAllocationMode}
          smartDcaIndicatorOverrides={smartDcaIndicatorOverrides}
          onUpdateSmartDcaIndicatorOverrides={setSmartDcaIndicatorOverrides}
          smartDcaLastRefreshSuccessAt={smartDcaLastRefreshSuccessAt}
          onUnifiedSync={onUnifiedSync}
          isSyncingPrices={isSyncingPrices}
          onOpenOrderSlip={onOpenOrderSlip}
          onCommitRebalanceToHoldings={onCommitRebalanceToHoldings}
          onSwitchToStandardRebalancer={() => setRebalancerSubMode('rebalance')}
        />
      ) : (
        <>
          {/* SMART WELCOME BANNER (For New Users with Rp 0 Portfolio and no Cash Injected yet) */}
          {rebalanceResult.initialTotalIdr === 0 &&
        cashInjectionIdr === 0 &&
        !isFixedBudgetMode &&
        !isWelcomeBannerDismissed && (
        <div className="relative overflow-hidden rounded-xl border ui-border ui-card p-4 sm:p-5 shadow-sm">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                <Coins className="h-4 w-4" />
              </div>
              <div className="space-y-0.5">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-semibold ui-text-main">
                    Mulai Belanja Perdana Portofolio
                  </h3>
                  <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-medium text-emerald-400 border border-emerald-500/20">
                    Saldo Rp 0
                  </span>
                </div>
                <p className="text-xs ui-text-muted max-w-2xl leading-relaxed">
                  Portofolio Anda saat ini masih kosong. Siapkan daftar belanja perdana dari Modal Awal Menu 1 (
                  <strong className="text-emerald-500 dark:text-emerald-400">{formatIdr(initialCapitalMenu1Idr, true)}</strong>)
                  sesuai racikan <strong className="ui-text-main font-semibold">{activePortfolioName}</strong>, atau baca panduan SOP eksekusi.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 self-stretch sm:self-auto shrink-0">
              <button
                type="button"
                onClick={onSetupInitialBuyFromMenu1}
                className="flex-1 sm:flex-initial flex items-center justify-center gap-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-xs px-3.5 py-2 shadow-xs transition"
              >
                <ArrowUpRight className="h-3.5 w-3.5" />
                <span>Siapkan Beli Perdana</span>
              </button>

              <button
                type="button"
                onClick={() => setIsGuideModalOpen(true)}
                className="flex items-center justify-center gap-1.5 rounded-lg border ui-border ui-subtle hover:bg-zinc-200 dark:hover:bg-zinc-800 ui-text-secondary font-medium text-xs px-2.5 py-2 transition"
              >
                <HelpCircle className="h-3.5 w-3.5 ui-text-muted" />
                <span>Panduan</span>
              </button>

              <button
                type="button"
                onClick={() => setIsWelcomeBannerDismissed(true)}
                className="rounded-lg p-1.5 ui-text-muted hover:ui-text-main hover:ui-subtle transition"
                title="Tutup banner ini"
                aria-label="Tutup banner sambutan"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* TOP CONTROL BAR: HERO ACTIONS & TECHNICAL SETTINGS HUB */}
      <section className="ui-card rounded-xl p-3 sm:p-3.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          {/* Left: Collapsible Header & Target Badge */}
          <button
            type="button"
            onClick={() => toggleSectionCollapse('rebalanceHero')}
            className="flex items-center gap-2 text-left group focus:outline-none"
            aria-expanded={!collapsedSections['rebalanceHero']}
            aria-label={collapsedSections['rebalanceHero'] ? 'Buka Setelan Rebalancer' : 'Ciutkan Setelan Rebalancer'}
          >
            <ChevronDown
              className={`h-4 w-4 ui-text-muted transition-transform duration-200 group-hover:ui-text-main ${
                collapsedSections['rebalanceHero'] ? '-rotate-90' : ''
              }`}
            />
            <Scale className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
            <h2 className="ui-text-main text-xs sm:text-sm font-bold tracking-tight">
              Portfolio Rebalancer
            </h2>
            <span
              className={`rounded border px-1.5 py-0.5 text-[10px] font-semibold font-mono ${
                isHoldingsSyncedWithMenu1
                  ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
                  : 'border-zinc-500/30 bg-zinc-500/10 ui-text-secondary'
              }`}
            >
              {isHoldingsSyncedWithMenu1 ? `SYNC M1 (${formatIdr(initialCapitalMenu1Idr, true)})` : 'Manual'}
            </span>
            <span className="hidden md:inline-flex items-center gap-1 text-[11px] ui-text-muted">
              • Target: <strong className="ui-text-main font-semibold truncate max-w-[200px]">{activePortfolioName}</strong>
            </span>
          </button>

          {/* Right: Quick Action Controls */}
          <div className="flex flex-wrap items-center gap-1.5">
            {/* Guide SOP */}
            <button
              type="button"
              onClick={() => setIsGuideModalOpen(true)}
              className="ui-subtle ui-text-secondary flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-medium hover:ui-text-main transition"
              title="Panduan SOP eksekusi rebalancing vs belanja perdana"
            >
              <Lightbulb className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
              <span className="hidden sm:inline">SOP</span>
            </button>

            {/* Segmented Quick Actions: Ambil M1 / Beli Perdana / Kosongkan */}
            <div className="ui-subtle inline-flex rounded-md p-0.5 border text-xs">
              <button
                type="button"
                onClick={() => {
                  setQuickTotalIdr(initialCapitalMenu1Idr);
                  setPercentReferenceTotalIdr(initialCapitalMenu1Idr);
                  onPopulateCapital(initialCapitalMenu1Idr);
                }}
                className={`flex items-center gap-1 rounded px-2 py-1 font-medium transition ${
                  isHoldingsSyncedWithMenu1
                    ? 'ui-card ui-text-main font-semibold shadow-2xs'
                    : 'ui-text-muted hover:ui-text-main'
                }`}
                title={`Isi saldo aset sesuai proporsi Modal Awal Menu 1 (${formatIdr(initialCapitalMenu1Idr, true)})`}
              >
                <Coins className="h-3 w-3" />
                <span>Ambil M1</span>
              </button>

              <button
                type="button"
                onClick={onSetupInitialBuyFromMenu1}
                className={`flex items-center gap-1 rounded px-2 py-1 font-medium transition ${
                  cashInjectionIdr > 0 && rebalanceResult.initialTotalIdr === 0
                    ? 'ui-card ui-text-main font-semibold shadow-2xs'
                    : 'ui-text-muted hover:ui-text-main'
                }`}
                title="Kosongkan aset ke Rp 0 dan jadikan modal M1 sebagai Kas Baru untuk belanja perdana"
              >
                <ArrowUpRight className="h-3 w-3" />
                <span>Beli Perdana</span>
              </button>

              <button
                type="button"
                onClick={onClearHoldingsForManualInput}
                className={`flex items-center gap-1 rounded px-2 py-1 font-medium transition ${
                  rebalanceResult.initialTotalIdr === 0 && cashInjectionIdr === 0
                    ? 'ui-card ui-text-main font-semibold shadow-2xs'
                    : 'ui-text-muted hover:ui-text-main'
                }`}
                title="Reset semua saldo aset menjadi Rp 0"
              >
                <Trash2 className="h-3 w-3 text-rose-500" />
                <span>Kosongkan</span>
              </button>
            </div>

            {/* Consolidated Technical Settings Popover Menu */}
            <div ref={optionsMenuRef} className="relative">
              <button
                id="tour-rebalance-options-btn"
                type="button"
                aria-expanded={isOptionsMenuOpen}
                aria-haspopup="menu"
                onClick={() => setIsOptionsMenuOpen((prev) => !prev)}
                className={`flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-medium transition ${
                  isOptionsMenuOpen || anyPriceModified || !enableIdxLotRounding || enableBrokerFees
                    ? 'border-emerald-500/50 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 font-semibold'
                    : 'ui-subtle ui-text-secondary hover:ui-text-main'
                }`}
                title="Pengaturan Lanjutan: Skenario Krisis, Split Bank, Filter Receh, Fee Broker, Import Teks"
              >
                <SlidersHorizontal className="h-3 w-3" />
                <span>Opsi &amp; Simulasi</span>
                <ChevronDown className={`h-3 w-3 transition-transform ${isOptionsMenuOpen ? 'rotate-180' : ''}`} />
              </button>

              {isOptionsMenuOpen && (
                <div className="ui-card absolute right-0 z-50 mt-1.5 w-84 max-w-[92vw] space-y-2.5 rounded-xl p-3.5 text-xs shadow-md border ui-border">
                  <div className="ui-border flex items-center justify-between border-b pb-2">
                    <span className="ui-text-main font-bold">
                      Opsi &amp; Simulasi Lanjutan
                    </span>
                    <span className="ui-text-muted font-mono text-[10px]">
                      Rebalancer
                    </span>
                  </div>

                  {/* 3 Categorized Tabs Header */}
                  <div className="ui-subtle grid grid-cols-3 gap-0.5 rounded-lg p-0.5 border text-center text-[11px]">
                    <button
                      type="button"
                      onClick={() => setOptionsActiveTab('crisis')}
                      className={`rounded py-1 font-semibold transition flex items-center justify-center gap-1 ${
                        optionsActiveTab === 'crisis'
                          ? 'ui-card ui-text-main shadow-2xs'
                          : 'ui-text-muted hover:ui-text-main'
                      }`}
                    >
                      <Activity className="h-3 w-3 text-amber-500" />
                      <span>Krisis</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setOptionsActiveTab('broker')}
                      className={`rounded py-1 font-semibold transition flex items-center justify-center gap-1 ${
                        optionsActiveTab === 'broker'
                          ? 'ui-card ui-text-main shadow-2xs'
                          : 'ui-text-muted hover:ui-text-main'
                      }`}
                    >
                      <SlidersHorizontal className="h-3 w-3 text-sky-500" />
                      <span>Aturan &amp; TAA</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setOptionsActiveTab('balance')}
                      className={`rounded py-1 font-semibold transition flex items-center justify-center gap-1 ${
                        optionsActiveTab === 'balance'
                          ? 'ui-card ui-text-main shadow-2xs'
                          : 'ui-text-muted hover:ui-text-main'
                      }`}
                    >
                      <Coins className="h-3 w-3 text-emerald-500" />
                      <span>Kelola Saldo</span>
                    </button>
                  </div>

                  {/* TAB 1: KRISIS & STRESS-TEST */}
                  {optionsActiveTab === 'crisis' && (
                    <div className="space-y-2.5 max-h-[60vh] overflow-y-auto pr-0.5">
                      {/* Section 1: Simulasi Krisis Video (Preserves #tour-stress-scenarios!) */}
                      <div id="tour-stress-scenarios" className="space-y-1.5">
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] font-semibold ui-text-main">
                            Skenario Video Edukasi:
                          </span>
                          <button
                            type="button"
                            onClick={() => setShowShockSliders(!showShockSliders)}
                            className="text-[10px] text-emerald-600 dark:text-emerald-400 hover:underline"
                          >
                            {showShockSliders ? 'Tutup Sliders' : 'Slider Custom'}
                          </button>
                        </div>

                        <div className="grid grid-cols-2 gap-1 text-[11px]">
                          <button
                            type="button"
                            onClick={() => onApplyShockScenario('video-bull-3x')}
                            className="ui-subtle ui-text-main flex items-center justify-center gap-1 rounded-md p-1.5 hover:opacity-80 transition"
                          >
                            <TrendingUp className="h-3 w-3 text-emerald-500" />
                            <span>Bull 3x (+200%)</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => onApplyShockScenario('video-crash-50')}
                            className="ui-subtle ui-text-main flex items-center justify-center gap-1 rounded-md p-1.5 hover:opacity-80 transition"
                          >
                            <TrendingDown className="h-3 w-3 text-rose-500" />
                            <span>Crash -50% (Dip)</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => onApplyShockScenario('global-crisis')}
                            className="ui-subtle ui-text-main flex items-center justify-center gap-1 rounded-md p-1.5 hover:opacity-80 transition"
                          >
                            <span>Krisis Global (-35%)</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => onApplyShockScenario('reset')}
                            className="ui-subtle ui-text-muted flex items-center justify-center gap-1 rounded-md p-1.5 hover:opacity-80 transition"
                          >
                            <RotateCcw className="h-3 w-3" />
                            <span>Reset (0%)</span>
                          </button>
                        </div>

                        {/* Historical Macro Crisis Presets */}
                        <div className="pt-1">
                          <span className="text-[10px] ui-text-muted block mb-1 font-medium">
                            Krisis Historis Nyata:
                          </span>
                          <div className="grid grid-cols-3 gap-1 text-[10px]">
                            <button
                              type="button"
                              onClick={() => onApplyShockScenario('gfc-2008')}
                              className="ui-subtle ui-text-main flex flex-col items-center justify-center p-1.5 rounded hover:opacity-80 transition text-center"
                              title="2008 GFC: IHSG -55%, S&P500 -50%, Emas +25%"
                            >
                              <span className="font-bold text-rose-500">2008 GFC</span>
                              <span className="text-[9px] ui-text-muted">IHSG -55%</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => onApplyShockScenario('covid-2020')}
                              className="ui-subtle ui-text-main flex flex-col items-center justify-center p-1.5 rounded hover:opacity-80 transition text-center"
                              title="COVID 2020 Crash: IHSG -37%, US -34%, Crypto -50%"
                            >
                              <span className="font-bold text-amber-500">2020 COVID</span>
                              <span className="text-[9px] ui-text-muted">Crash -37%</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => onApplyShockScenario('crypto-tech-winter-2022')}
                              className="ui-subtle ui-text-main flex flex-col items-center justify-center p-1.5 rounded hover:opacity-80 transition text-center"
                              title="2022 Winter: Crypto -75%, Tech -33%, IHSG +4%"
                            >
                              <span className="font-bold text-sky-500">2022 Winter</span>
                              <span className="text-[9px] ui-text-muted">Crypto -75%</span>
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* TAB 2: ATURAN BROKER & TAA TACTICAL VALUATION */}
                  {optionsActiveTab === 'broker' && (
                    <div className="space-y-2 max-h-[60vh] overflow-y-auto pr-0.5">
                      <div className="space-y-1.5">
                        <span className="text-[11px] font-semibold ui-text-main block">
                          Aturan Eksekusi Broker:
                        </span>
                        {setEnableIdxLotRounding && (
                          <button
                            type="button"
                            onClick={() => setEnableIdxLotRounding(!enableIdxLotRounding)}
                            className={`flex w-full items-center justify-between rounded-lg p-2 text-xs transition ${
                              enableIdxLotRounding
                                ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 font-semibold'
                                : 'ui-subtle ui-text-secondary'
                            }`}
                          >
                            <span>Bulatkan Lot BEI (100 lbr)</span>
                            <span className="rounded bg-black/10 dark:bg-white/10 px-1 text-[10px]">
                              {enableIdxLotRounding ? 'ON' : 'OFF'}
                            </span>
                          </button>
                        )}

                        {setEnableBrokerFees && (
                          <button
                            type="button"
                            onClick={() => setEnableBrokerFees(!enableBrokerFees)}
                            className={`flex w-full items-center justify-between rounded-lg p-2 text-xs transition ${
                              enableBrokerFees
                                ? 'bg-amber-500/10 text-amber-700 dark:text-amber-300 font-semibold'
                                : 'ui-subtle ui-text-secondary'
                            }`}
                          >
                            <span>Estimasi Fee Broker &amp; Pajak</span>
                            <span className="rounded bg-black/10 dark:bg-white/10 px-1 text-[10px]">
                              {enableBrokerFees ? 'ON' : 'OFF'}
                            </span>
                          </button>
                        )}

                        {setFilterDustTrades && (
                          <button
                            type="button"
                            onClick={() => setFilterDustTrades(!filterDustTrades)}
                            className={`flex w-full items-center justify-between rounded-lg p-2 text-xs transition ${
                              filterDustTrades
                                ? 'bg-zinc-500/10 ui-text-main font-semibold'
                                : 'ui-subtle ui-text-secondary'
                            }`}
                          >
                            <span>Saring Order Receh (&lt; Rp 25rb)</span>
                            <span className="rounded bg-black/10 dark:bg-white/10 px-1 text-[10px]">
                              {filterDustTrades ? 'ON' : 'OFF'}
                            </span>
                          </button>
                        )}

                        {anyPriceModified && onResetAllAssetPrices && (
                          <button
                            type="button"
                            onClick={() => {
                              setIsOptionsMenuOpen(false);
                              onResetAllAssetPrices();
                            }}
                            className="flex w-full items-center justify-between rounded-lg p-2 text-xs font-semibold text-rose-600 dark:text-rose-400 hover:bg-rose-500/10 transition mt-1"
                          >
                            <div className="flex items-center gap-1.5">
                              <RotateCcw className="h-3.5 w-3.5" />
                              <span>Reset Semua Harga Spot Pasar</span>
                            </div>
                            <span className="text-[10px] uppercase font-mono">Reset</span>
                          </button>
                        )}
                      </div>

                      {/* Tactical Asset Allocation (Valuation Band) */}
                      {tacticalConfig && setTacticalConfig && (
                        <div className="ui-border border-t pt-2 space-y-2">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-1.5">
                              <Target className="h-3.5 w-3.5 text-emerald-500" />
                              <span className="text-[11px] font-semibold ui-text-main">
                                Valuation Band (TAA):
                              </span>
                            </div>
                            <button
                              type="button"
                              onClick={() =>
                                setTacticalConfig({
                                  ...tacticalConfig,
                                  enabled: !tacticalConfig.enabled,
                                })
                              }
                              className={`rounded px-1.5 py-0.5 text-[10px] font-mono font-bold transition ${
                                tacticalConfig.enabled
                                  ? 'bg-emerald-500/20 text-emerald-700 dark:text-emerald-300'
                                  : 'ui-subtle ui-text-muted'
                              }`}
                            >
                              {tacticalConfig.enabled ? 'ON' : 'OFF'}
                            </button>
                          </div>

                          {tacticalConfig.enabled && (
                            <div className="space-y-2 pt-1 text-[11px]">
                              {/* Aggressiveness pills */}
                              <div className="flex items-center justify-between">
                                <span className="ui-text-muted text-[10px]">Agresivitas Tilt:</span>
                                <div className="flex gap-1">
                                  {[0.1, 0.15, 0.25].map((val) => (
                                    <button
                                      key={val}
                                      type="button"
                                      onClick={() =>
                                        setTacticalConfig({
                                          ...tacticalConfig,
                                          aggressiveness: val,
                                        })
                                      }
                                      className={`rounded px-1.5 py-0.5 text-[10px] font-mono transition ${
                                        tacticalConfig.aggressiveness === val
                                          ? 'bg-emerald-600 text-white font-bold'
                                          : 'ui-subtle ui-text-muted hover:ui-text-main'
                                      }`}
                                    >
                                      ±{(val * 100).toFixed(0)}%
                                    </button>
                                  ))}
                                </div>
                              </div>

                              {/* Crypto slider & sync */}
                              <div className="space-y-1 rounded bg-black/5 dark:bg-white/5 p-2">
                                <div className="flex items-center justify-between text-[10px]">
                                  <span className="font-semibold ui-text-main">Crypto Sentiment:</span>
                                  <div className="flex items-center gap-1">
                                    <span className="font-mono font-bold">{tacticalConfig.cryptoScore}/100</span>
                                    <button
                                      type="button"
                                      onClick={handleSyncCryptoFearAndGreed}
                                      disabled={isSyncingFng}
                                      className="text-[9px] text-emerald-600 dark:text-emerald-400 hover:underline flex items-center gap-0.5"
                                      title="Tarik data live dari alternative.me API"
                                    >
                                      <RefreshCw className={`h-2.5 w-2.5 ${isSyncingFng ? 'animate-spin' : ''}`} />
                                      {isSyncingFng ? 'Sync...' : 'Live'}
                                    </button>
                                  </div>
                                </div>
                                <input
                                  type="range"
                                  min="0"
                                  max="100"
                                  value={tacticalConfig.cryptoScore}
                                  onChange={(e) =>
                                    setTacticalConfig({
                                      ...tacticalConfig,
                                      cryptoScore: parseInt(e.target.value, 10),
                                    })
                                  }
                                  aria-label="Skor sentimen kripto"
                                  className="w-full accent-emerald-500 h-1.5 cursor-pointer"
                                />
                                <div className="flex justify-between text-[9px] ui-text-muted">
                                  <span>0 Fear (+tilt)</span>
                                  <span>50 Netral</span>
                                  <span>100 Greed (-trim)</span>
                                </div>
                                {fngSyncMessage && (
                                  <div className="text-[9px] text-emerald-600 dark:text-emerald-400 italic">
                                    {fngSyncMessage}
                                  </div>
                                )}
                              </div>

                              {/* US Equity slider */}
                              <div className="space-y-1 rounded bg-black/5 dark:bg-white/5 p-2">
                                <div className="flex items-center justify-between text-[10px]">
                                  <span className="font-semibold ui-text-main">US Equity:</span>
                                  <span className="font-mono font-bold">{tacticalConfig.usEquityScore}/100</span>
                                </div>
                                <input
                                  type="range"
                                  min="0"
                                  max="100"
                                  value={tacticalConfig.usEquityScore}
                                  onChange={(e) =>
                                    setTacticalConfig({
                                      ...tacticalConfig,
                                      usEquityScore: parseInt(e.target.value, 10),
                                    })
                                  }
                                  aria-label="Skor valuasi saham AS"
                                  className="w-full accent-emerald-500 h-1.5 cursor-pointer"
                                />
                              </div>

                              {/* IDX Equity slider */}
                              <div className="space-y-1 rounded bg-black/5 dark:bg-white/5 p-2">
                                <div className="flex items-center justify-between text-[10px]">
                                  <span className="font-semibold ui-text-main">IHSG / Domestik:</span>
                                  <span className="font-mono font-bold">{tacticalConfig.idxEquityScore}/100</span>
                                </div>
                                <input
                                  type="range"
                                  min="0"
                                  max="100"
                                  value={tacticalConfig.idxEquityScore}
                                  onChange={(e) =>
                                    setTacticalConfig({
                                      ...tacticalConfig,
                                      idxEquityScore: parseInt(e.target.value, 10),
                                    })
                                  }
                                  aria-label="Skor valuasi IHSG"
                                  className="w-full accent-emerald-500 h-1.5 cursor-pointer"
                                />
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {/* TAB 3: KELOLA SALDO & SKALA */}
                  {optionsActiveTab === 'balance' && (
                    <div className="space-y-2 max-h-[60vh] overflow-y-auto pr-0.5">
                      {/* Skala Cepat */}
                      <div className="space-y-1.5">
                        <span className="text-[11px] font-semibold ui-text-main block">
                          Skalakan Total Portofolio:
                        </span>
                        <div className="flex items-center gap-1.5">
                          <div className="ui-subtle flex flex-1 items-center gap-1 rounded-md border px-2 py-1">
                            <span className="ui-text-muted font-mono text-[10px]">Rp</span>
                            <FormattedNumberInput
                              step={10_000_000}
                              min={0}
                              value={quickTotalIdr}
                              onChange={(val) => setQuickTotalIdr(val)}
                              className="ui-text-main w-full bg-transparent font-mono text-xs font-bold focus:outline-none"
                              ariaLabel="Quick Scale Total Value"
                            />
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              onScaleTotalHoldingsIdr(quickTotalIdr, 'target');
                              setIsOptionsMenuOpen(false);
                            }}
                            className="rounded-md bg-emerald-600 px-2 py-1 text-[11px] font-semibold text-white hover:bg-emerald-500 shrink-0"
                          >
                            Bagi Target
                          </button>
                        </div>
                        <div className="flex flex-wrap gap-1 text-[10px]">
                          {[50_000_000, 100_000_000, 500_000_000, 1_000_000_000].map(
                            (presetTotal) => (
                              <button
                                key={presetTotal}
                                type="button"
                                onClick={() => setQuickTotalIdr(presetTotal)}
                                className="ui-subtle ui-text-muted rounded px-1.5 py-0.5 font-mono hover:ui-text-main"
                              >
                                {formatIdr(presetTotal, true)}
                              </button>
                            )
                          )}
                        </div>
                      </div>

                      {/* Manipulasi Saldo */}
                      <div className="ui-border border-t pt-2 space-y-1">
                        <span className="text-[11px] font-semibold ui-text-main block mb-1">
                          Aksi Saldo &amp; Portofolio:
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            setIsOptionsMenuOpen(false);
                            setIsHoldingsTextModalOpen(true);
                          }}
                          className="ui-subtle ui-text-main flex w-full items-center justify-between rounded-lg p-2 text-xs transition hover:opacity-80"
                        >
                          <div className="flex items-center gap-1.5">
                            <FileSpreadsheet className="h-3.5 w-3.5 text-emerald-500" />
                            <span>Import / Export Teks (Excel)</span>
                          </div>
                          <span className="ui-text-muted font-mono text-[10px]">TSV/CSV</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            setIsOptionsMenuOpen(false);
                            onClearHoldingsForManualInput();
                          }}
                          className="ui-subtle ui-text-main flex w-full items-center justify-between rounded-lg p-2 text-xs transition hover:opacity-80"
                        >
                          <div className="flex items-center gap-1.5">
                            <RotateCcw className="h-3.5 w-3.5 text-amber-500" />
                            <span>Isi Manual (Kosongkan ke Rp 0)</span>
                          </div>
                          <span className="ui-text-muted font-mono text-[10px]">Reset</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            setIsOptionsMenuOpen(false);
                            onLoadVideo1BExample();
                          }}
                          className="ui-subtle ui-text-main flex w-full items-center justify-between rounded-lg p-2 text-xs transition hover:opacity-80"
                        >
                          <div className="flex items-center gap-1.5">
                            <Coins className="h-3.5 w-3.5 ui-text-muted" />
                            <span>Muat Contoh Video Rp 1 Miliar</span>
                          </div>
                          <span className="ui-text-muted font-mono text-[10px]">Demo</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            setIsOptionsMenuOpen(false);
                            onApplyPeerDiversification();
                          }}
                          className="ui-subtle ui-text-main flex w-full items-center justify-between rounded-lg p-2 text-xs transition hover:opacity-80"
                        >
                          <div className="flex items-center gap-1.5">
                            <Split className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                            <span>Split Diversifikasi Sub-Bank</span>
                          </div>
                          <span className="ui-text-muted font-mono text-[10px]">Rekening</span>
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Collapse toggle button */}
            <button
              type="button"
              onClick={() => toggleSectionCollapse('rebalanceHero')}
              className="ui-subtle ui-border rounded-md border px-2 py-1 text-[11px] font-medium ui-text-secondary hover:ui-text-main transition"
              title={collapsedSections['rebalanceHero'] ? 'Buka Setelan Rebalancer' : 'Ciutkan Setelan Rebalancer'}
            >
              {collapsedSections['rebalanceHero'] ? 'Buka' : 'Ciutkan'}
            </button>
          </div>
        </div>

        {/* When Collapsed: A slim reminder line */}
        {collapsedSections['rebalanceHero'] && (
          <div className="mt-2 pt-2 border-t ui-border flex items-center justify-between text-xs ui-text-muted">
            <span className="text-[11px]">Setelan kontrol rebalancer disembunyikan. Posisi portfolio aktif tetap berlaku.</span>
            <button
              type="button"
              onClick={() => toggleSectionCollapse('rebalanceHero')}
              className="text-xs text-emerald-600 dark:text-emerald-400 font-semibold hover:underline"
            >
              Buka Setelan &rarr;
            </button>
          </div>
        )}

        {/* Custom Shock Sliders (Collapsible when opened from Opsi & Simulasi) */}
        {showShockSliders && !collapsedSections['rebalanceHero'] && (
          <div className="ui-subtle mt-3 rounded-lg p-3 border">
            <div className="flex items-center justify-between mb-2 text-xs">
              <span className="ui-text-main font-semibold flex items-center gap-1">
                <SlidersHorizontal className="h-3.5 w-3.5 text-amber-500" />
                <span>Slider Shock Harga Per Aset:</span>
              </span>
              <button
                type="button"
                onClick={() => setShowShockSliders(false)}
                className="text-[11px] ui-text-muted hover:ui-text-main rounded px-1.5 py-1"
              >
                ✕ Tutup
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-8">
              {rebalanceResult.items.map((item) => {
                const shock = holdings[item.assetId]?.shockPercent ?? 0;
                return (
                  <div key={item.assetId} className="ui-card rounded p-2 border">
                    <div className="flex items-center justify-between text-xs">
                      <span className="ui-text-main font-semibold">
                        {item.assetId}
                      </span>
                      <span
                        className={`font-mono font-semibold ${
                          shock > 0
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : shock < 0
                              ? 'text-rose-600 dark:text-rose-400'
                              : 'ui-text-muted'
                        }`}
                      >
                        {shock > 0 ? `+${shock}%` : `${shock}%`}
                      </span>
                    </div>
                    <input
                      type="range"
                      min={-80}
                      max={300}
                      step={5}
                      value={shock}
                      onChange={(e) =>
                        onUpdateHolding(item.assetId, {
                          shockPercent: Number(e.target.value),
                        })
                      }
                      className="mt-1.5 h-1 w-full cursor-pointer accent-emerald-500"
                      aria-label={`Price shock percent for ${item.assetId}`}
                    />
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </section>

      {/* KPI SUMMARY CARDS */}
      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="ui-card rounded-xl p-4">
          <div className="ui-text-muted text-xs font-medium">
            Nilai Porto Saat Ini (Post-Shock)
          </div>
          <div className="ui-text-main mt-1 font-mono text-xl font-bold">
            {formatIdr(rebalanceResult.postShockTotalIdr)}
          </div>
          <div className="mt-1 flex items-center gap-1.5 text-xs">
            <span className="ui-text-muted">
              Awal: {formatIdr(rebalanceResult.initialTotalIdr, true)}
            </span>
            {pnlFromShockIdr !== 0 && (
              <span
                className={`font-mono font-semibold ${
                  pnlFromShockIdr > 0
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : 'text-rose-600 dark:text-rose-400'
                }`}
              >
                ({pnlFromShockIdr > 0 ? '+' : ''}
                {pnlPercent.toFixed(1)}%)
              </span>
            )}
          </div>
        </div>

        <div
          className={`ui-card rounded-xl p-4 transition ${
            isFixedBudgetMode
              ? 'border border-emerald-500/40 bg-emerald-500/[0.02]'
              : ''
          }`}
        >
          <div className="flex items-center justify-between gap-1">
            <span className="ui-text-muted text-xs font-medium">
              Top-Up Kas Baru (DCA Injection)
            </span>
            <button
              type="button"
              onClick={() => setIsFixedBudgetMode?.(!isFixedBudgetMode)}
              title={
                isFixedBudgetMode
                  ? 'Mode Kunci Anggaran AKTIF: Kas Baru otomatis terpotong saat Anda mengisi saldo aset yang sudah dibeli'
                  : 'Aktifkan untuk mengunci total modal (misal Rp 25 Juta) agar kas baru otomatis terpotong saat beli bertahap'
              }
              className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold transition ${
                isFixedBudgetMode
                  ? 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/40 shadow-xs'
                  : 'ui-subtle ui-text-muted hover:ui-text-main'
              }`}
            >
              <Lock className="h-2.5 w-2.5" />
              <span>{isFixedBudgetMode ? 'Auto-Subtract ON' : 'Kunci Anggaran'}</span>
            </button>
          </div>

          {isFixedBudgetMode ? (
            <div className="mt-2 space-y-2">
              <div>
                <div className="flex items-center justify-between text-[11px] mb-1">
                  <span className="ui-text-muted">Target Total Modal:</span>
                  <button
                    type="button"
                    onClick={() => setFixedTotalBudgetIdr?.(initialCapitalMenu1Idr)}
                    className="text-[10px] text-emerald-600 dark:text-emerald-400 hover:underline font-medium"
                    title="Ambil nilai Modal Awal dari Menu 1"
                  >
                    Sync M1 ({formatIdr(initialCapitalMenu1Idr, true)})
                  </button>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="ui-text-muted font-mono text-xs font-semibold">Rp</span>
                  <FormattedNumberInput
                    step={1_000_000}
                    min={0}
                    value={fixedTotalBudgetIdr ?? initialCapitalMenu1Idr}
                    onChange={(val) => setFixedTotalBudgetIdr?.(val)}
                    className="ui-input w-full rounded px-2 py-1 font-mono text-sm font-semibold"
                    ariaLabel="Target Total Budget in IDR"
                  />
                </div>
              </div>

              {/* Breakdown: Terisi vs Sisa Kas Otomatis */}
              <div className="rounded-lg bg-black/10 dark:bg-black/25 p-2 text-[11px] space-y-1">
                <div className="flex items-center justify-between">
                  <span className="ui-text-muted">Aset Terisi Saat Ini:</span>
                  <span className="font-mono font-medium ui-text-main">
                    {formatIdr(rebalanceResult.initialTotalIdr)}
                  </span>
                </div>
                <div className="flex items-center justify-between border-t ui-border pt-1">
                  <span className="font-semibold text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                    <span>Sisa Kas Belanja:</span>
                    <span className="text-[9px] px-1 rounded bg-emerald-500/20 font-mono font-bold">
                      Auto
                    </span>
                  </span>
                  <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400">
                    {formatIdr(cashInjectionIdr)}
                  </span>
                </div>
                {rebalanceResult.initialTotalIdr >
                  (fixedTotalBudgetIdr ?? initialCapitalMenu1Idr) && (
                  <div className="text-[10px] text-amber-500 pt-0.5">
                    Terisi melebihi target (+
                    {formatIdr(
                      rebalanceResult.initialTotalIdr -
                        (fixedTotalBudgetIdr ?? initialCapitalMenu1Idr)
                    )}
                    )
                  </div>
                )}
              </div>
            </div>
          ) : (
            <>
              <div className="mt-1 flex items-center gap-1.5">
                <span className="ui-text-muted font-mono text-xs font-semibold">Rp</span>
                <FormattedNumberInput
                  step={1_000_000}
                  min={0}
                  value={cashInjectionIdr}
                  onChange={(val) => setCashInjectionIdr(val)}
                  className="ui-input w-full rounded px-2 py-1 font-mono text-sm font-semibold"
                  ariaLabel="Top-up Cash Injection in IDR"
                />
              </div>
              <div className="mt-1.5 flex flex-wrap gap-1 text-[10px]">
                <button
                  type="button"
                  onClick={() => setCashInjectionIdr(monthlySavingsMenu1Idr)}
                  title="Ambil nilai Custom DCA Bulanan dari Menu 1"
                  className={`rounded px-1.5 py-0.5 font-mono font-semibold ${
                    cashInjectionIdr === monthlySavingsMenu1Idr
                      ? 'bg-emerald-600 text-white'
                      : 'border border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                  }`}
                >
                  +DCA Menu 1 ({formatIdr(monthlySavingsMenu1Idr, true)})
                </button>
                {[0, 5_000_000, 10_000_000, 50_000_000].map((presetCash) => (
                  <button
                    key={presetCash}
                    type="button"
                    onClick={() => setCashInjectionIdr(presetCash)}
                    className="ui-subtle ui-text-secondary rounded px-1.5 py-0.5 font-mono"
                  >
                    {presetCash === 0 ? 'Reset 0' : `+${presetCash / 1_000_000}Jt`}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        <div className="ui-card rounded-xl p-3.5">
          <div className="flex items-center justify-between">
            <span className="ui-text-muted text-xs font-medium">
              Mode Rebalancing
            </span>
            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-zinc-500/10 text-emerald-600 dark:text-emerald-400">
              {rebalanceMode === 'selective-profit-trim'
                ? 'Selective Trim'
                : rebalanceMode === 'trim-defensive-first'
                  ? 'Defensive First'
                  : rebalanceMode === 'buy-only-dca'
                    ? 'Buy DCA'
                    : 'Full Rebalance'}
            </span>
          </div>

          <div className="mt-2 grid grid-cols-2 gap-1.5">
            <button
              type="button"
              onClick={() => setRebalanceMode('selective-profit-trim')}
              className={`flex items-center justify-between rounded-lg px-2.5 py-1.5 text-xs font-medium transition ${
                rebalanceMode === 'selective-profit-trim'
                  ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 font-bold ring-1 ring-emerald-500/30 shadow-2xs'
                  : 'ui-subtle ui-text-secondary hover:ui-text-main'
              }`}
              title="Hanya jual aset yang surplus signifikan"
            >
              <span>Jual Untung</span>
              {rebalanceMode === 'selective-profit-trim' && (
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              )}
            </button>

            <button
              type="button"
              onClick={() => setRebalanceMode('trim-defensive-first')}
              className={`flex items-center justify-between rounded-lg px-2.5 py-1.5 text-xs font-medium transition ${
                rebalanceMode === 'trim-defensive-first'
                  ? 'bg-blue-500/15 text-blue-700 dark:text-blue-300 font-bold ring-1 ring-blue-500/30 shadow-2xs'
                  : 'ui-subtle ui-text-secondary hover:ui-text-main'
              }`}
              title="Cairkan kas/RDPT untuk beli aset diskon"
            >
              <span>Kas/RDPT Dulu</span>
              {rebalanceMode === 'trim-defensive-first' && (
                <span className="h-1.5 w-1.5 rounded-full bg-blue-500" />
              )}
            </button>

            <button
              type="button"
              onClick={() => setRebalanceMode('sell-and-buy')}
              className={`flex items-center justify-between rounded-lg px-2.5 py-1.5 text-xs font-medium transition ${
                rebalanceMode === 'sell-and-buy'
                  ? 'bg-zinc-500/15 ui-text-main font-bold ring-1 ring-emerald-500/30 shadow-2xs'
                  : 'ui-subtle ui-text-secondary hover:ui-text-main'
              }`}
              title="Jual rata aset surplus secara proporsional"
            >
              <span>Jual Rata</span>
              {rebalanceMode === 'sell-and-buy' && (
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              )}
            </button>

            <button
              type="button"
              onClick={() => setRebalanceMode('buy-only-dca')}
              className={`flex items-center justify-between rounded-lg px-2.5 py-1.5 text-xs font-medium transition ${
                rebalanceMode === 'buy-only-dca'
                  ? 'bg-amber-500/15 text-amber-700 dark:text-amber-300 font-bold ring-1 ring-amber-500/30 shadow-2xs'
                  : 'ui-subtle ui-text-secondary hover:ui-text-main'
              }`}
              title="Alokasikan suntikan kas baru ke aset diskon tanpa jual"
            >
              <span>Beli Saja (DCA)</span>
              {rebalanceMode === 'buy-only-dca' && (
                <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
              )}
            </button>
          </div>

          <div className="ui-text-muted mt-2 text-[11px] leading-snug">
            {rebalanceMode === 'selective-profit-trim' && (
              <span className="text-emerald-600 dark:text-emerald-400">
                Pangkas aset surplus untuk beli aset diskon. Aset netral tetap HOLD.
              </span>
            )}
            {rebalanceMode === 'trim-defensive-first' && (
              <span className="text-blue-600 dark:text-blue-400">
                Cairkan buffer kas/RDPT untuk beli aset diskon tanpa jual saham/kripto.
              </span>
            )}
            {rebalanceMode === 'sell-and-buy' && (
              <span>
                Jual aset overweight dan beli underweight secara proporsional.
              </span>
            )}
            {rebalanceMode === 'buy-only-dca' && (
              <span className="text-amber-600 dark:text-amber-400">
                Tanpa jual aset. Alokasikan kas baru untuk mengakumulasi aset diskon.
              </span>
            )}
          </div>
        </div>

        <div className="ui-card rounded-xl p-4">
          <div className="ui-text-muted flex items-center justify-between text-xs font-medium">
            <span>Status Drift Bobot</span>
            <span>±{driftThresholdPercent}%</span>
          </div>
          <div className="mt-1 flex items-center gap-1.5">
            {rebalanceResult.breachedCount > 0 ? (
              <>
                <AlertCircle className="h-4 w-4 text-amber-500" />
                <span className="ui-text-main font-mono text-base font-bold">
                  {rebalanceResult.breachedCount} Aset Perlu Rebalance
                </span>
              </>
            ) : (
              <>
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                <span className="font-mono text-base font-bold text-emerald-600 dark:text-emerald-400">
                  Seimbang (Optimal)
                </span>
              </>
            )}
          </div>
          <input
            type="range"
            min={1}
            max={10}
            step={0.5}
            value={driftThresholdPercent}
            onChange={(e) => setDriftThresholdPercent(Number(e.target.value))}
            className="mt-2 h-1.5 w-full cursor-pointer"
            aria-label="Drift tolerance threshold percentage"
          />
        </div>
      </section>

      {/* MAIN REBALANCING TABLE & DRIFT CHART */}
      <section className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <div id="tour-rebalance-table-container" className="ui-card rounded-xl p-3.5 sm:p-5 lg:col-span-8">
          <div className="ui-border flex flex-wrap items-center justify-between gap-3 border-b pb-3">
            <div>
              <button
                type="button"
                onClick={() => toggleSectionCollapse('rebalanceTable')}
                className="flex items-center gap-2 text-left group focus:outline-none"
                aria-expanded={!collapsedSections['rebalanceTable']}
              >
                <ChevronDown
                  className={`h-4 w-4 ui-text-muted transition-transform duration-200 group-hover:ui-text-main ${
                    collapsedSections['rebalanceTable'] ? '-rotate-90' : ''
                  }`}
                />
                <h3 className="ui-text-main text-sm font-bold">
                  Tabel Instruksi Jual / Beli Rebalancing
                </h3>
              </button>
              <div className="flex flex-wrap items-center gap-2 mt-0.5 text-xs text-slate-400">
                <span>Ubah nilai saldo atau unit untuk menghitung order eksekusi:</span>
                {rebalanceResult.unallocatedCashRemainderIdr &&
                Math.abs(rebalanceResult.unallocatedCashRemainderIdr) > 100 ? (
                  <span
                    className={`font-mono text-[11px] font-semibold inline-flex items-center gap-1.5 ${
                      rebalanceResult.unallocatedCashRemainderIdr < 0
                        ? 'text-rose-500 font-bold'
                        : 'text-emerald-600 dark:text-emerald-400'
                    }`}
                  >
                    <span>
                      • {rebalanceResult.unallocatedCashRemainderIdr < 0 ? 'Defisit Kas: ' : 'Sisa Kas Belum Terpakai: '}
                      {formatIdr(Math.abs(rebalanceResult.unallocatedCashRemainderIdr))}
                      {rebalanceResult.unallocatedCashRemainderIdr < 0 ? ' (Perlu Top-Up)' : ''}
                    </span>
                    {rebalanceResult.unallocatedCashRemainderIdr < 0 && (
                      <button
                        type="button"
                        onClick={() => {
                          const deficit = Math.abs(rebalanceResult.unallocatedCashRemainderIdr!);
                          setCashInjectionIdr(cashInjectionIdr + Math.ceil(deficit));
                        }}
                        className="rounded bg-rose-500/15 hover:bg-rose-500/25 text-rose-600 dark:text-rose-300 border border-rose-500/30 px-1.5 py-0.2 font-sans text-[10px] font-semibold transition"
                        title="Otomatis tambahkan nominal defisit ini ke Top-Up Kas"
                      >
                        + Tutup Defisit
                      </button>
                    )}
                  </span>
                ) : null}
              </div>
            </div>

            <div id="tour-rebalance-actions" className="flex flex-wrap items-center gap-1.5">
              {/* Primary Emerald Broker Slip Button Group */}
              {onOpenOrderSlip ? (
                <div className="inline-flex rounded-lg shadow-2xs">
                  <button
                    type="button"
                    onClick={() => onOpenOrderSlip(rebalanceResult)}
                    className="inline-flex items-center gap-1.5 rounded-l-lg bg-emerald-600 hover:bg-emerald-500 text-white px-2.5 py-1 text-xs font-semibold transition shadow-xs"
                    title="Buka Slip Order Broker Interaktif (Stockbit / Pluang / Reku / Makmur)"
                  >
                    <Building2 className="h-3.5 w-3.5" />
                    <span>Slip Broker</span>
                  </button>
                  <button
                    type="button"
                    onClick={copyWhatsAppOrderSlip}
                    title="Salin Cepat Format Catatan ke Clipboard"
                    className="inline-flex items-center gap-1 rounded-r-lg bg-emerald-700 hover:bg-emerald-600 text-white px-2 py-1 text-xs border-l border-emerald-500/40 transition"
                  >
                    {slipCopied ? (
                      <Check className="h-3.5 w-3.5 text-white" />
                    ) : (
                      <Copy className="h-3.5 w-3.5" />
                    )}
                  </button>
                </div>
              ) : null}

              {/* Segmented Control: Table vs Mobile Card View */}
              <div className="ui-subtle inline-flex items-center gap-0.5 rounded-md p-0.5 border text-xs">
                <button
                  type="button"
                  onClick={() => setRebalanceViewMode('table')}
                  className={`flex items-center gap-1 rounded px-2 py-1 font-medium transition ${
                    rebalanceViewMode === 'table'
                      ? 'ui-card ui-text-main font-semibold shadow-2xs'
                      : 'ui-text-muted hover:ui-text-main'
                  }`}
                  title="Tampilan Tabel Lengkap"
                >
                  <Table2 className="h-3 w-3" />
                  <span className="hidden sm:inline">Tabel</span>
                </button>
                <button
                  type="button"
                  onClick={() => setRebalanceViewMode('cards')}
                  className={`flex items-center gap-1 rounded px-2 py-1 font-medium transition ${
                    rebalanceViewMode === 'cards'
                      ? 'ui-card ui-text-main font-semibold shadow-2xs'
                      : 'ui-text-muted hover:ui-text-main'
                  }`}
                  title="Tampilan Kartu Kompak"
                >
                  <LayoutGrid className="h-3 w-3" />
                  <span className="hidden sm:inline">Kartu</span>
                </button>
              </div>

              <button
                type="button"
                onClick={() => toggleSectionCollapse('rebalanceTable')}
                className="ui-subtle ui-border rounded-md border px-2 py-1 text-xs font-medium ui-text-secondary hover:ui-text-main transition"
              >
                {collapsedSections['rebalanceTable'] ? 'Buka' : 'Ciutkan'}
              </button>
            </div>
          </div>

          {!collapsedSections['rebalanceTable'] ? (
            <>
              {/* Row 2: Action Filter & Entry Mode Strip */}
              <div className="mt-2.5 pt-2 flex flex-wrap items-center justify-between gap-2 border-b ui-border pb-2.5 text-xs">
                {/* Left: Filter Tindakan Pills */}
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="ui-text-muted text-[10px] font-bold uppercase tracking-wider mr-0.5 hidden sm:inline">
                    Filter:
                  </span>
                  <div className="ui-subtle inline-flex rounded-md p-0.5 border text-xs">
                <button
                  type="button"
                  onClick={() => setTableActionFilter('all')}
                  className={`rounded-md px-2.5 py-1 font-medium transition ${
                    tableActionFilter === 'all'
                      ? 'ui-card ui-text-main font-semibold shadow-2xs'
                      : 'ui-text-muted hover:ui-text-main'
                  }`}
                >
                  Semua ({actionCounts.all})
                </button>
                <button
                  type="button"
                  onClick={() => setTableActionFilter('active')}
                  className={`flex items-center gap-1 rounded-md px-2.5 py-1 font-medium transition ${
                    tableActionFilter === 'active'
                      ? 'ui-card text-emerald-600 dark:text-emerald-400 font-bold shadow-2xs'
                      : 'ui-text-muted hover:ui-text-main'
                  }`}
                  title="Hanya tampilkan aset yang perlu order Beli atau Jual"
                >
                  <Zap className="h-3 w-3 text-emerald-500" />
                  <span>Order Aktif ({actionCounts.active})</span>
                </button>
                <button
                  type="button"
                  onClick={() => setTableActionFilter('buy')}
                  className={`flex items-center gap-1 rounded-md px-2.5 py-1 font-medium transition ${
                    tableActionFilter === 'buy'
                      ? 'ui-card text-emerald-600 dark:text-emerald-400 font-bold shadow-2xs'
                      : 'ui-text-muted hover:ui-text-main'
                  }`}
                >
                  <span>Beli ({actionCounts.buy})</span>
                </button>
                <button
                  type="button"
                  onClick={() => setTableActionFilter('sell')}
                  className={`flex items-center gap-1 rounded-md px-2.5 py-1 font-medium transition ${
                    tableActionFilter === 'sell'
                      ? 'ui-card text-rose-600 dark:text-rose-400 font-bold shadow-2xs'
                      : 'ui-text-muted hover:ui-text-main'
                  }`}
                >
                  <span>Jual ({actionCounts.sell})</span>
                </button>
                <button
                  type="button"
                  onClick={() => setTableActionFilter('hold')}
                  className={`rounded px-2 py-0.5 font-medium transition ${
                    tableActionFilter === 'hold'
                      ? 'ui-card ui-text-main font-semibold shadow-2xs'
                      : 'ui-text-muted hover:ui-text-main'
                  }`}
                >
                  Hold ({actionCounts.hold})
                </button>
              </div>
            </div>

            {/* Right: Holding Entry Mode & Tools */}
            <div className="flex flex-wrap items-center gap-1.5">
              <div className="ui-subtle inline-flex rounded-md p-0.5 border text-xs">
                <button
                  type="button"
                  onClick={() => {
                    setHoldingEntryMode('nominal');
                    setInputMode('nominal');
                  }}
                  className={`rounded px-2 py-0.5 font-medium transition ${
                    holdingEntryMode === 'nominal'
                      ? 'ui-card ui-text-main font-semibold shadow-2xs'
                      : 'ui-text-muted hover:ui-text-main'
                  }`}
                >
                  Nominal
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setHoldingEntryMode('percent');
                    setInputMode('nominal');
                    setPercentReferenceTotalIdr(
                      rebalanceResult.initialTotalIdr > 0
                        ? rebalanceResult.initialTotalIdr
                        : initialCapitalMenu1Idr
                    );
                  }}
                  className={`rounded px-2 py-0.5 font-medium transition ${
                    holdingEntryMode === 'percent'
                      ? 'ui-card ui-text-main font-semibold shadow-2xs'
                      : 'ui-text-muted hover:ui-text-main'
                  }`}
                >
                  % Saat Ini
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setHoldingEntryMode('units');
                    setInputMode('units');
                  }}
                  className={`rounded px-2 py-0.5 font-medium transition ${
                    holdingEntryMode === 'units'
                      ? 'ui-card ui-text-main font-semibold shadow-2xs'
                      : 'ui-text-muted hover:ui-text-main'
                  }`}
                >
                  Unit
                </button>
              </div>

              {/* Toggle Uji Drop Harga & Modal Beli */}
              <button
                type="button"
                onClick={() => setShowPriceSimControls((prev) => !prev)}
                className={`flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-medium transition ${
                  showPriceSimControls
                    ? 'border-emerald-500/50 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 font-semibold'
                    : 'ui-subtle ui-text-secondary hover:ui-text-main'
                }`}
                title="Tampilkan / sembunyikan tombol simulasi drop harga"
              >
                <SlidersHorizontal className="h-3 w-3" />
                <span>{showPriceSimControls ? 'Tutup Uji' : 'Uji Drop'}</span>
              </button>

              {/* CSV Export */}
              <button
                type="button"
                onClick={exportCsvTrades}
                className="ui-subtle ui-text-secondary flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-medium hover:ui-text-main transition"
                title="Unduh Instruksi Order sebagai file CSV"
              >
                <Download className="h-3 w-3" />
                <span>CSV</span>
              </button>
            </div>

            {tableActionFilter !== 'all' && (
              <button
                type="button"
                onClick={() => setTableActionFilter('all')}
                className="text-[11px] text-emerald-600 dark:text-emerald-400 hover:underline font-medium"
              >
                Tampilkan Semua ({actionCounts.all} Aset)
              </button>
            )}
          </div>

          {rebalanceViewMode === 'table' ? (
            <div
              id="tour-rebalance-table"
              tabIndex={0}
              role="region"
              aria-labelledby="rebalancer-table-caption"
              className="ui-border mt-4 overflow-x-auto rounded-lg border"
            >
              <table className="w-full border-separate border-spacing-0 text-left text-xs">
                <caption id="rebalancer-table-caption" className="sr-only">
                  Tabel Instruksi Jual dan Beli Rebalancing berdasarkan Posisi Saat Ini
                  dan Bobot Target
                </caption>
                <thead className="ui-subtle text-[11px] font-semibold uppercase">
                  <tr>
                    <th scope="col" className="ui-subtle ui-border sticky left-0 z-20 border-b border-r px-3 py-2 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.18)]">
                      Instrumen &amp; Harga Spot
                    </th>
                    <th scope="col" className="ui-border border-b px-3 py-2 text-right">
                      Input Posisi Awal
                    </th>
                    <th scope="col" className="ui-border border-b px-3 py-2 text-right">
                      Nilai Saat Ini
                    </th>
                    <th scope="col" className="ui-border border-b px-2.5 py-2 text-right">
                      Now vs Target
                    </th>
                    <th scope="col" className="ui-border border-b px-3 py-2 text-right">
                      Target (Rp)
                    </th>
                    <th scope="col" className="ui-border border-b px-3 py-2 text-right">
                      Action (Jual / Beli)
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filteredTableItems.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-xs ui-text-muted">
                        Tidak ada aset dengan tindakan "{tableActionFilter.toUpperCase()}".
                        <button
                          type="button"
                          onClick={() => setTableActionFilter('all')}
                          className="ml-2 font-semibold text-emerald-600 dark:text-emerald-400 hover:underline"
                        >
                          Tampilkan Semua Aset
                        </button>
                      </td>
                    </tr>
                  ) : (
                    filteredTableItems.map((item) => {
                    const asset = allAssets.find((a) => a.id === item.assetId)!;
                    const h = holdings[item.assetId] ?? {
                      assetId: item.assetId,
                      currentValueIdr: 0,
                      units: 0,
                      currentPrice: asset?.defaultPrice ?? 1,
                      shockPercent: 0,
                    };

                    return (
                      <tr
                        key={item.assetId}
                        className={
                          item.isDriftBreached
                            ? 'bg-amber-500/5'
                            : 'hover:bg-zinc-500/5'
                        }
                      >
                        <th
                          scope="row"
                          className="ui-card ui-border sticky left-0 z-10 border-b border-r px-3 py-2.5 font-normal shadow-[2px_0_5px_-2px_rgba(0,0,0,0.18)] min-w-[170px]"
                        >
                          {(() => {
                            const isNominal =
                              h.isNominalOnly ??
                              asset?.isNominalOnly ??
                              (asset?.category === 'bonds' || asset?.category === 'money-market');

                            if (isNominal) {
                              return (
                                <div className="flex items-start gap-2">
                                  <span
                                    className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full"
                                    style={{ backgroundColor: item.color }}
                                  />
                                  <div className="flex-1 space-y-1">
                                    <div className="flex items-center justify-between gap-1">
                                      <span className="ui-text-main font-bold text-xs">{item.symbol}</span>
                                    </div>

                                    <div className="flex items-center gap-1.5 pt-0.5">
                                      <span
                                        className="inline-flex items-center gap-1 rounded bg-sky-500/10 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-sky-600 dark:text-sky-400 border border-sky-500/20 select-none"
                                        title="Aset bebas harga pasar. Dikelola murni berdasarkan saldo nominal Rupiah."
                                      >
                                        Nominal Murni
                                      </span>
                                      <button
                                        type="button"
                                        onClick={() =>
                                          onUpdateHolding(item.assetId, {
                                            isNominalOnly: false,
                                            currentPrice: asset?.defaultPrice ?? 1,
                                          })
                                        }
                                        className="ui-text-muted hover:ui-text-main text-[9px] underline decoration-dotted transition"
                                        title="Ubah ke mode input harga pasar per unit"
                                      >
                                        Atur Harga
                                      </button>
                                    </div>
                                  </div>
                                </div>
                              );
                            }

                            const priceDiffPct = asset?.defaultPrice
                              ? ((h.currentPrice - asset.defaultPrice) / asset.defaultPrice) * 100
                              : 0;
                            const isPriceCustom = Math.abs(priceDiffPct) >= 0.1;

                            return (
                              <div className="flex items-start gap-2">
                                <span
                                  className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full"
                                  style={{ backgroundColor: item.color }}
                                />
                                <div className="flex-1 space-y-1">
                                  <div className="flex items-center justify-between gap-1">
                                    <span className="ui-text-main font-bold text-xs">{item.symbol}</span>
                                    <div className="flex items-center gap-1">
                                      {item.unrealizedGainPercent !== undefined && (
                                        <span
                                          className={`rounded px-1 py-0.2 font-mono text-[9px] font-bold ${
                                            item.unrealizedGainPercent >= 0
                                              ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                                              : 'bg-rose-500/15 text-rose-600 dark:text-rose-400'
                                          }`}
                                          title={`Unrealized P&L: ${item.unrealizedGainPercent >= 0 ? '+' : ''}${item.unrealizedGainPercent}% (${formatIdr(item.unrealizedGainIdr ?? 0)})`}
                                        >
                                          P&L {item.unrealizedGainPercent >= 0 ? '+' : ''}{item.unrealizedGainPercent}%
                                        </span>
                                      )}
                                      {isPriceCustom && (
                                        <span
                                          className={`rounded px-1 py-0.2 font-mono text-[9px] font-bold ${
                                            priceDiffPct < 0
                                              ? 'bg-rose-500/15 text-rose-600 dark:text-rose-400'
                                              : 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                                          }`}
                                          title={`Perubahan harga: ${priceDiffPct > 0 ? '+' : ''}${priceDiffPct.toFixed(1)}% dari harga normal (${formatPriceDisplay(asset?.defaultPrice ?? 1, asset?.currency)})`}
                                        >
                                          {priceDiffPct < 0 ? '▼' : '▲'} {Math.abs(priceDiffPct).toFixed(1)}%
                                        </span>
                                      )}
                                    </div>
                                  </div>

                                  {/* Editable Spot Price Input */}
                                  <div className="flex items-center gap-1">
                                    <span className="ui-text-muted font-mono text-[10px] select-none">
                                      {asset?.currency === 'USD' ? '$' : 'Rp'}
                                    </span>
                                    <input
                                      type="number"
                                      step={asset?.currency === 'USD' ? (h.currentPrice < 10 ? '0.01' : '1') : '25'}
                                      min={0.0001}
                                      value={h.currentPrice}
                                      onChange={(e) =>
                                        onUpdateHolding(item.assetId, {
                                          currentPrice: Math.max(0.000001, Number(e.target.value)),
                                        })
                                      }
                                      className={`ui-input rounded px-1.5 py-0.5 font-mono text-[11px] font-semibold text-right ${
                                        isPriceCustom ? 'border-amber-500 text-amber-600 dark:text-amber-400' : ''
                                      }`}
                                      style={{ width: asset?.currency === 'USD' ? '5.5rem' : '6.5rem' }}
                                      title={`Ketik harga pasar untuk simulasi. Normal: ${formatPriceDisplay(asset?.defaultPrice ?? 1, asset?.currency)}`}
                                      aria-label={`Harga pasar ${item.symbol}`}
                                    />
                                    {isPriceCustom && (
                                      <button
                                        type="button"
                                        onClick={() =>
                                          onUpdateHolding(item.assetId, {
                                            currentPrice: asset?.defaultPrice ?? 1,
                                          })
                                        }
                                        aria-label="Reset harga ke normal"
                                      className="ui-text-muted hover:text-emerald-500 p-1.5 rounded transition"
                                        title={`Reset ke harga pasar normal (${formatPriceDisplay(asset?.defaultPrice ?? 1, asset?.currency)})`}
                                      >
                                        <RotateCcw className="h-2.5 w-2.5" />
                                      </button>
                                    )}
                                    <button
                                      type="button"
                                      onClick={() =>
                                        onUpdateHolding(item.assetId, {
                                          isNominalOnly: true,
                                          currentPrice: 1,
                                        })
                                      }
                                      aria-label="Jadikan aset nominal murni"
                                      className="ui-text-muted hover:text-sky-500 p-1.5 rounded transition"
                                      title="Jadikan Aset Nominal Murni (Abaikan harga pasar unit)"
                                    >
                                      <Tag className="h-2.5 w-2.5" />
                                    </button>
                                  </div>

                                  {/* Quick Drop Chips & Modal Beli (Collapsible via showPriceSimControls, or keep visible if actively modified) */}
                                   {(showPriceSimControls ||
                                     h.avgBuyPrice !== undefined ||
                                     Math.abs(h.currentPrice - (asset?.defaultPrice ?? 1)) > 0.01) && (
                                     <div className="pt-1 mt-1 border-t border-black/5 dark:border-white/5 space-y-1">
                                       {/* Quick Drop Chips: [-10%] [-20%] [-35%] [-50%] */}
                                    <div className="flex items-center gap-1 pt-0.5">
                                      <span className="ui-text-muted text-[9px] select-none">Drop:</span>
                                      {[10, 20, 35, 50].map((dropPct) => {
                                        const defaultP = asset?.defaultPrice ?? 1;
                                        const discountedPrice = Number(
                                          (defaultP * (1 - dropPct / 100)).toFixed(asset?.currency === 'USD' && defaultP < 10 ? 4 : 2)
                                        );
                                        const isActive = Math.abs(h.currentPrice - discountedPrice) < 0.01;
                                        return (
                                          <button
                                            key={dropPct}
                                            type="button"
                                            onClick={() =>
                                              onUpdateHolding(item.assetId, {
                                                currentPrice: discountedPrice,
                                              })
                                            }
                                            className={`rounded px-1 py-0.2 font-mono text-[9px] transition ${
                                              isActive
                                                ? 'bg-rose-500 text-white font-bold'
                                                : 'ui-subtle ui-text-muted hover:text-rose-500'
                                            }`}
                                            title={`Simulasi harga anjlok -${dropPct}% menjadi ${formatPriceDisplay(discountedPrice, asset?.currency)}`}
                                          >
                                            -{dropPct}%
                                          </button>
                                        );
                                      })}
                                    </div>
  
                                    {/* Feature 5: Optional Avg Buy Price (Modal Beli Rata-Rata) */}
                                    <div className="flex items-center gap-1 pt-0.5" title="Harga modal beli rata-rata untuk tracking Unrealized P&L & proteksi selective-profit-trim">
                                      <span className="ui-text-muted font-mono text-[9px] select-none">Avg:</span>
                                      <input
                                        type="number"
                                        step={asset?.currency === 'USD' ? (h.currentPrice < 10 ? '0.01' : '1') : '25'}
                                        min={0}
                                        placeholder="Modal Beli"
                                        value={h.avgBuyPrice ?? ''}
                                        onChange={(e) => {
                                          const val = e.target.value ? Number(e.target.value) : undefined;
                                          onUpdateHolding(item.assetId, {
                                            avgBuyPrice: val && val > 0 ? val : undefined,
                                          });
                                        }}
                                        className="ui-input rounded px-1.5 py-0.5 font-mono text-[10px] text-right"
                                        style={{ width: asset?.currency === 'USD' ? '4.8rem' : '5.8rem' }}
                                        aria-label={`Harga modal beli rata-rata ${item.symbol}`}
                                      />
                                      {h.avgBuyPrice && (
                                        <button
                                          type="button"
                                          onClick={() =>
                                            onUpdateHolding(item.assetId, {
                                              avgBuyPrice: undefined,
                                            })
                                          }
                                          aria-label="Hapus modal beli"
                                          className="ui-text-muted hover:text-rose-500 p-1.5 rounded transition text-[10px]"
                                          title="Hapus modal beli"
                                        >
                                          ✕
                                        </button>
                                      )}
                                    </div>
                                     </div>
                                   )}
                                </div>
                              </div>
                            );
                          })()}
                        </th>

                        <td className="ui-border border-b px-3 py-2.5 text-right">
                          {holdingEntryMode === 'nominal' ? (
                            <div className="flex flex-col items-end gap-1">
                              <FormattedNumberInput
                                step={1_000_000}
                                min={0}
                                value={h.currentValueIdr}
                                onChange={(val) =>
                                  onUpdateHolding(item.assetId, {
                                    currentValueIdr: val,
                                  })
                                }
                                className="ui-input w-32 rounded px-2 py-1 text-right font-mono text-xs font-medium"
                                ariaLabel={`Nominal value in IDR for ${item.symbol}`}
                              />
                              <div className="flex items-center gap-1 text-[9px]">
                                <button
                                  type="button"
                                  onClick={() =>
                                    onUpdateHolding(item.assetId, {
                                      currentValueIdr: Math.round(
                                        initialCapitalMenu1Idr *
                                          ((targetWeights[item.assetId] ?? 0) / 100)
                                      ),
                                    })
                                  }
                                  title="Isi otomatis sesuai porsi Modal Awal Menu 1"
                                  className="ui-subtle ui-text-muted rounded px-1 py-0.5 hover:text-emerald-600"
                                >
                                  =Default M1
                                </button>
                                <button
                                  type="button"
                                  onClick={() =>
                                    onUpdateHolding(item.assetId, {
                                      currentValueIdr: 0,
                                    })
                                  }
                                  className="ui-subtle ui-text-muted rounded px-1 py-0.5 hover:text-rose-500"
                                >
                                  Rp 0
                                </button>
                              </div>
                            </div>
                          ) : holdingEntryMode === 'percent' ? (
                            <div className="flex flex-col items-end gap-1">
                              <div className="flex items-center gap-1">
                                <input
                                  type="number"
                                  step={0.5}
                                  min={0}
                                  max={100}
                                  value={Number(item.currentWeightPercent.toFixed(1))}
                                  onChange={(e) => {
                                    const pct = Math.max(
                                      0,
                                      Math.min(100, Number(e.target.value))
                                    );
                                    const baseTotal =
                                      percentReferenceTotalIdr > 0
                                        ? percentReferenceTotalIdr
                                        : (rebalanceResult.initialTotalIdr > 0
                                          ? rebalanceResult.initialTotalIdr
                                          : initialCapitalMenu1Idr);
                                    if (percentReferenceTotalIdr === 0 && baseTotal > 0) {
                                      setPercentReferenceTotalIdr(baseTotal);
                                    }
                                    onUpdateHolding(item.assetId, {
                                      currentValueIdr: Math.round(
                                        baseTotal * (pct / 100)
                                      ),
                                    });
                                  }}
                                  className="ui-input w-20 rounded px-2 py-1 text-right font-mono text-xs font-semibold"
                                  aria-label={`Current weight percentage for ${item.symbol}`}
                                />
                                <span className="ui-text-muted font-mono text-xs">
                                  %
                                </span>
                              </div>
                              <span className="ui-text-muted font-mono text-[10px]">
                                ≈ {formatIdr(h.currentValueIdr, true)}
                              </span>
                            </div>
                          ) : (
                            <div className="flex flex-col items-end gap-1">
                              <div className="flex items-center gap-1">
                                <input
                                  type="number"
                                  step="any"
                                  value={h.units}
                                  onChange={(e) =>
                                    onUpdateHolding(item.assetId, {
                                      units: Math.max(0, Number(e.target.value)),
                                    })
                                  }
                                  className="ui-input w-20 rounded px-1.5 py-0.5 text-right font-mono text-xs"
                                  aria-label={`Units held for ${item.symbol}`}
                                />
                                <span className="ui-text-muted text-[10px]">unit</span>
                              </div>
                              <div className="flex items-center gap-1">
                                <span className="ui-text-muted text-[10px]">@</span>
                                <input
                                  type="number"
                                  step="any"
                                  value={h.currentPrice}
                                  onChange={(e) =>
                                    onUpdateHolding(item.assetId, {
                                      currentPrice: Math.max(
                                        0.01,
                                        Number(e.target.value)
                                      ),
                                    })
                                  }
                                  className="ui-input w-20 rounded px-1.5 py-0.5 text-right font-mono text-[10px]"
                                  aria-label={`Current unit price for ${item.symbol}`}
                                />
                              </div>
                            </div>
                          )}
                        </td>

                        <td className="ui-border ui-text-secondary border-b px-3 py-2.5 text-right font-mono">
                          <div>{formatIdr(item.postShockValueIdr)}</div>
                          {h.shockPercent !== 0 && (
                            <div
                              className={`text-[10px] ${
                                h.shockPercent > 0
                                  ? 'text-emerald-600 dark:text-emerald-400'
                                  : 'text-rose-600 dark:text-rose-400'
                              }`}
                            >
                              Shock{' '}
                              {h.shockPercent > 0
                                ? `+${h.shockPercent}%`
                                : `${h.shockPercent}%`}
                            </div>
                          )}
                        </td>

                        <td className="ui-border border-b px-2.5 py-2.5 text-right font-mono">
                          <div className="ui-text-main font-semibold">
                            {item.currentWeightPercent.toFixed(1)}%{' '}
                            <span className="ui-text-muted font-normal">
                              / {item.targetWeightPercent.toFixed(1)}%
                            </span>
                          </div>
                          {item.tacticalSignal && (
                            <div className="pt-0.5">
                              <span
                                className={`inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[9px] font-sans font-medium border ${
                                  item.tacticalSignal.tiltMultiplierPercent > 0
                                    ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/20'
                                    : item.tacticalSignal.tiltMultiplierPercent < 0
                                      ? 'bg-rose-500/10 text-rose-700 dark:text-rose-300 border-rose-500/20'
                                      : 'bg-zinc-500/10 text-zinc-600 dark:text-zinc-400 border-zinc-500/20'
                                }`}
                                title={item.tacticalSignal.reason}
                              >
                                {item.tacticalSignal.badgeLabel}
                              </span>
                            </div>
                          )}
                          <div
                            className={`text-[10px] font-medium ${
                              item.isDriftBreached
                                ? 'text-amber-600 dark:text-amber-400'
                                : 'ui-text-muted'
                            }`}
                          >
                            Drift: {item.absoluteDriftPercent > 0 ? '+' : ''}
                            {item.absoluteDriftPercent.toFixed(1)}%
                          </div>
                        </td>

                        <td className="ui-border ui-text-main border-b px-3 py-2.5 text-right font-mono font-semibold">
                          {formatIdr(item.targetValueIdr)}
                        </td>

                        <td className="ui-border border-b px-3 py-2.5 text-right">
                          {item.action === 'BUY' ? (
                            <div className="inline-flex flex-col items-end rounded border border-emerald-500/30 bg-emerald-500/10 px-2 py-1">
                              <div className="flex items-center gap-1 font-mono text-xs font-bold text-emerald-700 dark:text-emerald-300">
                                <ArrowUpRight className="h-3.5 w-3.5" />
                                <span>BUY {formatIdr(item.tradeAmountIdr)}</span>
                              </div>
                              <div className="ui-text-muted font-mono text-[10px]">
                                {item.isNominalOnly
                                  ? 'Nominal Murni'
                                  : asset?.currency === 'USD'
                                    ? `${formatUsd(item.tradeAmountUsd)} (${item.tradeUnits} u)`
                                    : item.tradeLotsInteger !== undefined ? (
                                      <div className="flex items-center gap-1">
                                        <span>≈ {item.tradeLotsInteger} Lot ({item.tradeLotsInteger * 100} lbr)</span>
                                        {enableIdxLotRounding && (
                                          <span className="inline-flex items-center gap-0.5 ml-1">
                                            <button
                                              type="button"
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                handleAdjustLotOverride(item.assetId, -1);
                                              }}
                                              className="h-7 w-7 rounded-md ui-card border ui-border ui-text-main hover:border-emerald-500/50 hover:bg-emerald-500/10 hover:text-emerald-600 dark:hover:text-emerald-400 active:scale-95 transition font-mono text-xs font-bold flex items-center justify-center leading-none shadow-2xs"
                                              title="Kurangi 1 Lot"
                                aria-label="Kurangi 1 Lot"
                                            >
                                              -
                                            </button>
                                            <button
                                              type="button"
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                handleAdjustLotOverride(item.assetId, 1);
                                              }}
                                              className="h-7 w-7 rounded-md ui-card border ui-border ui-text-main hover:border-emerald-500/50 hover:bg-emerald-500/10 hover:text-emerald-600 dark:hover:text-emerald-400 active:scale-95 transition font-mono text-xs font-bold flex items-center justify-center leading-none shadow-2xs"
                                              title="Tambah 1 Lot"
                                aria-label="Tambah 1 Lot"
                                            >
                                              +
                                            </button>
                                            {lotOverrides[item.assetId] !== undefined && lotOverrides[item.assetId] !== 0 && (
                                              <button
                                                type="button"
                                                onClick={(e) => {
                                                  e.stopPropagation();
                                                  handleResetLotOverride(item.assetId);
                                                }}
                                                className="min-w-6 min-h-6 text-[11px] text-amber-600 dark:text-amber-500 hover:underline ml-0.5"
                                                title="Reset ke hitungan lot awal"
                                aria-label="Reset ke hitungan lot awal"
                                              >
                                                ↺
                                              </button>
                                            )}
                                          </span>
                                        )}
                                      </div>
                                    ) : item.tradeLots !== undefined
                                      ? `≈ ${item.tradeLots} Lot (${item.tradeUnits} lbr)`
                                      : `≈ ${item.tradeUnits} unit`}
                              </div>
                              {enableBrokerFees &&
                                item.estimatedFeeIdr !== undefined &&
                                item.estimatedFeeIdr > 0 && (
                                  <div className="font-mono text-[9px] text-amber-600 dark:text-amber-400">
                                    Fee: ≈ {formatIdr(item.estimatedFeeIdr)}
                                  </div>
                                )}
                              {item.tradeLotsRemainderIdr !== undefined &&
                                Math.abs(item.tradeLotsRemainderIdr) > 100 && (
                                  <div className="ui-text-muted font-mono text-[9px]">
                                    Sisa: {formatIdr(item.tradeLotsRemainderIdr)}
                                  </div>
                                )}
                            </div>
                          ) : item.action === 'SELL' ? (
                            <div className="inline-flex flex-col items-end rounded border border-rose-500/30 bg-rose-500/10 px-2 py-1">
                              <div className="flex items-center gap-1 font-mono text-xs font-bold text-rose-700 dark:text-rose-300">
                                <ArrowDownRight className="h-3.5 w-3.5" />
                                <span>
                                  SELL {formatIdr(Math.abs(item.tradeAmountIdr))}
                                </span>
                              </div>
                              <div className="ui-text-muted font-mono text-[10px]">
                                {item.isNominalOnly
                                  ? 'Nominal Murni'
                                  : asset?.currency === 'USD'
                                    ? `${formatUsd(Math.abs(item.tradeAmountUsd))} (${Math.abs(item.tradeUnits)} u)`
                                    : item.tradeLotsInteger !== undefined ? (
                                      <div className="flex items-center gap-1">
                                        <span>≈ {Math.abs(item.tradeLotsInteger)} Lot ({Math.abs(item.tradeLotsInteger * 100)} lbr)</span>
                                        {enableIdxLotRounding && (
                                          <span className="inline-flex items-center gap-0.5 ml-1">
                                            <button
                                              type="button"
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                handleAdjustLotOverride(item.assetId, -1);
                                              }}
                                              className="h-7 w-7 rounded-md ui-card border ui-border ui-text-main hover:border-emerald-500/50 hover:bg-emerald-500/10 hover:text-emerald-600 dark:hover:text-emerald-400 active:scale-95 transition font-mono text-xs font-bold flex items-center justify-center leading-none shadow-2xs"
                                              title="Kurangi 1 Lot"
                                aria-label="Kurangi 1 Lot"
                                            >
                                              -
                                            </button>
                                            <button
                                              type="button"
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                handleAdjustLotOverride(item.assetId, 1);
                                              }}
                                              className="h-7 w-7 rounded-md ui-card border ui-border ui-text-main hover:border-emerald-500/50 hover:bg-emerald-500/10 hover:text-emerald-600 dark:hover:text-emerald-400 active:scale-95 transition font-mono text-xs font-bold flex items-center justify-center leading-none shadow-2xs"
                                              title="Tambah 1 Lot"
                                aria-label="Tambah 1 Lot"
                                            >
                                              +
                                            </button>
                                            {lotOverrides[item.assetId] !== undefined && lotOverrides[item.assetId] !== 0 && (
                                              <button
                                                type="button"
                                                onClick={(e) => {
                                                  e.stopPropagation();
                                                  handleResetLotOverride(item.assetId);
                                                }}
                                                className="min-w-6 min-h-6 text-[11px] text-amber-600 dark:text-amber-500 hover:underline ml-0.5"
                                                title="Reset ke hitungan lot awal"
                                aria-label="Reset ke hitungan lot awal"
                                              >
                                                ↺
                                              </button>
                                            )}
                                          </span>
                                        )}
                                      </div>
                                    ) : item.tradeLots !== undefined
                                      ? `≈ ${Math.abs(item.tradeLots)} Lot (${Math.abs(item.tradeUnits)} lbr)`
                                      : `≈ ${Math.abs(item.tradeUnits)} unit`}
                              </div>
                              {enableBrokerFees &&
                                item.estimatedFeeIdr !== undefined &&
                                item.estimatedFeeIdr > 0 && (
                                  <div className="font-mono text-[9px] text-amber-600 dark:text-amber-400">
                                    Fee &amp; Pajak: ≈{' '}
                                    {formatIdr(item.estimatedFeeIdr)}
                                  </div>
                                )}
                            </div>
                          ) : (
                            <div className="inline-flex flex-col items-end">
                              <span className="ui-subtle ui-text-muted rounded px-2 py-0.5 font-mono text-xs">
                                HOLD
                              </span>
                              {item.isDustFiltered && (
                                <span className="text-[9px] text-emerald-600 dark:text-emerald-400 font-sans font-medium">
                                  Anti-Dust (&lt; 25rb)
                                </span>
                              )}
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  }))}
                </tbody>
              </table>
            </div>
          ) : (
            /* Mode 2: Zero-Horizontal-Scroll Mobile Card View for Rebalancer */
            <div id="tour-rebalance-cards" className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
              {filteredTableItems.length === 0 ? (
                <div className="col-span-full py-8 text-center text-xs ui-text-muted ui-card rounded-xl border ui-border p-6">
                  Tidak ada aset dengan tindakan "{tableActionFilter.toUpperCase()}".
                  <button
                    type="button"
                    onClick={() => setTableActionFilter('all')}
                    className="ml-2 font-semibold text-emerald-600 dark:text-emerald-400 hover:underline"
                  >
                    Tampilkan Semua Aset
                  </button>
                </div>
              ) : (
                filteredTableItems.map((item) => {
                const asset = allAssets.find((a) => a.id === item.assetId)!;
                const h = holdings[item.assetId] ?? {
                  assetId: item.assetId,
                  currentValueIdr: 0,
                  units: 0,
                  currentPrice: asset?.defaultPrice ?? 1,
                  shockPercent: 0,
                };
                const isNominal =
                  h.isNominalOnly ??
                  asset?.isNominalOnly ??
                  (asset?.category === 'bonds' || asset?.category === 'money-market');

                return (
                  <div
                    key={item.assetId}
                    className={`rounded-xl border p-3.5 ${
                      item.isDriftBreached
                        ? 'border-amber-500/40 bg-amber-500/5'
                        : 'ui-subtle ui-border'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span
                          className="h-3 w-3 shrink-0 rounded-full"
                          style={{ backgroundColor: item.color }}
                        />
                        <div>
                          <div className="ui-text-main text-xs font-bold flex items-center gap-1.5 flex-wrap">
                            <span>{item.symbol}</span>
                            <span className="ui-text-muted font-normal">
                              • {item.name}
                            </span>
                            {item.unrealizedGainPercent !== undefined && (
                              <span
                                className={`rounded px-1 py-0.2 font-mono text-[9px] font-bold ${
                                  item.unrealizedGainPercent >= 0
                                    ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                                    : 'bg-rose-500/15 text-rose-600 dark:text-rose-400'
                                }`}
                                title={`Unrealized P&L: ${item.unrealizedGainPercent >= 0 ? '+' : ''}${item.unrealizedGainPercent}% (${formatIdr(item.unrealizedGainIdr ?? 0)})`}
                              >
                                P&L {item.unrealizedGainPercent >= 0 ? '+' : ''}{item.unrealizedGainPercent}%
                              </span>
                            )}
                          </div>
                          {(() => {
                            if (isNominal) {
                              return (
                                <div className="flex items-center gap-1.5 pt-1">
                                  <span
                                    className="inline-flex items-center gap-1 rounded bg-sky-500/10 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-sky-600 dark:text-sky-400 border border-sky-500/20 select-none"
                                    title="Aset bebas harga pasar. Dikelola murni berdasarkan saldo nominal Rupiah."
                                  >
                                    Nominal Murni
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      onUpdateHolding(item.assetId, {
                                        isNominalOnly: false,
                                        currentPrice: asset?.defaultPrice ?? 1,
                                      })
                                    }
                                    className="ui-text-muted hover:ui-text-main text-[9px] underline decoration-dotted transition"
                                    title="Ubah ke mode input harga pasar per unit"
                                  >
                                    Atur Harga
                                  </button>
                                </div>
                              );
                            }

                            const priceDiffPct = asset?.defaultPrice
                              ? ((h.currentPrice - asset.defaultPrice) / asset.defaultPrice) * 100
                              : 0;
                            const isPriceCustom = Math.abs(priceDiffPct) >= 0.1;

                            return (
                              <div className="space-y-1 pt-1">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <span className="ui-text-muted text-[10px]">Harga:</span>
                                  <span className="ui-text-muted font-mono text-[10px]">
                                    {asset?.currency === 'USD' ? '$' : 'Rp'}
                                  </span>
                                  <input
                                    type="number"
                                    step={asset?.currency === 'USD' ? (h.currentPrice < 10 ? '0.01' : '1') : '25'}
                                    min={0.0001}
                                    value={h.currentPrice}
                                    onChange={(e) =>
                                      onUpdateHolding(item.assetId, {
                                        currentPrice: Math.max(0.000001, Number(e.target.value)),
                                      })
                                    }
                                    aria-label={`Harga pasar ${item.symbol}`}
                                    className={`ui-input w-24 rounded px-1.5 py-0.5 font-mono text-[11px] font-semibold text-right ${
                                      isPriceCustom ? 'border-amber-500 text-amber-600 dark:text-amber-400' : ''
                                    }`}
                                  />
                                  {isPriceCustom && (
                                    <span
                                      className={`rounded px-1 py-0.2 font-mono text-[9px] font-bold ${
                                        priceDiffPct < 0
                                          ? 'bg-rose-500/15 text-rose-600 dark:text-rose-400'
                                          : 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                                      }`}
                                    >
                                      {priceDiffPct < 0 ? '▼' : '▲'} {Math.abs(priceDiffPct).toFixed(1)}%
                                    </span>
                                  )}
                                  {isPriceCustom && (
                                    <button
                                      type="button"
                                      onClick={() =>
                                        onUpdateHolding(item.assetId, {
                                          currentPrice: asset?.defaultPrice ?? 1,
                                        })
                                      }
                                      aria-label="Reset harga ke normal"
                                      className="ui-text-muted hover:text-emerald-500 p-1.5 rounded transition"
                                      title="Reset ke harga pasar normal"
                                    >
                                      <RotateCcw className="h-2.5 w-2.5" />
                                    </button>
                                  )}
                                  <button
                                    type="button"
                                    onClick={() =>
                                      onUpdateHolding(item.assetId, {
                                        isNominalOnly: true,
                                        currentPrice: 1,
                                      })
                                    }
                                    aria-label="Jadikan aset nominal murni"
                                      className="ui-text-muted hover:text-sky-500 p-1.5 rounded transition"
                                    title="Jadikan Aset Nominal Murni (Abaikan harga pasar unit)"
                                  >
                                    <Tag className="h-2.5 w-2.5" />
                                  </button>
                                </div>

                                {/* Feature 5: Optional Avg Buy Price (Modal Beli Rata-Rata) */}
                                <div className="flex items-center gap-1 pt-0.5" title="Harga modal beli rata-rata untuk tracking Unrealized P&L & proteksi selective-profit-trim">
                                  <span className="ui-text-muted font-mono text-[9px] select-none">Avg:</span>
                                  <span className="ui-text-muted font-mono text-[9px] select-none">
                                    {asset?.currency === 'USD' ? '$' : 'Rp'}
                                  </span>
                                  <input
                                    type="number"
                                    step={asset?.currency === 'USD' ? (h.currentPrice < 10 ? '0.01' : '1') : '25'}
                                    min={0}
                                    placeholder="Modal Beli"
                                    value={h.avgBuyPrice ?? ''}
                                    onChange={(e) => {
                                      const val = e.target.value ? Number(e.target.value) : undefined;
                                      onUpdateHolding(item.assetId, {
                                        avgBuyPrice: val && val > 0 ? val : undefined,
                                      });
                                    }}
                                    className="ui-input rounded px-1.5 py-0.5 font-mono text-[10px] text-right"
                                    style={{ width: asset?.currency === 'USD' ? '4.8rem' : '5.8rem' }}
                                    aria-label={`Harga modal beli rata-rata ${item.symbol}`}
                                  />
                                  {h.avgBuyPrice && (
                                    <button
                                      type="button"
                                      onClick={() =>
                                        onUpdateHolding(item.assetId, {
                                          avgBuyPrice: undefined,
                                        })
                                      }
                                      aria-label="Hapus modal beli"
                                        className="ui-text-muted hover:text-rose-500 p-1.5 rounded transition text-[10px]"
                                      title="Hapus modal beli"
                                    >
                                      ✕
                                    </button>
                                  )}
                                </div>

                                {/* Quick Drop Chips */}
                                <div className="flex items-center gap-1">
                                  <span className="ui-text-muted text-[9px]">Drop:</span>
                                  {[10, 20, 35, 50].map((dropPct) => {
                                    const defaultP = asset?.defaultPrice ?? 1;
                                    const discountedPrice = Number(
                                      (defaultP * (1 - dropPct / 100)).toFixed(asset?.currency === 'USD' && defaultP < 10 ? 4 : 2)
                                    );
                                    const isActive = Math.abs(h.currentPrice - discountedPrice) < 0.01;
                                    return (
                                      <button
                                        key={dropPct}
                                        type="button"
                                        onClick={() =>
                                          onUpdateHolding(item.assetId, {
                                            currentPrice: discountedPrice,
                                          })
                                        }
                                        className={`rounded px-1.5 py-0.2 font-mono text-[9px] transition ${
                                          isActive
                                            ? 'bg-rose-500 text-white font-bold'
                                            : 'ui-subtle ui-text-muted hover:text-rose-500'
                                        }`}
                                      >
                                        -{dropPct}%
                                      </button>
                                    );
                                  })}
                                </div>
                              </div>
                            );
                          })()}
                        </div>
                      </div>

                      {item.action === 'BUY' ? (
                        <span className="rounded border border-emerald-500/40 bg-emerald-500/15 px-2 py-0.5 font-mono text-xs font-bold text-emerald-700 dark:text-emerald-300">
                          BUY {formatIdr(item.tradeAmountIdr, true)}
                        </span>
                      ) : item.action === 'SELL' ? (
                        <span className="rounded border border-rose-500/40 bg-rose-500/15 px-2 py-0.5 font-mono text-xs font-bold text-rose-700 dark:text-rose-300">
                          SELL {formatIdr(Math.abs(item.tradeAmountIdr), true)}
                        </span>
                      ) : (
                        <div className="flex flex-col items-end">
                          <div className="flex items-center gap-1">
                            <span className="ui-card ui-text-muted rounded px-2 py-0.5 font-mono text-xs">
                              HOLD
                            </span>
                            {enableIdxLotRounding && item.tradeLotsInteger !== undefined && (
                              <span className="inline-flex items-center gap-0.5 ml-1">
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleAdjustLotOverride(item.assetId, -1);
                                  }}
                                  className="h-7 w-7 rounded-md ui-card border ui-border ui-text-main hover:border-emerald-500/50 hover:bg-emerald-500/10 hover:text-emerald-600 dark:hover:text-emerald-400 active:scale-95 transition font-mono text-xs font-bold flex items-center justify-center leading-none shadow-2xs"
                                  title="Kurangi 1 Lot Jual"
                                aria-label="Kurangi 1 Lot Jual"
                                >
                                  -
                                </button>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleAdjustLotOverride(item.assetId, 1);
                                  }}
                                  className="h-7 w-7 rounded-md ui-card border ui-border ui-text-main hover:border-emerald-500/50 hover:bg-emerald-500/10 hover:text-emerald-600 dark:hover:text-emerald-400 active:scale-95 transition font-mono text-xs font-bold flex items-center justify-center leading-none shadow-2xs"
                                  title="Tambah 1 Lot Beli"
                                aria-label="Tambah 1 Lot Beli"
                                >
                                  +
                                </button>
                                {lotOverrides[item.assetId] !== undefined && lotOverrides[item.assetId] !== 0 && (
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleResetLotOverride(item.assetId);
                                    }}
                                    className="min-w-6 min-h-6 text-[11px] text-amber-600 dark:text-amber-500 hover:underline ml-0.5"
                                    title="Reset ke hitungan lot awal"
                                aria-label="Reset ke hitungan lot awal"
                                  >
                                    ↺
                                  </button>
                                )}
                              </span>
                            )}
                          </div>
                          {item.isDustFiltered && (
                            <span className="text-[9px] text-emerald-600 dark:text-emerald-400 font-sans font-medium">
                              Anti-Dust (&lt; 25rb)
                            </span>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Editable Input Row inside Card */}
                    <div className="ui-card mt-3 rounded-lg p-2.5 text-xs">
                      <div className="flex items-center justify-between gap-2">
                        <span className="ui-text-secondary font-medium">
                          {holdingEntryMode === 'nominal'
                            ? 'Nilai Saat Ini (Rp):'
                            : holdingEntryMode === 'percent'
                              ? 'Porsi Saat Ini (%):'
                              : 'Jumlah Unit:'}
                        </span>
                        {holdingEntryMode === 'nominal' ? (
                          <FormattedNumberInput
                            step={1_000_000}
                            min={0}
                            value={h.currentValueIdr}
                            onChange={(val) =>
                              onUpdateHolding(item.assetId, {
                                currentValueIdr: val,
                              })
                            }
                            className="ui-input w-36 rounded px-2 py-1 text-right font-mono text-xs font-bold"
                            ariaLabel={`Nominal value in IDR for ${item.symbol}`}
                          />
                        ) : holdingEntryMode === 'percent' ? (
                          <div className="flex items-center gap-1">
                            <input
                              type="number"
                              step={0.5}
                              min={0}
                              max={100}
                              value={Number(item.currentWeightPercent.toFixed(1))}
                              onChange={(e) => {
                                const pct = Math.max(
                                  0,
                                  Math.min(100, Number(e.target.value))
                                );
                                const baseTotal =
                                  percentReferenceTotalIdr > 0
                                    ? percentReferenceTotalIdr
                                    : (rebalanceResult.initialTotalIdr > 0
                                      ? rebalanceResult.initialTotalIdr
                                      : initialCapitalMenu1Idr);
                                if (percentReferenceTotalIdr === 0 && baseTotal > 0) {
                                  setPercentReferenceTotalIdr(baseTotal);
                                }
                                onUpdateHolding(item.assetId, {
                                  currentValueIdr: Math.round(
                                    baseTotal * (pct / 100)
                                  ),
                                });
                              }}
                              className="ui-input w-24 rounded px-2 py-1 text-right font-mono text-xs font-bold"
                              aria-label={`Current weight percentage for ${item.symbol}`}
                            />
                            <span className="ui-text-muted font-mono">%</span>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1.5">
                            <input
                              type="number"
                              step="any"
                              value={h.units}
                              onChange={(e) =>
                                onUpdateHolding(item.assetId, {
                                  units: Math.max(0, Number(e.target.value)),
                                })
                              }
                              className="ui-input w-24 rounded px-2 py-1 text-right font-mono text-xs font-bold"
                              aria-label={`Units held for ${item.symbol}`}
                              title="Jumlah unit/lembar"
                            />
                            {!isNominal && (
                              <div className="flex items-center gap-0.5">
                                <span className="ui-text-muted text-[10px]">@</span>
                                <input
                                  type="number"
                                  step={asset?.currency === 'USD' ? (h.currentPrice < 10 ? '0.01' : '1') : '25'}
                                  min={0.0001}
                                  value={h.currentPrice}
                                  onChange={(e) =>
                                    onUpdateHolding(item.assetId, {
                                      currentPrice: Math.max(0.000001, Number(e.target.value)),
                                    })
                                  }
                                  className="ui-input w-20 rounded px-1.5 py-1 text-right font-mono text-[11px]"
                                  aria-label={`Harga satuan ${item.symbol}`}
                                  title={`Harga satuan pasar (${asset?.currency === 'USD' ? '$' : 'Rp'})`}
                                />
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                      <div className="mt-1.5 flex items-center justify-end gap-1.5 text-[10px]">
                        <button
                          type="button"
                          onClick={() =>
                            onUpdateHolding(item.assetId, {
                              currentValueIdr: Math.round(
                                initialCapitalMenu1Idr *
                                  ((targetWeights[item.assetId] ?? 0) / 100)
                              ),
                            })
                          }
                          className="ui-subtle ui-text-secondary rounded px-1.5 py-0.5 font-mono hover:text-emerald-600"
                        >
                          =Default Menu 1 (
                          {formatIdr(
                            Math.round(
                              initialCapitalMenu1Idr *
                                ((targetWeights[item.assetId] ?? 0) / 100)
                            ),
                            true
                          )}
                          )
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            onUpdateHolding(item.assetId, {
                              currentValueIdr: 0,
                              units: 0,
                            })
                          }
                          className="ui-subtle ui-text-muted rounded px-1.5 py-0.5 font-mono hover:text-rose-500"
                        >
                          Reset Rp 0
                        </button>
                      </div>
                    </div>

                    {/* Weight & Target Comparison Row */}
                    <div className="mt-2.5 grid grid-cols-3 gap-2 text-center font-mono text-[11px]">
                      <div className="ui-card rounded p-1.5">
                        <div className="ui-text-muted text-[9px] uppercase">
                          Bobot Kini
                        </div>
                        <div className="ui-text-main font-bold">
                          {item.currentWeightPercent.toFixed(1)}%
                        </div>
                      </div>
                      <div className="ui-card rounded p-1.5">
                        <div className="ui-text-muted text-[9px] uppercase">
                          Target
                        </div>
                        <div className="font-bold text-emerald-600 dark:text-emerald-400">
                          {item.targetWeightPercent.toFixed(1)}%
                        </div>
                        {item.tacticalSignal && (
                          <div className="mt-0.5 text-[8px] font-sans">
                            <span
                              className={`rounded px-1 py-0.2 ${
                                item.tacticalSignal.tiltMultiplierPercent > 0
                                  ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                                  : item.tacticalSignal.tiltMultiplierPercent < 0
                                    ? 'bg-rose-500/10 text-rose-700 dark:text-rose-300'
                                    : 'ui-subtle ui-text-muted'
                              }`}
                            >
                              {item.tacticalSignal.badgeLabel}
                            </span>
                          </div>
                        )}
                      </div>
                      <div className="ui-card rounded p-1.5">
                        <div className="ui-text-muted text-[9px] uppercase">
                          Target Rp
                        </div>
                        <div className="ui-text-main font-bold">
                          {formatIdr(item.targetValueIdr, true)}
                        </div>
                      </div>
                    </div>

                    {item.action !== 'HOLD' && (
                      <div
                        className={`mt-2.5 flex flex-col gap-1 rounded-lg px-2.5 py-1.5 font-mono text-xs ${
                          item.action === 'BUY'
                            ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                            : 'bg-rose-500/10 text-rose-700 dark:text-rose-300'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-bold">
                            {item.action === 'BUY' ? 'Beli:' : 'Jual:'}{' '}
                            {formatIdr(Math.abs(item.tradeAmountIdr))}
                          </span>
                          <div className="flex items-center gap-1">
                            <span className="text-[10px]">
                              {asset?.currency === 'USD'
                                ? `${formatUsd(Math.abs(item.tradeAmountUsd))} (${Math.abs(item.tradeUnits)} u)`
                                : item.tradeLotsInteger !== undefined
                                  ? `≈ ${Math.abs(item.tradeLotsInteger)} Lot (${Math.abs(item.tradeLotsInteger * 100)} lbr)`
                                  : item.tradeLots !== undefined
                                    ? `≈ ${Math.abs(item.tradeLots)} Lot`
                                    : `≈ ${Math.abs(item.tradeUnits)} unit`}
                            </span>
                            {enableIdxLotRounding && item.tradeLotsInteger !== undefined && (
                              <span className="inline-flex items-center gap-0.5 ml-1">
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleAdjustLotOverride(item.assetId, -1);
                                  }}
                                  className="h-7 w-7 rounded-md ui-card border ui-border ui-text-main hover:border-emerald-500/50 hover:bg-emerald-500/10 hover:text-emerald-600 dark:hover:text-emerald-400 active:scale-95 transition font-mono text-xs font-bold flex items-center justify-center leading-none shadow-2xs"
                                  title="Kurangi 1 Lot"
                                aria-label="Kurangi 1 Lot"
                                >
                                  -
                                </button>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleAdjustLotOverride(item.assetId, 1);
                                  }}
                                  className="h-7 w-7 rounded-md ui-card border ui-border ui-text-main hover:border-emerald-500/50 hover:bg-emerald-500/10 hover:text-emerald-600 dark:hover:text-emerald-400 active:scale-95 transition font-mono text-xs font-bold flex items-center justify-center leading-none shadow-2xs"
                                  title="Tambah 1 Lot"
                                aria-label="Tambah 1 Lot"
                                >
                                  +
                                </button>
                                {lotOverrides[item.assetId] !== undefined && lotOverrides[item.assetId] !== 0 && (
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleResetLotOverride(item.assetId);
                                    }}
                                    className="min-w-6 min-h-6 text-[11px] text-amber-600 dark:text-amber-500 hover:underline ml-0.5"
                                    title="Reset ke hitungan lot awal"
                                aria-label="Reset ke hitungan lot awal"
                                  >
                                    ↺
                                  </button>
                                )}
                              </span>
                            )}
                          </div>
                        </div>
                        {enableBrokerFees &&
                          item.estimatedFeeIdr !== undefined &&
                          item.estimatedFeeIdr > 0 && (
                            <div className="flex justify-between text-[10px] text-amber-600 dark:text-amber-400">
                              <span>Fee &amp; Pajak:</span>
                              <span>≈ {formatIdr(item.estimatedFeeIdr)}</span>
                            </div>
                          )}
                        {item.tradeLotsRemainderIdr !== undefined &&
                          Math.abs(item.tradeLotsRemainderIdr) > 100 && (
                            <div className="ui-text-muted flex justify-between text-[10px]">
                              <span>Sisa kas pecahan:</span>
                              <span>{formatIdr(item.tradeLotsRemainderIdr)}</span>
                            </div>
                          )}
                      </div>
                    )}
                  </div>
                );
              }))}
            </div>
          )}

          {/* 1-CLICK COMMIT REBALANCE TO HOLDINGS & RECORD SNAPSHOT */}
          <div className="ui-subtle mt-4 flex flex-col gap-2.5 rounded-lg p-3.5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex-1">
              <div className="ui-text-main text-xs font-semibold">
                Sudah Eksekusi Order di Broker/Exchange?
              </div>
              <p className="ui-text-muted text-[11px]">
                Klik tombol di kanan untuk otomatis memperbarui nilai posisi awal ke
                Target (Rp), mereset shock ke 0%, dan mencatat ke Jurnal Rebalancing.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {onOpenOrderSlip && (
                <button
                  type="button"
                  onClick={() => onOpenOrderSlip(rebalanceResult)}
                  className="flex items-center gap-1.5 rounded-lg border border-emerald-500/40 bg-zinc-500/10 px-3 py-1.5 text-xs font-semibold text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/20 transition"
                  title="Buka slip instruksi order yang dikelompokkan berdasarkan aplikasi broker"
                >
                  <Building2 className="h-3.5 w-3.5" />
                  <span>Buka Slip Order Broker</span>
                </button>
              )}
              <input
                type="text"
                value={rebalanceNoteInput}
                onChange={(e) => setRebalanceNoteInput(e.target.value)}
                placeholder="Catatan (mis. Rebalance Q4 / Buy Dip)"
                className="ui-input rounded-lg px-2.5 py-1.5 text-xs sm:w-52"
                aria-label="Rebalance journal note"
              />
              {rebalanceResult.unallocatedCashRemainderIdr !== undefined &&
                rebalanceResult.unallocatedCashRemainderIdr < -100 && (
                  <span className="inline-flex items-center gap-1 rounded-lg bg-rose-500/15 border border-rose-500/30 px-2 py-1 text-[11px] font-mono font-bold text-rose-500">
                    <AlertTriangle className="h-3.5 w-3.5" />
                    <span>Defisit: {formatIdr(Math.abs(rebalanceResult.unallocatedCashRemainderIdr))}</span>
                  </span>
                )}
              <button
                type="button"
                onClick={handleApplyAndRecord}
                className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-emerald-500 shadow-sm"
              >
                <Check className="h-3.5 w-3.5" />
                <span>
                  {committedBanner
                    ? 'Tersimpan ke Jurnal!'
                    : 'Catat & Terapkan Rebalance Ini'}
                </span>
              </button>
            </div>
          </div>
            </>
          ) : (
            <div className="pt-2 text-xs ui-text-muted flex items-center justify-between">
              <span>Tabel instruksi rebalancing disembunyikan.</span>
              <button
                type="button"
                onClick={() => toggleSectionCollapse('rebalanceTable')}
                className="text-emerald-600 dark:text-emerald-400 font-semibold hover:underline"
              >
                Buka Tabel Instruksi &rarr;
              </button>
            </div>
          )}
        </div>

        {/* Right 4 Cols: Drift Chart & Cashflow Summary (Sticky on Desktop) */}
        <div className="space-y-5 lg:col-span-4 lg:sticky lg:top-20 lg:self-start">
          <div className="ui-card rounded-xl p-5">
            <h3 className="ui-text-main text-sm font-bold">
              Bobot Saat Ini vs Target Optimal
            </h3>
            <p className="ui-text-muted mt-1 text-xs">
              Pergeseran bobot (drift) dibandingkan target:
            </p>

            <div className="mt-4 h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={chartData}
                  margin={{ top: 8, right: 8, left: -18, bottom: 0 }}
                >
                  <XAxis dataKey="symbol" stroke="#71717a" fontSize={11} />
                  <YAxis
                    stroke="#71717a"
                    fontSize={11}
                    tickFormatter={(v) => `${v}%`}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'var(--bg-card)',
                      borderColor: 'var(--border-subtle)',
                      color: 'var(--text-main)',
                      borderRadius: '0.5rem',
                      fontSize: '12px',
                    }}
                    itemStyle={{ color: 'var(--text-main)' }}
                    labelStyle={{ color: 'var(--text-main)', fontWeight: 600 }}
                    formatter={(val: number, name: string) => [`${val}%`, name]}
                  />
                  <Legend wrapperStyle={{ fontSize: '11px' }} />
                  <Bar
                    dataKey="Current"
                    name="Saat Ini (%)"
                    fill="#8F580A"
                    radius={[4, 4, 0, 0]}
                  />
                  <Bar
                    dataKey="Target"
                    name="Target (%)"
                    fill="var(--accent-primary)"
                    radius={[4, 4, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="ui-card rounded-xl p-5">
            <h3 className="ui-text-main text-sm font-bold">
              Ringkasan Arus Kas Rebalancing
            </h3>
            <div className="mt-3 space-y-2.5 text-xs">
              <div className="ui-border flex justify-between border-b pb-2">
                <span className="ui-text-muted">Total Aset Dijual:</span>
                <span className="font-mono font-semibold text-rose-600 dark:text-rose-400">
                  {formatIdr(rebalanceResult.totalSellIdr)}
                </span>
              </div>
              <div className="ui-border flex justify-between border-b pb-2">
                <span className="ui-text-muted">Top-Up Kas (DCA):</span>
                <span className="ui-text-main font-mono font-semibold">
                  {formatIdr(rebalanceResult.cashInjectionIdr)}
                </span>
              </div>
              <div className="ui-border flex justify-between border-b pb-2">
                <span className="ui-text-muted">Total Aset Dibeli:</span>
                <span className="font-mono font-semibold text-emerald-600 dark:text-emerald-400">
                  {formatIdr(rebalanceResult.totalBuyIdr)}
                </span>
              </div>
              {enableBrokerFees &&
                rebalanceResult.totalEstimatedFeeIdr !== undefined &&
                rebalanceResult.totalEstimatedFeeIdr > 0 && (
                  <div className="ui-border flex justify-between border-b pb-2 text-amber-600 dark:text-amber-400">
                    <span>Estimasi Fee Broker &amp; Pajak:</span>
                    <span className="font-mono font-semibold">
                      ≈ {formatIdr(rebalanceResult.totalEstimatedFeeIdr)}
                    </span>
                  </div>
                )}
              {rebalanceResult.unallocatedCashRemainderIdr !== undefined &&
                Math.abs(rebalanceResult.unallocatedCashRemainderIdr) > 100 && (
                  <div
                    className={`ui-border flex items-center justify-between border-b pb-2 ${
                      rebalanceResult.unallocatedCashRemainderIdr < 0
                        ? 'text-rose-500 font-bold'
                        : 'text-emerald-600 dark:text-emerald-400'
                    }`}
                  >
                    <span>
                      {rebalanceResult.unallocatedCashRemainderIdr < 0
                        ? 'Defisit Kas (Kekurangan Dana):'
                        : 'Sisa Kas Belum Terpakai:'}
                    </span>
                    <div className="flex items-center gap-1.5">
                      <span className="font-mono font-semibold">
                        {formatIdr(rebalanceResult.unallocatedCashRemainderIdr)}
                      </span>
                      {rebalanceResult.unallocatedCashRemainderIdr < 0 && (
                        <button
                          type="button"
                          onClick={() => {
                            const deficit = Math.abs(rebalanceResult.unallocatedCashRemainderIdr!);
                            setCashInjectionIdr(cashInjectionIdr + Math.ceil(deficit));
                          }}
                          className="rounded bg-rose-500/15 hover:bg-rose-500/25 text-rose-600 dark:text-rose-300 border border-rose-500/30 px-1.5 py-0.5 font-sans text-[10px] font-semibold transition"
                          title="Otomatis tambahkan nominal defisit ini ke Top-Up Kas"
                        >
                          + Tutup Defisit
                        </button>
                      )}
                    </div>
                  </div>
                )}
              {/* Mini Visual Cash Flow Balance Meter */}
              {rebalanceResult.finalTargetTotalIdr > 0 && (
                <div className="rounded-lg bg-black/5 dark:bg-white/5 p-2.5 space-y-1.5 border ui-border">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="ui-text-muted font-medium">Keseimbangan Kas:</span>
                    {rebalanceResult.unallocatedCashRemainderIdr !== undefined &&
                    Math.abs(rebalanceResult.unallocatedCashRemainderIdr) > 100 ? (
                      rebalanceResult.unallocatedCashRemainderIdr < 0 ? (
                        <span className="text-[10px] font-bold text-rose-500 flex items-center gap-1">
                          <AlertTriangle className="h-3 w-3" />
                          Defisit {formatIdr(Math.abs(rebalanceResult.unallocatedCashRemainderIdr))}
                        </span>
                      ) : (
                        <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                          <Check className="h-3 w-3" />
                          Sisa Kas {formatIdr(rebalanceResult.unallocatedCashRemainderIdr)}
                        </span>
                      )
                    ) : (
                      <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                        <Check className="h-3 w-3" />
                        Kas 100% Teralokasi
                      </span>
                    )}
                  </div>
                  {/* Progress ratio of Total Buy vs Available Cash */}
                  <div className="h-2 w-full overflow-hidden rounded-full bg-black/10 dark:bg-white/10 flex">
                    {(() => {
                      const available = rebalanceResult.totalSellIdr + rebalanceResult.cashInjectionIdr;
                      const buy = rebalanceResult.totalBuyIdr;
                      if (available <= 0 && buy <= 0) {
                        return <div className="h-full w-full bg-emerald-500/40" />;
                      }
                      const pct = available > 0 ? Math.min(100, Math.round((buy / available) * 100)) : 100;
                      return (
                        <div
                          className={`h-full transition-all duration-300 ${
                            buy > available + 100 ? 'bg-rose-500' : 'bg-emerald-500'
                          }`}
                          style={{ width: `${pct}%` }}
                        />
                      );
                    })()}
                  </div>
                  <div className="flex justify-between text-[10px] ui-text-muted font-mono">
                    <span>Kas Masuk: {formatIdr(rebalanceResult.totalSellIdr + rebalanceResult.cashInjectionIdr)}</span>
                    <span>Kas Keluar: {formatIdr(rebalanceResult.totalBuyIdr)}</span>
                  </div>
                </div>
              )}

              <div className="flex justify-between pt-1 text-sm font-bold">
                <span className="ui-text-main">Nilai Akhir Portfolio:</span>
                <span className="font-mono text-emerald-600 dark:text-emerald-400">
                  {formatIdr(rebalanceResult.finalTargetTotalIdr)}
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* PRE-PLANNED LIMIT ORDER & CRASH BUYING LADDER (-10%, -20%, -35%, -50%) */}
      <section id="tour-crash-ladder" className="ui-card rounded-xl p-3.5 sm:p-5">
        <div className="ui-border flex flex-wrap items-center justify-between gap-3 border-b pb-3">
          <button
            type="button"
            onClick={() => toggleSectionCollapse('crashLadder')}
            className="flex items-center gap-2 text-left group focus:outline-none"
            aria-expanded={!collapsedSections['crashLadder']}
          >
            <ChevronDown
              className={`h-4 w-4 ui-text-muted transition-transform duration-200 group-hover:ui-text-main ${
                collapsedSections['crashLadder'] ? '-rotate-90' : ''
              }`}
            />
            <ListOrdered className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
            <h3 className="ui-text-main text-sm font-bold">
              Pre-Planned Limit Order &amp; Crash Buying Ladder (-10% s/d -50%)
            </h3>
          </button>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex flex-wrap items-center gap-1">
              <span className="ui-text-muted text-xs hidden sm:inline">Pilih:</span>
              {activeCandidateAssets.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => {
                    if (collapsedSections['crashLadder']) toggleSectionCollapse('crashLadder');
                    setLadderAssetId(a.id);
                  }}
                  className={`rounded-md px-2 py-0.5 text-xs font-medium transition ${
                    effectiveLadderAssetId === a.id
                      ? 'bg-emerald-600 font-semibold text-white'
                      : 'ui-subtle ui-text-secondary hover:opacity-80'
                  }`}
                >
                  {a.id}
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={() => toggleSectionCollapse('crashLadder')}
              className="ui-subtle ui-border rounded-md border px-2 py-0.5 text-[11px] font-medium ui-text-secondary hover:ui-text-main transition"
            >
              {collapsedSections['crashLadder'] ? 'Buka' : 'Ciutkan'}
            </button>
          </div>
        </div>

        {!collapsedSections['crashLadder'] ? (
          <div
            tabIndex={0}
            role="region"
            aria-label="Pre-Planned Limit Order Crash Buying Ladder"
            className="ui-border mt-3 overflow-x-auto rounded-lg border"
          >
          <table className="w-full border-separate border-spacing-0 text-left text-xs">
            <thead className="ui-subtle text-[11px] font-semibold uppercase">
              <tr>
                <th scope="col" className="ui-subtle ui-border sticky left-0 z-20 border-b border-r px-3 py-2 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.18)]">
                  Tier Koreksi
                </th>
                <th scope="col" className="ui-border border-b px-3 py-2 text-right">
                  Harga Limit Order ({selectedLadderAsset?.currency ?? 'IDR'})
                </th>
                <th scope="col" className="ui-border border-b px-3 py-2 text-right">
                  Harga Limit (Rp)
                </th>
                <th scope="col" className="ui-border border-b px-3 py-2 text-right">
                  Total Porto Saat Crash
                </th>
                <th scope="col" className="ui-border border-b px-3 py-2 text-right">
                  Nominal BUY Rebalance
                </th>
                <th scope="col" className="ui-border border-b px-3 py-2 text-right">
                  Jumlah Unit / Lot IDX
                </th>
                <th scope="col" className="ui-border border-b px-3 py-2 text-right">
                  Sumber Dana (Jual RDPT / GLD)
                </th>
              </tr>
            </thead>
            <tbody>
              {crashLadderSteps.map((step) => (
                <tr key={step.dropPercent} className="hover:bg-zinc-500/5">
                  <th
                    scope="row"
                    className="ui-card ui-border sticky left-0 z-10 border-b border-r px-3 py-2.5 font-mono font-bold text-rose-600 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.18)] dark:text-rose-400"
                  >
                    Crash {step.dropPercent}%
                  </th>
                  <td className="ui-border ui-text-main border-b px-3 py-2.5 text-right font-mono font-semibold">
                    {selectedLadderAsset?.currency === 'USD'
                      ? `$${step.limitPriceNative.toLocaleString()}`
                      : `Rp ${step.limitPriceNative.toLocaleString('id-ID')}`}
                  </td>
                  <td className="ui-border ui-text-muted border-b px-3 py-2.5 text-right font-mono">
                    {formatIdr(step.limitPriceIdr)}
                  </td>
                  <td className="ui-border ui-text-main border-b px-3 py-2.5 text-right font-mono font-semibold">
                    {formatIdr(step.postCrashPortfolioIdr, true)}
                  </td>
                  <td className="ui-border border-b px-3 py-2.5 text-right font-mono font-bold text-emerald-600 dark:text-emerald-400">
                    BUY {formatIdr(step.rebalanceBuyAmountIdr)}
                    {selectedLadderAsset?.currency === 'USD' && (
                      <div className="ui-text-muted text-[10px] font-normal">
                        ({formatUsd(step.rebalanceBuyAmountIdr / Math.max(1, usdIdrRate))})
                      </div>
                    )}
                  </td>
                  <td className="ui-border ui-text-main border-b px-3 py-2.5 text-right font-mono">
                    {step.rebalanceBuyLots !== undefined
                      ? `${step.rebalanceBuyLots} Lot (${step.rebalanceBuyUnits} lbr)`
                      : `${step.rebalanceBuyUnits} unit`}
                  </td>
                  <td className="ui-border ui-text-secondary border-b px-3 py-2.5 text-right font-mono">
                    {formatIdr(step.fundingFromDefensiveIdr)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        ) : (
          <div className="pt-2 text-xs ui-text-muted flex items-center justify-between">
            <span>Skenario crash buying disembunyikan.</span>
            <button
              type="button"
              onClick={() => toggleSectionCollapse('crashLadder')}
              className="text-emerald-600 dark:text-emerald-400 font-semibold hover:underline"
            >
              Buka Crash Ladder &rarr;
            </button>
          </div>
        )}
      </section>

      {/* REBALANCING HISTORY JOURNAL & NET WORTH TRACKER */}
      <section id="tour-rebalance-journal" className="ui-card rounded-xl p-3.5 sm:p-5">
        <div className="ui-border flex flex-wrap items-center justify-between gap-2 border-b pb-3">
          <button
            type="button"
            onClick={() => toggleSectionCollapse('journal')}
            className="flex items-center gap-2 text-left group focus:outline-none"
            aria-expanded={!collapsedSections['journal']}
          >
            <ChevronDown
              className={`h-4 w-4 ui-text-muted transition-transform duration-200 group-hover:ui-text-main ${
                collapsedSections['journal'] ? '-rotate-90' : ''
              }`}
            />
            <History className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
            <h3 className="ui-text-main text-sm font-bold">
              Jurnal Riwayat Rebalancing &amp; Net Worth
            </h3>
          </button>
          <div className="flex items-center gap-2">
            <span className="ui-subtle ui-text-secondary rounded-md px-2 py-0.5 font-mono text-xs font-semibold">
              {rebalanceHistory.length} Snapshot
            </span>
            {rebalanceHistory.length > 0 && (
              <button
                type="button"
                onClick={exportCsvHistory}
                className="ui-subtle ui-text-secondary flex items-center gap-1.5 rounded-lg border px-2 py-0.5 text-xs font-medium hover:ui-text-main transition shadow-xs"
                title="Unduh seluruh riwayat rebalancing sebagai file CSV"
              >
                <Download className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Unduh CSV</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => toggleSectionCollapse('journal')}
              className="ui-subtle ui-border rounded-md border px-2 py-0.5 text-[11px] font-medium ui-text-secondary hover:ui-text-main transition"
            >
              {collapsedSections['journal'] ? 'Buka' : 'Ciutkan'}
            </button>
          </div>
        </div>

        {!collapsedSections['journal'] ? (
          <>

        {rebalanceHistory.length === 0 ? (
          <div className="ui-subtle ui-text-muted mt-4 rounded-lg p-6 text-center text-xs">
            Belum ada riwayat rebalancing. Klik tombol{' '}
            <strong className="ui-text-main">
              &ldquo;Catat &amp; Terapkan Rebalance Ini&rdquo;
            </strong>{' '}
            di atas setelah menyesuaikan posisi untuk merekam snapshot pertama.
          </div>
        ) : (
          <div className="mt-4 grid grid-cols-1 gap-6 lg:grid-cols-12">
            {historyChartData.length > 1 && (
              <div className="ui-subtle rounded-lg p-4 lg:col-span-5">
                <div className="ui-text-main mb-2 text-xs font-semibold">
                  Kurva Net Worth Riwayat Rebalance (Juta Rp)
                </div>
                <div className="h-48 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart
                      data={historyChartData}
                      margin={{ top: 6, right: 10, left: -10, bottom: 0 }}
                    >
                      <XAxis dataKey="step" stroke="#71717a" fontSize={10} />
                      <YAxis
                        stroke="#71717a"
                        fontSize={10}
                        tickFormatter={(v) => `${v}Jt`}
                      />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: 'var(--bg-card)',
                          borderColor: 'var(--border-subtle)',
                          color: 'var(--text-main)',
                          borderRadius: '0.5rem',
                          fontSize: '12px',
                        }}
                        itemStyle={{ color: 'var(--text-main)' }}
                        labelStyle={{ color: 'var(--text-main)', fontWeight: 600 }}
                        formatter={(val: number) => [
                          `Rp ${val.toLocaleString('id-ID')} Juta`,
                          'Total Portfolio',
                        ]}
                      />
                      <Area
                        type="monotone"
                        dataKey="NetWorthJuta"
                        stroke="var(--accent-primary)"
                        fill="var(--accent-primary)"
                        fillOpacity={0.18}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}

            <div
              className={
                historyChartData.length > 1 ? 'lg:col-span-7' : 'lg:col-span-12'
              }
            >
              <div className="ui-border overflow-x-auto rounded-lg border">
                <table className="w-full border-separate border-spacing-0 text-left text-xs">
                  <thead className="ui-subtle text-[11px] font-semibold uppercase">
                    <tr>
                      <th scope="col" className="ui-border border-b px-3 py-2">Tanggal</th>
                      <th scope="col" className="ui-border border-b px-3 py-2">Catatan</th>
                      <th scope="col" className="ui-border border-b px-3 py-2 text-right">
                        Total Portfolio
                      </th>
                      <th scope="col" className="ui-border border-b px-3 py-2">
                        Ringkasan Eksekusi
                      </th>
                      <th scope="col" className="ui-border border-b px-2 py-2 text-center">
                        Aksi
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {rebalanceHistory.map((h) => (
                      <tr key={h.id} className="hover:bg-zinc-500/5">
                        <td className="ui-border ui-text-secondary border-b px-3 py-2 font-mono whitespace-nowrap">
                          {h.timestamp}
                        </td>
                        <td className="ui-border border-b px-3 py-2">
                          <div className="ui-text-main font-semibold">{h.note}</div>
                          <div className="ui-text-muted text-[10px]">
                            Top-Up: {formatIdr(h.cashInjectedIdr, true)} • Beli:{' '}
                            {formatIdr(h.totalBuyIdr, true)}
                            {h.unspentCashRemainderIdr !== undefined && h.unspentCashRemainderIdr > 0 && (
                              <span className="ml-1 text-emerald-600 dark:text-emerald-400 font-medium">
                                • Sisa Kas: {formatIdr(h.unspentCashRemainderIdr, true)}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="ui-border border-b px-3 py-2 text-right font-mono font-bold text-emerald-600 dark:text-emerald-400">
                          {formatIdr(h.totalValueAfterIdr)}
                        </td>
                        <td className="ui-border border-b px-3 py-2">
                          <div className="flex flex-wrap gap-1">
                            {h.tradesSummary.slice(0, 4).map((t, idx) => (
                              <span
                                key={idx}
                                className={`rounded px-1.5 py-0.5 font-mono text-[10px] font-medium ${
                                  t.startsWith('BUY')
                                    ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                                    : 'bg-rose-500/10 text-rose-700 dark:text-rose-300'
                                }`}
                              >
                                {t}
                              </span>
                            ))}
                            {h.tradesSummary.length === 0 && (
                              <span className="ui-text-muted text-[10px]">
                                Posisi sudah seimbang (Hold)
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="ui-border border-b px-2 py-2 text-center">
                          <div className="flex items-center justify-center gap-1">
                            {onUndoRebalanceHistoryEntry && h.holdingsBefore && (
                              <button
                                type="button"
                                onClick={() => setUndoTargetEntry(h)}
                                className="ui-text-muted hover:text-amber-500 p-1.5 rounded transition"
                                title="Kembalikan (Undo) posisi portfolio ke sebelum rebalance ini"
                                aria-label={`Kembalikan rebalance ${h.timestamp}`}
                              >
                                <RotateCcw className="mx-auto h-3.5 w-3.5" />
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => onDeleteRebalanceHistoryEntry(h.id)}
                              className="ui-text-muted hover:text-rose-600 p-1.5 rounded transition"
                              title="Hapus log ini dari riwayat"
                              aria-label={`Hapus log rebalance ${h.timestamp}`}
                            >
                              <Trash2 className="mx-auto h-3.5 w-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
          </>
        ) : (
          <div className="pt-2 text-xs ui-text-muted flex items-center justify-between">
            <span>Jurnal riwayat rebalancing disembunyikan.</span>
            <button
              type="button"
              onClick={() => toggleSectionCollapse('journal')}
              className="text-emerald-600 dark:text-emerald-400 font-semibold hover:underline"
            >
              Buka Jurnal &rarr;
            </button>
          </div>
        )}
      </section>
        </>
      )}

      {/* Lazy-Loaded Modals */}
      <React.Suspense fallback={null}>
        {/* Holdings Text Import & Export Modal */}
        {isHoldingsTextModalOpen && (
          <HoldingsTextImportModal
            isOpen={isHoldingsTextModalOpen}
            onClose={() => setIsHoldingsTextModalOpen(false)}
            allAssets={allAssets}
            currentHoldings={holdings}
            usdIdrRate={usdIdrRate}
            onApplyHoldings={handleApplyHoldingsFromText}
          />
        )}

        {/* Rebalancer Onboarding & Execution Guide Modal */}
        {isGuideModalOpen && (
          <RebalanceExecutionGuideModal
            isOpen={isGuideModalOpen}
            onClose={() => setIsGuideModalOpen(false)}
            initialCapitalMenu1Idr={initialCapitalMenu1Idr}
            activePortfolioName={activePortfolioName}
            onSetupInitialBuy={onSetupInitialBuyFromMenu1}
            onOpenOrderSlip={() => onOpenOrderSlip && onOpenOrderSlip(rebalanceResult)}
            onOpenTextImport={() => setIsHoldingsTextModalOpen(true)}
          />
        )}
      </React.Suspense>

      {/* Feature 2 & Decision 1: Soft-Lock Overbudget Deficit Confirmation Modal */}
      {showDeficitConfirmModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="deficit-modal-title"
          onClick={() => setShowDeficitConfirmModal(false)}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 animate-in fade-in duration-200"
        >
          <div
            tabIndex={-1}
            className="relative w-full max-w-md ui-card ui-border rounded-xl shadow-md p-6 space-y-4 outline-none"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-lg bg-rose-500/15 border border-rose-500/30 flex items-center justify-center text-rose-500 shrink-0">
                <AlertTriangle className="h-4 w-4" />
              </div>
              <div>
                <h3 id="deficit-modal-title" className="text-sm font-bold ui-text-main">
                  Konfirmasi Defisit Kas (Overbudget)
                </h3>
                <p className="text-xs ui-text-muted">
                  Pembelian melebihi kas yang tersedia
                </p>
              </div>
            </div>

            <div className="bg-rose-500/10 border border-rose-500/20 rounded-lg p-3.5 space-y-2 text-xs">
              <div className="flex justify-between items-center">
                <span className="ui-text-secondary">Total Beli yang Diinginkan:</span>
                <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400">{formatIdr(rebalanceResult.totalBuyIdr)}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="ui-text-secondary">Kas Tersedia (Jual + DCA):</span>
                <span className="font-mono font-bold ui-text-main">
                  {formatIdr(rebalanceResult.totalSellIdr + rebalanceResult.cashInjectionIdr)}
                </span>
              </div>
              <div className="border-t border-rose-500/20 pt-2 flex justify-between items-center text-rose-600 dark:text-rose-400 font-bold">
                <span>Kekurangan Dana (Defisit):</span>
                <span className="font-mono text-sm">
                  {formatIdr(Math.abs(rebalanceResult.unallocatedCashRemainderIdr ?? 0))}
                </span>
              </div>
            </div>

            <p className="text-xs ui-text-secondary leading-relaxed">
              Apakah Anda akan melakukan <strong>top-up kas sebesar {formatIdr(Math.abs(rebalanceResult.unallocatedCashRemainderIdr ?? 0))}</strong> ke portofolio / RDN untuk menutup kekurangan dana ini sebelum menerapkan rebalance?
            </p>

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setShowDeficitConfirmModal(false)}
                className="px-3.5 py-2 rounded-lg ui-subtle ui-border hover:opacity-90 ui-text-main text-xs font-semibold transition"
              >
                Batal / Sesuaikan Lot
              </button>
              <button
                type="button"
                onClick={handleConfirmDeficitTopUpAndCommit}
                className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition shadow-sm"
              >
                Ya, Setujui Top-Up &amp; Terapkan
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Undo Rebalance Confirmation Modal */}
      {undoTargetEntry && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="undo-modal-title"
          onClick={() => setUndoTargetEntry(null)}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 animate-in fade-in duration-200"
        >
          <div
            tabIndex={-1}
            className="relative w-full max-w-md ui-card ui-border rounded-xl shadow-md p-6 space-y-4 outline-none"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-lg bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-500 shrink-0">
                <RotateCcw className="h-4 w-4" />
              </div>
              <div>
                <h3 id="undo-modal-title" className="text-sm font-bold ui-text-main">
                  Kembalikan (Undo) Rebalance?
                </h3>
                <p className="text-xs ui-text-muted">
                  Memulihkan posisi holdings dan sisa kas ke kondisi sebelumnya
                </p>
              </div>
            </div>

            <div className="ui-subtle border ui-border rounded-lg p-3.5 space-y-2 text-xs">
              <div className="flex justify-between items-center">
                <span className="ui-text-secondary">Snapshot Rebalance:</span>
                <span className="font-mono font-bold ui-text-main">{undoTargetEntry.timestamp}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="ui-text-secondary">Catatan:</span>
                <span className="font-medium ui-text-main">{undoTargetEntry.note}</span>
              </div>
              <div className="flex justify-between items-center border-t ui-border pt-1.5">
                <span className="ui-text-secondary">Total Portofolio Saat Dicatat:</span>
                <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400">
                  {formatIdr(undoTargetEntry.totalValueAfterIdr)}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="ui-text-secondary">Akan Dikembalikan ke Total:</span>
                <span className="font-mono font-bold ui-text-main">
                  {formatIdr(undoTargetEntry.totalValueBeforeIdr)}
                </span>
              </div>
            </div>

            <p className="text-xs ui-text-secondary leading-relaxed">
              Tindakan ini akan mengembalikan seluruh unit/nilai aset portofolio dan nominal kas belanja ke kondisi tepat sebelum rebalance ini dicatat. Log ini akan dihapus dari jurnal riwayat.
            </p>

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setUndoTargetEntry(null)}
                className="px-3.5 py-2 rounded-lg ui-subtle ui-border hover:opacity-90 ui-text-main text-xs font-semibold transition"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={() => {
                  if (onUndoRebalanceHistoryEntry) {
                    onUndoRebalanceHistoryEntry(undoTargetEntry.id);
                  }
                  setUndoTargetEntry(null);
                }}
                className="px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold transition shadow-sm"
              >
                Ya, Kembalikan Posisi Ini
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
