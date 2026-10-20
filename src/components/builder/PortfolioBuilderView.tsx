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
} from 'lucide-react';

interface PortfolioBuilderViewProps {
  allAssets: AssetDefinition[];
  onAddCustomAsset: (asset: AssetDefinition) => void;
  presets: PortfolioPreset[];
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
  monthlySavingsIdr: number;
  setMonthlySavingsIdr: (v: number) => void;
  onGoToRebalancer: () => void;
}

export const PortfolioBuilderView: React.FC<PortfolioBuilderViewProps> = ({
  allAssets,
  onAddCustomAsset,
  presets,
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
  monthlySavingsIdr,
  setMonthlySavingsIdr,
  onGoToRebalancer,
}) => {
  const [archetypeFilter, setArchetypeFilter] = useState<InvestorArchetype>('all');
  const [showDominated25, setShowDominated25] = useState(false);

  // Custom ticker / synthetic asset form state
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

  const core8Ids = ['RDPU', 'RDPT', 'BBCA', 'GLD', 'SPY', 'QQQ', 'BTC', 'ETH'];

  // Filter presets based on Investor Archetype & Optimal 15 vs Full 25 toggle
  const displayedPresets = presets.filter((p) => {
    if (!showDominated25 && !p.isOptimal15) return false;
    if (archetypeFilter === 'business-owner') {
      // 01:22 - Business owners / busy professionals target 6-15% return & low/medium drawdown (<10%)
      return p.maxDrawdown <= 10.5;
    }
    if (archetypeFilter === 'full-time-investor') {
      // 02:06 - Full-time investors target >18% compounding
      return p.cagr >= 18;
    }
    if (archetypeFilter === 'hybrid-conviction') {
      // 09:01 & 13:42 - Leon's personal choice: Risk Budgeting 70-90% or Risk Parity 7 Assets
      return p.method === 'risk-budgeting' || p.id === 'opt-9-rp-all-7';
    }
    return true;
  });

  // Simulate time to Rp 10 Billion for Rp 5M, Rp 10M, Rp 20M, and user's custom monthly savings
  const sim5M = simulateWealthToGoal({
    initialCapitalIdr: 0,
    monthlyContributionIdr: 5_000_000,
    annualCagrPercent: solvedMetrics.cagr,
    maxDrawdownPercent: solvedMetrics.maxDrawdown,
  });
  const sim10M = simulateWealthToGoal({
    initialCapitalIdr: 0,
    monthlyContributionIdr: 10_000_000,
    annualCagrPercent: solvedMetrics.cagr,
    maxDrawdownPercent: solvedMetrics.maxDrawdown,
  });
  const sim20M = simulateWealthToGoal({
    initialCapitalIdr: 0,
    monthlyContributionIdr: 20_000_000,
    annualCagrPercent: solvedMetrics.cagr,
    maxDrawdownPercent: solvedMetrics.maxDrawdown,
  });
  const simCustom = simulateWealthToGoal({
    initialCapitalIdr: 0,
    monthlyContributionIdr: monthlySavingsIdr,
    annualCagrPercent: solvedMetrics.cagr,
    maxDrawdownPercent: solvedMetrics.maxDrawdown,
  });

  const tierBadge = getRiskTierBadge(solvedMetrics.riskTier);

  // Data for Capital Weight vs Risk Contribution bar chart
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

  // Data for Efficient Frontier Scatter Chart (CAGR vs Max Drawdown)
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
        `Ticker "${query.toUpperCase()}" tidak ditemukan di Yahoo/Database. Silakan isi estimasi CAGR & Max DD di form manual di bawah.`
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
      color: '#22d3ee',
      description: `${res.name} — ${res.assumptionNote}`,
    };
    onAddCustomAsset(newAsset);
    // Also populate manual form so user can tweak the assumptions if they want!
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
      color: '#34d399',
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
      {/* TOP SUMMARY BANNER: Active Portfolio KPI & Time to Rp 10 Billion */}
      <section className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        {/* Left 7 cols: Active Portfolio Metrics & Risk Tier */}
        <div className="flex flex-col justify-between rounded-2xl border border-slate-800 bg-slate-900/90 p-5 shadow-xl lg:col-span-7">
          <div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span
                  className={`rounded-md border px-2.5 py-0.5 text-xs font-extrabold tracking-wider ${tierBadge.bgClass} ${tierBadge.textClass} ${tierBadge.borderClass}`}
                >
                  {tierBadge.label}
                </span>
                <span className="rounded-md bg-slate-800 px-2.5 py-0.5 text-xs font-medium text-slate-300">
                  Mode:{' '}
                  {allocationMethod === 'preset'
                    ? 'Video Preset'
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
                className="flex items-center gap-1.5 rounded-xl bg-emerald-500 px-3.5 py-1.5 text-xs font-bold text-slate-950 shadow-md shadow-emerald-500/20 transition hover:bg-emerald-400"
              >
                <span>Gunakan di Rebalancer</span>
                <ArrowRight className="h-3.5 w-3.5" />
              </button>
            </div>

            {/* Key Quantitative Figures */}
            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="rounded-xl border border-slate-800/80 bg-slate-950/70 p-3.5">
                <div className="text-[11px] font-medium uppercase tracking-wider text-slate-400">
                  Expected CAGR (5Y)
                </div>
                <div className="mt-1 font-mono text-2xl font-extrabold text-emerald-400">
                  {solvedMetrics.cagr.toFixed(2)}%
                </div>
                <div className="mt-0.5 text-[11px] text-slate-500">Return tahunan</div>
              </div>

              <div className="rounded-xl border border-slate-800/80 bg-slate-950/70 p-3.5">
                <div className="text-[11px] font-medium uppercase tracking-wider text-slate-400">
                  Max Drawdown (5Y)
                </div>
                <div className="mt-1 font-mono text-2xl font-extrabold text-rose-400">
                  -{solvedMetrics.maxDrawdown.toFixed(2)}%
                </div>
                <div className="mt-0.5 text-[11px] text-slate-500">
                  Penurunan terdalam
                </div>
              </div>

              <div className="rounded-xl border border-slate-800/80 bg-slate-950/70 p-3.5">
                <div className="text-[11px] font-medium uppercase tracking-wider text-slate-400">
                  Return / Drawdown
                </div>
                <div className="mt-1 font-mono text-2xl font-extrabold text-sky-400">
                  {solvedMetrics.maxDrawdown > 0
                    ? (solvedMetrics.cagr / solvedMetrics.maxDrawdown).toFixed(2)
                    : '∞'}
                  x
                </div>
                <div className="mt-0.5 text-[11px] text-slate-500">Calmar efisiensi</div>
              </div>

              <div className="rounded-xl border border-slate-800/80 bg-slate-950/70 p-3.5">
                <div className="text-[11px] font-medium uppercase tracking-wider text-slate-400">
                  Sharpe Ratio
                </div>
                <div className="mt-1 font-mono text-2xl font-extrabold text-amber-300">
                  {solvedMetrics.sharpeRatio.toFixed(2)}
                </div>
                <div className="mt-0.5 text-[11px] text-slate-500">
                  Volatilitas {solvedMetrics.volatility}%
                </div>
              </div>
            </div>
          </div>

          {/* Pareto Efficiency Alert (10:16 in Video) */}
          <div className="mt-4">
            {solvedMetrics.isParetoDominated ? (
              <div className="flex items-start gap-2.5 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-200">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
                <div>
                  <span className="font-bold">
                    Filter Pareto (Menit 10:16): Portfolio ini Kalah Efisien!
                  </span>{' '}
                  Ada kombinasi lain dengan return lebih tinggi dan drawdown lebih rendah:{' '}
                  <span className="font-semibold text-white">
                    {solvedMetrics.dominatingPresets.join(' atau ')}
                  </span>
                  .
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs text-emerald-200">
                <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
                <span>
                  <strong className="text-white">Optimal Pareto Frontier:</strong> Tidak
                  ada preset lain yang mengalahkan return portfolio ini pada tingkat
                  risiko drawdown yang sama.
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Right 5 cols: "Kapan Dapat 10 Miliar Pertama?" Live Box (matching Video Screenshots 2, 4, 5) */}
        <div className="flex flex-col justify-between rounded-2xl border border-slate-800 bg-gradient-to-br from-slate-900 via-slate-900 to-emerald-950/30 p-5 shadow-xl lg:col-span-5">
          <div>
            <div className="flex items-center justify-between">
              <h2 className="text-base font-extrabold text-white">
                Kapan dapat Rp 10 Miliar pertama?
              </h2>
              <span className="rounded-lg bg-emerald-500/15 px-2 py-0.5 font-mono text-xs font-bold text-emerald-300">
                @{solvedMetrics.cagr.toFixed(2)}%/thn
              </span>
            </div>
            <p className="mt-1 text-xs text-slate-400">
              Simulasi nabung rutin bulanan (DCA) + compounding menuju Rp 10.000.000.000:
            </p>

            {/* Video's 3 standard tiers: 5 Jt/bln, 10 Jt/bln, 20 Jt/bln */}
            <div className="mt-3.5 space-y-2">
              <div className="flex items-center justify-between rounded-xl border border-slate-800/90 bg-slate-950/80 px-3.5 py-2.5">
                <span className="text-xs font-semibold text-slate-300">
                  Rp 5 Juta / bulan
                </span>
                <span className="font-mono text-sm font-extrabold text-white">
                  ➔ {sim5M.exactYearsFloat} Tahun{' '}
                  <span className="text-[11px] font-normal text-slate-400">
                    (Modal {formatIdr(sim5M.totalPrincipalAtGoalIdr, true)})
                  </span>
                </span>
              </div>

              <div className="flex items-center justify-between rounded-xl border border-slate-800/90 bg-slate-950/80 px-3.5 py-2.5">
                <span className="text-xs font-semibold text-slate-300">
                  Rp 10 Juta / bulan
                </span>
                <span className="font-mono text-sm font-extrabold text-emerald-400">
                  ➔ {sim10M.exactYearsFloat} Tahun{' '}
                  <span className="text-[11px] font-normal text-slate-400">
                    (Modal {formatIdr(sim10M.totalPrincipalAtGoalIdr, true)})
                  </span>
                </span>
              </div>

              <div className="flex items-center justify-between rounded-xl border border-slate-800/90 bg-slate-950/80 px-3.5 py-2.5">
                <span className="text-xs font-semibold text-slate-300">
                  Rp 20 Juta / bulan
                </span>
                <span className="font-mono text-sm font-extrabold text-sky-400">
                  ➔ {sim20M.exactYearsFloat} Tahun{' '}
                  <span className="text-[11px] font-normal text-slate-400">
                    (Modal {formatIdr(sim20M.totalPrincipalAtGoalIdr, true)})
                  </span>
                </span>
              </div>
            </div>
          </div>

          {/* Interactive Custom Monthly Saving Slider */}
          <div className="mt-4 rounded-xl border border-emerald-500/30 bg-slate-950/90 p-3">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium text-slate-300">
                Custom Investasi Bulanan Anda:
              </span>
              <span className="font-mono font-bold text-emerald-400">
                {formatIdr(monthlySavingsIdr)} / bln ➔ {simCustom.exactYearsFloat} Thn
              </span>
            </div>
            <input
              type="range"
              min={1_000_000}
              max={100_000_000}
              step={1_000_000}
              value={monthlySavingsIdr}
              onChange={(e) => setMonthlySavingsIdr(Number(e.target.value))}
              className="mt-2 h-1.5 w-full cursor-pointer appearance-none rounded-lg bg-slate-800 accent-emerald-500"
              aria-label="Custom Monthly Savings in IDR"
            />
          </div>
        </div>
      </section>

      {/* SECTION 2: THE OVERPOST 15 OPTIMAL PORTFOLIOS TABLE (WITH INVESTOR ARCHETYPE FILTER) */}
      <section className="rounded-2xl border border-slate-800 bg-slate-900/90 p-5 shadow-xl">
        <div className="flex flex-col gap-4 border-b border-slate-800 pb-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-extrabold uppercase tracking-wide text-white sm:text-lg">
                Tabel 15 Portfolio Optimal (The Overpost Baseline)
              </h2>
              <span className="rounded-md bg-sky-500/15 px-2 py-0.5 text-xs font-semibold text-sky-300">
                Klik baris untuk memilih resep
              </span>
            </div>
            <p className="mt-1 text-xs text-slate-400">
              Berdasarkan riset kuantitatif 5 tahun atas 8 instrumen benchmark (07:16 –
              14:05). Pilih profil Anda di kanan untuk memfilter:
            </p>
          </div>

          {/* Investor Archetype Filter (01:06 - 03:56) + Dominated 25 Toggle */}
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => setArchetypeFilter('all')}
              className={`rounded-lg px-2.5 py-1.5 text-xs font-semibold transition ${
                archetypeFilter === 'all'
                  ? 'bg-emerald-500 text-slate-950'
                  : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
              }`}
            >
              Semua ({showDominated25 ? 25 : 15})
            </button>
            <button
              type="button"
              onClick={() => setArchetypeFilter('business-owner')}
              title="Fokus Active Income / Bisnis / Karir (60 jam/minggu): Target 6-15% return, Drawdown < 10% (01:22)"
              className={`flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition ${
                archetypeFilter === 'business-owner'
                  ? 'bg-emerald-500 text-slate-950'
                  : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
              }`}
            >
              <Briefcase className="h-3.5 w-3.5" />
              <span>Pebisnis / Profesional</span>
            </button>
            <button
              type="button"
              onClick={() => setArchetypeFilter('hybrid-conviction')}
              title="Strategi Leon Hartono (Risk Budgeting 70-90% sesuai siklus Bull Market + Risk Parity) (09:05 & 13:42)"
              className={`flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition ${
                archetypeFilter === 'hybrid-conviction'
                  ? 'bg-emerald-500 text-slate-950'
                  : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
              }`}
            >
              <Sparkles className="h-3.5 w-3.5" />
              <span>Risk Budgeting &amp; Parity</span>
            </button>
            <button
              type="button"
              onClick={() => setArchetypeFilter('full-time-investor')}
              title="Full-time Investor / High Risk: Return > 18% p.a. (02:06)"
              className={`flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition ${
                archetypeFilter === 'full-time-investor'
                  ? 'bg-emerald-500 text-slate-950'
                  : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
              }`}
            >
              <Flame className="h-3.5 w-3.5" />
              <span>High Return (&gt;18%)</span>
            </button>

            <button
              type="button"
              onClick={() => setShowDominated25(!showDominated25)}
              title="Tampilkan juga 10 portfolio yang tereliminasi karena kalah efisien (Menit 07:16 & 10:16)"
              className={`flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition ${
                showDominated25
                  ? 'border-amber-500/50 bg-amber-500/15 text-amber-300'
                  : 'border-slate-700 bg-slate-900 text-slate-400 hover:text-slate-200'
              }`}
            >
              {showDominated25 ? (
                <EyeOff className="h-3.5 w-3.5" />
              ) : (
                <Eye className="h-3.5 w-3.5" />
              )}
              <span>{showDominated25 ? 'Sembunyikan 10 Kalah' : '+10 Porto Tereliminasi'}</span>
            </button>
          </div>
        </div>

        {/* Semantic Responsive Table with Sticky Headers (following modern-web-guidance `responsive-table`) */}
        <div
          tabIndex={0}
          role="region"
          aria-labelledby="optimal-portfolios-caption"
          className="mt-4 max-h-[520px] overflow-auto rounded-xl border border-slate-800"
        >
          <table className="w-full border-separate border-spacing-0 text-left text-xs">
            <caption id="optimal-portfolios-caption" className="sr-only">
              Daftar 15 Portfolio Optimal berdasarkan CAGR, Maximum Drawdown, dan Bobot 8
              Instrumen Benchmark
            </caption>
            <thead className="sticky top-0 z-20 bg-slate-950 text-[11px] font-bold uppercase tracking-wider text-slate-300 shadow-sm">
              <tr>
                <th
                  rowSpan={2}
                  className="sticky left-0 z-30 border-b border-r border-slate-800 bg-slate-950 px-3.5 py-2.5"
                >
                  Investment Strategy
                </th>
                <th
                  rowSpan={2}
                  className="border-b border-r border-slate-800 px-3 py-2.5 text-center"
                >
                  Risk Profile
                </th>
                <th
                  rowSpan={2}
                  className="border-b border-r border-slate-800 bg-emerald-950/30 px-3 py-2.5 text-right text-emerald-300"
                >
                  CAGR (%)
                </th>
                <th
                  rowSpan={2}
                  className="border-b border-r border-slate-800 bg-rose-950/30 px-3 py-2.5 text-right text-rose-300"
                >
                  Max DD (%)
                </th>
                <th
                  colSpan={8}
                  className="border-b border-slate-800 bg-sky-950/40 px-3 py-1.5 text-center text-sky-300"
                >
                  BOBOT MODAL (%) — 8 CORE BENCHMARK
                </th>
              </tr>
              <tr>
                {core8Ids.map((id) => (
                  <th
                    key={id}
                    className="border-b border-r border-slate-800 bg-slate-900 px-2.5 py-1.5 text-right font-mono text-[11px] text-slate-300"
                  >
                    {id}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/70">
              {displayedPresets.map((preset) => {
                const isSelected = activePresetId === preset.id;
                const badge = getRiskTierBadge(preset.riskTier);
                return (
                  <tr
                    key={preset.id}
                    onClick={() => onSelectPreset(preset)}
                    className={`cursor-pointer transition ${
                      isSelected
                        ? 'bg-emerald-500/15 ring-1 ring-inset ring-emerald-500/50'
                        : !preset.isOptimal15
                          ? 'bg-slate-950/60 opacity-65 hover:opacity-100'
                          : 'hover:bg-slate-800/70'
                    }`}
                  >
                    <th
                      scope="row"
                      className={`sticky left-0 z-10 border-r border-slate-800/80 px-3.5 py-2.5 font-semibold ${
                        isSelected
                          ? 'bg-slate-900 text-emerald-300'
                          : 'bg-slate-900/95 text-white'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        {preset.rank && (
                          <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-slate-800 font-mono text-[10px] text-slate-400">
                            {preset.rank}
                          </span>
                        )}
                        <div>
                          <div className="text-xs font-bold">{preset.name}</div>
                          {preset.videoNote && (
                            <div className="mt-0.5 line-clamp-1 max-w-xs text-[10px] font-normal text-slate-400">
                              {preset.videoNote}
                            </div>
                          )}
                          {preset.dominatedByReason && (
                            <div className="mt-0.5 max-w-xs text-[10px] font-normal text-amber-400">
                              ⚠️ {preset.dominatedByReason}
                            </div>
                          )}
                        </div>
                      </div>
                    </th>

                    <td className="border-r border-slate-800/60 px-2.5 py-2 text-center">
                      <span
                        className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-bold ${badge.bgClass} ${badge.textClass}`}
                      >
                        {badge.label.replace(' RISK', '')}
                      </span>
                    </td>

                    <td className="border-r border-slate-800/60 bg-emerald-500/5 px-3 py-2 text-right font-mono font-bold text-emerald-400">
                      {preset.cagr.toFixed(2)}%
                    </td>

                    <td className="border-r border-slate-800/60 bg-rose-500/5 px-3 py-2 text-right font-mono font-bold text-rose-400">
                      {preset.maxDrawdown.toFixed(2)}%
                    </td>

                    {core8Ids.map((assetId) => {
                      const w = preset.weights[assetId] ?? 0;
                      return (
                        <td
                          key={assetId}
                          className={`border-r border-slate-800/40 px-2.5 py-2 text-right font-mono ${
                            w >= 30
                              ? 'bg-sky-500/15 font-bold text-sky-300'
                              : w > 0
                                ? 'text-slate-200'
                                : 'text-slate-600'
                          }`}
                        >
                          {w}%
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* SECTION 3: CUSTOM QUANT SOLVER & MANUAL WEIGHT BUILDER */}
      <section className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Left 7 Cols: Custom Risk Parity / Risk Budgeting Solver + Asset Universe Picker + Sliders */}
        <div className="space-y-5 rounded-2xl border border-slate-800 bg-slate-900/90 p-5 shadow-xl lg:col-span-7">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-3">
            <div className="flex items-center gap-2">
              <Sliders className="h-5 w-5 text-emerald-400" />
              <h2 className="text-base font-extrabold text-white">
                Custom Portfolio Quant Lab &amp; Bobot Editor
              </h2>
            </div>

            {/* Method Selector Pills */}
            <div className="flex flex-wrap gap-1 rounded-xl border border-slate-800 bg-slate-950 p-1">
              {(
                [
                  { id: 'risk-parity', label: 'Risk Parity (Rata)' },
                  { id: 'risk-budgeting', label: 'Risk Budgeting (Bias)' },
                  { id: 'all-in', label: 'All-In 100%' },
                  { id: 'custom', label: 'Manual Sliders' },
                ] as const
              ).map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setAllocationMethod(m.id)}
                  className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition ${
                    allocationMethod === m.id
                      ? 'bg-emerald-500 text-slate-950'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>

          {/* Step A: Select Active Asset Universe */}
          <div>
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-300">
                1. Pilih Instrumen di Universe Anda (Klik untuk Aktif/Nonaktif):
              </label>
              <span className="text-[11px] text-slate-400">
                {selectedUniverseIds.length} instrumen aktif
              </span>
            </div>

            <div className="mt-2.5 flex flex-wrap gap-1.5">
              {allAssets.map((asset) => {
                const isSelected = selectedUniverseIds.includes(asset.id);
                return (
                  <button
                    key={asset.id}
                    type="button"
                    onClick={() => onToggleUniverseAsset(asset.id)}
                    title={`${asset.name} • 5Y CAGR: ${asset.cagr}% • Max DD: ${asset.maxDrawdown}%`}
                    className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition ${
                      isSelected
                        ? 'border-emerald-500/50 bg-emerald-500/15 text-white shadow-xs'
                        : 'border-slate-800 bg-slate-950/60 text-slate-500 hover:border-slate-700 hover:text-slate-300'
                    }`}
                  >
                    <span
                      className="h-2 w-2 rounded-full"
                      style={{ backgroundColor: asset.color }}
                    />
                    <span>{asset.shortName}</span>
                    {!asset.isCoreBenchmark && (
                      <span className="rounded bg-slate-800 px-1 text-[9px] text-slate-400">
                        +Peer
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Step B: Conviction Risk Budgeting Controls (Shown when method === 'risk-budgeting' or 'all-in') */}
          {(allocationMethod === 'risk-budgeting' || allocationMethod === 'all-in') && (
            <div className="rounded-xl border border-emerald-500/30 bg-slate-950/90 p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="text-xs font-bold text-emerald-300">
                    2. Pilih Aset Conviction (Bias Bull Market — Menit 09:01):
                  </div>
                  <p className="text-[11px] text-slate-400">
                    Alokasikan persentase <strong>Risiko</strong> (bukan 90% modal!) ke
                    instrumen yang Anda yakini sedang uptrend.
                  </p>
                </div>

                {/* Solver Algorithm Mode Toggle */}
                {allocationMethod === 'risk-budgeting' && (
                  <select
                    value={solverMode}
                    onChange={(e) =>
                      setSolverMode(
                        e.target.value as 'calibrated-video' | 'euler-covariance'
                      )
                    }
                    className="rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1 text-xs text-slate-200"
                    aria-label="Quant Solver Algorithm"
                  >
                    <option value="calibrated-video">
                      Solver: Video Calibrated (Sander/Leon)
                    </option>
                    <option value="euler-covariance">
                      Solver: Exact Covariance Matrix (Spinu)
                    </option>
                  </select>
                )}
              </div>

              {/* Conviction Asset Selector */}
              <div className="mt-3 flex flex-wrap gap-1.5">
                {allAssets
                  .filter((a) => selectedUniverseIds.includes(a.id))
                  .map((asset) => (
                    <button
                      key={asset.id}
                      type="button"
                      onClick={() => setConvictionAssetId(asset.id)}
                      className={`rounded-lg px-3 py-1.5 text-xs font-bold transition ${
                        convictionAssetId === asset.id
                          ? 'bg-amber-400 text-slate-950 shadow-sm'
                          : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                      }`}
                    >
                      {asset.shortName}
                    </button>
                  ))}
              </div>

              {/* Risk Budget % Slider */}
              {allocationMethod === 'risk-budgeting' && (
                <div className="mt-4">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-slate-300">
                      Target Alokasi Risiko di{' '}
                      <strong className="text-amber-300">{convictionAssetId}</strong>:
                    </span>
                    <div className="flex items-center gap-2">
                      {[50, 70, 80, 90].map((presetPct) => (
                        <button
                          key={presetPct}
                          type="button"
                          onClick={() => setConvictionRiskPercent(presetPct)}
                          className={`rounded px-2 py-0.5 font-mono text-xs font-bold ${
                            convictionRiskPercent === presetPct
                              ? 'bg-emerald-500 text-slate-950'
                              : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
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
                    className="mt-2 h-2 w-full cursor-pointer appearance-none rounded-lg bg-slate-800 accent-amber-400"
                    aria-label="Conviction Risk Budget Percentage"
                  />
                  <div className="mt-1 flex justify-between text-[11px] text-slate-400">
                    <span>20% Risiko (Moderat)</span>
                    <span className="font-mono font-bold text-amber-300">
                      {convictionRiskPercent}% Risiko ➔{' '}
                      {activeWeights[convictionAssetId] ?? 0}% Bobot Modal
                    </span>
                    <span>95% Risiko (Agresif)</span>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Step C: Interactive Weight Sliders & Risk Contribution Breakdown */}
          <div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-300">
                3. Bobot Modal (%) vs Kontribusi Risiko (%):
              </span>
              <div className="flex items-center gap-2">
                <span
                  className={`font-mono text-xs font-bold ${
                    Math.abs(manualSum - 100) > 0.5
                      ? 'text-amber-400'
                      : 'text-emerald-400'
                  }`}
                >
                  Total: {manualSum.toFixed(1)}%
                </span>
                {Math.abs(manualSum - 100) > 0.2 && (
                  <button
                    type="button"
                    onClick={onNormalizeManualWeights}
                    className="rounded-lg bg-emerald-500/20 px-2.5 py-1 text-xs font-semibold text-emerald-300 hover:bg-emerald-500/30"
                  >
                    Auto-Normalize 100%
                  </button>
                )}
              </div>
            </div>

            <div className="mt-3 max-h-80 space-y-2.5 overflow-y-auto pr-1">
              {allAssets
                .filter(
                  (a) =>
                    selectedUniverseIds.includes(a.id) || (activeWeights[a.id] ?? 0) > 0
                )
                .map((asset) => {
                  const capWeight = activeWeights[asset.id] ?? 0;
                  const riskContrib = solvedMetrics.riskContributions[asset.id] ?? 0;
                  return (
                    <div
                      key={asset.id}
                      className="rounded-xl border border-slate-800/90 bg-slate-950/70 p-3"
                    >
                      <div className="flex items-center justify-between gap-2 text-xs">
                        <div className="flex items-center gap-2">
                          <span
                            className="h-3 w-3 rounded-full"
                            style={{ backgroundColor: asset.color }}
                          />
                          <span className="font-bold text-white">{asset.shortName}</span>
                          <span className="hidden text-slate-400 sm:inline">
                            {asset.name}
                          </span>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-[11px] text-slate-400">
                            Risk Share:{' '}
                            <strong className="font-mono text-amber-300">
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
                              className="w-14 rounded border border-slate-700 bg-slate-900 px-1.5 py-0.5 text-right font-mono text-xs font-bold text-emerald-400"
                              aria-label={`${asset.shortName} weight percentage`}
                            />
                            <span className="font-mono text-xs text-slate-400">%</span>
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
                        className="mt-2 h-1.5 w-full cursor-pointer appearance-none rounded-lg bg-slate-800 accent-emerald-500"
                        aria-label={`${asset.shortName} weight slider`}
                      />
                    </div>
                  );
                })}
            </div>
          </div>

          {/* Step D: Custom Ticker Lookup (Yahoo Finance) & Synthetic Asset Creator */}
          <div className="border-t border-slate-800 pt-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-xs font-bold text-slate-300">
                Tambah Instrumen Baru ke Universe (Yahoo Ticker / Custom Aset):
              </div>
              <button
                type="button"
                onClick={() => setShowSyntheticForm(!showSyntheticForm)}
                className="flex items-center gap-1 text-xs font-semibold text-sky-400 hover:text-sky-300"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>{showSyntheticForm ? 'Tutup Form Manual' : 'Edit Asumsi / Synthetic Asset'}</span>
              </button>
            </div>

            <div className="mt-2 flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-500" />
                <input
                  type="text"
                  placeholder="Ketik simbol saham Indo/US (contoh: AADI.JK, ADRO, BREN, TLKM, NVDA)..."
                  value={tickerInput}
                  onChange={(e) => setTickerInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleYahooLookup()}
                  className="w-full rounded-xl border border-slate-800 bg-slate-950 pl-8 pr-3 py-1.5 text-xs text-white focus:border-emerald-500 focus:outline-none"
                />
              </div>
              <button
                type="button"
                onClick={() => handleYahooLookup()}
                disabled={isLookingUpTicker}
                className="rounded-xl bg-emerald-500 px-3.5 py-1.5 text-xs font-bold text-slate-950 hover:bg-emerald-400 disabled:opacity-50"
              >
                {isLookingUpTicker ? 'Fetching...' : 'Fetch Ticker'}
              </button>
            </div>

            {/* Quick-Pick Popular Tickers (including IPOs < 5Y with documented assumptions) */}
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <span className="text-[10px] font-semibold text-slate-500">
                Quick Add (Estimasi &amp; 5Y):
              </span>
              {Object.keys(POPULAR_TICKER_ESTIMATES)
                .slice(0, 9)
                .map((sym) => (
                  <button
                    key={sym}
                    type="button"
                    onClick={() => handleYahooLookup(sym)}
                    className="rounded border border-slate-800 bg-slate-950 px-2 py-0.5 font-mono text-[10px] text-slate-300 hover:border-emerald-500/50 hover:text-emerald-300"
                  >
                    +{sym.replace('.JK', '')}
                  </button>
                ))}
            </div>

            {tickerError && (
              <p className="mt-2 text-[11px] text-amber-400">{tickerError}</p>
            )}

            {/* Display Transparency Card for Assumptions & Estimated Metrics of Fetched Ticker */}
            {lastFetchedTickerInfo && (
              <div className="mt-3 rounded-xl border border-sky-500/30 bg-sky-950/20 p-3 text-xs">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="font-bold text-white">
                    ✅ {lastFetchedTickerInfo.symbol} — {lastFetchedTickerInfo.name}
                  </div>
                  <span className="rounded bg-sky-500/20 px-2 py-0.5 font-mono text-[10px] font-semibold text-sky-300">
                    {lastFetchedTickerInfo.sourceType === 'live-yahoo'
                      ? `Live Yahoo (${lastFetchedTickerInfo.dataYears} Thn Data)`
                      : `Curated Quant Estimate (${lastFetchedTickerInfo.dataYears} Thn Histori)`}
                  </span>
                </div>
                <div className="mt-1.5 flex flex-wrap gap-4 font-mono text-[11px]">
                  <span>
                    Est. CAGR:{' '}
                    <strong className="text-emerald-400">
                      {lastFetchedTickerInfo.cagr}%/thn
                    </strong>
                  </span>
                  <span>
                    Est. Max Drawdown:{' '}
                    <strong className="text-rose-400">
                      -{lastFetchedTickerInfo.maxDrawdown}%
                    </strong>
                  </span>
                  <span>
                    Volatilitas:{' '}
                    <strong className="text-amber-300">
                      {lastFetchedTickerInfo.volatility}%
                    </strong>
                  </span>
                  <span>
                    Harga:{' '}
                    <strong className="text-white">
                      {lastFetchedTickerInfo.currency === 'IDR'
                        ? `Rp ${lastFetchedTickerInfo.price.toLocaleString('id-ID')}`
                        : `$${lastFetchedTickerInfo.price}`}
                    </strong>
                  </span>
                </div>
                <p className="mt-1.5 text-[11px] text-slate-300">
                  <strong>Catatan Asumsi:</strong> {lastFetchedTickerInfo.assumptionNote}{' '}
                  <button
                    type="button"
                    onClick={() => setShowSyntheticForm(true)}
                    className="text-sky-400 underline hover:text-sky-300"
                  >
                    Ubah angka asumsi ini
                  </button>
                </p>
              </div>
            )}

            {showSyntheticForm && (
              <form
                onSubmit={handleAddSyntheticAsset}
                className="mt-3 grid grid-cols-2 gap-2.5 rounded-xl border border-slate-800 bg-slate-950 p-3.5 sm:grid-cols-6"
              >
                <div className="sm:col-span-1">
                  <label className="block text-[10px] text-slate-400">Simbol</label>
                  <input
                    type="text"
                    required
                    placeholder="SBN"
                    value={synthSymbol}
                    onChange={(e) => setSynthSymbol(e.target.value)}
                    className="mt-1 w-full rounded border border-slate-800 bg-slate-900 px-2 py-1 text-xs text-white"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-[10px] text-slate-400">Nama Aset</label>
                  <input
                    type="text"
                    placeholder="Obligasi FR / Properti"
                    value={synthName}
                    onChange={(e) => setSynthName(e.target.value)}
                    className="mt-1 w-full rounded border border-slate-800 bg-slate-900 px-2 py-1 text-xs text-white"
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-slate-400">CAGR (%)</label>
                  <input
                    type="number"
                    step="0.5"
                    value={synthCagr}
                    onChange={(e) => setSynthCagr(Number(e.target.value))}
                    className="mt-1 w-full rounded border border-slate-800 bg-slate-900 px-2 py-1 text-xs text-emerald-400"
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-slate-400">Max DD (%)</label>
                  <input
                    type="number"
                    step="0.5"
                    value={synthMaxDd}
                    onChange={(e) => setSynthMaxDd(Number(e.target.value))}
                    className="mt-1 w-full rounded border border-slate-800 bg-slate-900 px-2 py-1 text-xs text-rose-400"
                  />
                </div>
                <div className="flex items-end">
                  <button
                    type="submit"
                    className="w-full rounded bg-emerald-500 py-1.5 text-xs font-bold text-slate-950 hover:bg-emerald-400"
                  >
                    + Tambah
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>

        {/* Right 5 Cols: Visual Quant Charts (Capital Weight vs Risk Contribution + Pareto Frontier) */}
        <div className="space-y-5 lg:col-span-5">
          {/* Chart 1: Capital Weight (%) vs Risk Contribution (%) */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900/90 p-5 shadow-xl">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-extrabold text-white">
                Bobot Modal (%) vs Porsi Risiko (%)
              </h3>
              <Layers className="h-4 w-4 text-sky-400" />
            </div>
            <p className="mt-1 text-xs text-slate-400">
              Menjelaskan konsep menit 09:20: kenapa bobot modal 18% di BTC setara dengan
              ~90% risiko fluktuasi portfolio Anda.
            </p>

            <div className="mt-4 h-60 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={weightVsRiskData}
                  margin={{ top: 8, right: 10, left: -18, bottom: 0 }}
                >
                  <XAxis
                    dataKey="symbol"
                    stroke="#94a3b8"
                    fontSize={11}
                    tickLine={false}
                  />
                  <YAxis
                    stroke="#64748b"
                    fontSize={11}
                    tickFormatter={(v) => `${v}%`}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#0f172a',
                      borderColor: '#1e293b',
                      borderRadius: '0.75rem',
                      fontSize: '12px',
                    }}
                    formatter={(value: number, name: string) => [`${value}%`, name]}
                  />
                  <Legend wrapperStyle={{ fontSize: '11px' }} />
                  <Bar
                    dataKey="capitalWeight"
                    name="Bobot Modal (%)"
                    fill="#10b981"
                    radius={[4, 4, 0, 0]}
                  />
                  <Bar
                    dataKey="riskContribution"
                    name="Kontribusi Risiko (%)"
                    fill="#f59e0b"
                    radius={[4, 4, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Chart 2: Efficient Frontier Scatter Plot (CAGR vs Max Drawdown) */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900/90 p-5 shadow-xl">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-extrabold text-white">
                Spektrum Return vs Risiko (Pareto Frontier)
              </h3>
              <ShieldAlert className="h-4 w-4 text-emerald-400" />
            </div>
            <p className="mt-1 text-xs text-slate-400">
              Garis hijau adalah 15 Portfolio Optimal. Titik merah muda adalah 10
              portfolio yang tereliminasi karena kalah efisien (04:15 &amp; 10:16).
            </p>

            <div className="mt-4 h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <ScatterChart margin={{ top: 10, right: 15, bottom: 10, left: -15 }}>
                  <XAxis
                    type="number"
                    dataKey="maxDrawdown"
                    name="Max Drawdown"
                    unit="%"
                    stroke="#94a3b8"
                    fontSize={11}
                  />
                  <YAxis
                    type="number"
                    dataKey="cagr"
                    name="CAGR"
                    unit="%"
                    stroke="#94a3b8"
                    fontSize={11}
                  />
                  <ZAxis range={[55, 55]} />
                  <Tooltip
                    cursor={{ strokeDasharray: '3 3' }}
                    contentStyle={{
                      backgroundColor: '#0f172a',
                      borderColor: '#1e293b',
                      borderRadius: '0.75rem',
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
                    stroke="#38bdf8"
                    strokeDasharray="3 3"
                  />
                  <ReferenceLine
                    y={solvedMetrics.cagr}
                    stroke="#38bdf8"
                    strokeDasharray="3 3"
                  />
                  <Scatter
                    name="15 Optimal Presets"
                    data={scatterOptimalData}
                    fill="#10b981"
                  />
                  <Scatter
                    name="10 Dominated (Kalah)"
                    data={scatterDominatedData}
                    fill="#f43f5e"
                  />
                  <Scatter
                    name="Active Portfolio Anda"
                    data={activePointData}
                    fill="#38bdf8"
                  >
                    {activePointData.map((_, idx) => (
                      <Cell key={idx} fill="#38bdf8" />
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
