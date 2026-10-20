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
  RebalanceMode,
} from './lib/quant/types';
import {
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

const STORAGE_KEY = 'quantporto_state_v1';
const SAVED_PORTFOLIOS_KEY = 'quantporto_saved_portfolios_v1';

export function App() {
  const [activeTab, setActiveTab] = useState<'builder' | 'rebalancer' | 'roadmap'>(
    'builder'
  );

  // Asset Universe (8 Core Video Benchmarks + Expanded IDX/US/Crypto + User Custom Assets)
  const [allAssets, setAllAssets] = useState<AssetDefinition[]>(
    CORE_AND_EXPANDED_ASSETS
  );

  // Selected Universe for Quant Solver (defaults to the 7 core active assets in Risk Parity / Risk Budgeting)
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

  // Monthly Savings for Rp 10 Billion calculator
  const [monthlySavingsIdr, setMonthlySavingsIdr] = useState<number>(10_000_000);

  // Rebalancer State
  const [usdIdrRate, setUsdIdrRate] = useState<number>(15600);
  const [inputMode, setInputMode] = useState<'nominal' | 'units'>('nominal');
  const [rebalanceMode, setRebalanceMode] =
    useState<RebalanceMode>('sell-and-buy');
  const [cashInjectionIdr, setCashInjectionIdr] = useState<number>(0);
  const [driftThresholdPercent, setDriftThresholdPercent] = useState<number>(3);

  const [holdings, setHoldings] = useState<Record<string, HoldingEntry>>(() => {
    const init: Record<string, HoldingEntry> = {};
    for (const a of CORE_AND_EXPANDED_ASSETS) {
      const valIdr = VIDEO_1B_REBALANCE_EXAMPLE[a.id] ?? 0;
      const unitPriceIdr =
        a.currency === 'USD' ? a.defaultPrice * 15600 : a.defaultPrice;
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

  // Restore state from URL Hash (if shared link) or LocalStorage on first mount
  useEffect(() => {
    try {
      if (window.location.hash.startsWith('#porto=')) {
        const encoded = decodeURIComponent(window.location.hash.slice(7));
        const parsed = JSON.parse(atob(encoded));
        if (parsed.weights) {
          setActiveWeights(parsed.weights);
          setActivePresetId(parsed.presetId ?? null);
          setAllocationMethod(parsed.method ?? 'custom');
        }
        return;
      }

      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const saved = JSON.parse(raw);
        if (saved.activeWeights) setActiveWeights(saved.activeWeights);
        if (saved.activePresetId !== undefined)
          setActivePresetId(saved.activePresetId);
        if (saved.allocationMethod) setAllocationMethod(saved.allocationMethod);
        if (saved.holdings) setHoldings((prev) => ({ ...prev, ...saved.holdings }));
        if (saved.monthlySavingsIdr)
          setMonthlySavingsIdr(saved.monthlySavingsIdr);
        if (saved.usdIdrRate) setUsdIdrRate(saved.usdIdrRate);
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
          monthlySavingsIdr,
          usdIdrRate,
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
    monthlySavingsIdr,
    usdIdrRate,
  ]);

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
  const exactPresetMatch = useMemo(
    () =>
      activePresetId
        ? VIDEO_PORTFOLIO_PRESETS.find((p) => p.id === activePresetId) ?? null
        : null,
    [activePresetId]
  );

  const solvedMetrics = useMemo(
    () =>
      evaluatePortfolioMetrics(
        activeWeights,
        allAssets,
        VIDEO_PORTFOLIO_PRESETS,
        {
          rdptAlphaPromoBonusPercent: rdptPromoActive ? 3.0 : 0,
          exactPresetMatch,
        }
      ),
    [activeWeights, allAssets, rdptPromoActive, exactPresetMatch]
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
    ]
  );

  // Handler: Select one of the 15 Optimal Presets (or 10 Dominated Presets)
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

  // Handler: Update individual holding in Rebalancer
  const handleUpdateHolding = (assetId: string, patch: Partial<HoldingEntry>) => {
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

  // Handler: Load Video Rp 1 Billion Rebalance Example (14:58)
  const handleLoadVideo1BExample = () => {
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
          // Video 15:20: BTC & ETH naik 3x lipat (+200%), BBCA turun -10%, RDPT tetap 0%
          if (a.category === 'crypto') shock = 200;
          else if (a.category === 'idx-equity') shock = -10;
        } else if (scenario === 'video-crash-50') {
          // Video 15:46: BTC & ETH turun -50%
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
    const shareData = btoa(
      JSON.stringify({
        weights: activeWeights,
        presetId: activePresetId,
        method: allocationMethod,
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

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
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
      />

      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
        {activeTab === 'builder' && (
          <PortfolioBuilderView
            allAssets={allAssets}
            onAddCustomAsset={handleAddCustomAsset}
            presets={VIDEO_PORTFOLIO_PRESETS}
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
            monthlySavingsIdr={monthlySavingsIdr}
            setMonthlySavingsIdr={setMonthlySavingsIdr}
            onGoToRebalancer={() => setActiveTab('rebalancer')}
          />
        )}

        {activeTab === 'rebalancer' && (
          <PortfolioRebalancerView
            allAssets={allAssets}
            targetWeights={activeWeights}
            holdings={holdings}
            onUpdateHolding={handleUpdateHolding}
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
          />
        )}

        {activeTab === 'roadmap' && (
          <WealthRoadmapView
            solvedMetrics={solvedMetrics}
            monthlySavingsIdr={monthlySavingsIdr}
            setMonthlySavingsIdr={setMonthlySavingsIdr}
          />
        )}
      </main>

      <footer className="mt-12 border-t border-slate-900 bg-slate-950 py-6 text-center text-xs text-slate-500">
        <div className="mx-auto max-w-7xl px-4">
          QuantPorto — Reverse-Engineered dari{' '}
          <a
            href="https://www.youtube.com/watch?v=O8PShy9d484"
            target="_blank"
            rel="noreferrer"
            className="text-slate-400 underline hover:text-emerald-400"
          >
            &ldquo;Cara Dapet Rp10 MILIAR PERTAMA&rdquo; (Leon Hartono &amp; Sander)
          </a>
          . Data historis 5 tahun bukan jaminan kinerja masa depan. Siap di-deploy ke
          GitHub Pages.
        </div>
      </footer>
    </div>
  );
}

export default App;
