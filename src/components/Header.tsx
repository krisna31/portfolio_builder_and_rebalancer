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
  Compass,
  HelpCircle,
  SlidersHorizontal,
  ArrowRight,
  ChevronDown,
  FileSpreadsheet,
  Building2,
} from 'lucide-react';
import { BrandLogo } from './BrandLogo';
import { FormattedNumberInput } from './FormattedNumberInput';
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
  onOpenRecommender: () => void;
  onOpenWalkthrough: () => void;
  onOpenFactsheet?: () => void;
  onOpenOrderSlip?: () => void;
  activePortfolioName?: string;
  activeCagr?: number;
  activeMaxDrawdown?: number;
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
  onOpenRecommender,
  onOpenWalkthrough,
  onOpenFactsheet,
  onOpenOrderSlip,
  activePortfolioName = 'Portfolio Aktif',
  activeCagr = 0,
  activeMaxDrawdown = 0,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const toolsMenuRef = useRef<HTMLDivElement>(null);
  const [newSaveName, setNewSaveName] = useState('');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isToolsMenuOpen, setIsToolsMenuOpen] = useState(false);

  // Close tools dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        toolsMenuRef.current &&
        !toolsMenuRef.current.contains(e.target as Node)
      ) {
        setIsToolsMenuOpen(false);
      }
    };
    if (isToolsMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isToolsMenuOpen]);

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
      const activeScheme =
        stored === 'light' || stored === 'dark'
          ? stored
          : mql.matches
            ? 'dark'
            : 'light';
      setRenderedScheme(activeScheme);
      document.documentElement.classList.toggle('dark', activeScheme === 'dark');
      document.documentElement.setAttribute('data-theme', activeScheme);
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
    document.documentElement.classList.toggle('dark', targetScheme === 'dark');
    document.documentElement.setAttribute('data-theme', targetScheme);
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

  const calmarRatio =
    activeMaxDrawdown > 0
      ? (activeCagr / Math.max(0.5, activeMaxDrawdown)).toFixed(2)
      : '0.00';

  return (
    <>
      <header className="ui-card sticky top-0 z-30 border-x-0 border-t-0 shadow-2xs">
        <div className="mx-auto max-w-7xl px-3 py-2 sm:px-6 sm:py-2.5">
          <div className="flex items-center justify-between gap-2">
            {/* Minimalist Brand Title */}
            <div className="flex items-center gap-2 sm:gap-2.5">
              <BrandLogo className="h-7 w-7 shrink-0 sm:h-8 sm:w-8" />
              <div>
                <div className="flex items-center gap-1.5">
                  <h1 className="ui-text-main text-sm font-bold tracking-tight sm:text-base">
                    QuantPorto
                  </h1>
                  <span className="ui-subtle ui-text-muted rounded px-1.5 py-0.5 font-mono text-[10px] font-medium">
                    Rp10M
                  </span>
                </div>
                <p className="ui-text-muted hidden text-[11px] sm:block">
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

            {/* Desktop Primary Navigation Tabs (Hidden on mobile because mobile uses thumb-friendly Bottom Bar) */}
            <nav
              id="tour-nav-tabs"
              aria-label="Main Navigation"
              className="ui-subtle hidden items-center gap-1 rounded-lg p-1 lg:flex"
            >
              <button
                type="button"
                onClick={() => setActiveTab('builder')}
                className={`flex items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition ${
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
                className={`flex items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition ${
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
                className={`flex items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition ${
                  activeTab === 'roadmap'
                    ? 'ui-card ui-text-main font-semibold shadow-2xs'
                    : 'ui-text-muted hover:ui-text-main'
                }`}
              >
                <TrendingUp className="h-3.5 w-3.5" />
                <span>3. Rp10M Simulator</span>
              </button>
            </nav>

            {/* Right Action Bar: Clean Partitioned Hierarchy */}
            <div className="flex items-center gap-1.5">
              {/* Primary CTA: Tanya Quant */}
              <button
                id="tour-tanya-quant"
                type="button"
                onClick={onOpenRecommender}
                title="Jawab 4 pertanyaan singkat untuk mengestimasi pilihan portfolio terbaik Anda"
                className="flex items-center gap-1 rounded-md bg-emerald-600 px-2.5 py-1.5 text-xs font-semibold text-white transition hover:bg-emerald-500"
              >
                <Compass className="h-3.5 w-3.5 shrink-0" />
                <span>Tanya Quant</span>
              </button>

              {/* Interactive Spotlight Tour Trigger */}
              <button
                id="tour-guide-btn"
                type="button"
                onClick={onOpenWalkthrough}
                title="Mulai tur panduan interaktif QuantPorto (Spotlight & Penjelasan)"
                className="ui-subtle ui-text-main hidden items-center gap-1 rounded-md px-2.5 py-1.5 text-xs font-medium transition hover:border-emerald-500/50 sm:flex"
              >
                <HelpCircle className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                <span>Panduan</span>
              </button>

              {/* Desktop-only Unified Tools & Settings Dropdown */}
              <div ref={toolsMenuRef} className="relative hidden lg:block">
                <button
                  id="tour-tools-menu"
                  type="button"
                  onClick={() => setIsToolsMenuOpen((prev) => !prev)}
                  className={`flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium transition ${
                    isToolsMenuOpen || rdptPromoActive
                      ? 'border-emerald-500/50 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                      : 'ui-subtle ui-text-secondary hover:opacity-80'
                  }`}
                  title="Menu Kurs USD, Promo RDPT, Sinkronisasi Harga, Simpan, dan Bagikan"
                >
                  <SlidersHorizontal className="h-3.5 w-3.5" />
                  <span>Alat &amp; Pengaturan</span>
                  <span className="font-mono text-[10px] ui-text-muted">
                    (${Math.round(usdIdrRate / 1000)}k)
                  </span>
                  <ChevronDown
                    className={`h-3 w-3 transition-transform ${
                      isToolsMenuOpen ? 'rotate-180' : ''
                    }`}
                  />
                </button>

                {isToolsMenuOpen && (
                  <div className="ui-card absolute right-0 z-50 mt-1.5 w-72 space-y-2.5 rounded-xl p-3 text-xs shadow-xl">
                    <div className="ui-border flex items-center justify-between border-b pb-2">
                      <span className="ui-text-main font-bold">
                        Alat &amp; Pengaturan
                      </span>
                      <span className="ui-text-muted font-mono text-[10px]">
                        QuantPorto
                      </span>
                    </div>

                    {/* Kurs USD Inline */}
                    <div className="ui-subtle flex items-center justify-between rounded-lg p-2">
                      <span className="ui-text-secondary font-medium">
                        Asumsi Kurs USD:
                      </span>
                      <div className="flex items-center gap-1">
                        <span className="ui-text-muted font-mono text-[11px]">
                          Rp
                        </span>
                        <FormattedNumberInput
                          step={100}
                          min={1000}
                          value={usdIdrRate}
                          onChange={(val) => setUsdIdrRate(val)}
                          className="ui-text-main w-20 bg-transparent text-right font-mono font-bold focus:outline-none"
                          ariaLabel="USD to IDR Exchange Rate"
                        />
                      </div>
                    </div>

                    {/* Promo RDPT +3% */}
                    <button
                      type="button"
                      onClick={() => setRdptPromoActive(!rdptPromoActive)}
                      className={`flex w-full items-center justify-between rounded-lg p-2 text-xs transition ${
                        rdptPromoActive
                          ? 'border border-emerald-500/40 bg-emerald-500/15 font-semibold text-emerald-700 dark:text-emerald-300'
                          : 'ui-subtle ui-text-secondary hover:opacity-80'
                      }`}
                    >
                      <div className="flex items-center gap-1.5">
                        <Sparkles className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                        <span>Promo RDPT (+3% Alpha)</span>
                      </div>
                      <span className="rounded bg-black/20 px-1.5 py-0.5 text-[10px]">
                        {rdptPromoActive ? 'ON' : 'OFF'}
                      </span>
                    </button>

                    {/* Live Market Price Sync */}
                    <button
                      type="button"
                      onClick={onRefreshLivePrices}
                      disabled={isFetchingPrices}
                      className="ui-subtle ui-text-secondary flex w-full items-center justify-between rounded-lg p-2 text-xs transition hover:opacity-80 disabled:opacity-50"
                    >
                      <div className="flex items-center gap-1.5">
                        <RefreshCw
                          className={`h-3.5 w-3.5 ${
                            isFetchingPrices
                              ? 'animate-spin text-emerald-600'
                              : ''
                          }`}
                        />
                        <span>Sync Harga Pasar Live</span>
                      </div>
                      <span className="ui-text-muted text-[10px]">
                        {isFetchingPrices
                          ? 'Fetching...'
                          : lastUpdatedText || '5Y Baseline'}
                      </span>
                    </button>

                    <div className="ui-border space-y-1.5 border-t pt-2">
                      {/* Saved Portfolios */}
                      <button
                        type="button"
                        onClick={() => {
                          setIsToolsMenuOpen(false);
                          dialogRef.current?.showModal();
                        }}
                        className="ui-subtle ui-text-main flex w-full items-center justify-between rounded-lg p-2 text-xs transition hover:opacity-80"
                      >
                        <div className="flex items-center gap-1.5">
                          <BookmarkCheck className="h-3.5 w-3.5 text-emerald-600" />
                          <span>Portofolio Tersimpan</span>
                        </div>
                        <span className="rounded bg-zinc-500/15 px-1.5 py-0.5 font-mono text-[10px] font-bold">
                          {savedPortfolios.length}
                        </span>
                      </button>

                      {/* Share Link */}
                      <button
                        type="button"
                        onClick={onCopyShareUrl}
                        className="ui-subtle ui-text-main flex w-full items-center justify-between rounded-lg p-2 text-xs transition hover:opacity-80"
                      >
                        <div className="flex items-center gap-1.5">
                          {shareCopied ? (
                            <Check className="h-3.5 w-3.5 text-emerald-600" />
                          ) : (
                            <Share2 className="h-3.5 w-3.5" />
                          )}
                          <span>
                            {shareCopied
                              ? 'Tautan Tersalin ke Clipboard!'
                              : 'Bagikan Link Portofolio'}
                          </span>
                        </div>
                        <span className="ui-text-muted font-mono text-[10px]">
                          #porto
                        </span>
                      </button>

                      {/* Institutional Factsheet & Broker Order Slips */}
                      {onOpenFactsheet && (
                        <button
                          type="button"
                          onClick={() => {
                            setIsToolsMenuOpen(false);
                            onOpenFactsheet();
                          }}
                          className="ui-subtle ui-text-main flex w-full items-center justify-between rounded-lg p-2 text-xs transition hover:opacity-80"
                        >
                          <div className="flex items-center gap-1.5">
                            <FileSpreadsheet className="h-3.5 w-3.5 text-indigo-500" />
                            <span>Factsheet Portofolio</span>
                          </div>
                          <span className="rounded bg-indigo-500/15 px-1.5 py-0.5 font-mono text-[10px] font-bold text-indigo-500 dark:text-indigo-400">
                            A4 / PNG
                          </span>
                        </button>
                      )}

                      {onOpenOrderSlip && (
                        <button
                          type="button"
                          onClick={() => {
                            setIsToolsMenuOpen(false);
                            onOpenOrderSlip();
                          }}
                          className="ui-subtle ui-text-main flex w-full items-center justify-between rounded-lg p-2 text-xs transition hover:opacity-80"
                        >
                          <div className="flex items-center gap-1.5">
                            <Building2 className="h-3.5 w-3.5 text-sky-500" />
                            <span>Slip Order Broker</span>
                          </div>
                          <span className="rounded bg-sky-500/15 px-1.5 py-0.5 font-mono text-[10px] font-bold text-sky-500 dark:text-sky-400">
                            Multi-App
                          </span>
                        </button>
                      )}

                      {/* Export / Import Backup */}
                      <div className="grid grid-cols-2 gap-1.5 pt-1">
                        <button
                          type="button"
                          onClick={onExportJson}
                          className="ui-subtle ui-text-secondary flex items-center justify-center gap-1 rounded-md py-1.5 text-[11px] hover:opacity-80"
                        >
                          <Download className="h-3 w-3" />
                          <span>Export Backup</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => fileInputRef.current?.click()}
                          className="ui-subtle ui-text-secondary flex items-center justify-center gap-1 rounded-md py-1.5 text-[11px] hover:opacity-80"
                        >
                          <Upload className="h-3 w-3" />
                          <span>Import Backup</span>
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Light / Dark Theme Toggle (Always accessible) */}
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
                className="ui-subtle ui-text-main flex items-center gap-1 rounded-md px-2 py-1.5 text-xs font-medium transition hover:opacity-80"
              >
                {renderedScheme === 'dark' ? (
                  <>
                    <Sun className="h-3.5 w-3.5 text-amber-400" />
                    <span className="hidden xl:inline">Light</span>
                  </>
                ) : (
                  <>
                    <Moon className="h-3.5 w-3.5 text-slate-700" />
                    <span className="hidden xl:inline">Dark</span>
                  </>
                )}
              </button>

              {/* Mobile Tools Drawer Trigger (< lg) */}
              <button
                type="button"
                onClick={() => setIsMobileMenuOpen((prev) => !prev)}
                aria-expanded={isMobileMenuOpen}
                aria-label="Buka menu pengaturan kurs, backup, dan bantuan"
                className={`flex items-center gap-1 rounded-md border px-2 py-1.5 text-xs font-medium transition lg:hidden ${
                  isMobileMenuOpen || rdptPromoActive
                    ? 'border-emerald-500/50 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                    : 'ui-subtle ui-text-main'
                }`}
              >
                {isMobileMenuOpen ? (
                  <X className="h-3.5 w-3.5" />
                ) : (
                  <SlidersHorizontal className="h-3.5 w-3.5" />
                )}
                <span>Menu</span>
              </button>
            </div>
          </div>

          {/* Collapsible Mobile Tools Drawer (< lg) */}
          {isMobileMenuOpen && (
            <div className="ui-border mt-2.5 space-y-2.5 border-t pt-2.5 lg:hidden">
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {/* USD/IDR Input */}
                <div className="ui-subtle flex items-center justify-between rounded-lg px-2.5 py-1.5 text-xs">
                  <span className="ui-text-muted font-medium">Kurs USD:</span>
                  <FormattedNumberInput
                    step={100}
                    min={1000}
                    value={usdIdrRate}
                    onChange={(val) => setUsdIdrRate(val)}
                    className="ui-text-main w-16 bg-transparent text-right font-mono font-bold focus:outline-none"
                    ariaLabel="USD to IDR Exchange Rate Mobile"
                  />
                </div>

                {/* RDPT Promo Toggle */}
                <button
                  type="button"
                  onClick={() => setRdptPromoActive(!rdptPromoActive)}
                  className={`flex items-center justify-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition ${
                    rdptPromoActive
                      ? 'border-emerald-500/50 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                      : 'ui-subtle ui-text-secondary'
                  }`}
                >
                  <Sparkles className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                  <span>Promo RDPT +3%</span>
                </button>

                {/* Sync Live Prices */}
                <button
                  type="button"
                  onClick={onRefreshLivePrices}
                  disabled={isFetchingPrices}
                  className="ui-subtle ui-text-main flex items-center justify-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium disabled:opacity-50"
                >
                  <RefreshCw
                    className={`h-3.5 w-3.5 ${isFetchingPrices ? 'animate-spin' : ''}`}
                  />
                  <span>Sync Harga Live</span>
                </button>

                {/* Saved Portfolios */}
                <button
                  type="button"
                  onClick={() => {
                    setIsMobileMenuOpen(false);
                    dialogRef.current?.showModal();
                  }}
                  className="ui-subtle ui-text-main flex items-center justify-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium"
                >
                  <BookmarkCheck className="h-3.5 w-3.5" />
                  <span>Saved ({savedPortfolios.length})</span>
                </button>

                {/* Share URL */}
                <button
                  type="button"
                  onClick={onCopyShareUrl}
                  className="ui-subtle ui-text-main flex items-center justify-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium"
                >
                  {shareCopied ? (
                    <>
                      <Check className="h-3.5 w-3.5 text-emerald-600" />
                      <span>Link Tersalin</span>
                    </>
                  ) : (
                    <>
                      <Share2 className="h-3.5 w-3.5" />
                      <span>Bagikan Link</span>
                    </>
                  )}
                </button>

                {/* Walkthrough Tour */}
                <button
                  type="button"
                  onClick={() => {
                    setIsMobileMenuOpen(false);
                    onOpenWalkthrough();
                  }}
                  className="ui-subtle ui-text-main flex items-center justify-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium"
                >
                  <HelpCircle className="h-3.5 w-3.5" />
                  <span>Panduan Fitur</span>
                </button>

                {/* Factsheet Report Mobile */}
                {onOpenFactsheet && (
                  <button
                    type="button"
                    onClick={() => {
                      setIsMobileMenuOpen(false);
                      onOpenFactsheet();
                    }}
                    className="ui-subtle ui-text-main flex items-center justify-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-indigo-500 dark:text-indigo-400"
                  >
                    <FileSpreadsheet className="h-3.5 w-3.5" />
                    <span>Factsheet A4</span>
                  </button>
                )}

                {/* Broker Order Slip Mobile */}
                {onOpenOrderSlip && (
                  <button
                    type="button"
                    onClick={() => {
                      setIsMobileMenuOpen(false);
                      onOpenOrderSlip();
                    }}
                    className="ui-subtle ui-text-main flex items-center justify-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-sky-500 dark:text-sky-400"
                  >
                    <Building2 className="h-3.5 w-3.5" />
                    <span>Slip Broker</span>
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Mini Active Portfolio Status Bar (Persistent when scrolling) */}
        <div className="ui-border bg-emerald-500/[0.04] border-t px-3 py-1 sm:px-6">
          <div className="mx-auto flex max-w-7xl items-center justify-between gap-2 text-[11px]">
            <div className="flex min-w-0 items-center gap-1.5 sm:gap-2.5">
              <span className="h-2 w-2 shrink-0 rounded-full bg-emerald-500" />
              <span className="ui-text-main truncate font-semibold">
                {activePortfolioName}
              </span>
              <span className="ui-text-muted hidden sm:inline">•</span>
              <span className="shrink-0 font-mono font-bold text-emerald-600 dark:text-emerald-400">
                CAGR +{activeCagr.toFixed(2)}%
              </span>
              <span className="shrink-0 font-mono font-semibold text-rose-600 dark:text-rose-400">
                DD -{activeMaxDrawdown.toFixed(1)}%
              </span>
              <span className="ui-text-muted hidden shrink-0 font-mono md:inline">
                Calmar {calmarRatio}x
              </span>
            </div>

            <button
              type="button"
              onClick={() =>
                setActiveTab(activeTab === 'builder' ? 'rebalancer' : 'builder')
              }
              className="flex shrink-0 items-center gap-1 font-semibold text-emerald-700 hover:underline dark:text-emerald-300"
            >
              <span>
                {activeTab === 'builder' ? 'Eksekusi Order' : 'Ubah Bobot'}
              </span>
              <ArrowRight className="h-3 w-3" />
            </button>
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

      {/* Thumb-Friendly Mobile Bottom Tab Navigation Bar (< lg) */}
      <nav
        aria-label="Mobile Bottom Navigation"
        className="ui-card ui-border fixed inset-x-0 bottom-0 z-40 border-t px-2 py-1.5 pb-[max(0.375rem,env(safe-area-inset-bottom))] shadow-lg lg:hidden"
      >
        <div className="mx-auto grid max-w-md grid-cols-3 gap-1">
          <button
            type="button"
            onClick={() => {
              setActiveTab('builder');
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
            className={`flex flex-col items-center justify-center gap-0.5 rounded-lg py-1.5 text-[11px] font-medium transition ${
              activeTab === 'builder'
                ? 'bg-emerald-500/12 font-bold text-emerald-700 dark:text-emerald-300'
                : 'ui-text-muted hover:ui-text-main'
            }`}
          >
            <BarChart3 className="h-4 w-4" />
            <span>1. Builder</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveTab('rebalancer');
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
            className={`flex flex-col items-center justify-center gap-0.5 rounded-lg py-1.5 text-[11px] font-medium transition ${
              activeTab === 'rebalancer'
                ? 'bg-emerald-500/12 font-bold text-emerald-700 dark:text-emerald-300'
                : 'ui-text-muted hover:ui-text-main'
            }`}
          >
            <Scale className="h-4 w-4" />
            <span>2. Rebalancer</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveTab('roadmap');
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
            className={`flex flex-col items-center justify-center gap-0.5 rounded-lg py-1.5 text-[11px] font-medium transition ${
              activeTab === 'roadmap'
                ? 'bg-emerald-500/12 font-bold text-emerald-700 dark:text-emerald-300'
                : 'ui-text-muted hover:ui-text-main'
            }`}
          >
            <TrendingUp className="h-4 w-4" />
            <span>3. Simulator</span>
          </button>
        </div>
      </nav>
    </>
  );
};
