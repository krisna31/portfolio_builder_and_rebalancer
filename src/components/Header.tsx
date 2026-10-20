import React, { useEffect, useRef, useState } from 'react';
import {
  BarChart3,
  Scale,
  TrendingUp,
  RefreshCw,
  Download,
  Upload,
  Share2,
  BookmarkCheck,
  Sparkles,
  Check,
  X,
  Sun,
  Moon,
} from 'lucide-react';

export interface SavedPortfolioSnapshot {
  id: string;
  name: string;
  createdAt: string;
  weights: Record<string, number>;
  cagr: number;
  maxDrawdown: number;
}

interface HeaderProps {
  activeTab: 'builder' | 'rebalancer' | 'roadmap';
  setActiveTab: (tab: 'builder' | 'rebalancer' | 'roadmap') => void;
  usdIdrRate: number;
  setUsdIdrRate: (rate: number) => void;
  priceSourceText: string;
  lastUpdatedText: string;
  isFetchingPrices: boolean;
  onRefreshLivePrices: () => void;
  rdptPromoActive: boolean;
  setRdptPromoActive: (v: boolean) => void;
  onExportJson: () => void;
  onImportJson: (file: File) => void;
  onCopyShareUrl: () => void;
  shareCopied: boolean;
  savedPortfolios: SavedPortfolioSnapshot[];
  onSaveCurrentPortfolio: (name: string) => void;
  onLoadSavedPortfolio: (snap: SavedPortfolioSnapshot) => void;
  onDeleteSavedPortfolio: (id: string) => void;
}

