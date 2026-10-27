import React, { useMemo, useState } from 'react';
import {
  AssetDefinition,
  AllocationMethod,
  InvestorArchetype,
  PortfolioPreset,
  SolvedPortfolio,
} from '../../lib/quant/types';
import { formatIdr, getRiskTierBadge } from '../../lib/formatters';
import { FormattedNumberInput } from '../FormattedNumberInput';
import { simulateWealthToGoal } from '../../lib/quant/wealthSimulator';
import { findStrictDominatingPresets } from '../../lib/quant/riskParitySolver';
import { CORE_AND_EXPANDED_ASSETS } from '../../data/presets';
import {
  lookupCustomYahooTicker,
  POPULAR_TICKER_ESTIMATES,
  TickerLookupResult,
} from '../../services/priceFeed';
import { AssetCorrelationMatrixCard } from './AssetCorrelationMatrixCard';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ScatterChart,
  Scatter,
  ZAxis,
  Cell,
  ReferenceLine,
  Legend,
} from 'recharts';
import {
  Sliders,
  ShieldAlert,
  Sparkles,
  CheckCircle2,
  AlertTriangle,
  Plus,
  Search,
  ArrowRight,
  Layers,
  Briefcase,
  Flame,
  Eye,
  EyeOff,
  Pin,
  Trash2,
  RotateCcw,
  Repeat,
  Compass,
  LayoutGrid,
  Table2,
  ArrowLeftRight,
  FileSpreadsheet,
  Lock,
  Unlock,
  Pencil,
  Check,
  X,
} from 'lucide-react';

interface PortfolioBuilderViewProps {
  allAssets: AssetDefinition[];
  onAddCustomAsset: (asset: AssetDefinition) => void;
  presets: PortfolioPreset[];
  customTableRows: PortfolioPreset[];
  onPinCurrentToTable: (customName?: string) => void;
  onRemoveCustomTableRow: (id: string) => void;
  slotMap: Record<string, string>;
  onChangeSlotAsset: (coreSlotId: string, newAssetId: string) => void;
  onResetSlotMap: () => void;
  onQuickSwapBbcaToPtba: () => void;
  activePresetId: string | null;
  onSelectPreset: (preset: PortfolioPreset) => void;
  allocationMethod: AllocationMethod;
  setAllocationMethod: (m: AllocationMethod) => void;
  selectedUniverseIds: string[];
  onToggleUniverseAsset: (id: string) => void;
  convictionAssetId: string;
  setConvictionAssetId: (id: string) => void;
  convictionRiskPercent: number;
  setConvictionRiskPercent: (pct: number) => void;
  solverMode: 'calibrated-video' | 'euler-covariance';
  setSolverMode: (m: 'calibrated-video' | 'euler-covariance') => void;
  activeWeights: Record<string, number>;
  onManualWeightChange: (assetId: string, newWeight: number) => void;
  onNormalizeManualWeights: (strategy?: 'proportional' | 'equal') => void;
  lockedAssetIds?: string[];
  onToggleLockAsset?: (assetId: string) => void;
  onUnlockAllAssets?: () => void;
  solvedMetrics: SolvedPortfolio;
  initialCapitalIdr: number;
  setInitialCapitalIdr: (v: number) => void;
  targetGoalIdr: number;
  setTargetGoalIdr: (v: number) => void;
  monthlySavingsIdr: number;
  setMonthlySavingsIdr: (v: number) => void;
  onGoToRebalancer: () => void;
  onOpenRecommender: () => void;
  rdptPromoActive: boolean;
  hasCustomAssetAssumptions: boolean;
  onUpdateAssetAssumption: (
    assetId: string,
    patch: { cagr?: number; maxDrawdown?: number }
  ) => void;
  onResetAssetAssumptions: () => void;
  onUpdateAssetMeta?: (
    assetId: string,
    patch: {
      shortName?: string;
      name?: string;
      isNominalOnly?: boolean;
      lotSize?: number;
      allowFractional?: boolean;
    }
  ) => void;
  onResetAssetMeta?: (assetId: string) => void;
  pinnedPresetIds?: string[];
  onTogglePinPreset?: (presetId: string) => void;
  onOpenFactsheet?: () => void;
}

