import React, { useMemo, useState } from 'react';
import { AssetDefinition } from '../../lib/quant/types';
import {
  calculatePortfolioDiversificationScore,
  getAssetPairwiseCorrelation,
} from '../../lib/quant/riskParitySolver';
import {
  ShieldCheck,
  Info,
  HelpCircle,
  TrendingDown,
  Layers,
  ArrowRight,
  Sparkles,
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

  // Filter assets based on scope
  const displayAssets = useMemo(() => {
    if (viewScope === 'active') {
      const active = allAssets.filter((a) => (activeWeights[a.id] ?? 0) > 0);
      return active.length > 0 ? active : coreBenchmarkAssets.slice(0, 5);
    }
    return coreBenchmarkAssets;
  }, [viewScope, allAssets, activeWeights, coreBenchmarkAssets]);

  // Diversification score for active portfolio
  const divScore = useMemo(() => {
    return calculatePortfolioDiversificationScore(allAssets, activeWeights);
  }, [allAssets, activeWeights]);

  // Default selected pair if null
  const activePair = useMemo(() => {
    if (selectedPair) return selectedPair;
    if (displayAssets.length >= 2) {
      return [displayAssets[0].id, displayAssets[displayAssets.length - 1].id] as [string, string];
    }
    return ['RDPT', 'BTC'] as [string, string];
  }, [selectedPair, displayAssets]);

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

  // Color helper based on correlation r
  const getCellColorClass = (corr: number, isSelf: boolean) => {
    if (isSelf) return 'bg-slate-800 text-slate-400 font-bold';
    if (corr >= 0.7) return 'bg-rose-500/25 text-rose-300 font-semibold hover:bg-rose-500/40';
    if (corr >= 0.35) return 'bg-amber-500/20 text-amber-300 hover:bg-amber-500/35';
    if (corr >= 0.1) return 'bg-sky-500/20 text-sky-300 hover:bg-sky-500/35';
    return 'bg-emerald-500/25 text-emerald-300 font-semibold hover:bg-emerald-500/40';
  };

  // Descriptive text helper for selected pair
  const getPairInsight = (a: AssetDefinition, b: AssetDefinition, corr: number) => {
    if (a.id === b.id) {
      return {
        strength: 'Korelasi Sempurna (1.00)',
        description: `${a.symbol} berkorelasi 100% terhadap dirinya sendiri. Tidak memberikan manfaat diversifikasi langsung.`,
      };
    }

    if (corr >= 0.7) {
      return {
        strength: 'Korelasi Sangat Tinggi (Searah)',
        description: `${a.symbol} dan ${b.symbol} cenderung bergerak serempak pada siklus pasar yang sama. Mengalokasikan terlalu banyak pada keduanya dapat menumpuk risiko sistemik (misal sama-sama sektor teknologi AS atau sesama kripto).`,
      };
    }

    if (corr >= 0.35) {
      return {
        strength: 'Korelasi Moderat',
        description: `${a.symbol} dan ${b.symbol} memiliki keterkaitan pergerakan sedang. Masih memberikan peredam risiko yang cukup baik dibanding hanya memegang satu kelas aset tunggal.`,
      };
    }

    if (corr >= 0.1) {
      return {
        strength: 'Korelasi Rendah (Dekorrelasi Efektif)',
        description: `Pergerakan harga ${a.symbol} dan ${b.symbol} sangat independen. Ketika salah satu aset mengalami koreksi atau siklus bear, aset lainnya cenderung bertahan atau bergerak sebaliknya, membatasi penurunan drawdown portofolio.`,
      };
    }

    return {
      strength: 'Korelasi Sangat Rendah / Mendekati Nol (Diversifikasi Maksimal)',
      description: `Kombinasi ${a.symbol} dan ${b.symbol} adalah pasangan ideal dalam teori Risk Parity. Aset ini bertindak sebagai penyeimbang sempurna tanpa mengorbankan ekspektasi return majemuk portofolio jangka panjang.`,
    };
  };

  const insight = getPairInsight(assetA, assetB, selectedCorrelation);

  return (
    <div className="ui-card rounded-xl p-5 border shadow-sm space-y-4">
      {/* Header bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-border">
        <div>
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-indigo-400" />
            <h3 className="ui-text-main text-sm font-bold">
              Matriks Korelasi &amp; Efektivitas Diversifikasi
            </h3>
          </div>
          <p className="ui-text-muted text-xs mt-0.5">
            Analisis korelasi antar-aset untuk membuktikan mengapa portofolio tahan banting saat krisis
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Diversification Score Badge */}
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>Skor Diversifikasi: {divScore.score}%</span>
          </div>

          {/* Scope Toggle: Active vs All 8 Benchmarks */}
          <div className="ui-subtle flex rounded-lg p-0.5 text-xs">
            <button
              type="button"
              onClick={() => setViewScope('active')}
              className={`px-2.5 py-1 rounded font-medium transition ${
                viewScope === 'active'
                  ? 'ui-card ui-text-main font-semibold shadow-2xs'
                  : 'ui-text-muted hover:opacity-80'
              }`}
            >
              Aset Portofolio
            </button>
            <button
              type="button"
              onClick={() => setViewScope('benchmark')}
              className={`px-2.5 py-1 rounded font-medium transition ${
                viewScope === 'benchmark'
                  ? 'ui-card ui-text-main font-semibold shadow-2xs'
                  : 'ui-text-muted hover:opacity-80'
              }`}
            >
              8 Aset Inti Video
            </button>
          </div>
        </div>
      </div>

      {/* Main Grid + Side Insight Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* Left: Heatmap Grid Table */}
        <div className="lg:col-span-8 overflow-x-auto">
          <div className="min-w-[420px]">
            <table className="w-full text-center border-collapse text-xs">
              <thead>
                <tr>
                  <th className="p-2 text-left text-slate-400 font-semibold w-20">
                    Aset
                  </th>
                  {displayAssets.map((asset) => (
                    <th
                      key={asset.id}
                      className="p-2 text-slate-300 font-semibold text-center"
                      title={asset.name}
                    >
                      <div className="flex items-center justify-center gap-1">
                        <span
                          className="w-2 h-2 rounded-full shrink-0"
                          style={{ backgroundColor: asset.color }}
                        />
                        <span>{asset.symbol}</span>
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {displayAssets.map((rowAsset) => (
                  <tr key={rowAsset.id}>
                    {/* Row Header */}
                    <td className="p-2 text-left font-semibold text-slate-200">
                      <div className="flex items-center gap-1.5">
                        <span
                          className="w-2 h-2 rounded-full shrink-0"
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
                          className={`p-2 transition-all cursor-pointer rounded text-[11px] font-mono ${getCellColorClass(
                            corr,
                            isSelf
                          )} ${
                            isSelected
                              ? 'ring-2 ring-indigo-400 font-bold scale-105 z-10'
                              : ''
                          }`}
                          title={`Korelasi ${rowAsset.symbol} vs ${colAsset.symbol}: ${corr.toFixed(2)}`}
                        >
                          {corr.toFixed(2)}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Color Legend */}
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-[10px] text-slate-400 pt-2 border-t border-border/60">
            <div className="flex items-center gap-3">
              <span className="font-semibold text-slate-300">Legenda:</span>
              <div className="flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded bg-emerald-500/40 border border-emerald-500/50" />
                <span>Dekorrelasi Maksimal (&lt; 0.10)</span>
              </div>
              <div className="flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded bg-sky-500/40 border border-sky-500/50" />
                <span>Rendah (0.10 - 0.35)</span>
              </div>
              <div className="flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded bg-amber-500/40 border border-amber-500/50" />
                <span>Moderat (0.35 - 0.70)</span>
              </div>
              <div className="flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded bg-rose-500/40 border border-rose-500/50" />
                <span>Tinggi (&ge; 0.70)</span>
              </div>
            </div>
            <span className="italic text-slate-500">Klik sel mana saja untuk analisis detail</span>
          </div>
        </div>

        {/* Right: Selected Pair Deep-Dive Card */}
        <div className="lg:col-span-4 p-4 rounded-xl bg-slate-900/60 border border-border/80 space-y-3 text-xs">
          <div className="flex items-center justify-between pb-2 border-b border-border/60">
            <span className="font-bold text-slate-200">Wawasan Pasangan Terpilih:</span>
            <span className="font-mono text-xs font-bold px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-400 border border-indigo-500/30">
              r = {selectedCorrelation.toFixed(2)}
            </span>
          </div>

          <div className="flex items-center justify-center gap-2 py-1">
            <div className="text-center">
              <span className="font-bold text-white text-sm">{assetA.symbol}</span>
              <div className="text-[10px] text-slate-400">{assetA.name}</div>
            </div>
            <ArrowRight className="w-4 h-4 text-slate-500" />
            <div className="text-center">
              <span className="font-bold text-white text-sm">{assetB.symbol}</span>
              <div className="text-[10px] text-slate-400">{assetB.name}</div>
            </div>
          </div>

          <div className="p-2.5 rounded-lg bg-slate-950/80 border border-border/60">
            <div className="text-[11px] font-semibold text-slate-300">
              {insight.strength}
            </div>
            <p className="text-[11px] text-slate-400 mt-1 leading-relaxed">
              {insight.description}
            </p>
          </div>

          <div className="p-2.5 rounded-lg bg-indigo-500/10 border border-indigo-500/20 text-[11px] text-indigo-300 space-y-1">
            <div className="font-semibold flex items-center gap-1">
              <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
              <span>Prinsip Risk Parity:</span>
            </div>
            <p className="text-slate-400 text-[10px] leading-relaxed">
              Korelasi rendah antar-aset memungkinkan portofolio memotong risiko kejatuhan pasar tanpa mengurangi potensi return jangka panjang.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
