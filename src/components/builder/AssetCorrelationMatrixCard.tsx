import React, { useMemo, useState } from 'react';
import { AssetDefinition } from '../../lib/quant/types';
import {
  calculatePortfolioDiversificationScore,
  getAssetPairwiseCorrelation,
} from '../../lib/quant/riskParitySolver';
import {
  ShieldCheck,
  Layers,
  ArrowRight,
  Sparkles,
  ChevronDown,
  ArrowLeftRight,
  Zap,
} from 'lucide-react';

export interface AssetCorrelationMatrixCardProps {
  allAssets: AssetDefinition[];
  activeWeights: Record<string, number>;
  coreBenchmarkAssets: AssetDefinition[];
}

export const AssetCorrelationMatrixCard: React.FC<AssetCorrelationMatrixCardProps> = ({
  allAssets,
  activeWeights,
  coreBenchmarkAssets,
}) => {
  const [viewScope, setViewScope] = useState<'active' | 'benchmark'>('active');
  const [selectedPair, setSelectedPair] = useState<[string, string] | null>(null);
  const [isCollapsed, setIsCollapsed] = useState(false);

  // Active assets with positive allocation
  const activeAssets = useMemo(() => {
    return allAssets.filter((a) => (activeWeights[a.id] ?? 0) > 0);
  }, [allAssets, activeWeights]);

  // Filter assets based on scope
  const displayAssets = useMemo(() => {
    if (viewScope === 'active') {
      return activeAssets.length >= 2 ? activeAssets : coreBenchmarkAssets;
    }
    return coreBenchmarkAssets;
  }, [viewScope, activeAssets, coreBenchmarkAssets]);

  // Diversification score for active portfolio
  const divScore = useMemo(() => {
    return calculatePortfolioDiversificationScore(allAssets, activeWeights);
  }, [allAssets, activeWeights]);

  // Active selected pair
  const activePair = useMemo(() => {
    if (selectedPair) {
      // Verify both assets exist in allAssets
      const existsA = allAssets.some((a) => a.id === selectedPair[0]);
      const existsB = allAssets.some((a) => a.id === selectedPair[1]);
      if (existsA && existsB) return selectedPair;
    }
    if (displayAssets.length >= 2) {
      return [displayAssets[0].id, displayAssets[displayAssets.length - 1].id] as [string, string];
    }
    return ['RDPT', 'BTC'] as [string, string];
  }, [selectedPair, displayAssets, allAssets]);

  const assetA = useMemo(
    () => allAssets.find((a) => a.id === activePair[0]) ?? displayAssets[0],
    [activePair, allAssets, displayAssets]
  );
  const assetB = useMemo(
    () => allAssets.find((a) => a.id === activePair[1]) ?? displayAssets[displayAssets.length - 1],
    [activePair, allAssets, displayAssets]
  );

  const selectedCorrelation = useMemo(() => {
    if (!assetA || !assetB) return 1.0;
    return getAssetPairwiseCorrelation(assetA, assetB);
  }, [assetA, assetB]);

  // Color helper based on correlation r (theme-safe for both light and dark modes)
  const getCellColorClass = (corr: number, isSelf: boolean) => {
    if (isSelf) {
      return 'bg-zinc-100 dark:bg-zinc-800/80 text-zinc-500 dark:text-zinc-400 font-bold border border-zinc-200 dark:border-zinc-700/60';
    }
    if (corr >= 0.7) {
      return 'bg-rose-500/15 text-rose-700 dark:text-rose-300 font-semibold hover:bg-rose-500/25 border border-rose-500/20';
    }
    if (corr >= 0.35) {
      return 'bg-amber-500/15 text-amber-700 dark:text-amber-300 font-medium hover:bg-amber-500/25 border border-amber-500/20';
    }
    if (corr >= 0.1) {
      return 'bg-sky-500/15 text-sky-700 dark:text-sky-300 font-medium hover:bg-sky-500/25 border border-sky-500/20';
    }
    return 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 font-semibold hover:bg-emerald-500/25 border border-emerald-500/20';
  };

  // Helper for asset category badge
  const getCategoryLabel = (category: string) => {
    switch (category) {
      case 'money-market':
        return 'Pasar Uang';
      case 'bonds':
        return 'Obligasi';
      case 'idx-equity':
        return 'Saham IDN';
      case 'gold':
        return 'Komoditas Emas';
      case 'us-equity':
        return 'Saham Global/AS';
      case 'crypto':
        return 'Aset Kripto';
      default:
        return 'Aset Kustom';
    }
  };

  // Descriptive text helper for selected pair
  const getPairInsight = (a: AssetDefinition, b: AssetDefinition, corr: number) => {
    if (a.id === b.id) {
      return {
        strength: 'Korelasi Sempurna (r = 1.00)',
        strengthColor: 'text-zinc-600 dark:text-zinc-400',
        badgeBg: 'bg-zinc-500/15 text-zinc-700 dark:text-zinc-300 border-zinc-500/30',
        description: `${a.symbol} berkorelasi 100% terhadap dirinya sendiri. Tidak memberikan peredam risiko tambahan.`,
      };
    }

    if (corr >= 0.7) {
      return {
        strength: 'Korelasi Sangat Tinggi / Searah (r ≥ 0.70)',
        strengthColor: 'text-rose-600 dark:text-rose-400',
        badgeBg: 'bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/30',
        description: `${a.symbol} dan ${b.symbol} cenderung bergerak serempak pada siklus pasar yang sama. Mengalokasikan bobot terlalu besar pada keduanya memperbesar risiko kejatuhan portofolio secara bersamaan saat sektor mengalami tekanan.`,
      };
    }

    if (corr >= 0.35) {
      return {
        strength: 'Korelasi Moderat (0.35 ≤ r < 0.70)',
        strengthColor: 'text-amber-600 dark:text-amber-400',
        badgeBg: 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30',
        description: `${a.symbol} dan ${b.symbol} memiliki keterkaitan pergerakan sedang. Kombinasi ini memberikan diversifikasi yang cukup baik dibanding hanya memegang satu kelas aset tunggal.`,
      };
    }

    if (corr >= 0.1) {
      return {
        strength: 'Korelasi Rendah / Dekorrelasi Efektif (0.10 ≤ r < 0.35)',
        strengthColor: 'text-sky-600 dark:text-sky-400',
        badgeBg: 'bg-sky-500/15 text-sky-700 dark:text-sky-300 border-sky-500/30',
        description: `Pergerakan harga ${a.symbol} dan ${b.symbol} sangat independen. Ketika salah satu aset mengalami koreksi atau siklus bear, aset lainnya cenderung bertahan atau bergerak sebaliknya, membatasi penurunan drawdown portofolio.`,
      };
    }

    return {
      strength: 'Dekorrelasi Maksimal (r < 0.10)',
      strengthColor: 'text-emerald-600 dark:text-emerald-400',
      badgeBg: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30',
      description: `Kombinasi ${a.symbol} dan ${b.symbol} adalah pasangan ideal dalam prinsip Modern Portfolio Theory & Risk Parity. Aset ini bertindak sebagai penyeimbang sempurna yang memangkas risiko crash tanpa mengorbankan return majemuk portofolio.`,
    };
  };

  const insight = getPairInsight(assetA, assetB, selectedCorrelation);

  // Popular comparison shortcuts
  const popularPairs: Array<{ idA: string; idB: string; label: string }> = [
    { idA: 'SPY', idB: 'GLD', label: 'SPY ⚡ GLD (Saham vs Emas)' },
    { idA: 'SPY', idB: 'TLT', label: 'SPY ⚡ TLT (Saham vs Obligasi)' },
    { idA: 'BTC', idB: 'SPY', label: 'BTC ⚡ SPY (Kripto vs Saham AS)' },
    { idA: 'BTC', idB: 'TLT', label: 'BTC ⚡ TLT (Kripto vs Obligasi)' },
    { idA: 'RDPT', idB: 'BTC', label: 'RDPT ⚡ BTC (Pasar Uang vs Kripto)' },
  ];

  return (
    <div className="ui-card rounded-2xl p-5 sm:p-6 border ui-border shadow-xs space-y-5">
      {/* Header bar */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b ui-border">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400">
            <Layers className="h-5 w-5" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="ui-text-main text-base font-bold sm:text-lg">
                Matriks Korelasi &amp; Efisiensi Diversifikasi
              </h3>
              <span className="rounded-full bg-indigo-500/10 px-2 py-0.5 text-[10px] font-semibold text-indigo-600 dark:text-indigo-400 border border-indigo-500/20">
                Risk Parity Heatmap
              </span>
            </div>
            <p className="ui-text-muted text-xs sm:text-sm mt-0.5">
              Analisis korelasi antar-aset untuk membuktikan mengapa portofolio majemuk tahan banting saat krisis.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {/* Diversification Score Badge */}
          <div
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border ${
              divScore.score >= 55
                ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30'
                : divScore.score >= 35
                  ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30'
                  : 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/30'
            }`}
          >
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>Skor Diversifikasi: <strong>{divScore.score}%</strong></span>
            <span className="hidden sm:inline opacity-75">({divScore.label})</span>
          </div>

          {/* Scope Selector: Active Portfolio vs 8 Core Benchmarks */}
          <div className="ui-subtle flex rounded-lg p-0.5 text-xs">
            <button
              type="button"
              onClick={() => setViewScope('active')}
              className={`px-3 py-1 rounded-md font-medium transition ${
                viewScope === 'active'
                  ? 'ui-card ui-text-main font-semibold shadow-xs'
                  : 'ui-text-muted hover:ui-text-main'
              }`}
            >
              Aset Portofolio ({activeAssets.length})
            </button>
            <button
              type="button"
              onClick={() => setViewScope('benchmark')}
              className={`px-3 py-1 rounded-md font-medium transition ${
                viewScope === 'benchmark'
                  ? 'ui-card ui-text-main font-semibold shadow-xs'
                  : 'ui-text-muted hover:ui-text-main'
              }`}
            >
              8 Aset Inti (Benchmark)
            </button>
          </div>

          {/* Accordion Collapse/Expand Button */}
          <button
            type="button"
            onClick={() => setIsCollapsed((prev) => !prev)}
            className="ui-subtle flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium ui-text-secondary hover:ui-text-main transition"
            title={isCollapsed ? 'Tampilkan Matriks Korelasi' : 'Sembunyikan Matriks Korelasi'}
          >
            <span>{isCollapsed ? 'Buka' : 'Sembunyikan'}</span>
            <ChevronDown
              className={`w-3.5 h-3.5 transition-transform duration-200 ${
                isCollapsed ? '-rotate-90' : ''
              }`}
            />
          </button>
        </div>
      </div>

      {/* Main Content Body */}
      {!isCollapsed && (
        <>
          {/* Notice when active portfolio has < 2 assets */}
          {viewScope === 'active' && activeAssets.length < 2 && (
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3.5 text-xs text-amber-800 dark:text-amber-200 flex flex-wrap items-center justify-between gap-2">
              <span>
                💡 Portofolio aktif Anda saat ini hanya memiliki {activeAssets.length} aset dengan bobot &gt; 0%.
                Matriks korelasi memerlukan minimal 2 aset. Menampilkan 8 aset benchmark video sebagai referensi kuantitatif.
              </span>
              <button
                type="button"
                onClick={() => setViewScope('benchmark')}
                className="rounded-md bg-amber-500/20 px-2.5 py-1 font-semibold text-amber-900 dark:text-amber-100 hover:bg-amber-500/30 transition"
              >
                Lihat 8 Aset Inti
              </button>
            </div>
          )}

          {/* Grid Layout: Wide table on Left (7-8 cols), Deep Dive on Right (4-5 cols) */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Left: Heatmap Matrix Table */}
            <div className="lg:col-span-7 xl:col-span-8 space-y-3">
              <div className="ui-subtle rounded-xl border ui-border p-3 sm:p-4 overflow-hidden">
                <div className="overflow-x-auto scrollbar-thin">
                  <table className="w-full text-center border-collapse text-xs">
                    <thead>
                      <tr>
                        <th className="p-2.5 text-left font-semibold ui-text-muted text-[11px] uppercase tracking-wider w-24">
                          Aset
                        </th>
                        {displayAssets.map((colAsset) => {
                          const isHighlighted =
                            activePair[0] === colAsset.id || activePair[1] === colAsset.id;
                          return (
                            <th
                              key={colAsset.id}
                              className={`p-2 text-center text-xs transition-colors min-w-[56px] sm:min-w-[64px] ${
                                isHighlighted
                                  ? 'font-bold text-indigo-600 dark:text-indigo-400'
                                  : 'font-semibold ui-text-secondary'
                              }`}
                              title={`${colAsset.name} (${colAsset.symbol})`}
                            >
                              <div className="flex flex-col items-center justify-center gap-1">
                                <span
                                  className="w-2.5 h-2.5 rounded-full ring-1 ring-black/10 shrink-0"
                                  style={{ backgroundColor: colAsset.color }}
                                />
                                <span className="font-mono">{colAsset.symbol}</span>
                              </div>
                            </th>
                          );
                        })}
                      </tr>
                    </thead>
                    <tbody className="divide-y ui-border">
                      {displayAssets.map((rowAsset) => {
                        const isRowHighlighted =
                          activePair[0] === rowAsset.id || activePair[1] === rowAsset.id;
                        return (
                          <tr key={rowAsset.id} className="hover:bg-black/5 dark:hover:bg-white/5 transition-colors">
                            {/* Row Header */}
                            <td className="p-2 text-left">
                              <div
                                className={`flex items-center gap-2 font-mono text-xs ${
                                  isRowHighlighted
                                    ? 'font-bold text-indigo-600 dark:text-indigo-400'
                                    : 'font-semibold ui-text-main'
                                }`}
                              >
                                <span
                                  className="w-2.5 h-2.5 rounded-full ring-1 ring-black/10 shrink-0"
                                  style={{ backgroundColor: rowAsset.color }}
                                />
                                <span>{rowAsset.symbol}</span>
                              </div>
                            </td>

                            {/* Matrix Cells */}
                            {displayAssets.map((colAsset) => {
                              const isSelf = rowAsset.id === colAsset.id;
                              const corr = getAssetPairwiseCorrelation(rowAsset, colAsset);
                              const isSelected =
                                (activePair[0] === rowAsset.id && activePair[1] === colAsset.id) ||
                                (activePair[0] === colAsset.id && activePair[1] === rowAsset.id);

                              return (
                                <td
                                  key={colAsset.id}
                                  onClick={() => setSelectedPair([rowAsset.id, colAsset.id])}
                                  className={`p-2 transition-all cursor-pointer rounded-md text-xs font-mono select-none ${getCellColorClass(
                                    corr,
                                    isSelf
                                  )} ${
                                    isSelected
                                      ? 'ring-2 ring-indigo-500 scale-105 z-20 shadow-md font-bold bg-indigo-500/25 text-indigo-900 dark:text-indigo-100 border-indigo-500'
                                      : ''
                                  }`}
                                  title={`Klik untuk analisis: ${rowAsset.symbol} vs ${colAsset.symbol} (r = ${corr.toFixed(2)})`}
                                >
                                  {corr.toFixed(2)}
                                </td>
                              );
                            })}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Color Legend & Interaction Guide */}
                <div className="mt-4 pt-3 border-t ui-border flex flex-wrap items-center justify-between gap-3 text-[11px] ui-text-muted">
                  <div className="flex flex-wrap items-center gap-2 sm:gap-4">
                    <span className="font-semibold ui-text-main">Legenda Korelasi:</span>
                    <div className="flex items-center gap-1.5">
                      <span className="w-3 h-3 rounded bg-emerald-500/30 border border-emerald-500/60" />
                      <span>Maksimal (&lt; 0.10)</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="w-3 h-3 rounded bg-sky-500/30 border border-sky-500/60" />
                      <span>Rendah (0.10 - 0.35)</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="w-3 h-3 rounded bg-amber-500/30 border border-amber-500/60" />
                      <span>Moderat (0.35 - 0.70)</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="w-3 h-3 rounded bg-rose-500/30 border border-rose-500/60" />
                      <span>Tinggi (&ge; 0.70)</span>
                    </div>
                  </div>
                  <span className="italic text-[11px] text-indigo-600 dark:text-indigo-400">
                    💡 Klik sel mana saja untuk analisis detail
                  </span>
                </div>
              </div>
            </div>

            {/* Right: Selected Pair Deep-Dive Card */}
            <div className="lg:col-span-5 xl:col-span-4 ui-card rounded-xl p-4 sm:p-5 border ui-border shadow-xs space-y-4">
              {/* Header with selected pair badge */}
              <div className="flex items-center justify-between pb-3 border-b ui-border">
                <div>
                  <span className="font-bold ui-text-main text-sm">Wawasan Pasangan Terpilih</span>
                  <div className="ui-text-muted text-[11px]">Dinamika hubungan makro &amp; risiko</div>
                </div>
                <div
                  className={`font-mono text-xs font-bold px-2.5 py-1 rounded-lg border ${insight.badgeBg}`}
                >
                  r = {selectedCorrelation.toFixed(2)}
                </div>
              </div>

              {/* Pair comparison banner */}
              <div className="ui-subtle rounded-xl p-3 border ui-border flex items-center justify-between gap-3">
                {/* Asset A */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span
                      className="w-2.5 h-2.5 rounded-full ring-1 ring-black/10 shrink-0"
                      style={{ backgroundColor: assetA.color }}
                    />
                    <span className="font-bold ui-text-main text-sm truncate">{assetA.symbol}</span>
                  </div>
                  <div className="ui-text-muted text-[11px] truncate mt-0.5">{assetA.name}</div>
                  <div className="mt-1 flex items-center gap-1.5">
                    <span className="rounded bg-black/5 dark:bg-white/5 px-1.5 py-0.5 text-[10px] font-medium ui-text-secondary">
                      {getCategoryLabel(assetA.category)}
                    </span>
                    {(activeWeights[assetA.id] ?? 0) > 0 && (
                      <span className="font-mono text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">
                        {activeWeights[assetA.id]}%
                      </span>
                    )}
                  </div>
                </div>

                {/* Connector */}
                <div className="flex flex-col items-center justify-center shrink-0 px-1">
                  <div className="h-7 w-7 rounded-full bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
                    <ArrowLeftRight className="w-3.5 h-3.5" />
                  </div>
                </div>

                {/* Asset B */}
                <div className="flex-1 min-w-0 text-right">
                  <div className="flex items-center justify-end gap-1.5">
                    <span className="font-bold ui-text-main text-sm truncate">{assetB.symbol}</span>
                    <span
                      className="w-2.5 h-2.5 rounded-full ring-1 ring-black/10 shrink-0"
                      style={{ backgroundColor: assetB.color }}
                    />
                  </div>
                  <div className="ui-text-muted text-[11px] truncate mt-0.5">{assetB.name}</div>
                  <div className="mt-1 flex items-center justify-end gap-1.5">
                    {(activeWeights[assetB.id] ?? 0) > 0 && (
                      <span className="font-mono text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">
                        {activeWeights[assetB.id]}%
                      </span>
                    )}
                    <span className="rounded bg-black/5 dark:bg-white/5 px-1.5 py-0.5 text-[10px] font-medium ui-text-secondary">
                      {getCategoryLabel(assetB.category)}
                    </span>
                  </div>
                </div>
              </div>

              {/* Correlation Spectrum Visual Bar */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-[10px] ui-text-muted">
                  <span>-1.0 (Berlawanan)</span>
                  <span>0.0 (Netral)</span>
                  <span>+1.0 (Searah)</span>
                </div>
                <div className="relative h-2.5 w-full rounded-full bg-gradient-to-r from-emerald-500 via-sky-400 via-amber-400 to-rose-500 opacity-80">
                  {/* Position Marker */}
                  <div
                    className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 h-4 w-4 rounded-full bg-white dark:bg-zinc-900 border-2 border-indigo-600 shadow-md"
                    style={{
                      left: `${Math.max(4, Math.min(96, ((selectedCorrelation + 1) / 2) * 100))}%`,
                    }}
                  />
                </div>
              </div>

              {/* Qualitative Insight */}
              <div className="ui-subtle rounded-xl p-3.5 border ui-border space-y-1.5">
                <div className={`text-xs font-bold ${insight.strengthColor}`}>
                  {insight.strength}
                </div>
                <p className="ui-text-secondary text-xs leading-relaxed">
                  {insight.description}
                </p>
              </div>

              {/* Institutional Risk Parity Principle */}
              <div className="rounded-xl p-3.5 bg-indigo-500/10 border border-indigo-500/20 text-xs space-y-1 text-indigo-950 dark:text-indigo-200">
                <div className="font-semibold flex items-center gap-1.5 text-indigo-700 dark:text-indigo-300">
                  <Sparkles className="w-3.5 h-3.5 shrink-0" />
                  <span>Prinsip Risk Parity:</span>
                </div>
                <p className="text-[11px] ui-text-secondary leading-relaxed">
                  Korelasi rendah antar-aset adalah satu-satunya &quot;free lunch&quot; dalam dunia investasi. Menggabungkan aset independen memotong volatilitas portofolio tanpa harus memangkas potensi return majemuk.
                </p>
              </div>

              {/* Quick Pair Explorations */}
              <div className="space-y-2 pt-1 border-t ui-border">
                <div className="flex items-center gap-1.5 text-[11px] font-semibold ui-text-muted">
                  <Zap className="w-3 h-3 text-amber-500" />
                  <span>Eksplorasi Pasangan Kunci:</span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {popularPairs.map((p) => {
                    const isSelected =
                      (activePair[0] === p.idA && activePair[1] === p.idB) ||
                      (activePair[0] === p.idB && activePair[1] === p.idA);
                    return (
                      <button
                        key={p.label}
                        type="button"
                        onClick={() => {
                          setViewScope('benchmark');
                          setSelectedPair([p.idA, p.idB]);
                        }}
                        className={`rounded-lg px-2 py-1 text-[11px] transition ${
                          isSelected
                            ? 'bg-indigo-600 text-white font-semibold shadow-xs'
                            : 'ui-subtle ui-text-secondary hover:ui-text-main hover:bg-black/5 dark:hover:bg-white/5'
                        }`}
                      >
                        {p.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
};