export const PortfolioBuilderView: React.FC<PortfolioBuilderViewProps> = ({
  allAssets,
  onAddCustomAsset,
  presets,
  customTableRows,
  onPinCurrentToTable,
  onRemoveCustomTableRow,
  slotMap,
  onChangeSlotAsset,
  onResetSlotMap,
  onQuickSwapBbcaToPtba,
  activePresetId,
  onSelectPreset,
  allocationMethod,
  setAllocationMethod,
  selectedUniverseIds,
  onToggleUniverseAsset,
  convictionAssetId,
  setConvictionAssetId,
  convictionRiskPercent,
  setConvictionRiskPercent,
  solverMode,
  setSolverMode,
  activeWeights,
  onManualWeightChange,
  onNormalizeManualWeights,
  lockedAssetIds = [],
  onToggleLockAsset,
  onUnlockAllAssets,
  solvedMetrics,
  initialCapitalIdr,
  setInitialCapitalIdr,
  targetGoalIdr,
  setTargetGoalIdr,
  monthlySavingsIdr,
  setMonthlySavingsIdr,
  onGoToRebalancer,
  onOpenRecommender,
  rdptPromoActive,
  hasCustomAssetAssumptions,
  onUpdateAssetAssumption,
  onResetAssetAssumptions,
  onUpdateAssetMeta,
  onResetAssetMeta,
  pinnedPresetIds = [],
  onTogglePinPreset,
  onOpenFactsheet,
}) => {
  const [editingAssetId, setEditingAssetId] = useState<string | null>(null);
  const [draftShortName, setDraftShortName] = useState('');
  const [draftName, setDraftName] = useState('');
  const [draftIsNominal, setDraftIsNominal] = useState(false);

  const handleStartEditAsset = (asset: AssetDefinition) => {
    setEditingAssetId(asset.id);
    setDraftShortName(asset.shortName);
    setDraftName(asset.name);
    setDraftIsNominal(Boolean(asset.isNominalOnly));
  };

  const handleCancelEditAsset = () => {
    setEditingAssetId(null);
  };

  const handleSaveEditAsset = (assetId: string) => {
    if (onUpdateAssetMeta) {
      const asset = allAssets.find((a) => a.id === assetId);
      const baseDef = CORE_AND_EXPANDED_ASSETS.find((a) => a.id === assetId);
      const origLot = asset?.originalLotSize ?? baseDef?.lotSize ?? asset?.lotSize ?? (draftIsNominal ? 1 : 100);
      const origFractional = baseDef?.allowFractional ?? asset?.allowFractional ?? (draftIsNominal ? true : false);
      onUpdateAssetMeta(assetId, {
        shortName: draftShortName.trim() || undefined,
        name: draftName.trim() || undefined,
        isNominalOnly: draftIsNominal,
        lotSize: draftIsNominal ? 1 : origLot,
        allowFractional: draftIsNominal ? true : origFractional,
      });
    }
    setEditingAssetId(null);
  };

  const handleResetDefaultAsset = (assetId: string) => {
    if (onResetAssetMeta) {
      onResetAssetMeta(assetId);
    }
    setEditingAssetId(null);
  };

  const [archetypeFilter, setArchetypeFilter] = useState<InvestorArchetype>('all');
  const [showDominated25, setShowDominated25] = useState(false);
  const [customRowName, setCustomRowName] = useState('');
  const [tableViewMode, setTableViewMode] = useState<'table' | 'cards'>(() => {
    return typeof window !== 'undefined' && window.innerWidth < 768
      ? 'cards'
      : 'table';
  });
  const [tableSortKey, setTableSortKey] = useState<
    'rank' | 'cagr' | 'maxDrawdown' | 'calmar'
  >('rank');
  const [tableSortOrder, setTableSortOrder] = useState<'asc' | 'desc'>('asc');
  const [cellDisplayMode, setCellDisplayMode] = useState<
    'both' | 'percent' | 'nominal'
  >('both');
  const [comparePresetId, setComparePresetId] = useState<string>('opt-4-rb-btc-90');

  const [tickerInput, setTickerInput] = useState('');
  const [isLookingUpTicker, setIsLookingUpTicker] = useState(false);
  const [tickerError, setTickerError] = useState('');
  const [lastFetchedTickerInfo, setLastFetchedTickerInfo] =
    useState<TickerLookupResult | null>(null);
  const [showSyntheticForm, setShowSyntheticForm] = useState(false);
  const [synthSymbol, setSynthSymbol] = useState('');
  const [synthName, setSynthName] = useState('');
  const [synthCagr, setSynthCagr] = useState(18);
  const [synthMaxDd, setSynthMaxDd] = useState(15);
  const [synthPrice, setSynthPrice] = useState(10000);
  const [synthCurrency, setSynthCurrency] = useState<'IDR' | 'USD'>('IDR');

  const core8Slots = ['RDPU', 'RDPT', 'BBCA', 'GLD', 'SPY', 'QQQ', 'BTC', 'ETH'];
  const mappedColumnIds = core8Slots.map((slot) => slotMap[slot] ?? slot);

  // Also include any extra columns if a pinned custom row uses an asset outside the 8 mapped columns
  const extraCustomAssetIds = Array.from(
    new Set(
      customTableRows.flatMap((row) =>
        Object.entries(row.weights)
          .filter(([, w]) => w > 0)
          .map(([id]) => id)
      )
    )
  ).filter((id) => !mappedColumnIds.includes(id));

  const isSlotMapCustomized = core8Slots.some((slot) => (slotMap[slot] ?? slot) !== slot);

  const combinedRows: PortfolioPreset[] = [
    ...customTableRows,
    ...presets.filter((p) => {
      if (!showDominated25 && !p.isOptimal15) return false;
      if (archetypeFilter === 'business-owner') {
        return p.maxDrawdown <= 10.5;
      }
      if (archetypeFilter === 'full-time-investor') {
        return p.cagr >= 18;
      }
      if (archetypeFilter === 'hybrid-conviction') {
        return p.method === 'risk-budgeting' || p.id === 'opt-9-rp-all-7';
      }
      return true;
    }),
  ];

  const sortedCombinedRows = React.useMemo(() => {
    return [...combinedRows].sort((a, b) => {
      // 1. PIN CHECK: Pinned rows bubble to the very top of the table
      const aPinned = pinnedPresetIds.includes(a.id);
      const bPinned = pinnedPresetIds.includes(b.id);
      if (aPinned && !bPinned) return -1;
      if (!aPinned && bPinned) return 1;

      if (tableSortKey === 'rank') {
        if (a.isCustomRow && !b.isCustomRow) return -1;
        if (!a.isCustomRow && b.isCustomRow) return 1;
        return tableSortOrder === 'asc'
          ? (a.rank ?? 999) - (b.rank ?? 999)
          : (b.rank ?? 999) - (a.rank ?? 999);
      }
      if (tableSortKey === 'cagr') {
        return tableSortOrder === 'desc' ? b.cagr - a.cagr : a.cagr - b.cagr;
      }
      if (tableSortKey === 'maxDrawdown') {
        return tableSortOrder === 'asc'
          ? a.maxDrawdown - b.maxDrawdown
          : b.maxDrawdown - a.maxDrawdown;
      }
      if (tableSortKey === 'calmar') {
        const calA = a.cagr / Math.max(0.5, a.maxDrawdown);
        const calB = b.cagr / Math.max(0.5, b.maxDrawdown);
        return tableSortOrder === 'desc' ? calB - calA : calA - calB;
      }
      return 0;
    });
  }, [combinedRows, tableSortKey, tableSortOrder, pinnedPresetIds]);

  const handleToggleTableSort = (key: 'rank' | 'cagr' | 'maxDrawdown' | 'calmar') => {
    if (tableSortKey === key) {
      setTableSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setTableSortKey(key);
      setTableSortOrder(key === 'cagr' || key === 'calmar' ? 'desc' : 'asc');
    }
  };

  // Simulate time to targetGoalIdr (default Rp 1 Miliar, selectable to Rp 10 Miliar) starting from initialCapitalIdr (default Rp 100 Juta)
  const sim3M = simulateWealthToGoal({
    initialCapitalIdr,
    monthlyContributionIdr: 3_000_000,
    annualCagrPercent: solvedMetrics.cagr,
    maxDrawdownPercent: solvedMetrics.maxDrawdown,
    targetWealthIdr: targetGoalIdr,
  });
  const sim5M = simulateWealthToGoal({
    initialCapitalIdr,
    monthlyContributionIdr: 5_000_000,
    annualCagrPercent: solvedMetrics.cagr,
    maxDrawdownPercent: solvedMetrics.maxDrawdown,
    targetWealthIdr: targetGoalIdr,
  });
  const sim10M = simulateWealthToGoal({
    initialCapitalIdr,
    monthlyContributionIdr: 10_000_000,
    annualCagrPercent: solvedMetrics.cagr,
    maxDrawdownPercent: solvedMetrics.maxDrawdown,
    targetWealthIdr: targetGoalIdr,
  });
  const simCustom = simulateWealthToGoal({
    initialCapitalIdr,
    monthlyContributionIdr: monthlySavingsIdr,
    annualCagrPercent: solvedMetrics.cagr,
    maxDrawdownPercent: solvedMetrics.maxDrawdown,
    targetWealthIdr: targetGoalIdr,
  });

  // Format concise nominal amount (e.g., 25 Jt, 12.5 Jt, 500 Rb) from Initial Capital & weight %
  const formatNominalCell = (weightPercent: number) => {
    const nominalIdr = Math.round(initialCapitalIdr * (weightPercent / 100));
    if (nominalIdr <= 0) return 'Rp 0';
    if (nominalIdr >= 1_000_000_000) {
      return `Rp ${(nominalIdr / 1_000_000_000).toLocaleString('id-ID', {
        maximumFractionDigits: 2,
      })}M`;
    }
    if (nominalIdr >= 1_000_000) {
      return `${(nominalIdr / 1_000_000).toLocaleString('id-ID', {
        maximumFractionDigits: 1,
      })} Jt`;
    }
    if (nominalIdr >= 1_000) {
      return `${Math.round(nominalIdr / 1_000).toLocaleString('id-ID')} Rb`;
    }
    return `Rp ${nominalIdr.toLocaleString('id-ID')}`;
  };

  const tierBadge = getRiskTierBadge(solvedMetrics.riskTier);
  const [paretoZoomMode, setParetoZoomMode] = useState<
    'all' | 'cluster-35' | 'optimal-only'
  >('all');

  const formatTopWeights = (wMap: Record<string, number>) =>
    Object.entries(wMap)
      .filter(([, w]) => w > 0)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([id, w]) => `${id} ${w}%`)
      .join(' • ');

  const weightVsRiskData = allAssets
    .filter((a) => (activeWeights[a.id] ?? 0) > 0 || selectedUniverseIds.includes(a.id))
    .map((a) => ({
      assetId: a.id,
      symbol: a.shortName,
      name: a.name,
      capitalWeight: Number((activeWeights[a.id] ?? 0).toFixed(1)),
      riskContribution: Number((solvedMetrics.riskContributions[a.id] ?? 0).toFixed(1)),
      assetCagr: a.cagr,
      assetMaxDd: a.maxDrawdown,
      color: a.color,
    }))
    .filter((d) => d.capitalWeight > 0 || d.riskContribution > 0);

  const filterByZoom = (maxDd: number) =>
    paretoZoomMode === 'cluster-35' ? maxDd <= 36 : true;

  const allCandidatePresets = [...customTableRows, ...presets];

  const isPresetStrictlyOptimal = (p: PortfolioPreset) =>
    findStrictDominatingPresets(p.cagr, p.maxDrawdown, allCandidatePresets, p.id)
      .length === 0;

  const scatterOptimalData = allCandidatePresets
    .filter((p) => isPresetStrictlyOptimal(p) && filterByZoom(p.maxDrawdown))
    .map((p) => ({
      id: p.id,
      name: p.name,
      rank: p.rank,
      maxDrawdown: p.maxDrawdown,
      cagr: p.cagr,
      calmar: Number((p.cagr / Math.max(0.5, p.maxDrawdown)).toFixed(2)),
      topWeights: formatTopWeights(p.weights),
      isOptimal: true,
      isCustomRow: Boolean(p.isCustomRow),
      videoNote: p.videoNote,
      preset: p,
    }));

  const scatterDominatedData =
    paretoZoomMode === 'optimal-only'
      ? []
      : allCandidatePresets
          .filter((p) => !isPresetStrictlyOptimal(p) && filterByZoom(p.maxDrawdown))
          .map((p) => {
            const doms = findStrictDominatingPresets(
              p.cagr,
              p.maxDrawdown,
              allCandidatePresets,
              p.id
            );
            return {
              id: p.id,
              name: p.name,
              maxDrawdown: p.maxDrawdown,
              cagr: p.cagr,
              calmar: Number((p.cagr / Math.max(0.5, p.maxDrawdown)).toFixed(2)),
              topWeights: formatTopWeights(p.weights),
              isOptimal: false,
              dominatedByReason:
                p.dominatedByReason ??
                (doms.length > 0
                  ? `Kalah efisien dibanding ${doms[0].name} (CAGR ${doms[0].cagr}%, Max DD -${doms[0].maxDrawdown}%).`
                  : undefined),
              preset: p,
            };
          });

  const activePresetObj =
    allCandidatePresets.find((p) => p.id === activePresetId) ?? null;

  const activePointData = filterByZoom(solvedMetrics.maxDrawdown)
    ? [
        {
          id: 'active-point',
          name: activePresetObj
            ? `Aktif: ${activePresetObj.name}`
            : 'Portfolio Aktif Anda (Custom)',
          maxDrawdown: solvedMetrics.maxDrawdown,
          cagr: solvedMetrics.cagr,
          calmar: Number(
            (solvedMetrics.cagr / Math.max(0.5, solvedMetrics.maxDrawdown)).toFixed(2)
          ),
          topWeights: formatTopWeights(activeWeights),
          isOptimal: !solvedMetrics.isParetoDominated,
          isActivePoint: true,
          preset: activePresetObj,
        },
      ]
    : [];

  // Ordered strictly Pareto-optimal presets from lowest drawdown (conservative) to highest return (aggressive)
  const sortedOptimalPresets = allCandidatePresets
    .filter((p) => isPresetStrictlyOptimal(p))
    .sort((a, b) => a.maxDrawdown - b.maxDrawdown);
  const currentOptimalIdx = sortedOptimalPresets.findIndex(
    (p) => p.id === activePresetId
  );

  // Compute neighboring optimal alternatives & highest Calmar efficiency champion for 1-click switching
  const saferAlternativePreset =
    [...sortedOptimalPresets]
      .reverse()
      .find(
        (p) =>
          p.id !== activePresetId &&
          p.maxDrawdown < solvedMetrics.maxDrawdown - 0.15
      ) ?? null;

  const higherReturnAlternativePreset =
    sortedOptimalPresets.find(
      (p) =>
        p.id !== activePresetId &&
        p.cagr > solvedMetrics.cagr + 0.15
    ) ?? null;

  const bestCalmarPreset =
    [...sortedOptimalPresets]
      .filter((p) => p.maxDrawdown >= 3.0 && p.id !== activePresetId)
      .sort(
        (a, b) =>
          b.cagr / Math.max(1, b.maxDrawdown) -
          a.cagr / Math.max(1, a.maxDrawdown)
      )[0] ?? null;

  const handleYahooLookup = async (overrideSymbol?: string) => {
    const query = (overrideSymbol ?? tickerInput).trim();
    if (!query) return;
    setIsLookingUpTicker(true);
    setTickerError('');
    const res = await lookupCustomYahooTicker(query);
    setIsLookingUpTicker(false);
    if (!res) {
      setTickerError(
        `Ticker "${query.toUpperCase()}" tidak ditemukan. Silakan isi estimasi CAGR & Max DD di form manual di bawah.`
      );
      setSynthSymbol(query.toUpperCase().replace('.JK', ''));
      setSynthName(query.toUpperCase());
      setShowSyntheticForm(true);
      return;
    }
    setLastFetchedTickerInfo(res);
    const id = res.symbol.replace('.JK', '');
    const newAsset: AssetDefinition = {
      id,
      symbol: res.symbol,
      name: res.name,
      shortName: id,
      category: res.currency === 'IDR' ? 'idx-equity' : 'us-equity',
      currency: res.currency,
      cagr: res.cagr,
      maxDrawdown: res.maxDrawdown,
      volatility: res.volatility,
      riskScale: res.riskScale,
      defaultPrice: res.price,
      lotSize: res.symbol.endsWith('.JK') ? 100 : 1,
      allowFractional: !res.symbol.endsWith('.JK'),
      isCoreBenchmark: false,
      yahooSymbol: res.symbol,
      color: '#0ea5e9',
      description: `${res.name} — ${res.assumptionNote}`,
    };
    onAddCustomAsset(newAsset);
    setSynthSymbol(id);
    setSynthName(res.name);
    setSynthCagr(res.cagr);
    setSynthMaxDd(res.maxDrawdown);
    setSynthPrice(res.price);
    setSynthCurrency(res.currency);
    setTickerInput('');
  };

  const handleAddSyntheticAsset = (e: React.FormEvent) => {
    e.preventDefault();
    if (!synthSymbol.trim()) return;
    const cleanId = synthSymbol.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
    const vol = Math.max(1, Number((synthMaxDd * 0.85).toFixed(1)));
    const riskScale = Number(Math.max(0.3, synthMaxDd / 6.5).toFixed(2));
    const newAsset: AssetDefinition = {
      id: cleanId,
      symbol: synthSymbol.trim().toUpperCase(),
      name: synthName.trim() || synthSymbol.trim().toUpperCase(),
      shortName: cleanId,
      category: 'custom',
      currency: synthCurrency,
      cagr: Number(synthCagr),
      maxDrawdown: Number(synthMaxDd),
      volatility: vol,
      riskScale,
      defaultPrice: Math.max(1, Number(synthPrice)),
      lotSize: 1,
      allowFractional: true,
      isCoreBenchmark: false,
      color: '#10b981',
      description: `Custom Synthetic Asset (${synthCagr}% CAGR, ${synthMaxDd}% Max DD).`,
    };
    onAddCustomAsset(newAsset);
    setSynthSymbol('');
    setSynthName('');
    setShowSyntheticForm(false);
  };

  const manualSum = Object.values(activeWeights).reduce((a, b) => a + b, 0);

  const lockedSet = useMemo(() => new Set(lockedAssetIds), [lockedAssetIds]);
  const lockedCount = lockedAssetIds.length;
  const lockedSum = useMemo(() => {
    return Number(
      lockedAssetIds
        .reduce((sum, id) => sum + (activeWeights[id] ?? 0), 0)
        .toFixed(1)
    );
  }, [lockedAssetIds, activeWeights]);
  const isLockedSumOverLimit = lockedSum > 100;

  // Compute Portfolio Net Dividend Yield for quick display in the Builder KPI bar
  const builderDividendStats = allAssets.reduce(
    (acc, asset) => {
      const w = (activeWeights[asset.id] ?? 0) / 100;
      if (w <= 0) return acc;
      const grossY = asset.dividendYield ?? 0;
      const taxPct = asset.dividendTaxPercent ?? 0;
      const netY = grossY * (1 - taxPct / 100);
      return {
        grossYield: acc.grossYield + w * grossY,
        netYield: acc.netYield + w * netY,
      };
    },
    { grossYield: 0, netYield: 0 }
  );
  const annualDividendAtGoalIdr =
    targetGoalIdr * (builderDividendStats.netYield / 100);

  // Compute per-asset effective CAGR assumption & weighted return contribution (Bobot % × Return Aset %)
  const getEffectiveAssetCagr = (asset: AssetDefinition): number =>
    asset.id === 'RDPT' && rdptPromoActive ? asset.cagr + 3.0 : asset.cagr;

  const normWeightMultiplier = manualSum > 0 ? 100 / manualSum : 1;

  const activeReturnBreakdown = allAssets
    .filter((asset) => (activeWeights[asset.id] ?? 0) > 0)
    .map((asset) => {
      const weightPct = activeWeights[asset.id] ?? 0;
      const effectiveWeightPct = Number((weightPct * normWeightMultiplier).toFixed(2));
      const effectiveCagr = getEffectiveAssetCagr(asset);
      const weightedReturnContrib = (effectiveWeightPct / 100) * effectiveCagr;
      return {
        asset,
        weightPct,
        effectiveCagr,
        weightedReturnContrib,
      };
    })
    .sort((a, b) => b.weightedReturnContrib - a.weightedReturnContrib);

  const weightedBaseCagr = activeReturnBreakdown.reduce(
    (sum, item) => sum + item.weightedReturnContrib,
    0
  );
  const rebalancingBonusDiff = solvedMetrics.cagr - weightedBaseCagr;

  return (
    <div className="space-y-6">
      {/* TOP SUMMARY BANNER */}
      <section className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <div className="ui-card flex flex-col justify-between rounded-xl p-5 lg:col-span-7">
          <div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span
                  className={`rounded border px-2 py-0.5 text-[11px] font-semibold ${tierBadge.bgClass} ${tierBadge.textClass} ${tierBadge.borderClass}`}
                >
                  {tierBadge.label}
                </span>
                <span className="ui-subtle ui-text-secondary rounded px-2 py-0.5 text-xs font-medium">
                  {allocationMethod === 'preset'
                    ? 'Table Preset'
                    : allocationMethod === 'risk-parity'
                      ? 'Risk Parity (Equal Risk)'
                      : allocationMethod === 'risk-budgeting'
                        ? `Risk Budgeting (${convictionAssetId} ${convictionRiskPercent}%)`
                        : allocationMethod === 'all-in'
                          ? `All-In (${convictionAssetId})`
                          : 'Custom Manual Bobot'}
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={onOpenRecommender}
                  className="ui-subtle ui-text-main flex items-center gap-1.5 rounded-lg border border-emerald-500/40 px-3 py-1.5 text-xs font-semibold transition hover:opacity-80"
                >
                  <Compass className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                  <span>Cari Portfolio Ideal Saya (Kuis Quant)</span>
                </button>

                {onOpenFactsheet && (
                  <button
                    type="button"
                    onClick={onOpenFactsheet}
                    className="ui-subtle ui-text-main flex items-center gap-1.5 rounded-lg border border-indigo-500/40 px-3 py-1.5 text-xs font-semibold transition hover:opacity-80"
                    title="Buka Factsheet 1-Halaman Siap Cetak A4 & Unduh PNG"
                  >
                    <FileSpreadsheet className="h-3.5 w-3.5 text-indigo-500 dark:text-indigo-400" />
                    <span>Factsheet Portofolio (A4)</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={onGoToRebalancer}
                  className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-emerald-500"
                >
                  <span>Gunakan di Rebalancer</span>
                  <ArrowRight className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>

            {/* Key Quantitative Figures */}
            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-5">
              <div className="ui-subtle rounded-lg p-3">
                <div className="ui-text-muted text-[11px] font-medium uppercase">
                  Expected CAGR (5Y)
                </div>
                <div className="mt-1 font-mono text-2xl font-bold text-emerald-600 dark:text-emerald-400">
                  {solvedMetrics.cagr.toFixed(2)}%
                </div>
                <div className="ui-text-muted mt-0.5 text-[11px]">Return tahunan</div>
              </div>

              <div className="ui-subtle rounded-lg p-3">
                <div className="ui-text-muted text-[11px] font-medium uppercase">
                  Max Drawdown (5Y)
                </div>
                <div className="mt-1 font-mono text-2xl font-bold text-rose-600 dark:text-rose-400">
                  -{solvedMetrics.maxDrawdown.toFixed(2)}%
                </div>
                <div className="ui-text-muted mt-0.5 text-[11px]">
                  Penurunan terdalam
                </div>
              </div>

              <div className="ui-subtle rounded-lg p-3">
                <div className="ui-text-muted text-[11px] font-medium uppercase">
                  Return / Drawdown
                </div>
                <div className="ui-text-main mt-1 font-mono text-2xl font-bold">
                  {solvedMetrics.maxDrawdown > 0
                    ? (solvedMetrics.cagr / solvedMetrics.maxDrawdown).toFixed(2)
                    : '∞'}
                  x
                </div>
                <div className="ui-text-muted mt-0.5 text-[11px]">Calmar efisiensi</div>
              </div>

              <div className="ui-subtle rounded-lg p-3">
                <div className="ui-text-muted text-[11px] font-medium uppercase">
                  Sharpe Ratio
                </div>
                <div className="ui-text-main mt-1 font-mono text-2xl font-bold">
                  {solvedMetrics.sharpeRatio.toFixed(2)}
                </div>
                <div className="ui-text-muted mt-0.5 text-[11px]">
                  Volatilitas {solvedMetrics.volatility}%
                </div>
              </div>

              <div className="ui-subtle col-span-2 rounded-lg p-3 sm:col-span-1">
                <div className="ui-text-muted text-[11px] font-medium uppercase">
                  Dividen Bersih
                </div>
                <div className="mt-1 font-mono text-2xl font-bold text-emerald-600 dark:text-emerald-400">
                  {builderDividendStats.netYield.toFixed(2)}%
                </div>
                <div className="ui-text-muted mt-0.5 text-[10px]">
                  ≈ {formatIdr(annualDividendAtGoalIdr / 12, true)}/bln @{' '}
                  {formatIdr(targetGoalIdr, true)}
                </div>
              </div>
            </div>

            {/* Per-Asset Assumed Return & CAGR Contribution Breakdown */}
            <div className="ui-subtle mt-3 rounded-lg border border-emerald-500/20 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 text-xs font-semibold">
                  <Sparkles className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                  <span className="ui-text-main">
                    Bedah Asumsi Return Tiap Aset ➔ Pembentuk CAGR{' '}
                    <span className="font-mono text-emerald-600 dark:text-emerald-400">
                      {solvedMetrics.cagr.toFixed(2)}%/thn
                    </span>
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-1.5 font-mono text-[10px]">
                  <span className="ui-card ui-text-secondary rounded px-1.5 py-0.5">
                    ∑(Bobot × Return Aset) ={' '}
                    <strong className="ui-text-main">
                      {weightedBaseCagr.toFixed(2)}%
                    </strong>
                  </span>
                  {Math.abs(rebalancingBonusDiff) >= 0.03 && (
                    <span
                      title="Efek Rebalancing & Diversifikasi (Volatility Harvesting / kalibrasi empiris 5Y video Menit 08:25)"
                      className="rounded bg-emerald-500/15 px-1.5 py-0.5 font-semibold text-emerald-600 dark:text-emerald-400"
                    >
                      {rebalancingBonusDiff >= 0 ? '+' : ''}
                      {rebalancingBonusDiff.toFixed(2)}% Rebalancing/Kalibrasi
                    </span>
                  )}
                  {hasCustomAssetAssumptions && (
                    <button
                      type="button"
                      onClick={onResetAssetAssumptions}
                      className="rounded bg-amber-500/15 px-1.5 py-0.5 font-sans font-semibold text-amber-600 hover:bg-amber-500/25 dark:text-amber-400"
                    >
                      Reset Asumsi 5Y Video
                    </button>
                  )}
                </div>
              </div>

              <div className="mt-2 grid grid-cols-2 gap-1.5 sm:grid-cols-3 md:grid-cols-4">
                {activeReturnBreakdown.map(
                  ({ asset, weightPct, effectiveCagr, weightedReturnContrib }) => (
                    <div
                      key={asset.id}
                      className="ui-card flex flex-col justify-between rounded-md border border-zinc-500/15 px-2.5 py-1.5 text-[11px]"
                    >
                      <div className="flex items-center justify-between gap-1">
                        <span className="flex items-center gap-1.5 font-semibold">
                          <span
                            className="h-2 w-2 rounded-full"
                            style={{ backgroundColor: asset.color }}
                          />
                          <span className="ui-text-main">{asset.shortName}</span>
                        </span>
                        <span className="ui-subtle ui-text-secondary rounded px-1 py-0.2 font-mono text-[10px] font-semibold">
                          {weightPct}%
                        </span>
                      </div>
                      <div className="mt-1 flex items-center justify-between font-mono text-[10px]">
                        <span
                          className="ui-text-muted"
                          title={`Asumsi Return Tahunan ${asset.name}: ${effectiveCagr.toFixed(1)}%/thn | Max Drawdown: -${asset.maxDrawdown}%`}
                        >
                          Asumsi:{' '}
                          <strong className="ui-text-secondary">
                            {effectiveCagr.toFixed(1)}%
                          </strong>
                          <span className="text-rose-500/80">
                            {' '}
                            (-{asset.maxDrawdown}%)
                          </span>
                        </span>
                        <span
                          className="font-bold text-emerald-600 dark:text-emerald-400"
                          title={`${weightPct}% bobot × ${effectiveCagr.toFixed(1)}% asumsi return = +${weightedReturnContrib.toFixed(2)}%/thn`}
                        >
                          +{weightedReturnContrib.toFixed(2)}%
                        </span>
                      </div>
                    </div>
                  )
                )}
              </div>
            </div>
          </div>

          {/* Pareto Efficiency Alert & Interactive Clickable Alternatives */}
          <div className="mt-4">
            {solvedMetrics.isParetoDominated ? (
              <div className="rounded-lg border border-amber-500/35 bg-amber-500/10 p-3 text-xs text-amber-900 dark:text-amber-200">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
                  <div className="flex-1">
                    <div>
                      <span className="font-bold">
                        Filter Matematis Pareto (Menit 10:16): Portfolio Ini Terdominasi (Kalah Efisien).
                      </span>{' '}
                      Ditemukan strategi lain di tabel yang memiliki{' '}
                      <strong>Return (CAGR) lebih tinggi</strong> sekaligus{' '}
                      <strong>Max Drawdown lebih rendah/setara</strong>:
                    </div>

                    {activePresetObj?.dominatedByReason && (
                      <div className="mt-1 text-[11px] opacity-90">
                        💡 {activePresetObj.dominatedByReason}
                      </div>
                    )}

                    {/* Clickable Dominating Preset Chips */}
                    <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                      <span className="text-[10px] font-semibold uppercase tracking-wide opacity-80">
                        Klik untuk pindah ke strategi yang lebih unggul:
                      </span>
                      {(solvedMetrics.dominatingPresetItems ?? []).map((dom) => {
                        const targetPreset = allCandidatePresets.find(
                          (p) => p.id === dom.presetId
                        );
                        if (!targetPreset) return null;
                        return (
                          <button
                            key={dom.presetId}
                            type="button"
                            onClick={() => onSelectPreset(targetPreset)}
                            className="inline-flex items-center gap-1.5 rounded-md border border-amber-500/40 bg-amber-500/20 px-2.5 py-1 font-mono text-[11px] font-semibold text-amber-950 transition hover:bg-amber-500 hover:text-white dark:text-amber-100 dark:hover:bg-amber-500 dark:hover:text-zinc-950"
                          >
                            <span>⚡ {dom.name}</span>
                            <span className="rounded bg-emerald-500/20 px-1 py-0.2 text-[10px] font-bold text-emerald-700 dark:text-emerald-300">
                              CAGR {dom.cagr.toFixed(2)}% (+{dom.cagrDiff.toFixed(2)}%)
                            </span>
                            <span className="rounded bg-sky-500/20 px-1 py-0.2 text-[10px] font-bold text-sky-700 dark:text-sky-300">
                              DD -{dom.maxDrawdown.toFixed(2)}% (
                              {dom.maxDdDiff > 0
                                ? `-${dom.maxDdDiff.toFixed(2)}% lebih aman`
                                : 'setara'}
                              )
                            </span>
                            <ArrowRight className="h-3 w-3" />
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs text-emerald-900 dark:text-emerald-200">
                <div className="flex items-start gap-2">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                  <div className="flex-1">
                    <div>
                      <strong>Optimal Pareto Frontier (Terverifikasi Matematis):</strong>{' '}
                      Tidak ada preset lain di tabel yang mengalahkan return portfolio ini (
                      <span className="font-mono font-bold">
                        {solvedMetrics.cagr.toFixed(2)}%/thn
                      </span>
                      ) dengan Max Drawdown{' '}
                      <span className="font-mono font-bold">
                        ≤ -{solvedMetrics.maxDrawdown.toFixed(2)}%
                      </span>
                      .
                    </div>

                    {/* Interactive Trade-Off Alternatives on the Frontier */}
                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      <span className="text-[10px] font-semibold uppercase tracking-wide opacity-80">
                        Alternatif Optimal (Klik untuk pindah):
                      </span>

                      {saferAlternativePreset && (
                        <button
                          type="button"
                          onClick={() => onSelectPreset(saferAlternativePreset)}
                          title={`Turunkan risiko Max Drawdown dari -${solvedMetrics.maxDrawdown.toFixed(2)}% ke -${saferAlternativePreset.maxDrawdown.toFixed(2)}%`}
                          className="ui-card ui-text-main inline-flex items-center gap-1 rounded-md border border-emerald-500/30 px-2 py-1 text-[11px] font-medium transition hover:border-emerald-500 hover:bg-emerald-500/20"
                        >
                          <span>🛡️ Lebih Aman:</span>
                          <strong className="font-semibold">
                            {saferAlternativePreset.name}
                          </strong>
                          <span className="font-mono text-[10px] text-emerald-600 dark:text-emerald-400">
                            (CAGR {saferAlternativePreset.cagr.toFixed(2)}% • DD -
                            {saferAlternativePreset.maxDrawdown.toFixed(2)}%)
                          </span>
                        </button>
                      )}

                      {higherReturnAlternativePreset && (
                        <button
                          type="button"
                          onClick={() => onSelectPreset(higherReturnAlternativePreset)}
                          title={`Tingkatkan potensi CAGR dari ${solvedMetrics.cagr.toFixed(2)}% ke ${higherReturnAlternativePreset.cagr.toFixed(2)}%`}
                          className="ui-card ui-text-main inline-flex items-center gap-1 rounded-md border border-emerald-500/30 px-2 py-1 text-[11px] font-medium transition hover:border-emerald-500 hover:bg-emerald-500/20"
                        >
                          <span>🚀 Return Lebih Tinggi:</span>
                          <strong className="font-semibold">
                            {higherReturnAlternativePreset.name}
                          </strong>
                          <span className="font-mono text-[10px] text-emerald-600 dark:text-emerald-400">
                            (CAGR {higherReturnAlternativePreset.cagr.toFixed(2)}% • DD -
                            {higherReturnAlternativePreset.maxDrawdown.toFixed(2)}%)
                          </span>
                        </button>
                      )}

                      {bestCalmarPreset &&
                        bestCalmarPreset.id !== saferAlternativePreset?.id &&
                        bestCalmarPreset.id !== higherReturnAlternativePreset?.id && (
                          <button
                            type="button"
                            onClick={() => onSelectPreset(bestCalmarPreset)}
                            title="Strategi dengan Rasio Return / Drawdown (Calmar) paling efisien"
                            className="ui-card ui-text-main inline-flex items-center gap-1 rounded-md border border-emerald-500/30 px-2 py-1 text-[11px] font-medium transition hover:border-emerald-500 hover:bg-emerald-500/20"
                          >
                            <span>🏆 Juara Efisiensi (Calmar):</span>
                            <strong className="font-semibold">
                              {bestCalmarPreset.name}
                            </strong>
                            <span className="font-mono text-[10px] text-emerald-600 dark:text-emerald-400">
                              (
                              {(
                                bestCalmarPreset.cagr /
                                Math.max(1, bestCalmarPreset.maxDrawdown)
                              ).toFixed(2)}
                              x • CAGR {bestCalmarPreset.cagr.toFixed(2)}%)
                            </span>
                          </button>
                        )}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right 5 cols: "Kapan Capai Target Pertama?" (Default Modal Rp 100 Jt -> Target Rp 1 Miliar / 10 Miliar) */}
        <div className="ui-card flex flex-col justify-between rounded-xl p-5 lg:col-span-5">
          <div>
            <div className="flex items-center justify-between gap-2">
              <h2 className="ui-text-main text-sm font-bold">
                Kapan capai {formatIdr(targetGoalIdr, true)} pertama?
              </h2>
              <span className="ui-subtle rounded px-2 py-0.5 font-mono text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                @{solvedMetrics.cagr.toFixed(2)}%/thn
              </span>
            </div>

            {/* Editable Initial Capital (Default Rp 100 Jt) & Target Goal Selector (Default Rp 1 Miliar / Pilihan Rp 10 Miliar) */}
            <div className="mt-2.5 grid grid-cols-2 gap-2">
              <div className="ui-subtle rounded-lg p-2">
                <div className="flex items-center justify-between">
                  <label className="ui-text-muted block text-[10px] font-medium">
                    Modal Awal (Rp)
                  </label>
                  <span className="font-mono text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">
                    {formatIdr(initialCapitalIdr, true)}
                  </span>
                </div>
                <div className="mt-0.5 flex items-center justify-between gap-1">
                  <FormattedNumberInput
                    step={10_000_000}
                    min={0}
                    value={initialCapitalIdr}
                    onChange={(val) => setInitialCapitalIdr(val)}
                    className="ui-text-main w-full bg-transparent font-mono text-xs font-bold focus:outline-none"
                    ariaLabel="Initial Capital in IDR"
                  />
                </div>
                <div className="mt-1 flex gap-1 text-[10px]">
                  {[0, 50_000_000, 100_000_000, 500_000_000].map((v) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => setInitialCapitalIdr(v)}
                      className={`rounded px-1.5 py-0.5 font-mono ${
                        initialCapitalIdr === v
                          ? 'bg-emerald-600 font-semibold text-white'
                          : 'ui-card ui-text-muted'
                      }`}
                    >
                      {v === 0 ? '0' : `${v / 1_000_000}Jt`}
                    </button>
                  ))}
                </div>
              </div>

              <div className="ui-subtle rounded-lg p-2">
                <div className="flex items-center justify-between">
                  <label className="ui-text-muted block text-[10px] font-medium">
                    Target Kekayaan (Rp)
                  </label>
                  <span className="font-mono text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">
                    {formatIdr(targetGoalIdr, true)}
                  </span>
                </div>
                <div className="mt-0.5 flex items-center justify-between gap-1">
                  <FormattedNumberInput
                    step={500_000_000}
                    min={10_000_000}
                    value={targetGoalIdr}
                    onChange={(val) => setTargetGoalIdr(val)}
                    className="ui-text-main w-full bg-transparent font-mono text-xs font-bold focus:outline-none"
                    ariaLabel="Target Wealth Goal in IDR"
                  />
                </div>
                <div className="mt-1 flex gap-1 text-[10px]">
                  {[
                    { label: '1M', val: 1_000_000_000 },
                    { label: '5M', val: 5_000_000_000 },
                    { label: '10M', val: 10_000_000_000 },
                  ].map((t) => (
                    <button
                      key={t.val}
                      type="button"
                      onClick={() => setTargetGoalIdr(t.val)}
                      className={`flex-1 rounded px-1.5 py-0.5 font-mono ${
                        targetGoalIdr === t.val
                          ? 'bg-emerald-600 font-semibold text-white'
                          : 'ui-card ui-text-muted'
                      }`}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="mt-2.5 space-y-1.5">
              <div className="ui-subtle flex items-center justify-between rounded-lg px-3 py-1.5">
                <span className="ui-text-secondary text-xs font-medium">
                  + Rp 3 Juta / bulan (Default)
                </span>
                <span className="font-mono text-xs font-bold text-emerald-600 dark:text-emerald-400">
                  ➔ {sim3M.exactYearsFloat} Thn{' '}
                  <span className="ui-text-muted font-normal">
                    (Pokok {formatIdr(sim3M.totalPrincipalAtGoalIdr, true)})
                  </span>
                </span>
              </div>

              <div className="ui-subtle flex items-center justify-between rounded-lg px-3 py-1.5">
                <span className="ui-text-secondary text-xs font-medium">
                  + Rp 5 Juta / bulan
                </span>
                <span className="ui-text-main font-mono text-xs font-bold">
                  ➔ {sim5M.exactYearsFloat} Thn{' '}
                  <span className="ui-text-muted font-normal">
                    (Pokok {formatIdr(sim5M.totalPrincipalAtGoalIdr, true)})
                  </span>
                </span>
              </div>

              <div className="ui-subtle flex items-center justify-between rounded-lg px-3 py-1.5">
                <span className="ui-text-secondary text-xs font-medium">
                  + Rp 10 Juta / bulan
                </span>
                <span className="ui-text-main font-mono text-xs font-bold">
                  ➔ {sim10M.exactYearsFloat} Thn{' '}
                  <span className="ui-text-muted font-normal">
                    (Pokok {formatIdr(sim10M.totalPrincipalAtGoalIdr, true)})
                  </span>
                </span>
              </div>
            </div>
          </div>

          <div id="tour-quick-dca" className="ui-subtle mt-3 rounded-lg p-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
              <span className="ui-text-secondary font-medium">
                Custom DCA Bulanan (Rp):
              </span>
              <div className="flex items-center gap-1.5">
                <FormattedNumberInput
                  step={500_000}
                  min={0}
                  value={monthlySavingsIdr}
                  onChange={(val) => setMonthlySavingsIdr(val)}
                  className="ui-card ui-text-main w-28 rounded px-2 py-0.5 text-right font-mono text-xs font-bold focus:outline-none"
                  ariaLabel="Custom Monthly DCA in IDR"
                />
                <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400">
                  ➔ {simCustom.exactYearsFloat} Thn
                </span>
              </div>
            </div>
            <div className="mt-1.5 flex flex-wrap gap-1 text-[10px]">
              {[1_000_000, 3_000_000, 5_000_000, 10_000_000, 20_000_000].map(
                (v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setMonthlySavingsIdr(v)}
                    className={`rounded px-1.5 py-0.5 font-mono transition ${
                      monthlySavingsIdr === v
                        ? 'bg-emerald-600 font-semibold text-white'
                        : 'ui-card ui-text-muted hover:opacity-80'
                    }`}
                  >
                    {v / 1_000_000}Jt/bln
                  </button>
                )
              )}
            </div>
            <input
              type="range"
              min={500_000}
              max={100_000_000}
              step={500_000}
              value={monthlySavingsIdr}
              onChange={(e) => setMonthlySavingsIdr(Number(e.target.value))}
              className="mt-1.5 h-1.5 w-full cursor-pointer"
              aria-label="Custom Monthly Savings Slider in IDR"
            />
          </div>
        </div>
      </section>

      {/* SECTION 2: THE 15 OPTIMAL PORTFOLIOS TABLE (WITH DYNAMIC SLOT SWAP e.g. BBCA -> PTBA & PINNED CUSTOM ROWS) */}
      <section id="tour-table-section" className="ui-card rounded-xl p-5">
        <div className="ui-border flex flex-col gap-3 border-b pb-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="ui-text-main text-sm font-bold uppercase tracking-wide sm:text-base">
                Tabel 15 Portfolio Optimal &amp; Simulasi Custom Slot
              </h2>
              {isSlotMapCustomized && (
                <span className="rounded border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 dark:text-emerald-300">
                  Mode Custom Slot Aktif (Dihitung Ulang oleh Solver)
                </span>
              )}
            </div>
            <p className="ui-text-muted mt-0.5 text-xs">
              Anda bisa mengganti instrumen di header kolom tabel (contoh: ubah{' '}
              <strong>BBCA ➔ PTBA</strong>) untuk melihat bagaimana bobot ke-15
              strategi berubah secara otomatis, atau pin racikan custom Anda ke tabel.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            {/* Quick Example Button: Ubah BBCA -> PTBA */}
            <button
              type="button"
              onClick={onQuickSwapBbcaToPtba}
              className={`flex items-center gap-1 rounded-md border px-2.5 py-1 text-xs font-semibold transition ${
                slotMap.BBCA === 'PTBA'
                  ? 'border-emerald-500 bg-emerald-600 text-white'
                  : 'ui-subtle ui-text-main hover:opacity-80'
              }`}
            >
              <Repeat className="h-3 w-3" />
              <span>Contoh Custom: Ubah BBCA ➔ PTBA</span>
            </button>

            {isSlotMapCustomized && (
              <button
                type="button"
                onClick={onResetSlotMap}
                className="ui-subtle ui-text-muted flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium hover:opacity-80"
              >
                <RotateCcw className="h-3 w-3" />
                <span>Reset 8 Benchmark Video</span>
              </button>
            )}

            {/* Archetype Filter Segmented Control */}
            <div className="ui-subtle inline-flex rounded-lg p-0.5 border text-xs">
              <button
                type="button"
                onClick={() => setArchetypeFilter('all')}
                className={`rounded-md px-2.5 py-1 font-medium transition ${
                  archetypeFilter === 'all'
                    ? 'ui-card ui-text-main font-semibold shadow-2xs'
                    : 'ui-text-muted hover:ui-text-main'
                }`}
              >
                Semua ({showDominated25 ? 25 : 15})
              </button>
              <button
                type="button"
                onClick={() => setArchetypeFilter('business-owner')}
                className={`flex items-center gap-1 rounded-md px-2.5 py-1 font-medium transition ${
                  archetypeFilter === 'business-owner'
                    ? 'ui-card ui-text-main font-semibold shadow-2xs'
                    : 'ui-text-muted hover:ui-text-main'
                }`}
              >
                <Briefcase className="h-3 w-3" />
                <span>&lt;10% DD</span>
              </button>
              <button
                type="button"
                onClick={() => setArchetypeFilter('hybrid-conviction')}
                className={`flex items-center gap-1 rounded-md px-2.5 py-1 font-medium transition ${
                  archetypeFilter === 'hybrid-conviction'
                    ? 'ui-card ui-text-main font-semibold shadow-2xs'
                    : 'ui-text-muted hover:ui-text-main'
                }`}
              >
                <Sparkles className="h-3 w-3" />
                <span>Risk Budgeting</span>
              </button>
              <button
                type="button"
                onClick={() => setArchetypeFilter('full-time-investor')}
                className={`flex items-center gap-1 rounded-md px-2.5 py-1 font-medium transition ${
                  archetypeFilter === 'full-time-investor'
                    ? 'ui-card ui-text-main font-semibold shadow-2xs'
                    : 'ui-text-muted hover:ui-text-main'
                }`}
              >
                <Flame className="h-3 w-3" />
                <span>&gt;18% CAGR</span>
              </button>
            </div>

            <button
              type="button"
              onClick={() => setShowDominated25(!showDominated25)}
              className="ui-subtle ui-text-muted flex items-center gap-1 rounded-lg border px-2.5 py-1 text-xs font-medium hover:ui-text-main transition"
            >
              {showDominated25 ? (
                <EyeOff className="h-3 w-3" />
              ) : (
                <Eye className="h-3 w-3" />
              )}
              <span>{showDominated25 ? 'Sembunyikan 10 Kalah' : '+10 Tereliminasi'}</span>
            </button>

            {/* 3-Mode Cell Value Display Selector (% + Rp | % Bobot | Rp Nominal) */}
            <div className="ui-subtle inline-flex items-center gap-0.5 rounded-lg p-0.5 border text-xs">
              {(
                [
                  { id: 'both', label: '% + Rp' },
                  { id: 'percent', label: '% Saja' },
                  { id: 'nominal', label: 'Rp Juta' },
                ] as const
              ).map((mode) => (
                <button
                  key={mode.id}
                  type="button"
                  onClick={() => setCellDisplayMode(mode.id)}
                  title={`Tampilkan pembagian porsi aset dari Modal Awal ${formatIdr(
                    initialCapitalIdr,
                    true
                  )}`}
                  className={`rounded-md px-2 py-1 font-medium transition ${
                    cellDisplayMode === mode.id
                      ? 'ui-card ui-text-main font-semibold shadow-2xs'
                      : 'ui-text-muted hover:ui-text-main'
                  }`}
                >
                  {mode.label}
                </button>
              ))}
            </div>

            {/* Quick Sorting Selector */}
            <div className="ui-subtle inline-flex items-center gap-0.5 rounded-lg p-0.5 border text-xs">
              <span className="ui-text-muted px-1.5 text-[10px] font-medium hidden sm:inline">
                Sort:
              </span>
              <button
                type="button"
                onClick={() => handleToggleTableSort('rank')}
                className={`rounded px-2 py-1 font-medium transition ${
                  tableSortKey === 'rank'
                    ? 'ui-card ui-text-main font-semibold shadow-2xs'
                    : 'ui-text-muted hover:ui-text-main'
                }`}
              >
                Rank {tableSortKey === 'rank' ? (tableSortOrder === 'asc' ? '↑' : '↓') : ''}
              </button>
              <button
                type="button"
                onClick={() => handleToggleTableSort('cagr')}
                className={`rounded px-2 py-1 font-medium transition ${
                  tableSortKey === 'cagr'
                    ? 'ui-card ui-text-main font-semibold shadow-2xs'
                    : 'ui-text-muted hover:ui-text-main'
                }`}
              >
                CAGR {tableSortKey === 'cagr' ? (tableSortOrder === 'desc' ? '↓' : '↑') : ''}
              </button>
              <button
                type="button"
                onClick={() => handleToggleTableSort('maxDrawdown')}
                className={`rounded px-2 py-1 font-medium transition ${
                  tableSortKey === 'maxDrawdown'
                    ? 'ui-card ui-text-main font-semibold shadow-2xs'
                    : 'ui-text-muted hover:ui-text-main'
                }`}
              >
                Max DD {tableSortKey === 'maxDrawdown' ? (tableSortOrder === 'asc' ? '↑' : '↓') : ''}
              </button>
              <button
                type="button"
                onClick={() => handleToggleTableSort('calmar')}
                className={`rounded px-2 py-1 font-medium transition ${
                  tableSortKey === 'calmar'
                    ? 'ui-card ui-text-main font-semibold shadow-2xs'
                    : 'ui-text-muted hover:ui-text-main'
                }`}
              >
                Calmar {tableSortKey === 'calmar' ? (tableSortOrder === 'desc' ? '↓' : '↑') : ''}
              </button>
            </div>

            {/* Hybrid Table vs Mobile Card View Toggle */}
            <div className="ui-subtle inline-flex items-center gap-0.5 rounded-lg p-0.5 border text-xs">
              <button
                type="button"
                onClick={() => setTableViewMode('table')}
                className={`flex items-center gap-1 rounded-md px-2 py-1 font-medium transition ${
                  tableViewMode === 'table'
                    ? 'ui-card ui-text-main font-semibold shadow-2xs'
                    : 'ui-text-muted hover:ui-text-main'
                }`}
              >
                <Table2 className="h-3 w-3" />
                <span>Tabel</span>
              </button>
              <button
                type="button"
                onClick={() => setTableViewMode('cards')}
                className={`flex items-center gap-1 rounded-md px-2 py-1 font-medium transition ${
                  tableViewMode === 'cards'
                    ? 'ui-card ui-text-main font-semibold shadow-2xs'
                    : 'ui-text-muted hover:ui-text-main'
                }`}
              >
                <LayoutGrid className="h-3 w-3" />
                <span>Kartu</span>
              </button>
            </div>
          </div>
        </div>

        {/* Mobile Quick Slot Switcher Bar when in Card View */}
        {tableViewMode === 'cards' && (
          <div className="ui-subtle mt-3 flex flex-wrap items-center gap-2 rounded-lg p-2.5 text-xs">
            <span className="ui-text-secondary font-semibold">
              Ganti Slot Instrumen:
            </span>
            {core8Slots.map((slotId) => {
              const currentAssetId = slotMap[slotId] ?? slotId;
              const isSwapped = currentAssetId !== slotId;
              return (
                <div
                  key={slotId}
                  className={`flex items-center gap-1 rounded border px-2 py-1 font-mono text-[11px] ${
                    isSwapped
                      ? 'border-emerald-500/50 bg-emerald-500/15'
                      : 'ui-card ui-border'
                  }`}
                >
                  <span className="ui-text-muted text-[10px]">{allAssets.find((a) => a.id === slotId)?.shortName ?? slotId}:</span>
                  <select
                    value={currentAssetId}
                    onChange={(e) => onChangeSlotAsset(slotId, e.target.value)}
                    aria-label={`Slot benchmark ${slotId}`}
                    className="ui-text-main cursor-pointer bg-transparent font-bold focus:outline-none"
                  >
                    {allAssets.map((a) => {
                      const isUsedInOtherSlot = core8Slots.some(
                        (s) => s !== slotId && (slotMap[s] ?? s) === a.id
                      );
                      return (
                        <option
                          key={a.id}
                          value={a.id}
                          disabled={isUsedInOtherSlot}
                          className="bg-zinc-900 text-white"
                        >
                          {a.shortName}{isUsedInOtherSlot ? ' (Sudah Dipakai)' : ''}
                        </option>
                      );
                    })}
                  </select>
                </div>
              );
            })}
          </div>
        )}

        {/* Mode 1: Data Table with Sticky First Column & Scroll Shadow */}
        {tableViewMode === 'table' ? (
          <div
            tabIndex={0}
            role="region"
            aria-labelledby="optimal-portfolios-caption"
            className="ui-border mt-4 max-h-[580px] overflow-auto rounded-lg border"
          >
            <table className="w-full border-separate border-spacing-0 text-left text-xs">
              <caption id="optimal-portfolios-caption" className="sr-only">
                Daftar 15 Portfolio Optimal dan Custom Rows berdasarkan CAGR, Maximum
                Drawdown, dan Bobot Instrumen
              </caption>
              <thead className="ui-card ui-border sticky top-0 z-20 text-[11px] font-semibold uppercase shadow-xs">
                <tr>
                  <th
                    rowSpan={2}
                    onClick={() => handleToggleTableSort('rank')}
                    className="ui-card ui-border sticky left-0 z-30 min-w-[160px] max-w-[200px] cursor-pointer select-none border-b border-r px-2.5 py-2 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.18)] hover:text-emerald-600 sm:max-w-xs sm:px-3"
                    title="Klik untuk sortir berdasarkan Rank / Default"
                  >
                    <div className="flex items-center justify-between">
                      <span>Strategy ({sortedCombinedRows.length})</span>
                      <span className="font-mono text-[10px]">
                        {tableSortKey === 'rank' ? (tableSortOrder === 'asc' ? '▲' : '▼') : ''}
                      </span>
                    </div>
                  </th>
                  <th
                    rowSpan={2}
                    className="ui-border border-b border-r px-2.5 py-2 text-center"
                  >
                    Risk
                  </th>
                  <th
                    rowSpan={2}
                    onClick={() => handleToggleTableSort('cagr')}
                    className="ui-border cursor-pointer select-none border-b border-r px-3 py-2 text-right hover:text-emerald-600"
                    title="Klik untuk sortir berdasarkan CAGR"
                  >
                    <div className="flex items-center justify-end gap-1">
                      <span>CAGR</span>
                      <span className="font-mono text-[10px]">
                        {tableSortKey === 'cagr' ? (tableSortOrder === 'desc' ? '▼' : '▲') : ''}
                      </span>
                    </div>
                  </th>
                  <th
                    rowSpan={2}
                    onClick={() => handleToggleTableSort('maxDrawdown')}
                    className="ui-border cursor-pointer select-none border-b border-r px-3 py-2 text-right hover:text-emerald-600"
                    title="Klik untuk sortir berdasarkan Max Drawdown (Terendah / Paling Aman)"
                  >
                    <div className="flex items-center justify-end gap-1">
                      <span>Max DD</span>
                      <span className="font-mono text-[10px]">
                        {tableSortKey === 'maxDrawdown' ? (tableSortOrder === 'asc' ? '▲' : '▼') : ''}
                      </span>
                    </div>
                  </th>
                  <th
                    colSpan={core8Slots.length + extraCustomAssetIds.length}
                    className="ui-border border-b px-3 py-1 text-center"
                  >
                    Pembagian Aset dari Modal Awal{' '}
                    <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400">
                      {formatIdr(initialCapitalIdr, true)}
                    </span>{' '}
                    — Klik Dropdown Kolom untuk Ganti Instrumen (Misal BBCA ➔ PTBA)
                  </th>
                </tr>
                <tr>
                  {core8Slots.map((slotId) => {
                    const currentAssetId = slotMap[slotId] ?? slotId;
                    const isSwapped = currentAssetId !== slotId;
                    const slotAsset = allAssets.find((a) => a.id === currentAssetId);
                    const slotEffectiveCagr = slotAsset
                      ? getEffectiveAssetCagr(slotAsset)
                      : 0;
                    return (
                      <th
                        key={slotId}
                        className={`ui-border border-b border-r px-1.5 py-1 text-right font-mono text-[11px] ${
                          isSwapped ? 'bg-emerald-500/15' : 'ui-card'
                        }`}
                      >
                        <select
                          value={currentAssetId}
                          onChange={(e) => onChangeSlotAsset(slotId, e.target.value)}
                          title={`Ganti slot benchmark ${slotId} dengan instrumen lain`}
                          aria-label={`Slot benchmark ${slotId}`}
                          className="ui-text-main cursor-pointer bg-transparent font-mono text-[11px] font-bold focus:outline-none"
                        >
                          {allAssets.map((a) => {
                            const isUsedInOtherSlot = core8Slots.some(
                              (s) => s !== slotId && (slotMap[s] ?? s) === a.id
                            );
                            return (
                              <option
                                key={a.id}
                                value={a.id}
                                disabled={isUsedInOtherSlot}
                                className="bg-zinc-900 text-white"
                              >
                                {a.shortName} ({getEffectiveAssetCagr(a).toFixed(1)}%){isUsedInOtherSlot ? ' (Sudah Dipakai)' : ''}
                              </option>
                            );
                          })}
                        </select>
                        {slotAsset && (
                          <div
                            className="text-[9px] font-normal leading-tight text-emerald-600 dark:text-emerald-400"
                            title={`Asumsi Return ${slotAsset.shortName}: ${slotEffectiveCagr.toFixed(1)}%/thn • MaxDD: -${slotAsset.maxDrawdown}%`}
                          >
                            {slotEffectiveCagr.toFixed(1)}%/thn
                          </div>
                        )}
                        {isSwapped && (
                          <div className="ui-text-muted text-[9px] font-normal leading-tight">
                            ex-{slotId}
                          </div>
                        )}
                      </th>
                    );
                  })}
                  {extraCustomAssetIds.map((extraId) => {
                    const extraAsset = allAssets.find((a) => a.id === extraId);
                    return (
                      <th
                        key={extraId}
                        className="ui-card ui-border border-b border-r px-2.5 py-1 text-right font-mono text-[11px]"
                      >
                        <div>{extraId}</div>
                        {extraAsset && (
                          <div className="text-[9px] font-normal leading-tight text-emerald-600 dark:text-emerald-400">
                            {getEffectiveAssetCagr(extraAsset).toFixed(1)}%/thn
                          </div>
                        )}
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {sortedCombinedRows.map((preset, index) => {
                  const isSelected = activePresetId === preset.id;
                  const isPinned = pinnedPresetIds.includes(preset.id);
                  const badge = getRiskTierBadge(preset.riskTier);
                  return (
                    <tr
                      key={preset.id}
                      onClick={() => onSelectPreset(preset)}
                      className={`cursor-pointer transition ${
                        isSelected
                          ? 'bg-emerald-500/10'
                          : isPinned
                            ? 'bg-amber-500/[0.06] hover:bg-amber-500/[0.10]'
                            : preset.isCustomRow
                              ? 'bg-sky-500/5 hover:bg-sky-500/10'
                              : !preset.isOptimal15
                                ? 'opacity-60 hover:opacity-100'
                                : 'hover:bg-zinc-500/5'
                      }`}
                    >
                      <th
                        scope="row"
                        className="ui-card ui-border sticky left-0 z-10 min-w-[160px] max-w-[200px] border-b border-r px-2.5 py-2 font-medium shadow-[2px_0_5px_-2px_rgba(0,0,0,0.18)] sm:max-w-xs sm:px-3"
                      >
                        <div className="flex items-center justify-between gap-1.5">
                          <div className="flex min-w-0 items-center gap-1.5 sm:gap-2">
                            {onTogglePinPreset && (
                              <button
                                type="button"
                                id={index === 0 ? 'tour-table-pin' : undefined}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onTogglePinPreset(preset.id);
                                }}
                                title={
                                  isPinned
                                    ? 'Lepas sematan (unpin) baris ini dari paling atas'
                                    : 'Sematkan (Pin) baris ini ke baris paling atas tabel'
                                }
                                className={`shrink-0 rounded p-1 transition ${
                                  isPinned
                                    ? 'bg-amber-500/20 text-amber-600 dark:text-amber-400'
                                    : 'ui-text-muted hover:bg-zinc-500/10 hover:ui-text-main'
                                }`}
                              >
                                <Pin
                                  className={`h-3.5 w-3.5 ${
                                    isPinned ? 'fill-current rotate-45' : ''
                                  }`}
                                />
                              </button>
                            )}

                            {preset.isCustomRow ? (
                              <span className="shrink-0 rounded bg-emerald-600 px-1.5 py-0.5 font-mono text-[9px] font-bold text-white">
                                CUSTOM
                              </span>
                            ) : (
                              preset.rank && (
                                <span className="ui-subtle ui-text-muted inline-flex h-4 w-4 shrink-0 items-center justify-center rounded font-mono text-[10px]">
                                  {preset.rank}
                                </span>
                              )
                            )}

                            <div className="min-w-0">
                              <div className="flex items-center gap-1">
                                <span className="ui-text-main truncate text-xs font-semibold sm:whitespace-normal">
                                  {preset.name}
                                </span>
                                {isPinned && (
                                  <span className="shrink-0 rounded bg-amber-500/15 px-1 py-0.2 font-mono text-[9px] font-bold text-amber-700 dark:text-amber-300">
                                    📌 Pin
                                  </span>
                                )}
                              </div>
                              {preset.videoNote && (
                                <div className="ui-text-muted mt-0.5 hidden line-clamp-1 max-w-xs text-[10px] font-normal sm:block">
                                  {preset.videoNote}
                                </div>
                              )}
                              {preset.dominatedByReason && (
                                <div className="mt-0.5 line-clamp-1 max-w-xs text-[10px] font-normal text-amber-600 dark:text-amber-400">
                                  ⚠️ {preset.dominatedByReason}
                                </div>
                              )}
                            </div>
                          </div>

                          {preset.isCustomRow && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                onRemoveCustomTableRow(preset.id);
                              }}
                              title="Hapus baris custom ini dari tabel"
                              className="ui-text-muted shrink-0 rounded p-1 hover:text-rose-500"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                      </th>

                      <td className="ui-border border-b border-r px-2 py-2 text-center">
                        <span
                          className={`inline-block rounded border px-1.5 py-0.5 text-[10px] font-medium ${badge.bgClass} ${badge.textClass} ${badge.borderClass}`}
                        >
                          {badge.label.replace(' RISK', '')}
                        </span>
                      </td>

                      <td className="ui-border border-b border-r px-3 py-2 text-right font-mono font-semibold text-emerald-600 dark:text-emerald-400">
                        {preset.cagr.toFixed(2)}%
                      </td>

                      <td className="ui-border border-b border-r px-3 py-2 text-right font-mono font-semibold text-rose-600 dark:text-rose-400">
                        {preset.maxDrawdown.toFixed(2)}%
                      </td>

                      {[...mappedColumnIds, ...extraCustomAssetIds].map(
                        (colAssetId, colIdx) => {
                          const w = preset.weights[colAssetId] ?? 0;
                          const nominalText = formatNominalCell(w);
                          return (
                            <td
                              key={`${colAssetId}-${colIdx}`}
                              className={`ui-border border-b border-r px-2.5 py-2 text-right font-mono ${
                                w >= 30
                                  ? 'ui-text-main bg-emerald-500/5 font-bold'
                                  : w > 0
                                    ? 'ui-text-secondary'
                                    : 'ui-text-muted opacity-40'
                              }`}
                            >
                              {w === 0 ? (
                                <span>0%</span>
                              ) : cellDisplayMode === 'percent' ? (
                                <span>{w}%</span>
                              ) : cellDisplayMode === 'nominal' ? (
                                <span className="text-emerald-600 dark:text-emerald-400">
                                  {nominalText}
                                </span>
                              ) : (
                                <div className="leading-tight">
                                  <div>{w}%</div>
                                  <div className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">
                                    {nominalText}
                                  </div>
                                </div>
                              )}
                            </td>
                          );
                        }
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          /* Mode 2: Zero-Horizontal-Scroll Responsive Card View */
          <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {sortedCombinedRows.map((preset) => {
              const isSelected = activePresetId === preset.id;
              const badge = getRiskTierBadge(preset.riskTier);
              const nonZeroWeights = Object.entries(preset.weights)
                .filter(([, w]) => w > 0)
                .sort((a, b) => b[1] - a[1]);
              const isPinned = pinnedPresetIds.includes(preset.id);

              return (
                <div
                  key={preset.id}
                  onClick={() => onSelectPreset(preset)}
                  className={`flex cursor-pointer flex-col justify-between rounded-xl border p-3.5 transition ${
                    isSelected
                      ? 'border-emerald-500 bg-emerald-500/10 shadow-xs'
                      : isPinned
                        ? 'border-amber-500/50 bg-amber-500/[0.05] hover:border-amber-500/80'
                        : 'ui-subtle ui-border hover:border-emerald-500/40'
                  }`}
                >
                  <div>
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-1.5">
                        {onTogglePinPreset && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onTogglePinPreset(preset.id);
                            }}
                            title={
                              isPinned
                                ? 'Lepas sematan (unpin) kartu ini'
                                : 'Sematkan (Pin) kartu ini ke paling atas'
                            }
                            className={`shrink-0 rounded p-1 transition ${
                              isPinned
                                ? 'bg-amber-500/20 text-amber-600 dark:text-amber-400'
                                : 'ui-text-muted hover:bg-zinc-500/10 hover:ui-text-main'
                            }`}
                          >
                            <Pin
                              className={`h-3.5 w-3.5 ${
                                isPinned ? 'fill-current rotate-45' : ''
                              }`}
                            />
                          </button>
                        )}
                        {preset.isCustomRow ? (
                          <span className="rounded bg-emerald-600 px-1.5 py-0.5 font-mono text-[9px] font-bold text-white">
                            CUSTOM
                          </span>
                        ) : (
                          preset.rank && (
                            <span className="ui-card ui-text-muted inline-flex h-5 w-5 shrink-0 items-center justify-center rounded font-mono text-[10px] font-bold">
                              #{preset.rank}
                            </span>
                          )
                        )}
                        <h3 className="ui-text-main text-xs font-bold">
                          {preset.name}
                        </h3>
                        {isPinned && (
                          <span className="shrink-0 rounded bg-amber-500/15 px-1 py-0.2 font-mono text-[9px] font-bold text-amber-700 dark:text-amber-300">
                            📌 Pin
                          </span>
                        )}
                      </div>
                      <span
                        className={`shrink-0 rounded border px-1.5 py-0.5 text-[10px] font-medium ${badge.bgClass} ${badge.textClass} ${badge.borderClass}`}
                      >
                        {badge.label.replace(' RISK', '')}
                      </span>
                    </div>

                    {/* Key Metrics Row */}
                    <div className="ui-card mt-2.5 grid grid-cols-3 gap-2 rounded-lg p-2 text-center font-mono text-xs">
                      <div>
                        <div className="ui-text-muted text-[9px] uppercase">
                          CAGR
                        </div>
                        <div className="font-bold text-emerald-600 dark:text-emerald-400">
                          +{preset.cagr.toFixed(2)}%
                        </div>
                      </div>
                      <div>
                        <div className="ui-text-muted text-[9px] uppercase">
                          Max DD
                        </div>
                        <div className="font-bold text-rose-600 dark:text-rose-400">
                          -{preset.maxDrawdown.toFixed(2)}%
                        </div>
                      </div>
                      <div>
                        <div className="ui-text-muted text-[9px] uppercase">
                          Calmar
                        </div>
                        <div className="ui-text-main font-bold">
                          {(preset.cagr / Math.max(0.5, preset.maxDrawdown)).toFixed(2)}x
                        </div>
                      </div>
                    </div>

                    {/* Weight Pills */}
                    <div className="mt-2.5 flex flex-wrap gap-1">
                      {nonZeroWeights.map(([assetId, w]) => (
                        <span
                          key={assetId}
                          className={`rounded px-1.5 py-0.5 font-mono text-[10px] ${
                            w >= 30
                              ? 'bg-emerald-500/15 font-bold text-emerald-700 dark:text-emerald-300'
                              : 'ui-card ui-text-secondary'
                          }`}
                        >
                          {assetId}{' '}
                          {cellDisplayMode === 'percent'
                            ? `${w}%`
                            : cellDisplayMode === 'nominal'
                              ? formatNominalCell(w)
                              : `${w}% (${formatNominalCell(w)})`}
                        </span>
                      ))}
                    </div>

                    {preset.videoNote && (
                      <p className="ui-text-muted mt-2 text-[11px]">
                        {preset.videoNote}
                      </p>
                    )}
                    {preset.dominatedByReason && (
                      <p className="mt-1.5 text-[10px] text-amber-600 dark:text-amber-400">
                        ⚠️ {preset.dominatedByReason}
                      </p>
                    )}
                  </div>

                  <div className="ui-border mt-3 flex items-center justify-between border-t pt-2 text-[11px]">
                    <span
                      className={`font-semibold ${
                        isSelected
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : 'ui-text-muted'
                      }`}
                    >
                      {isSelected ? '✓ Sedang Aktif' : 'Tap untuk Pakai'}
                    </span>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setComparePresetId(preset.id);
                      }}
                      className="ui-card ui-text-secondary rounded px-2 py-0.5 text-[10px] font-medium hover:opacity-80"
                    >
                      Jadikan Pembanding
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* SECTION 3: CUSTOM QUANT SOLVER & MANUAL WEIGHT BUILDER */}
      <section className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <div id="tour-builder-sliders" className="ui-card space-y-5 rounded-xl p-5 lg:col-span-7">
          <div className="ui-border flex flex-wrap items-center justify-between gap-2 border-b pb-3">
            <div className="flex items-center gap-2">
              <Sliders className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
              <h2 className="ui-text-main text-sm font-bold">
                Custom Portfolio Quant Lab &amp; Bobot Editor
              </h2>
            </div>

            <div className="ui-subtle flex flex-wrap gap-1 rounded-lg p-1">
              {(
                [
                  { id: 'risk-parity', label: 'Risk Parity' },
                  { id: 'risk-budgeting', label: 'Risk Budgeting' },
                  { id: 'all-in', label: 'All-In' },
                  { id: 'custom', label: 'Manual' },
                ] as const
              ).map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setAllocationMethod(m.id)}
                  className={`rounded px-2.5 py-1 text-xs font-medium transition ${
                    allocationMethod === m.id
                      ? 'ui-card ui-text-main font-semibold shadow-2xs'
                      : 'ui-text-muted hover:ui-text-main'
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>

          {/* Pin Current Custom Lab Configuration into the Main Comparison Table */}
          <div className="ui-subtle flex flex-col gap-2 rounded-lg p-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex-1">
              <div className="ui-text-main text-xs font-semibold">
                Masukkan Racikan Ini ke Tabel Utama di Atas
              </div>
              <p className="ui-text-muted text-[11px]">
                Bandingkan pembagian bobot, CAGR ({solvedMetrics.cagr}%), &amp; Max DD
                (-{solvedMetrics.maxDrawdown}%) dengan 15 preset lainnya.
              </p>
            </div>
            <div className="flex items-center gap-1.5">
              <input
                type="text"
                placeholder="Nama baris (opsional)..."
                value={customRowName}
                onChange={(e) => setCustomRowName(e.target.value)}
                className="ui-card ui-text-main w-40 rounded px-2.5 py-1.5 text-xs focus:outline-none"
              />
              <button
                type="button"
                onClick={() => {
                  onPinCurrentToTable(customRowName.trim() || undefined);
                  setCustomRowName('');
                }}
                className="flex items-center gap-1 rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-500"
              >
                <Pin className="h-3.5 w-3.5" />
                <span>+ Masukkan ke Tabel</span>
              </button>
            </div>
          </div>

          {/* Step A: Select Active Asset Universe */}
          <div>
            <div className="flex items-center justify-between">
              <label className="ui-text-secondary text-xs font-semibold">
                1. Pilih Instrumen di Universe Anda:
              </label>
              <span className="ui-text-muted text-[11px]">
                {selectedUniverseIds.length} aktif
              </span>
            </div>

            <div className="mt-2 flex flex-wrap gap-1.5">
              {allAssets.map((asset) => {
                const isSelected = selectedUniverseIds.includes(asset.id);
                const effCagr = getEffectiveAssetCagr(asset);
                return (
                  <button
                    key={asset.id}
                    type="button"
                    onClick={() => onToggleUniverseAsset(asset.id)}
                    title={`${asset.name} • Asumsi Return 5Y: ${effCagr.toFixed(1)}%/thn • Max DD: -${asset.maxDrawdown}%`}
                    className={`flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium transition ${
                      isSelected
                        ? 'ui-text-main border-emerald-500/50 bg-emerald-500/10 font-semibold'
                        : 'ui-subtle ui-text-muted opacity-65 hover:opacity-100'
                    }`}
                  >
                    <span
                      className="h-2 w-2 rounded-full"
                      style={{ backgroundColor: asset.color }}
                    />
                    <span>{asset.shortName}</span>
                    <span className="font-mono text-[10px] text-emerald-600 dark:text-emerald-400">
                      {effCagr.toFixed(1)}%
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Step B: Conviction Risk Budgeting Controls */}
          {(allocationMethod === 'risk-budgeting' || allocationMethod === 'all-in') && (
            <div className="ui-subtle rounded-lg p-4">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="ui-text-main text-xs font-semibold">
                    2. Pilih Aset Conviction (Bias Bull Market — Menit 09:01):
                  </div>
                  <p className="ui-text-muted text-[11px]">
                    Alokasikan persentase <strong>Risiko</strong> ke instrumen utama.
                  </p>
                </div>

                {allocationMethod === 'risk-budgeting' && (
                  <select
                    value={solverMode}
                    onChange={(e) =>
                      setSolverMode(
                        e.target.value as 'calibrated-video' | 'euler-covariance'
                      )
                    }
                    className="ui-card ui-text-main rounded px-2 py-1 text-xs"
                    aria-label="Quant Solver Algorithm"
                  >
                    <option value="calibrated-video">Solver: Video Calibrated</option>
                    <option value="euler-covariance">Solver: Exact Covariance</option>
                  </select>
                )}
              </div>

              <div className="mt-2.5 flex flex-wrap gap-1.5">
                {allAssets
                  .filter((a) => selectedUniverseIds.includes(a.id))
                  .map((asset) => (
                    <button
                      key={asset.id}
                      type="button"
                      onClick={() => setConvictionAssetId(asset.id)}
                      className={`rounded px-2.5 py-1 text-xs font-semibold transition ${
                        convictionAssetId === asset.id
                          ? 'bg-emerald-600 text-white'
                          : 'ui-card ui-text-secondary'
                      }`}
                    >
                      {asset.shortName}
                    </button>
                  ))}
              </div>

              {allocationMethod === 'risk-budgeting' && (
                <div className="mt-3">
                  <div className="flex items-center justify-between text-xs">
                    <span className="ui-text-secondary">
                      Alokasi Risiko di <strong>{convictionAssetId}</strong>:
                    </span>
                    <div className="flex items-center gap-1.5">
                      {[50, 70, 80, 90].map((presetPct) => (
                        <button
                          key={presetPct}
                          type="button"
                          onClick={() => setConvictionRiskPercent(presetPct)}
                          className={`rounded px-2 py-0.5 font-mono text-xs ${
                            convictionRiskPercent === presetPct
                              ? 'bg-emerald-600 font-semibold text-white'
                              : 'ui-card ui-text-secondary'
                          }`}
                        >
                          {presetPct}%
                        </button>
                      ))}
                    </div>
                  </div>
                  <input
                    type="range"
                    min={20}
                    max={95}
                    step={5}
                    value={convictionRiskPercent}
                    onChange={(e) => setConvictionRiskPercent(Number(e.target.value))}
                    className="mt-2 h-1.5 w-full cursor-pointer"
                    aria-label="Conviction Risk Budget Percentage"
                  />
                  <div className="ui-text-muted mt-1 flex justify-between text-[11px]">
                    <span>20% Risiko</span>
                    <span className="ui-text-main font-mono font-semibold">
                      {convictionRiskPercent}% Risiko ➔{' '}
                      {activeWeights[convictionAssetId] ?? 0}% Bobot Modal
                    </span>
                    <span>95% Risiko</span>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Step C: Interactive Weight Sliders & Per-Asset Return Assumptions */}
          <div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="ui-text-secondary text-xs font-semibold">
                3. Bobot Modal (%), Asumsi Return Aset (%/thn) & Kontribusi CAGR:
              </span>
              <div className="flex items-center gap-2">
                {hasCustomAssetAssumptions && (
                  <button
                    type="button"
                    onClick={onResetAssetAssumptions}
                    className="rounded bg-amber-500/15 px-2 py-0.5 text-[11px] font-semibold text-amber-600 hover:bg-amber-500/25 dark:text-amber-400"
                  >
                    Reset Asumsi 5Y Video
                  </button>
                )}
                <span className="ui-text-main font-mono text-xs font-semibold">
                  Total Bobot: {manualSum.toFixed(1)}% ➔ CAGR{' '}
                  <span className="text-emerald-600 dark:text-emerald-400">
                    {solvedMetrics.cagr.toFixed(2)}%
                  </span>
                </span>
                {/* Locked Assets Badge & Unlock All */}
                {lockedCount > 0 && (
                  <div className="flex items-center gap-1.5 rounded-lg bg-amber-500/10 border border-amber-500/30 px-2 py-0.5 text-xs text-amber-700 dark:text-amber-300">
                    <Lock className="h-3 w-3" />
                    <span className="font-semibold">{lockedCount} Tergembok ({lockedSum}%)</span>
                    {onUnlockAllAssets && (
                      <button
                        type="button"
                        onClick={onUnlockAllAssets}
                        className="ml-1 text-[10px] underline hover:opacity-80"
                        title="Buka semua gembok aset"
                      >
                        Buka Semua
                      </button>
                    )}
                  </div>
                )}

                {/* Warning if locked sum exceeds 100% */}
                {isLockedSumOverLimit && (
                  <span className="rounded bg-rose-500/15 border border-rose-500/30 px-2 py-0.5 text-[10px] font-bold text-rose-600 dark:text-rose-400">
                    ⚠️ Total gembok ({lockedSum}%) &gt; 100%!
                  </span>
                )}

                {Math.abs(manualSum - 100) > 0.2 && (
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      disabled={isLockedSumOverLimit}
                      onClick={() => onNormalizeManualWeights('proportional')}
                      className={`rounded px-2 py-0.5 text-xs font-semibold transition ${
                        isLockedSumOverLimit
                          ? 'bg-zinc-300/30 text-zinc-400 cursor-not-allowed'
                          : 'ui-subtle ui-text-main hover:bg-emerald-500/20'
                      }`}
                      title={
                        lockedCount > 0
                          ? 'Skalakan aset yang tidak digembok secara proporsional agar total = 100%'
                          : 'Normalisasi seluruh aset agar total = 100%'
                      }
                    >
                      Normalize 100%
                    </button>

                    {lockedCount > 0 && (
                      <button
                        type="button"
                        disabled={isLockedSumOverLimit}
                        onClick={() => onNormalizeManualWeights('equal')}
                        className={`rounded px-2 py-0.5 text-xs font-medium transition ${
                          isLockedSumOverLimit
                            ? 'bg-zinc-300/30 text-zinc-400 cursor-not-allowed'
                            : 'ui-subtle text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/15'
                        }`}
                        title="Bagi rata sisa persentase sama besar ke seluruh aset yang tidak digembok"
                      >
                        Bagi Rata (Equalize)
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>

            <div className="mt-2.5 max-h-80 space-y-2 overflow-y-auto pr-1">
              {allAssets
                .filter(
                  (a) =>
                    selectedUniverseIds.includes(a.id) || (activeWeights[a.id] ?? 0) > 0
                )
                .map((asset) => {
                  const capWeight = activeWeights[asset.id] ?? 0;
                  const isLocked = lockedSet.has(asset.id);
                  const riskContrib = solvedMetrics.riskContributions[asset.id] ?? 0;
                  const effectiveCagr = getEffectiveAssetCagr(asset);
                  const cagrContrib = (capWeight / 100) * effectiveCagr;
                  return (
                    <div key={asset.id} className="ui-subtle rounded-lg p-2.5">
                      {editingAssetId === asset.id ? (
                        /* Unlocked Edit State */
                        <div className="space-y-2 rounded-md bg-zinc-900/60 p-2.5 border border-emerald-500/30 mb-2">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="flex flex-wrap items-center gap-2">
                              <span
                                className="h-2.5 w-2.5 rounded-full"
                                style={{ backgroundColor: asset.color }}
                              />
                              <div className="flex items-center gap-1.5">
                                <span className="text-[11px] text-zinc-400">Kode:</span>
                                <input
                                  type="text"
                                  value={draftShortName}
                                  onChange={(e) => setDraftShortName(e.target.value.toUpperCase())}
                                  placeholder="RDS"
                                  maxLength={10}
                                  className="ui-card ui-text-main w-20 rounded px-1.5 py-0.5 text-xs font-bold font-mono focus:outline-none focus:ring-1 focus:ring-emerald-500"
                                  aria-label={`Edit kode ticker ${asset.shortName}`}
                                />
                              </div>
                              <div className="flex items-center gap-1.5">
                                <span className="text-[11px] text-zinc-400">Nama:</span>
                                <input
                                  type="text"
                                  value={draftName}
                                  onChange={(e) => setDraftName(e.target.value)}
                                  placeholder="Reksa Dana Saham"
                                  className="ui-card ui-text-main w-36 sm:w-48 rounded px-1.5 py-0.5 text-xs focus:outline-none focus:ring-1 focus:ring-emerald-500"
                                  aria-label={`Edit nama lengkap ${asset.shortName}`}
                                />
                              </div>
                            </div>

                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => handleSaveEditAsset(asset.id)}
                                className="flex items-center gap-1 rounded bg-emerald-600 px-2 py-0.5 text-xs font-semibold text-white hover:bg-emerald-500"
                                title="Simpan Perubahan Ticker & Mode"
                              >
                                <Check className="h-3.5 w-3.5" />
                                <span>Simpan</span>
                              </button>
                              <button
                                type="button"
                                onClick={handleCancelEditAsset}
                                className="flex items-center gap-1 rounded bg-zinc-700 px-2 py-0.5 text-xs font-medium text-zinc-200 hover:bg-zinc-600"
                                title="Batal Edit"
                              >
                                <X className="h-3.5 w-3.5" />
                                <span>Batal</span>
                              </button>
                              {(asset.isRenamed || asset.originalShortName) && (
                                <button
                                  type="button"
                                  onClick={() => handleResetDefaultAsset(asset.id)}
                                  className="flex items-center gap-1 rounded bg-rose-500/10 px-2 py-0.5 text-xs font-medium text-rose-400 hover:bg-rose-500/20 border border-rose-500/30"
                                  title={`Kembalikan ke ${asset.originalShortName || asset.id} standar pabrikan`}
                                >
                                  <RotateCcw className="h-3.5 w-3.5" />
                                  <span>Reset Default</span>
                                </button>
                              )}
                            </div>
                          </div>

                          <div className="flex items-center gap-2 pt-1 border-t border-zinc-700/50">
                            <label className="flex items-center gap-2 text-[11px] cursor-pointer text-zinc-300">
                              <input
                                type="checkbox"
                                checked={draftIsNominal}
                                onChange={(e) => setDraftIsNominal(e.target.checked)}
                                className="rounded border-zinc-600 text-emerald-500 focus:ring-emerald-500"
                              />
                              <span className="font-medium">
                                Mode Reksa Dana (Nominal Bebas Lot 100 BEI)
                              </span>
                            </label>
                            {draftIsNominal && (
                              <span className="text-[10px] text-sky-400 bg-sky-500/10 px-1.5 py-0.2 rounded border border-sky-500/20">
                                Eksekusi nominal Rupiah bebas tanpa sisa odd-lot
                              </span>
                            )}
                          </div>
                        </div>
                      ) : null}

                      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                        {editingAssetId !== asset.id ? (
                          <div className="flex items-center gap-2">
                            <span
                              className="h-2.5 w-2.5 rounded-full"
                              style={{ backgroundColor: asset.color }}
                            />
                            <span className="ui-text-main font-semibold">
                              {asset.shortName}
                            </span>
                            <span className="ui-text-muted hidden sm:inline">
                              {asset.name}
                            </span>
                            {asset.isNominalOnly && (
                              <span
                                className="rounded bg-sky-500/10 px-1.5 py-0.5 font-mono text-[9px] font-semibold text-sky-500 dark:text-sky-400 border border-sky-500/30"
                                title="Aset ini dieksekusi dalam nominal Rupiah murni bebas aturan pembulatan 100 lembar BEI"
                              >
                                Reksa Dana / Nominal
                              </span>
                            )}
                            {asset.isRenamed && (
                              <span
                                className="rounded bg-purple-500/10 px-1.5 py-0.5 font-mono text-[9px] font-semibold text-purple-600 dark:text-purple-400 border border-purple-500/30"
                                title={`Aset ini telah dikustomisasi dari ${asset.originalShortName || asset.id}`}
                              >
                                Customized
                              </span>
                            )}
                            {onUpdateAssetMeta && (
                              <button
                                type="button"
                                onClick={() => handleStartEditAsset(asset)}
                                className="ui-text-muted hover:ui-text-main hover:bg-zinc-500/10 rounded p-1 transition"
                                title={`Ubah Kode Ticker (${asset.shortName}), Nama, atau Mode Reksa Dana`}
                              >
                                <Pencil className="h-3 w-3" />
                              </button>
                            )}
                          </div>
                        ) : (
                          <div className="flex items-center gap-1.5 text-xs text-emerald-500/80 font-medium italic">
                            <span>✏️ Mode Edit Instrumen Aktif</span>
                          </div>
                        )}
                        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                          <span className="font-mono text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
                            {formatNominalCell(capWeight)}
                          </span>
                          <span
                            className="rounded bg-emerald-500/10 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-emerald-600 dark:text-emerald-400"
                            title={`${capWeight}% bobot × ${effectiveCagr.toFixed(1)}% asumsi return = +${cagrContrib.toFixed(2)}%/thn kontribusi ke CAGR`}
                          >
                            +{cagrContrib.toFixed(2)}%/thn
                          </span>
                          <span className="ui-text-muted text-[11px]">
                            Risk:{' '}
                            <strong className="ui-text-secondary font-mono">
                              {riskContrib.toFixed(1)}%
                            </strong>
                          </span>
                          <div className="flex items-center gap-1">
                            {onToggleLockAsset && (
                              <button
                                type="button"
                                onClick={() => onToggleLockAsset(asset.id)}
                                className={`rounded p-1 transition ${
                                  isLocked
                                    ? 'bg-amber-500/20 text-amber-600 dark:text-amber-400 border border-amber-500/40 shadow-xs'
                                    : 'ui-text-muted hover:ui-text-main hover:bg-zinc-500/10'
                                }`}
                                title={
                                  isLocked
                                    ? `${asset.shortName} terkunci pada ${capWeight}%. Klik untuk membuka gembok.`
                                    : `Gembok bobot ${asset.shortName} agar tidak berubah saat Normalize.`
                                }
                              >
                                {isLocked ? (
                                  <Lock className="h-3 w-3" />
                                ) : (
                                  <Unlock className="h-3 w-3 opacity-60 hover:opacity-100" />
                                )}
                              </button>
                            )}
                            <input
                              type="number"
                              min={0}
                              max={100}
                              step={1}
                              value={capWeight}
                              disabled={isLocked}
                              readOnly={isLocked}
                              onChange={(e) =>
                                onManualWeightChange(
                                  asset.id,
                                  Math.max(0, Math.min(100, Number(e.target.value)))
                                )
                              }
                              className={`ui-card ui-text-main w-14 rounded px-1.5 py-0.5 text-right font-mono text-xs font-semibold ${
                                isLocked
                                  ? 'bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-500/30 cursor-not-allowed opacity-90'
                                  : ''
                              }`}
                              aria-label={`${asset.shortName} weight percentage`}
                            />
                            <span className="ui-text-muted font-mono text-xs">%</span>
                          </div>
                        </div>
                      </div>

                      <input
                        type="range"
                        min={0}
                        max={100}
                        step={1}
                        value={capWeight}
                        disabled={isLocked}
                        onChange={(e) =>
                          onManualWeightChange(asset.id, Number(e.target.value))
                        }
                        className={`mt-1.5 h-1.5 w-full ${
                          isLocked ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'
                        }`}
                        aria-label={`${asset.shortName} weight slider`}
                      />

                      {/* Inline Editable Asset Return (CAGR %) & MaxDD (%) Assumptions */}
                      <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2 border-t border-zinc-500/10 pt-1.5 text-[10px]">
                        <div className="flex items-center gap-1.5">
                          <span className="ui-text-muted">Asumsi Return Aset:</span>
                          <input
                            type="number"
                            step={0.5}
                            min={-50}
                            max={200}
                            value={asset.cagr}
                            onChange={(e) =>
                              onUpdateAssetAssumption(asset.id, {
                                cagr: Number(e.target.value),
                              })
                            }
                            className="ui-card ui-text-main w-14 rounded px-1 py-0.5 text-right font-mono text-[10px] font-semibold"
                            aria-label={`Asumsi CAGR tahunan ${asset.shortName}`}
                          />
                          <span className="ui-text-muted font-mono">%/thn</span>
                          {asset.id === 'RDPT' && rdptPromoActive && (
                            <span className="font-mono font-semibold text-emerald-600 dark:text-emerald-400">
                              (+3% Promo = {effectiveCagr.toFixed(1)}%)
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-1.5">
                          <span className="ui-text-muted">Asumsi MaxDD:</span>
                          <span className="font-mono text-rose-500">-</span>
                          <input
                            type="number"
                            step={0.5}
                            min={0.5}
                            max={99}
                            value={asset.maxDrawdown}
                            onChange={(e) =>
                              onUpdateAssetAssumption(asset.id, {
                                maxDrawdown: Math.max(0.5, Number(e.target.value)),
                              })
                            }
                            className="ui-card ui-text-main w-14 rounded px-1 py-0.5 text-right font-mono text-[10px] font-semibold"
                            aria-label={`Asumsi Max Drawdown ${asset.shortName}`}
                          />
                          <span className="ui-text-muted font-mono">%</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>

          {/* Step D: Custom Ticker Lookup & Synthetic Asset Creator */}
          <div className="ui-border border-t pt-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="ui-text-secondary text-xs font-semibold">
                Tambah Instrumen Baru (Yahoo Ticker / Custom Aset):
              </div>
              <button
                type="button"
                onClick={() => setShowSyntheticForm(!showSyntheticForm)}
                className="ui-text-secondary flex items-center gap-1 text-xs font-medium underline"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>
                  {showSyntheticForm ? 'Tutup Form Manual' : 'Edit Asumsi / Manual'}
                </span>
              </button>
            </div>

            <div className="mt-2 flex gap-2">
              <div className="relative flex-1">
                <Search className="ui-text-muted absolute left-3 top-2 h-3.5 w-3.5" />
                <input
                  type="text"
                  placeholder="Ketik simbol saham Indo/US (contoh: AADI.JK, PTBA, ADRO, BREN, NVDA)..."
                  value={tickerInput}
                  onChange={(e) => setTickerInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleYahooLookup()}
                  className="ui-input w-full rounded-lg pl-8 pr-3 py-1.5 text-xs"
                />
              </div>
              <button
                type="button"
                onClick={() => handleYahooLookup()}
                disabled={isLookingUpTicker}
                className="rounded-lg bg-emerald-600 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
              >
                {isLookingUpTicker ? 'Loading...' : 'Add Ticker'}
              </button>
            </div>

            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <span className="ui-text-muted text-[10px] font-medium">
                Quick Add:
              </span>
              {Object.keys(POPULAR_TICKER_ESTIMATES)
                .slice(0, 9)
                .map((sym) => (
                  <button
                    key={sym}
                    type="button"
                    onClick={() => handleYahooLookup(sym)}
                    className="ui-subtle ui-text-secondary rounded px-2 py-0.5 font-mono text-[10px] hover:opacity-80"
                  >
                    +{sym.replace('.JK', '')}
                  </button>
                ))}
            </div>

            {tickerError && (
              <p className="mt-2 text-[11px] text-amber-600 dark:text-amber-400">
                {tickerError}
              </p>
            )}

            {lastFetchedTickerInfo && (
              <div className="ui-subtle mt-3 rounded-lg p-3 text-xs">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="ui-text-main font-semibold">
                    {lastFetchedTickerInfo.symbol} — {lastFetchedTickerInfo.name}
                  </div>
                  <span className="ui-card ui-text-muted rounded px-2 py-0.5 font-mono text-[10px]">
                    {lastFetchedTickerInfo.sourceType === 'live-yahoo'
                      ? `Live Yahoo (${lastFetchedTickerInfo.dataYears} Thn)`
                      : `Quant Estimate (${lastFetchedTickerInfo.dataYears} Thn)`}
                  </span>
                </div>
                <div className="ui-text-secondary mt-1.5 flex flex-wrap gap-4 font-mono text-[11px]">
                  <span>
                    CAGR: <strong>{lastFetchedTickerInfo.cagr}%/thn</strong>
                  </span>
                  <span>
                    Max DD: <strong>-{lastFetchedTickerInfo.maxDrawdown}%</strong>
                  </span>
                  <span>
                    Vol: <strong>{lastFetchedTickerInfo.volatility}%</strong>
                  </span>
                  <span>
                    Harga:{' '}
                    <strong>
                      {lastFetchedTickerInfo.currency === 'IDR'
                        ? `Rp ${lastFetchedTickerInfo.price.toLocaleString('id-ID')}`
                        : `$${lastFetchedTickerInfo.price}`}
                    </strong>
                  </span>
                </div>
                <p className="ui-text-muted mt-1.5 text-[11px]">
                  <strong>Asumsi:</strong> {lastFetchedTickerInfo.assumptionNote}{' '}
                  <button
                    type="button"
                    onClick={() => setShowSyntheticForm(true)}
                    className="ui-text-main underline"
                  >
                    Ubah angka
                  </button>
                </p>
              </div>
            )}

            {showSyntheticForm && (
              <form
                onSubmit={handleAddSyntheticAsset}
                className="ui-subtle mt-3 grid grid-cols-2 gap-2.5 rounded-lg p-3 sm:grid-cols-6"
              >
                <div className="sm:col-span-1">
                  <label className="ui-text-muted block text-[10px]">Simbol</label>
                  <input
                    type="text"
                    required
                    placeholder="SBN"
                    value={synthSymbol}
                    onChange={(e) => setSynthSymbol(e.target.value)}
                    className="ui-card ui-text-main mt-1 w-full rounded px-2 py-1 text-xs"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="ui-text-muted block text-[10px]">Nama Aset</label>
                  <input
                    type="text"
                    placeholder="Obligasi / Saham"
                    value={synthName}
                    onChange={(e) => setSynthName(e.target.value)}
                    className="ui-card ui-text-main mt-1 w-full rounded px-2 py-1 text-xs"
                  />
                </div>
                <div>
                  <label className="ui-text-muted block text-[10px]">CAGR (%)</label>
                  <input
                    type="number"
                    step="0.5"
                    value={synthCagr}
                    onChange={(e) => setSynthCagr(Number(e.target.value))}
                    className="ui-card ui-text-main mt-1 w-full rounded px-2 py-1 text-xs"
                  />
                </div>
                <div>
                  <label className="ui-text-muted block text-[10px]">Max DD (%)</label>
                  <input
                    type="number"
                    step="0.5"
                    value={synthMaxDd}
                    onChange={(e) => setSynthMaxDd(Number(e.target.value))}
                    className="ui-card ui-text-main mt-1 w-full rounded px-2 py-1 text-xs"
                  />
                </div>
                <div className="flex items-end">
                  <button
                    type="submit"
                    className="w-full rounded bg-emerald-600 py-1.5 text-xs font-semibold text-white hover:bg-emerald-500"
                  >
                    Simpan
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>

        {/* Right 5 Cols: Visual Quant Charts */}
        <div className="space-y-5 lg:col-span-5">
          {/* Chart 1: Bobot Modal vs Porsi Risiko */}
          <div className="ui-card rounded-xl p-5">
            <div className="flex items-center justify-between">
              <h3 className="ui-text-main text-sm font-bold">
                Bobot Modal (%) vs Porsi Risiko (%)
              </h3>
              <Layers className="ui-text-muted h-4 w-4" />
            </div>
            <p className="ui-text-muted mt-1 text-xs">
              Menjelaskan kenapa bobot modal 18% di BTC setara dengan ~90% risiko
              portfolio (09:20).{' '}
              <span className="ui-text-secondary font-medium">
                Klik batang aset untuk menjadikannya Conviction Risk Budgeting.
              </span>
            </p>

            <div className="mt-4 h-60 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={weightVsRiskData}
                  margin={{ top: 8, right: 10, left: -18, bottom: 0 }}
                >
                  <XAxis
                    dataKey="symbol"
                    stroke="#71717a"
                    fontSize={11}
                    tickLine={false}
                  />
                  <YAxis
                    stroke="#71717a"
                    fontSize={11}
                    tickFormatter={(v) => `${v}%`}
                  />
                  <Tooltip
                    cursor={{ fill: 'rgba(16, 185, 129, 0.08)' }}
                    content={({ active, payload }) => {
                      if (!active || !payload || payload.length === 0) return null;
                      const d = payload[0]?.payload;
                      if (!d) return null;
                      return (
                        <div className="ui-card ui-border rounded-lg border p-3 text-xs shadow-xl">
                          <div className="ui-text-main font-bold">
                            {d.symbol} — {d.name}
                          </div>
                          <div className="mt-1.5 space-y-1 font-mono">
                            <div className="flex items-center justify-between gap-4">
                              <span className="ui-text-secondary">Bobot Modal:</span>
                              <span className="font-bold text-emerald-600 dark:text-emerald-400">
                                {d.capitalWeight}%
                              </span>
                            </div>
                            <div className="flex items-center justify-between gap-4">
                              <span className="ui-text-secondary">
                                Kontribusi Risiko:
                              </span>
                              <span className="font-bold text-amber-500">
                                {d.riskContribution}%
                              </span>
                            </div>
                            <div className="ui-border flex items-center justify-between gap-4 border-t pt-1 text-[11px]">
                              <span className="ui-text-muted">5Y CAGR / Max DD:</span>
                              <span className="ui-text-main">
                                {d.assetCagr}% / -{d.assetMaxDd}%
                              </span>
                            </div>
                          </div>
                          <div className="mt-1.5 text-[10px] font-medium text-emerald-600 dark:text-emerald-400">
                            👆 Klik batang untuk set Conviction {d.symbol}
                          </div>
                        </div>
                      );
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: '11px' }} />
                  <Bar
                    dataKey="capitalWeight"
                    name="Bobot Modal (%)"
                    fill="#10b981"
                    radius={[3, 3, 0, 0]}
                    className="cursor-pointer"
                    onClick={(data) => {
                      if (data?.assetId) {
                        setConvictionAssetId(data.assetId);
                        setAllocationMethod('risk-budgeting');
                      }
                    }}
                  />
                  <Bar
                    dataKey="riskContribution"
                    name="Kontribusi Risiko (%)"
                    fill="#f59e0b"
                    radius={[3, 3, 0, 0]}
                    className="cursor-pointer"
                    onClick={(data) => {
                      if (data?.assetId) {
                        setConvictionAssetId(data.assetId);
                        setAllocationMethod('risk-budgeting');
                      }
                    }}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Chart 2: Interactive Pareto Frontier ScatterChart */}
          <div id="tour-pareto-chart" className="ui-card rounded-xl p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="ui-text-main text-sm font-bold">
                  Spektrum Return vs Risiko (Pareto Frontier)
                </h3>
                <p className="ui-text-muted mt-0.5 text-xs">
                  Klik titik mana saja di grafik untuk langsung menerapkan portfolio
                  tersebut:
                </p>
              </div>

              {/* Zoom / Filter Controls */}
              <div className="ui-subtle flex rounded-lg p-0.5 text-[11px]">
                {[
                  { id: 'all', label: 'Semua' },
                  { id: 'cluster-35', label: 'Zoom <35% DD' },
                  { id: 'optimal-only', label: '15 Optimal' },
                ].map((z) => (
                  <button
                    key={z.id}
                    type="button"
                    onClick={() =>
                      setParetoZoomMode(z.id as typeof paretoZoomMode)
                    }
                    className={`rounded-md px-2 py-0.5 font-medium transition ${
                      paretoZoomMode === z.id
                        ? 'ui-card ui-text-main font-semibold shadow-2xs'
                        : 'ui-text-muted hover:ui-text-main'
                    }`}
                  >
                    {z.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-3 h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <ScatterChart margin={{ top: 10, right: 15, bottom: 10, left: -15 }}>
                  <XAxis
                    type="number"
                    dataKey="maxDrawdown"
                    name="Max Drawdown"
                    stroke="#71717a"
                    fontSize={11}
                    tickFormatter={(v) => `${v}%`}
                  />
                  <YAxis
                    type="number"
                    dataKey="cagr"
                    name="CAGR"
                    stroke="#71717a"
                    fontSize={11}
                    tickFormatter={(v) => `${v}%`}
                  />
                  <ZAxis range={[65, 65]} />
                  <Tooltip
                    cursor={{ strokeDasharray: '3 3' }}
                    content={({ active, payload }) => {
                      if (!active || !payload || payload.length === 0) return null;
                      const pt = payload[0]?.payload;
                      if (!pt) return null;
                      return (
                        <div className="ui-card ui-border max-w-xs rounded-lg border p-3 text-xs shadow-xl">
                          <div className="flex items-center justify-between gap-2">
                            <span
                              className={`rounded px-1.5 py-0.5 font-mono text-[10px] font-bold ${
                                pt.isActivePoint
                                  ? 'bg-sky-500/15 text-sky-500'
                                  : pt.isCustomRow
                                    ? 'bg-emerald-600 text-white'
                                    : pt.isOptimal
                                      ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                                      : 'bg-rose-500/15 text-rose-600 dark:text-rose-400'
                              }`}
                            >
                              {pt.isActivePoint
                                ? 'PORTFOLIO AKTIF'
                                : pt.isCustomRow
                                  ? 'CUSTOM ROW'
                                  : pt.isOptimal
                                    ? `OPTIMAL #${pt.rank ?? ''}`
                                    : 'TERELIMINASI (KALAH PARETO)'}
                            </span>
                            <span className="ui-text-muted font-mono text-[10px]">
                              Efisiensi {pt.calmar}x
                            </span>
                          </div>

                          <div className="ui-text-main mt-1.5 font-bold">
                            {pt.name}
                          </div>

                          <div className="mt-2 grid grid-cols-2 gap-2 rounded-md bg-zinc-500/10 p-2 font-mono">
                            <div>
                              <div className="ui-text-muted text-[10px]">
                                Expected CAGR
                              </div>
                              <div className="font-bold text-emerald-600 dark:text-emerald-400">
                                {Number(pt.cagr).toFixed(2)}% / thn
                              </div>
                            </div>
                            <div>
                              <div className="ui-text-muted text-[10px]">
                                Max Drawdown
                              </div>
                              <div className="font-bold text-rose-600 dark:text-rose-400">
                                -{Number(pt.maxDrawdown).toFixed(2)}%
                              </div>
                            </div>
                          </div>

                          {pt.topWeights && (
                            <div className="ui-text-secondary mt-2 font-mono text-[10px]">
                              <strong>Bobot:</strong> {pt.topWeights}
                            </div>
                          )}

                          {pt.dominatedByReason && (
                            <div className="mt-1.5 text-[10px] text-amber-600 dark:text-amber-400">
                              ⚠️ {pt.dominatedByReason}
                            </div>
                          )}

                          {pt.preset && (
                            <div className="mt-2 border-t border-zinc-500/20 pt-1.5 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">
                              👆 Klik titik ini untuk menerapkan portfolio
                            </div>
                          )}
                        </div>
                      );
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: '11px' }} />
                  <ReferenceLine
                    x={solvedMetrics.maxDrawdown}
                    stroke="#0ea5e9"
                    strokeDasharray="3 3"
                  />
                  <ReferenceLine
                    y={solvedMetrics.cagr}
                    stroke="#0ea5e9"
                    strokeDasharray="3 3"
                  />
                  <Scatter
                    name="15 Optimal"
                    data={scatterOptimalData}
                    fill="#10b981"
                    className="cursor-pointer"
                    onClick={(pt) => {
                      if (pt?.preset) {
                        onSelectPreset(pt.preset);
                      }
                    }}
                  />
                  {paretoZoomMode !== 'optimal-only' && (
                    <Scatter
                      name="10 Dominated"
                      data={scatterDominatedData}
                      fill="#f43f5e"
                      className="cursor-pointer"
                      onClick={(pt) => {
                        if (pt?.preset) {
                          onSelectPreset(pt.preset);
                        }
                      }}
                    />
                  )}
                  <Scatter
                    name="Active Portfolio"
                    data={activePointData}
                    fill="#0ea5e9"
                  >
                    {activePointData.map((_, idx) => (
                      <Cell key={idx} fill="#0ea5e9" />
                    ))}
                  </Scatter>
                </ScatterChart>
              </ResponsiveContainer>
            </div>

            {/* Interactive Frontier Stepper Bar below Chart */}
            <div className="ui-subtle mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg px-3 py-2 text-xs">
              <div className="min-w-0 flex-1">
                <div className="ui-text-muted text-[10px] uppercase">
                  Titik Aktif di Kurva Pareto:
                </div>
                <div className="ui-text-main truncate font-semibold">
                  {activePresetObj ? activePresetObj.name : 'Custom Racikan Anda'} (
                  <span className="font-mono text-emerald-600 dark:text-emerald-400">
                    +{solvedMetrics.cagr.toFixed(2)}%
                  </span>{' '}
                  /{' '}
                  <span className="font-mono text-rose-600 dark:text-rose-400">
                    -{solvedMetrics.maxDrawdown.toFixed(2)}%
                  </span>
                  )
                </div>
              </div>

              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    const prevIdx =
                      currentOptimalIdx > 0
                        ? currentOptimalIdx - 1
                        : sortedOptimalPresets.findIndex(
                            (p) => p.maxDrawdown >= solvedMetrics.maxDrawdown
                          ) - 1;
                    const target =
                      sortedOptimalPresets[Math.max(0, prevIdx)] ??
                      sortedOptimalPresets[0];
                    if (target) onSelectPreset(target);
                  }}
                  title="Geser ke titik portfolio optimal yang lebih konservatif (Drawdown lebih rendah)"
                  className="ui-card ui-text-main rounded px-2 py-1 text-[11px] font-medium hover:opacity-80"
                >
                  ◀ Lebih Aman
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const nextIdx =
                      currentOptimalIdx >= 0
                        ? Math.min(
                            sortedOptimalPresets.length - 1,
                            currentOptimalIdx + 1
                          )
                        : sortedOptimalPresets.findIndex(
                            (p) => p.maxDrawdown > solvedMetrics.maxDrawdown
                          );
                    const target =
                      sortedOptimalPresets[
                        nextIdx >= 0 ? nextIdx : sortedOptimalPresets.length - 1
                      ];
                    if (target) onSelectPreset(target);
                  }}
                  title="Geser ke titik portfolio optimal dengan return lebih tinggi"
                  className="ui-card ui-text-main rounded px-2 py-1 text-[11px] font-medium hover:opacity-80"
                >
                  Lebih Agresif ▶
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* SECTION 4: INSTITUTIONAL ASSET CORRELATION MATRIX & RISK PARITY DIVERSIFICATION */}
      <section id="tour-correlation-section">
        <AssetCorrelationMatrixCard
          allAssets={allAssets}
          activeWeights={activeWeights}
          coreBenchmarkAssets={allAssets.filter((a) => a.isCoreBenchmark)}
        />
      </section>

      {/* SECTION 5: HEAD-TO-HEAD PORTFOLIO COMPARATOR (BANDINGKAN 2 PORTFOLIO) */}
      {(() => {
        const allSelectablePresets = [...customTableRows, ...presets];
        const compareTarget =
          allSelectablePresets.find((p) => p.id === comparePresetId) ??
          allSelectablePresets.find((p) => p.id !== activePresetId) ??
          presets[0];

        if (!compareTarget) return null;

        const simCompare = simulateWealthToGoal({
          initialCapitalIdr,
          monthlyContributionIdr: monthlySavingsIdr,
          annualCagrPercent: compareTarget.cagr,
          maxDrawdownPercent: compareTarget.maxDrawdown,
          targetWealthIdr: targetGoalIdr,
        });

        const activeCalmar = Number(
          (solvedMetrics.cagr / Math.max(0.5, solvedMetrics.maxDrawdown)).toFixed(2)
        );
        const compareCalmar = Number(
          (compareTarget.cagr / Math.max(0.5, compareTarget.maxDrawdown)).toFixed(2)
        );

        const cagrDiff = Number((solvedMetrics.cagr - compareTarget.cagr).toFixed(2));
        const ddDiff = Number(
          (solvedMetrics.maxDrawdown - compareTarget.maxDrawdown).toFixed(2)
        );
        const yearsDiff = Number(
          (simCustom.exactYearsFloat - simCompare.exactYearsFloat).toFixed(1)
        );

        const comparedAssetIds = Array.from(
          new Set([
            ...Object.keys(activeWeights).filter((k) => (activeWeights[k] ?? 0) > 0),
            ...Object.keys(compareTarget.weights).filter(
              (k) => (compareTarget.weights[k] ?? 0) > 0
            ),
          ])
        );

        return (
          <section id="tour-comparator-section" className="ui-card rounded-xl p-5">
            <div className="ui-border flex flex-col gap-3 border-b pb-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-2.5">
                <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                  <ArrowLeftRight className="h-4 w-4" />
                </div>
                <div>
                  <h2 className="ui-text-main text-sm font-bold sm:text-base">
                    Bandingkan 2 Portfolio (Head-to-Head Comparator)
                  </h2>
                  <p className="ui-text-muted text-xs">
                    Bandingkan langsung racikan aktif Anda (Kiri) melawan strategi
                    lain (Kanan) dari segi Return, Risiko Drawdown, Kecepatan Capai{' '}
                    {formatIdr(targetGoalIdr, true)}, dan Selisih Bobot.
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <label
                  htmlFor="compare-preset-select"
                  className="ui-text-secondary text-xs font-semibold"
                >
                  Lawan Pembanding:
                </label>
                <select
                  id="compare-preset-select"
                  value={compareTarget.id}
                  onChange={(e) => setComparePresetId(e.target.value)}
                  className="ui-subtle ui-text-main max-w-xs rounded-lg border px-2.5 py-1.5 text-xs font-semibold focus:outline-none"
                >
                  {allSelectablePresets.map((p) => (
                    <option
                      key={p.id}
                      value={p.id}
                      className="bg-zinc-900 text-white"
                    >
                      {p.rank ? `#${p.rank} ` : p.isCustomRow ? '[Custom] ' : ''}
                      {p.name} ({p.cagr}% / -{p.maxDrawdown}%)
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Side-by-Side Metric Cards */}
            <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
              {/* Portfolio A: Active */}
              <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/5 p-4">
                <div className="flex items-center justify-between gap-2">
                  <span className="rounded bg-emerald-600 px-2 py-0.5 text-[10px] font-bold uppercase text-white">
                    Portfolio A • Sedang Aktif
                  </span>
                  <span className="ui-text-muted font-mono text-xs">
                    Efisiensi Calmar {activeCalmar}x
                  </span>
                </div>
                <h3 className="ui-text-main mt-2 text-sm font-bold">
                  {activePresetObj ? activePresetObj.name : 'Racikan Custom Anda'}
                </h3>

                <div className="mt-3 grid grid-cols-3 gap-2">
                  <div className="ui-card rounded-lg p-2.5">
                    <div className="ui-text-muted text-[10px] uppercase">
                      Expected CAGR
                    </div>
                    <div className="mt-0.5 font-mono text-sm font-bold text-emerald-600 dark:text-emerald-400">
                      +{solvedMetrics.cagr.toFixed(2)}%
                    </div>
                    <div className="ui-text-muted mt-0.5 font-mono text-[10px]">
                      {cagrDiff >= 0 ? `+${cagrDiff}% unggul` : `${cagrDiff}% vs B`}
                    </div>
                  </div>

                  <div className="ui-card rounded-lg p-2.5">
                    <div className="ui-text-muted text-[10px] uppercase">
                      Max Drawdown
                    </div>
                    <div className="mt-0.5 font-mono text-sm font-bold text-rose-600 dark:text-rose-400">
                      -{solvedMetrics.maxDrawdown.toFixed(2)}%
                    </div>
                    <div className="ui-text-muted mt-0.5 font-mono text-[10px]">
                      {ddDiff <= 0
                        ? `${Math.abs(ddDiff)}% lebih aman`
                        : `+${ddDiff}% lebih fluktuatif`}
                    </div>
                  </div>

                  <div className="ui-card rounded-lg p-2.5">
                    <div className="ui-text-muted text-[10px] uppercase">
                      Capai {formatIdr(targetGoalIdr, true)}
                    </div>
                    <div className="ui-text-main mt-0.5 font-mono text-sm font-bold">
                      {simCustom.exactYearsFloat} Thn
                    </div>
                    <div className="ui-text-muted mt-0.5 font-mono text-[10px]">
                      {yearsDiff <= 0
                        ? `${Math.abs(yearsDiff)} thn lebih cepat`
                        : `+${yearsDiff} thn lebih lama`}
                    </div>
                  </div>
                </div>
              </div>

              {/* Portfolio B: Comparison Target */}
              <div className="ui-subtle ui-border flex flex-col justify-between rounded-xl border p-4">
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="rounded bg-sky-500/15 px-2 py-0.5 text-[10px] font-bold uppercase text-sky-600 dark:text-sky-400">
                      Portfolio B • Pembanding
                    </span>
                    <span className="ui-text-muted font-mono text-xs">
                      Efisiensi Calmar {compareCalmar}x
                    </span>
                  </div>
                  <div className="mt-2 flex items-center justify-between gap-2">
                    <h3 className="ui-text-main text-sm font-bold">
                      {compareTarget.name}
                    </h3>
                    <button
                      type="button"
                      onClick={() => onSelectPreset(compareTarget)}
                      className="rounded-md bg-sky-600 px-2.5 py-1 text-xs font-semibold text-white transition hover:bg-sky-500"
                    >
                      Gunakan B Ini
                    </button>
                  </div>

                  <div className="mt-3 grid grid-cols-3 gap-2">
                    <div className="ui-card rounded-lg p-2.5">
                      <div className="ui-text-muted text-[10px] uppercase">
                        Expected CAGR
                      </div>
                      <div className="mt-0.5 font-mono text-sm font-bold text-emerald-600 dark:text-emerald-400">
                        +{compareTarget.cagr.toFixed(2)}%
                      </div>
                      <div className="ui-text-muted mt-0.5 font-mono text-[10px]">
                        / tahun
                      </div>
                    </div>

                    <div className="ui-card rounded-lg p-2.5">
                      <div className="ui-text-muted text-[10px] uppercase">
                        Max Drawdown
                      </div>
                      <div className="mt-0.5 font-mono text-sm font-bold text-rose-600 dark:text-rose-400">
                        -{compareTarget.maxDrawdown.toFixed(2)}%
                      </div>
                      <div className="ui-text-muted mt-0.5 font-mono text-[10px]">
                        risiko historis
                      </div>
                    </div>

                    <div className="ui-card rounded-lg p-2.5">
                      <div className="ui-text-muted text-[10px] uppercase">
                        Capai {formatIdr(targetGoalIdr, true)}
                      </div>
                      <div className="ui-text-main mt-0.5 font-mono text-sm font-bold">
                        {simCompare.exactYearsFloat} Thn
                      </div>
                      <div className="ui-text-muted mt-0.5 font-mono text-[10px]">
                        @{formatIdr(monthlySavingsIdr, true)}/bln
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Side-by-Side Asset Allocation Diff Bars */}
            <div className="ui-subtle mt-4 rounded-xl p-4">
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                <span className="ui-text-main font-semibold">
                  Perbandingan Bobot Modal per Instrumen (A vs B)
                </span>
                <div className="flex items-center gap-3 text-[11px]">
                  <span className="flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-xs bg-emerald-500" />
                    <span className="ui-text-secondary">A: Aktif (%)</span>
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-xs bg-sky-500" />
                    <span className="ui-text-secondary">B: Pembanding (%)</span>
                  </span>
                </div>
              </div>

              <div className="mt-3 grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
                {comparedAssetIds.map((assetId) => {
                  const wA = Number((activeWeights[assetId] ?? 0).toFixed(1));
                  const wB = Number(
                    (compareTarget.weights[assetId] ?? 0).toFixed(1)
                  );
                  const diff = Number((wA - wB).toFixed(1));
                  return (
                    <div key={assetId} className="ui-card rounded-lg p-2.5 text-xs">
                      <div className="flex items-center justify-between font-mono">
                        <span className="ui-text-main font-bold">{assetId}</span>
                        <span
                          className={`text-[10px] font-semibold ${
                            diff > 0
                              ? 'text-emerald-600 dark:text-emerald-400'
                              : diff < 0
                                ? 'text-sky-600 dark:text-sky-400'
                                : 'ui-text-muted'
                          }`}
                        >
                          {diff > 0 ? `+${diff}% di A` : diff < 0 ? `${diff}% di A` : 'Sama'}
                        </span>
                      </div>

                      <div className="mt-1.5 space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="ui-text-muted w-4 font-mono text-[10px]">
                            A
                          </span>
                          <div className="h-2 flex-1 overflow-hidden rounded-full bg-zinc-500/15">
                            <div
                              className="h-full rounded-full bg-emerald-500"
                              style={{ width: `${Math.min(100, wA)}%` }}
                            />
                          </div>
                          <span className="ui-text-main w-10 text-right font-mono text-[10px] font-semibold">
                            {wA}%
                          </span>
                        </div>

                        <div className="flex items-center gap-2">
                          <span className="ui-text-muted w-4 font-mono text-[10px]">
                            B
                          </span>
                          <div className="h-2 flex-1 overflow-hidden rounded-full bg-zinc-500/15">
                            <div
                              className="h-full rounded-full bg-sky-500"
                              style={{ width: `${Math.min(100, wB)}%` }}
                            />
                          </div>
                          <span className="ui-text-secondary w-10 text-right font-mono text-[10px]">
                            {wB}%
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </section>
        );
      })()}
    </div>
  );
};