import React, { useEffect, useRef } from 'react';
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
} from 'lucide-react';
import { formatIdr } from '../lib/formatters';

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
  const [newSaveName, setNewSaveName] = React.useState('');

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
    <header className="sticky top-0 z-30 border-b border-slate-800/90 bg-slate-950/90 backdrop-blur-md">
      <div className="mx-auto max-w-7xl px-4 py-3 sm:px-6">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          {/* Brand Title & Video Reference */}
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-sky-600 shadow-lg shadow-emerald-500/20">
                <Scale className="h-5 w-5 text-slate-950 stroke-[2.5]" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-lg font-extrabold tracking-tight text-white sm:text-xl">
                    Quant<span className="text-emerald-400">Porto</span>
                  </h1>
                  <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[11px] font-semibold text-emerald-300">
                    Rp10M Edition
                  </span>
                </div>
                <p className="text-xs text-slate-400">
                  Reverse-Engineered Risk Parity &amp; Risk Budgeting Engine •{' '}
                  <a
                    href="https://www.youtube.com/watch?v=O8PShy9d484"
                    target="_blank"
                    rel="noreferrer"
                    className="text-sky-400 underline decoration-sky-400/40 hover:text-sky-300"
                  >
                    Leon Hartono / The Overpost
                  </a>
                </p>
              </div>
            </div>
          </div>

          {/* Primary Navigation Tabs */}
          <nav className="flex items-center gap-1.5 rounded-xl border border-slate-800 bg-slate-900/90 p-1">
            <button
              type="button"
              onClick={() => setActiveTab('builder')}
              className={`flex flex-1 items-center justify-center gap-2 rounded-lg px-3.5 py-2 text-xs font-semibold transition sm:flex-initial sm:text-sm ${
                activeTab === 'builder'
                  ? 'bg-emerald-500 text-slate-950 shadow-sm shadow-emerald-500/30'
                  : 'text-slate-300 hover:bg-slate-800 hover:text-white'
              }`}
            >
              <BarChart3 className="h-4 w-4" />
              <span>1. Portfolio Builder</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('rebalancer')}
              className={`flex flex-1 items-center justify-center gap-2 rounded-lg px-3.5 py-2 text-xs font-semibold transition sm:flex-initial sm:text-sm ${
                activeTab === 'rebalancer'
                  ? 'bg-emerald-500 text-slate-950 shadow-sm shadow-emerald-500/30'
                  : 'text-slate-300 hover:bg-slate-800 hover:text-white'
              }`}
            >
              <Scale className="h-4 w-4" />
              <span>2. Rebalancer &amp; Crash Sim</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('roadmap')}
              className={`flex flex-1 items-center justify-center gap-2 rounded-lg px-3.5 py-2 text-xs font-semibold transition sm:flex-initial sm:text-sm ${
                activeTab === 'roadmap'
                  ? 'bg-emerald-500 text-slate-950 shadow-sm shadow-emerald-500/30'
                  : 'text-slate-300 hover:bg-slate-800 hover:text-white'
              }`}
            >
              <TrendingUp className="h-4 w-4" />
              <span>3. Rp10M Calculator</span>
            </button>
          </nav>

          {/* Global Controls: FX Rate, Makmur Alpha Toggle, Live Price Sync, Save/Share */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Makmur RDPT Alpha Promo (+3%) Toggle mentioned at 05:04 */}
            <button
              type="button"
              onClick={() => setRdptPromoActive(!rdptPromoActive)}
              title="Di menit 05:04, Leon membahas mencari Alpha RDPT dengan promo bonus +3% (9-10% p.a. vs 6-7% p.a.) untuk risiko yang sama."
              className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition ${
                rdptPromoActive
                  ? 'border-amber-500/50 bg-amber-500/15 text-amber-300'
                  : 'border-slate-800 bg-slate-900 text-slate-400 hover:border-slate-700 hover:text-slate-200'
              }`}
            >
              <Sparkles className="h-3.5 w-3.5 text-amber-400" />
              <span>RDPT Alpha +3%</span>
            </button>

            {/* USD/IDR Exchange Rate */}
            <div className="flex items-center gap-1.5 rounded-lg border border-slate-800 bg-slate-900 px-2.5 py-1 text-xs">
              <span className="text-slate-400">USD/IDR:</span>
              <input
                type="number"
                value={usdIdrRate}
                onChange={(e) => setUsdIdrRate(Math.max(1000, Number(e.target.value)))}
                className="w-16 bg-transparent font-mono font-semibold text-emerald-400 focus:outline-none"
                aria-label="USD to IDR Exchange Rate"
              />
            </div>

            {/* Live Price Refresh Button */}
            <button
              type="button"
              onClick={onRefreshLivePrices}
              disabled={isFetchingPrices}
              title={`Sumber Harga: ${priceSourceText}${lastUpdatedText ? ` (${lastUpdatedText})` : ''}`}
              className="flex items-center gap-1.5 rounded-lg border border-slate-800 bg-slate-900 px-2.5 py-1.5 text-xs font-medium text-slate-200 transition hover:border-emerald-500/40 hover:bg-slate-800 disabled:opacity-50"
            >
              <RefreshCw
                className={`h-3.5 w-3.5 text-emerald-400 ${
                  isFetchingPrices ? 'animate-spin' : ''
                }`}
              />
              <span className="hidden sm:inline">Live Price</span>
            </button>

            {/* Saved Portfolios & Backup Modal Trigger */}
            <button
              type="button"
              onClick={() => dialogRef.current?.showModal()}
              className="flex items-center gap-1.5 rounded-lg border border-slate-800 bg-slate-900 px-2.5 py-1.5 text-xs font-medium text-slate-200 transition hover:border-sky-500/40 hover:bg-slate-800"
            >
              <BookmarkCheck className="h-3.5 w-3.5 text-sky-400" />
              <span>Saved ({savedPortfolios.length})</span>
            </button>

            {/* Share URL Button */}
            <button
              type="button"
              onClick={onCopyShareUrl}
              className="flex items-center gap-1.5 rounded-lg border border-slate-800 bg-slate-900 px-2.5 py-1.5 text-xs font-medium text-slate-200 transition hover:border-emerald-500/40 hover:bg-slate-800"
            >
              {shareCopied ? (
                <>
                  <Check className="h-3.5 w-3.5 text-emerald-400" />
                  <span className="text-emerald-400">Copied!</span>
                </>
              ) : (
                <>
                  <Share2 className="h-3.5 w-3.5 text-slate-400" />
                  <span className="hidden sm:inline">Share</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Native Modal Dialog with closedby="any" for Saved Portfolios & JSON Backup */}
      <dialog
        ref={dialogRef}
        {...({ closedby: 'any' } as React.DialogHTMLAttributes<HTMLDialogElement>)}
        aria-labelledby="saved-modal-title"
        className="m-auto w-full max-w-lg rounded-2xl border border-slate-800 bg-slate-900 p-6 text-slate-100 shadow-2xl backdrop:bg-black/60 backdrop:backdrop-blur-xs"
      >
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <h2 id="saved-modal-title" className="text-base font-bold text-white">
            Saved Portfolios &amp; JSON Backup
          </h2>
          <button
            type="button"
            onClick={() => dialogRef.current?.close()}
            className="rounded-lg p-1 text-slate-400 hover:bg-slate-800 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-4 space-y-4">
          {/* Save Current Portfolio */}
          <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-3.5">
            <label className="block text-xs font-semibold text-slate-300">
              Simpan Racikan Portfolio Saat Ini ke Browser (LocalStorage)
            </label>
            <div className="mt-2 flex gap-2">
              <input
                type="text"
                placeholder="Nama Portfolio (misal: Porto Bull Run 2026)"
                value={newSaveName}
                onChange={(e) => setNewSaveName(e.target.value)}
                className="flex-1 rounded-lg border border-slate-800 bg-slate-900 px-3 py-1.5 text-xs text-white focus:border-emerald-500 focus:outline-none"
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
                className="rounded-lg bg-emerald-500 px-3.5 py-1.5 text-xs font-bold text-slate-950 hover:bg-emerald-400"
              >
                Simpan
              </button>
            </div>
          </div>

          {/* List of Saved Snapshots */}
          <div className="max-h-60 space-y-2 overflow-y-auto">
            {savedPortfolios.length === 0 ? (
              <p className="py-4 text-center text-xs text-slate-500">
                Belum ada portfolio yang disimpan.
              </p>
            ) : (
              savedPortfolios.map((snap) => (
                <div
                  key={snap.id}
                  className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-950/60 p-3"
                >
                  <div>
                    <div className="text-xs font-bold text-white">{snap.name}</div>
                    <div className="mt-0.5 text-[11px] text-slate-400">
                      CAGR{' '}
                      <span className="font-mono text-emerald-400">
                        {snap.cagr}%
                      </span>{' '}
                      • Max DD{' '}
                      <span className="font-mono text-rose-400">
                        {snap.maxDrawdown}%
                      </span>{' '}
                      • {snap.createdAt}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        onLoadSavedPortfolio(snap);
                        dialogRef.current?.close();
                      }}
                      className="rounded-lg bg-sky-500/20 px-2.5 py-1 text-xs font-semibold text-sky-300 hover:bg-sky-500/30"
                    >
                      Load
                    </button>
                    <button
                      type="button"
                      onClick={() => onDeleteSavedPortfolio(snap.id)}
                      className="rounded-lg bg-rose-500/15 px-2 py-1 text-xs text-rose-400 hover:bg-rose-500/25"
                    >
                      Hapus
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Export / Import JSON File */}
          <div className="flex items-center justify-between border-t border-slate-800 pt-4">
            <button
              type="button"
              onClick={onExportJson}
              className="flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-700"
            >
              <Download className="h-3.5 w-3.5 text-emerald-400" />
              <span>Export Backup (.json)</span>
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
              className="flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-700"
            >
              <Upload className="h-3.5 w-3.5 text-sky-400" />
              <span>Import Backup (.json)</span>
            </button>
          </div>
        </div>
      </dialog>
    </header>
  );
};
