import React, { useState } from 'react';
import {
  AssetDefinition,
  AllocationMethod,
  InvestorArchetype,
  PortfolioPreset,
  SolvedPortfolio,
} from '../../lib/quant/types';
import { formatIdr, getRiskTierBadge } from '../../lib/formatters';
import { simulateWealthToGoal } from '../../lib/quant/wealthSimulator';
import {
  lookupCustomYahooTicker,
  POPULAR_TICKER_ESTIMATES,
  TickerLookupResult,
} from '../../services/priceFeed';
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
  onNormalizeManualWeights: () => void;
  solvedMetrics: SolvedPortfolio;
  initialCapitalIdr: number;
  setInitialCapitalIdr: (v: number) => void;
  targetGoalIdr: number;
  setTargetGoalIdr: (v: number) => void;
  monthlySavingsIdr: number;
  setMonthlySavingsIdr: (v: number) => void;
  onGoToRebalancer: () => void;
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
  solvedMetrics,
  initialCapitalIdr,
  setInitialCapitalIdr,
  targetGoalIdr,
  setTargetGoalIdr,
  monthlySavingsIdr,
  setMonthlySavingsIdr,
  onGoToRebalancer,
}) => {
  const [archetypeFilter, setArchetypeFilter] = useState<InvestorArchetype>('all');
  const [showDominated25, setShowDominated25] = useState(false);
  const [customRowName, setCustomRowName] = useState('');

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

  // Simulate time to targetGoalIdr (default Rp 1 Miliar, selectable to Rp 10 Miliar) starting from initialCapitalIdr (default Rp 100 Juta)
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
  const sim20M = simulateWealthToGoal({
    initialCapitalIdr,
    monthlyContributionIdr: 20_000_000,
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

  const tierBadge = getRiskTierBadge(solvedMetrics.riskTier);

  const weightVsRiskData = allAssets
    .filter((a) => (activeWeights[a.id] ?? 0) > 0 || selectedUniverseIds.includes(a.id))
    .map((a) => ({
      symbol: a.shortName,
      name: a.name,
      capitalWeight: Number((activeWeights[a.id] ?? 0).toFixed(1)),
      riskContribution: Number((solvedMetrics.riskContributions[a.id] ?? 0).toFixed(1)),
      color: a.color,
    }))
    .filter((d) => d.capitalWeight > 0 || d.riskContribution > 0);

  const scatterOptimalData = presets
    .filter((p) => p.isOptimal15)
    .map((p) => ({
      name: p.name,
      maxDrawdown: p.maxDrawdown,
      cagr: p.cagr,
      isOptimal: true,
    }));

  const scatterDominatedData = presets
    .filter((p) => !p.isOptimal15)
    .map((p) => ({
      name: p.name,
      maxDrawdown: p.maxDrawdown,
      cagr: p.cagr,
      isOptimal: false,
    }));

  const activePointData = [
    {
      name: 'Active Portfolio Anda',
      maxDrawdown: solvedMetrics.maxDrawdown,
      cagr: solvedMetrics.cagr,
    },
  ];

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

              <button
                type="button"
                onClick={onGoToRebalancer}
                className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-emerald-500"
              >
                <span>Gunakan di Rebalancer</span>
                <ArrowRight className="h-3.5 w-3.5" />
              </button>
            </div>

            {/* Key Quantitative Figures */}
            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
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
            </div>
          </div>

          {/* Pareto Efficiency Alert */}
          <div className="mt-4">
            {solvedMetrics.isParetoDominated ? (
              <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-800 dark:text-amber-300">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <div>
                  <span className="font-semibold">
                    Filter Pareto (Menit 10:16): Portfolio ini Kalah Efisien.
                  </span>{' '}
                  Alternatif yang lebih unggul:{' '}
                  <span className="font-semibold underline">
                    {solvedMetrics.dominatingPresets.join(' atau ')}
                  </span>
                  .
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs text-emerald-800 dark:text-emerald-300">
                <CheckCircle2 className="h-4 w-4 shrink-0" />
                <span>
                  <strong>Optimal Pareto Frontier:</strong> Tidak ada preset lain yang
                  mengalahkan return portfolio ini pada tingkat drawdown yang sama.
                </span>
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
                <label className="ui-text-muted block text-[10px] font-medium">
                  Modal Awal (Rp)
                </label>
                <div className="mt-0.5 flex items-center justify-between gap-1">
                  <input
                    type="number"
                    step={10_000_000}
                    value={initialCapitalIdr}
                    onChange={(e) =>
                      setInitialCapitalIdr(Math.max(0, Number(e.target.value)))
                    }
                    className="ui-text-main w-full bg-transparent font-mono text-xs font-bold focus:outline-none"
                    aria-label="Initial Capital in IDR"
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
                          ? 'bg-emerald-600 text-white font-semibold'
                          : 'ui-card ui-text-muted'
                      }`}
                    >
                      {v === 0 ? '0' : `${v / 1_000_000}Jt`}
                    </button>
                  ))}
                </div>
              </div>

              <div className="ui-subtle rounded-lg p-2">
                <label className="ui-text-muted block text-[10px] font-medium">
                  Target Kekayaan (Rp)
                </label>
                <div className="mt-0.5 flex items-center justify-between gap-1">
                  <input
                    type="number"
                    step={500_000_000}
                    value={targetGoalIdr}
                    onChange={(e) =>
                      setTargetGoalIdr(Math.max(10_000_000, Number(e.target.value)))
                    }
                    className="ui-text-main w-full bg-transparent font-mono text-xs font-bold focus:outline-none"
                    aria-label="Target Wealth Goal in IDR"
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
                          ? 'bg-emerald-600 text-white font-semibold'
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
                <span className="font-mono text-xs font-bold text-emerald-600 dark:text-emerald-400">
                  ➔ {sim10M.exactYearsFloat} Thn{' '}
                  <span className="ui-text-muted font-normal">
                    (Pokok {formatIdr(sim10M.totalPrincipalAtGoalIdr, true)})
                  </span>
                </span>
              </div>

              <div className="ui-subtle flex items-center justify-between rounded-lg px-3 py-1.5">
                <span className="ui-text-secondary text-xs font-medium">
                  + Rp 20 Juta / bulan
                </span>
                <span className="ui-text-main font-mono text-xs font-bold">
                  ➔ {sim20M.exactYearsFloat} Thn{' '}
                  <span className="ui-text-muted font-normal">
                    (Pokok {formatIdr(sim20M.totalPrincipalAtGoalIdr, true)})
                  </span>
                </span>
              </div>
            </div>
          </div>

          <div className="ui-subtle mt-3 rounded-lg p-2.5">
            <div className="flex items-center justify-between text-xs">
              <span className="ui-text-secondary font-medium">
                Custom DCA Bulanan:
              </span>
              <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400">
                {formatIdr(monthlySavingsIdr)}/bln ➔ {simCustom.exactYearsFloat} Thn
              </span>
            </div>
            <input
              type="range"
              min={1_000_000}
              max={100_000_000}
              step={1_000_000}
              value={monthlySavingsIdr}
              onChange={(e) => setMonthlySavingsIdr(Number(e.target.value))}
              className="mt-1.5 h-1.5 w-full cursor-pointer"
              aria-label="Custom Monthly Savings in IDR"
            />
          </div>
        </div>
      </section>

      {/* SECTION 2: THE 15 OPTIMAL PORTFOLIOS TABLE (WITH DYNAMIC SLOT SWAP e.g. BBCA -> PTBA & PINNED CUSTOM ROWS) */}
      <section className="ui-card rounded-xl p-5">
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

            <button
              type="button"
              onClick={() => setArchetypeFilter('all')}
              className={`rounded-md px-2.5 py-1 text-xs font-medium transition ${
                archetypeFilter === 'all'
                  ? 'bg-emerald-600 text-white'
                  : 'ui-subtle ui-text-secondary'
              }`}
            >
              Semua ({showDominated25 ? 25 : 15})
            </button>
            <button
              type="button"
              onClick={() => setArchetypeFilter('business-owner')}
              className={`flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium transition ${
                archetypeFilter === 'business-owner'
                  ? 'bg-emerald-600 text-white'
                  : 'ui-subtle ui-text-secondary'
              }`}
            >
              <Briefcase className="h-3 w-3" />
              <span>&lt;10% DD</span>
            </button>
            <button
              type="button"
              onClick={() => setArchetypeFilter('hybrid-conviction')}
              className={`flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium transition ${
                archetypeFilter === 'hybrid-conviction'
                  ? 'bg-emerald-600 text-white'
                  : 'ui-subtle ui-text-secondary'
              }`}
            >
              <Sparkles className="h-3 w-3" />
              <span>Risk Budgeting</span>
            </button>
            <button
              type="button"
              onClick={() => setArchetypeFilter('full-time-investor')}
              className={`flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium transition ${
                archetypeFilter === 'full-time-investor'
                  ? 'bg-emerald-600 text-white'
                  : 'ui-subtle ui-text-secondary'
              }`}
            >
              <Flame className="h-3 w-3" />
              <span>&gt;18% CAGR</span>
            </button>

            <button
              type="button"
              onClick={() => setShowDominated25(!showDominated25)}
              className="ui-subtle ui-text-muted flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium"
            >
              {showDominated25 ? (
                <EyeOff className="h-3 w-3" />
              ) : (
                <Eye className="h-3 w-3" />
              )}
              <span>{showDominated25 ? 'Sembunyikan 10 Kalah' : '+10 Tereliminasi'}</span>
            </button>
          </div>
        </div>

        {/* Minimalist Data Table with Interactive Column Slot Selector */}
        <div
          tabIndex={0}
          role="region"
          aria-labelledby="optimal-portfolios-caption"
          className="ui-border mt-4 max-h-[520px] overflow-auto rounded-lg border"
        >
          <table className="w-full border-separate border-spacing-0 text-left text-xs">
            <caption id="optimal-portfolios-caption" className="sr-only">
              Daftar 15 Portfolio Optimal dan Custom Rows berdasarkan CAGR, Maximum
              Drawdown, dan Bobot Instrumen
            </caption>
            <thead className="ui-subtle sticky top-0 z-20 text-[11px] font-semibold uppercase">
              <tr>
                <th
                  rowSpan={2}
                  className="ui-subtle ui-border sticky left-0 z-30 border-b border-r px-3 py-2"
                >
                  Strategy ({combinedRows.length})
                </th>
                <th
                  rowSpan={2}
                  className="ui-border border-b border-r px-2.5 py-2 text-center"
                >
                  Risk
                </th>
                <th
                  rowSpan={2}
                  className="ui-border border-b border-r px-3 py-2 text-right"
                >
                  CAGR
                </th>
                <th
                  rowSpan={2}
                  className="ui-border border-b border-r px-3 py-2 text-right"
                >
                  Max DD
                </th>
                <th
                  colSpan={core8Slots.length + extraCustomAssetIds.length}
                  className="ui-border border-b px-3 py-1 text-center"
                >
                  Bobot Modal (%) — Klik Dropdown Kolom untuk Ganti Instrumen (Misal BBCA ➔ PTBA)
                </th>
              </tr>
              <tr>
                {core8Slots.map((slotId) => {
                  const currentAssetId = slotMap[slotId] ?? slotId;
                  const isSwapped = currentAssetId !== slotId;
                  return (
                    <th
                      key={slotId}
                      className={`ui-border border-b border-r px-1.5 py-1 text-right font-mono text-[11px] ${
                        isSwapped ? 'bg-emerald-500/15' : 'ui-subtle'
                      }`}
                    >
                      <select
                        value={currentAssetId}
                        onChange={(e) => onChangeSlotAsset(slotId, e.target.value)}
                        title={`Ganti slot benchmark ${slotId} dengan instrumen lain`}
                        aria-label={`Slot benchmark ${slotId}`}
                        className="ui-text-main cursor-pointer bg-transparent font-mono text-[11px] font-bold focus:outline-none"
                      >
                        {allAssets.map((a) => (
                          <option
                            key={a.id}
                            value={a.id}
                            className="bg-zinc-900 text-white"
                          >
                            {a.shortName}
                          </option>
                        ))}
                      </select>
                      {isSwapped && (
                        <div className="ui-text-muted text-[9px] font-normal">
                          ex-{slotId}
                        </div>
                      )}
                    </th>
                  );
                })}
                {extraCustomAssetIds.map((extraId) => (
                  <th
                    key={extraId}
                    className="ui-subtle ui-border border-b border-r px-2.5 py-1 text-right font-mono text-[11px]"
                  >
                    {extraId}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {combinedRows.map((preset) => {
                const isSelected = activePresetId === preset.id;
                const badge = getRiskTierBadge(preset.riskTier);
                return (
                  <tr
                    key={preset.id}
                    onClick={() => onSelectPreset(preset)}
                    className={`cursor-pointer transition ${
                      isSelected
                        ? 'bg-emerald-500/10'
                        : preset.isCustomRow
                          ? 'bg-sky-500/5 hover:bg-sky-500/10'
                          : !preset.isOptimal15
                            ? 'opacity-60 hover:opacity-100'
                            : 'hover:bg-zinc-500/5'
                    }`}
                  >
                    <th
                      scope="row"
                      className="ui-card ui-border sticky left-0 z-10 border-b border-r px-3 py-2 font-medium"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          {preset.isCustomRow ? (
                            <span className="rounded bg-emerald-600 px-1.5 py-0.5 font-mono text-[9px] font-bold text-white">
                              CUSTOM
                            </span>
                          ) : (
                            preset.rank && (
                              <span className="ui-subtle ui-text-muted inline-flex h-4 w-4 shrink-0 items-center justify-center rounded font-mono text-[10px]">
                                {preset.rank}
                              </span>
                            )
                          )}
                          <div>
                            <div className="ui-text-main text-xs font-semibold">
                              {preset.name}
                            </div>
                            {preset.videoNote && (
                              <div className="ui-text-muted mt-0.5 line-clamp-1 max-w-xs text-[10px] font-normal">
                                {preset.videoNote}
                              </div>
                            )}
                            {preset.dominatedByReason && (
                              <div className="mt-0.5 max-w-xs text-[10px] font-normal text-amber-600 dark:text-amber-400">
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
                            className="ui-text-muted rounded p-1 hover:text-rose-500"
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
                            {w}%
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
      </section>

      {/* SECTION 3: CUSTOM QUANT SOLVER & MANUAL WEIGHT BUILDER */}
      <section className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <div className="ui-card space-y-5 rounded-xl p-5 lg:col-span-7">
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
                return (
                  <button
                    key={asset.id}
                    type="button"
                    onClick={() => onToggleUniverseAsset(asset.id)}
                    title={`${asset.name} • 5Y CAGR: ${asset.cagr}% • Max DD: ${asset.maxDrawdown}%`}
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

          {/* Step C: Interactive Weight Sliders */}
          <div>
            <div className="flex items-center justify-between">
              <span className="ui-text-secondary text-xs font-semibold">
                3. Bobot Modal (%) vs Kontribusi Risiko (%):
              </span>
              <div className="flex items-center gap-2">
                <span className="ui-text-main font-mono text-xs font-semibold">
                  Total: {manualSum.toFixed(1)}%
                </span>
                {Math.abs(manualSum - 100) > 0.2 && (
                  <button
                    type="button"
                    onClick={onNormalizeManualWeights}
                    className="ui-subtle ui-text-main rounded px-2 py-0.5 text-xs font-medium"
                  >
                    Normalize 100%
                  </button>
                )}
              </div>
            </div>

            <div className="mt-2.5 max-h-72 space-y-2 overflow-y-auto pr-1">
              {allAssets
                .filter(
                  (a) =>
                    selectedUniverseIds.includes(a.id) || (activeWeights[a.id] ?? 0) > 0
                )
                .map((asset) => {
                  const capWeight = activeWeights[asset.id] ?? 0;
                  const riskContrib = solvedMetrics.riskContributions[asset.id] ?? 0;
                  return (
                    <div key={asset.id} className="ui-subtle rounded-lg p-2.5">
                      <div className="flex items-center justify-between gap-2 text-xs">
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
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="ui-text-muted text-[11px]">
                            Risk:{' '}
                            <strong className="ui-text-secondary font-mono">
                              {riskContrib.toFixed(1)}%
                            </strong>
                          </span>
                          <div className="flex items-center gap-1">
                            <input
                              type="number"
                              min={0}
                              max={100}
                              step={1}
                              value={capWeight}
                              onChange={(e) =>
                                onManualWeightChange(
                                  asset.id,
                                  Math.max(0, Math.min(100, Number(e.target.value)))
                                )
                              }
                              className="ui-card ui-text-main w-14 rounded px-1.5 py-0.5 text-right font-mono text-xs font-semibold"
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
                        onChange={(e) =>
                          onManualWeightChange(asset.id, Number(e.target.value))
                        }
                        className="mt-1.5 h-1.5 w-full cursor-pointer"
                        aria-label={`${asset.shortName} weight slider`}
                      />
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
          <div className="ui-card rounded-xl p-5">
            <div className="flex items-center justify-between">
              <h3 className="ui-text-main text-sm font-bold">
                Bobot Modal (%) vs Porsi Risiko (%)
              </h3>
              <Layers className="ui-text-muted h-4 w-4" />
            </div>
            <p className="ui-text-muted mt-1 text-xs">
              Menjelaskan kenapa bobot modal 18% di BTC setara dengan ~90% risiko
              portfolio (09:20).
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
                    contentStyle={{
                      backgroundColor: 'var(--bg-card)',
                      borderColor: 'var(--border-subtle)',
                      color: 'var(--text-main)',
                      borderRadius: '0.5rem',
                      fontSize: '12px',
                    }}
                    formatter={(value: number, name: string) => [`${value}%`, name]}
                  />
                  <Legend wrapperStyle={{ fontSize: '11px' }} />
                  <Bar
                    dataKey="capitalWeight"
                    name="Bobot Modal (%)"
                    fill="#10b981"
                    radius={[3, 3, 0, 0]}
                  />
                  <Bar
                    dataKey="riskContribution"
                    name="Kontribusi Risiko (%)"
                    fill="#f59e0b"
                    radius={[3, 3, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="ui-card rounded-xl p-5">
            <div className="flex items-center justify-between">
              <h3 className="ui-text-main text-sm font-bold">
                Spektrum Return vs Risiko (Pareto Frontier)
              </h3>
              <ShieldAlert className="ui-text-muted h-4 w-4" />
            </div>
            <p className="ui-text-muted mt-1 text-xs">
              15 Portfolio Optimal (hijau) vs 10 portfolio tereliminasi (merah).
            </p>

            <div className="mt-4 h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <ScatterChart margin={{ top: 10, right: 15, bottom: 10, left: -15 }}>
                  <XAxis
                    type="number"
                    dataKey="maxDrawdown"
                    name="Max Drawdown"
                    unit="%"
                    stroke="#71717a"
                    fontSize={11}
                  />
                  <YAxis
                    type="number"
                    dataKey="cagr"
                    name="CAGR"
                    unit="%"
                    stroke="#71717a"
                    fontSize={11}
                  />
                  <ZAxis range={[50, 50]} />
                  <Tooltip
                    cursor={{ strokeDasharray: '3 3' }}
                    contentStyle={{
                      backgroundColor: 'var(--bg-card)',
                      borderColor: 'var(--border-subtle)',
                      color: 'var(--text-main)',
                      borderRadius: '0.5rem',
                      fontSize: '12px',
                    }}
                    formatter={(val: number, name: string) => [`${val}%`, name]}
                    labelFormatter={(_, payload) =>
                      payload?.[0]?.payload?.name ?? 'Portfolio'
                    }
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
                  />
                  <Scatter
                    name="10 Dominated"
                    data={scatterDominatedData}
                    fill="#f43f5e"
                  />
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
          </div>
        </div>
      </section>
    </div>
  );
};