export const Header: React.FC<HeaderProps> = ({
  activeTab,
  setActiveTab,
  usdIdrRate,
  setUsdIdrRate,
  priceSourceText,
  lastUpdatedText,
  isFetchingPrices,
  onRefreshLivePrices,
  rdptPromoActive,
  setRdptPromoActive,
  onExportJson,
  onImportJson,
  onCopyShareUrl,
  shareCopied,
  savedPortfolios,
  onSaveCurrentPortfolio,
  onLoadSavedPortfolio,
  onDeleteSavedPortfolio,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [newSaveName, setNewSaveName] = useState('');

  // Track currently rendered scheme ('light' | 'dark') for the icon display
  const [renderedScheme, setRenderedScheme] = useState<'light' | 'dark'>(() => {
    try {
      const stored = localStorage.getItem('color-scheme');
      if (stored === 'light' || stored === 'dark') return stored;
    } catch {
      // Ignore
    }
    return typeof window !== 'undefined' &&
      window.matchMedia('(prefers-color-scheme: dark)').matches
      ? 'dark'
      : 'light';
  });

  // Listen to OS color-scheme changes & cross-tab storage events (following modern-web-guidance `dark-mode-toggle`)
  useEffect(() => {
    const mql = window.matchMedia('(prefers-color-scheme: dark)');
    const syncScheme = () => {
      let stored: string | null = null;
      try {
        stored = localStorage.getItem('color-scheme');
      } catch {
        // Ignore
      }
      const meta = document.querySelector('meta[name="color-scheme"]');
      if (meta) {
        meta.setAttribute('content', stored ?? 'light dark');
      }
      if (stored === 'light' || stored === 'dark') {
        setRenderedScheme(stored);
      } else {
        setRenderedScheme(mql.matches ? 'dark' : 'light');
      }
    };

    syncScheme();
    mql.addEventListener('change', syncScheme);
    window.addEventListener('storage', syncScheme);
    return () => {
      mql.removeEventListener('change', syncScheme);
      window.removeEventListener('storage', syncScheme);
    };
  }, []);

  // Two-state toggle logic per `dark-mode-toggle` guide:
  // Target = opposite of currently rendered scheme. If target matches OS default, remove stored override; else store target.
  const handleToggleColorScheme = () => {
    const sysDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const sysScheme: 'light' | 'dark' = sysDark ? 'dark' : 'light';
    const targetScheme: 'light' | 'dark' =
      renderedScheme === 'dark' ? 'light' : 'dark';

    const meta = document.querySelector('meta[name="color-scheme"]');
    try {
      if (targetScheme === sysScheme) {
        localStorage.removeItem('color-scheme');
        if (meta) meta.setAttribute('content', 'light dark');
      } else {
        localStorage.setItem('color-scheme', targetScheme);
        if (meta) meta.setAttribute('content', targetScheme);
      }
    } catch {
      if (meta) meta.setAttribute('content', targetScheme);
    }
    setRenderedScheme(targetScheme);
  };

  // Mandatory modern-web-guidance fallback for <dialog closedby="any"> light-dismiss
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (!('closedBy' in HTMLDialogElement.prototype)) {
      const handleBackdropClick = (event: MouseEvent) => {
        if (event.target !== dialog) return;
        const rect = dialog.getBoundingClientRect();
        const isDialogContent =
          rect.top <= event.clientY &&
          event.clientY <= rect.top + rect.height &&
          rect.left <= event.clientX &&
          event.clientX <= rect.left + rect.width;
        if (isDialogContent) return;
        dialog.close();
      };
      dialog.addEventListener('click', handleBackdropClick);
      return () => dialog.removeEventListener('click', handleBackdropClick);
    }
  }, []);

  return (
    <header className="ui-card sticky top-0 z-30 border-x-0 border-t-0">
      <div className="mx-auto max-w-7xl px-4 py-2.5 sm:px-6">
        <div className="flex flex-col gap-2.5 lg:flex-row lg:items-center lg:justify-between">
          {/* Minimalist Brand Title */}
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <div className="ui-subtle flex h-8 w-8 items-center justify-center rounded-md">
                <Scale className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="ui-text-main text-base font-bold tracking-tight">
                    QuantPorto
                  </h1>
                  <span className="ui-subtle ui-text-muted rounded px-1.5 py-0.5 font-mono text-[10px] font-medium">
                    Rp10M
                  </span>
                </div>
                <p className="ui-text-muted text-[11px]">
                  Risk Parity &amp; Rebalancer •{' '}
                  <a
                    href="https://www.youtube.com/watch?v=O8PShy9d484"
                    target="_blank"
                    rel="noreferrer"
                    className="underline hover:text-emerald-600"
                  >
                    Ref Video
                  </a>
                </p>
              </div>
            </div>
          </div>

          {/* Minimalist Primary Navigation Tabs */}
          <nav className="ui-subtle flex items-center gap-1 rounded-lg p-1">
            <button
              type="button"
              onClick={() => setActiveTab('builder')}
              className={`flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition sm:flex-initial ${
                activeTab === 'builder'
                  ? 'ui-card ui-text-main font-semibold shadow-2xs'
                  : 'ui-text-muted hover:ui-text-main'
              }`}
            >
              <BarChart3 className="h-3.5 w-3.5" />
              <span>1. Builder</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('rebalancer')}
              className={`flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition sm:flex-initial ${
                activeTab === 'rebalancer'
                  ? 'ui-card ui-text-main font-semibold shadow-2xs'
                  : 'ui-text-muted hover:ui-text-main'
              }`}
            >
              <Scale className="h-3.5 w-3.5" />
              <span>2. Rebalancer</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('roadmap')}
              className={`flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition sm:flex-initial ${
                activeTab === 'roadmap'
                  ? 'ui-card ui-text-main font-semibold shadow-2xs'
                  : 'ui-text-muted hover:ui-text-main'
              }`}
            >
              <TrendingUp className="h-3.5 w-3.5" />
              <span>3. Rp10M Simulator</span>
            </button>
          </nav>

          {/* Global Controls */}
          <div className="flex flex-wrap items-center gap-1.5">
            {/* Makmur RDPT Alpha Promo (+3%) Toggle */}
            <button
              type="button"
              onClick={() => setRdptPromoActive(!rdptPromoActive)}
              title="Di menit 05:04, Leon membahas mencari Alpha RDPT dengan promo bonus +3% (9-10% p.a. vs 6-7% p.a.)."
              className={`flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-medium transition ${
                rdptPromoActive
                  ? 'border-emerald-500/50 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                  : 'ui-subtle ui-text-secondary'
              }`}
            >
              <Sparkles className="h-3 w-3 text-emerald-600 dark:text-emerald-400" />
              <span>RDPT +3%</span>
            </button>

            {/* USD/IDR Exchange Rate */}
            <div className="ui-subtle flex items-center gap-1 rounded-md px-2 py-1 text-xs">
              <span className="ui-text-muted">USD:</span>
              <input
                type="number"
                value={usdIdrRate}
                onChange={(e) =>
                  setUsdIdrRate(Math.max(1000, Number(e.target.value)))
                }
                className="ui-text-main w-14 bg-transparent font-mono font-semibold focus:outline-none"
                aria-label="USD to IDR Exchange Rate"
              />
            </div>

            {/* Live Price Refresh Button */}
            <button
              type="button"
              onClick={onRefreshLivePrices}
              disabled={isFetchingPrices}
              title={`Sumber Harga: ${priceSourceText}${lastUpdatedText ? ` (${lastUpdatedText})` : ''}`}
              className="ui-subtle ui-text-secondary flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium transition hover:opacity-80 disabled:opacity-50"
            >
              <RefreshCw
                className={`h-3 w-3 ${isFetchingPrices ? 'animate-spin' : ''}`}
              />
              <span className="hidden sm:inline">Sync</span>
            </button>

            {/* Saved Portfolios Modal Trigger */}
            <button
              type="button"
              onClick={() => dialogRef.current?.showModal()}
              className="ui-subtle ui-text-secondary flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium transition hover:opacity-80"
            >
              <BookmarkCheck className="h-3.5 w-3.5" />
              <span>Saved ({savedPortfolios.length})</span>
            </button>

            {/* Share URL Button */}
            <button
              type="button"
              onClick={onCopyShareUrl}
              className="ui-subtle ui-text-secondary flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium transition hover:opacity-80"
            >
              {shareCopied ? (
                <>
                  <Check className="h-3.5 w-3.5 text-emerald-600" />
                  <span>Copied</span>
                </>
              ) : (
                <>
                  <Share2 className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Share</span>
                </>
              )}
            </button>

            {/* Light / Dark Theme Toggle */}
            <button
              type="button"
              onClick={handleToggleColorScheme}
              title={
                renderedScheme === 'dark'
                  ? 'Switch to Light Mode'
                  : 'Switch to Dark Mode'
              }
              aria-label={
                renderedScheme === 'dark'
                  ? 'Switch to light theme'
                  : 'Switch to dark theme'
              }
              className="ui-subtle ui-text-main flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium transition hover:opacity-80"
            >
              {renderedScheme === 'dark' ? (
                <>
                  <Sun className="h-3.5 w-3.5 text-amber-400" />
                  <span className="hidden sm:inline">Light</span>
                </>
              ) : (
                <>
                  <Moon className="h-3.5 w-3.5 text-slate-700" />
                  <span className="hidden sm:inline">Dark</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Native Modal Dialog with closedby="any" */}
      <dialog
        ref={dialogRef}
        {...({ closedby: 'any' } as React.DialogHTMLAttributes<HTMLDialogElement>)}
        aria-labelledby="saved-modal-title"
        className="ui-card m-auto w-full max-w-lg rounded-xl p-5 shadow-xl backdrop:bg-black/50"
      >
        <div className="ui-border flex items-center justify-between border-b pb-3">
          <h2 id="saved-modal-title" className="ui-text-main text-sm font-bold">
            Saved Portfolios &amp; JSON Backup
          </h2>
          <button
            type="button"
            onClick={() => dialogRef.current?.close()}
            className="ui-text-muted rounded p-1 hover:opacity-80"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-4 space-y-4">
          <div className="ui-subtle rounded-lg p-3">
            <label className="ui-text-secondary block text-xs font-medium">
              Simpan Portfolio Saat Ini (LocalStorage)
            </label>
            <div className="mt-2 flex gap-2">
              <input
                type="text"
                placeholder="Nama Portfolio..."
                value={newSaveName}
                onChange={(e) => setNewSaveName(e.target.value)}
                className="ui-card ui-text-main flex-1 rounded-md px-2.5 py-1.5 text-xs focus:outline-none"
              />
              <button
                type="button"
                onClick={() => {
                  const name =
                    newSaveName.trim() ||
                    `Custom Porto #${savedPortfolios.length + 1}`;
                  onSaveCurrentPortfolio(name);
                  setNewSaveName('');
                }}
                className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-500"
              >
                Simpan
              </button>
            </div>
          </div>

          <div className="max-h-60 space-y-2 overflow-y-auto">
            {savedPortfolios.length === 0 ? (
              <p className="ui-text-muted py-4 text-center text-xs">
                Belum ada portfolio yang disimpan.
              </p>
            ) : (
              savedPortfolios.map((snap) => (
                <div
                  key={snap.id}
                  className="ui-subtle flex items-center justify-between rounded-lg p-2.5"
                >
                  <div>
                    <div className="ui-text-main text-xs font-semibold">
                      {snap.name}
                    </div>
                    <div className="ui-text-muted mt-0.5 text-[11px]">
                      CAGR <span className="font-mono">{snap.cagr}%</span> • Max
                      DD <span className="font-mono">-{snap.maxDrawdown}%</span> •{' '}
                      {snap.createdAt}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        onLoadSavedPortfolio(snap);
                        dialogRef.current?.close();
                      }}
                      className="ui-card ui-text-main rounded px-2.5 py-1 text-xs font-medium"
                    >
                      Load
                    </button>
                    <button
                      type="button"
                      onClick={() => onDeleteSavedPortfolio(snap.id)}
                      className="rounded bg-rose-500/10 px-2 py-1 text-xs text-rose-600 dark:text-rose-400"
                    >
                      Hapus
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="ui-border flex items-center justify-between border-t pt-3">
            <button
              type="button"
              onClick={onExportJson}
              className="ui-subtle ui-text-main flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium"
            >
              <Download className="h-3.5 w-3.5" />
              <span>Export (.json)</span>
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".json"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) {
                  onImportJson(file);
                  e.target.value = '';
                }
              }}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="ui-subtle ui-text-main flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium"
            >
              <Upload className="h-3.5 w-3.5" />
              <span>Import (.json)</span>
            </button>
          </div>
        </div>
      </dialog>
    </header>
  );
};
