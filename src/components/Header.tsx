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
  Check,
  Copy,
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
  RotateCcw,
  Database,
  ClipboardPaste,
  Lock,
  Fingerprint,
  ExternalLink,
  Video,
  Keyboard,
} from 'lucide-react';
import { BrandLogo } from './BrandLogo';
import { FormattedNumberInput } from './FormattedNumberInput';
import { formatIdr } from '../lib/formatters';
import {
  isWebAuthnSupported,
  isPlatformAuthenticatorAvailable,
  hasRegisteredBiometric,
  registerBiometricCredential,
  clearBiometricCredential,
} from '../lib/auth/webauthnUtils';

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
  onStartInteractiveTour: () => void;
  onOpenFactsheet?: () => void;
  onOpenOrderSlip?: () => void;
  onOpenResetConfirm?: () => void;
  onOpenDataTransfer?: () => void;
  onQuickCopyConfig?: () => void;
  quickCopyFeedback?: boolean;
  activePortfolioName?: string;
  activeCagr?: number;
  activeMaxDrawdown?: number;
  onLockApp?: () => void;
  rebalanceBreachedCount?: number;
  rebalanceMaxDriftPercent?: number;
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
  onStartInteractiveTour,
  onOpenFactsheet,
  onOpenOrderSlip,
  onOpenResetConfirm,
  onOpenDataTransfer,
  onQuickCopyConfig,
  quickCopyFeedback = false,
  activePortfolioName = 'Portfolio Aktif',
  activeCagr = 0,
  activeMaxDrawdown = 0,
  onLockApp,
  rebalanceBreachedCount,
  rebalanceMaxDriftPercent,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const toolsMenuRef = useRef<HTMLDivElement>(null);
  const exportMenuRef = useRef<HTMLDivElement>(null);
  const helpMenuRef = useRef<HTMLDivElement>(null);
  const [newSaveName, setNewSaveName] = useState('');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isToolsMenuOpen, setIsToolsMenuOpen] = useState(false);
  const [isExportMenuOpen, setIsExportMenuOpen] = useState(false);
  const [isHelpMenuOpen, setIsHelpMenuOpen] = useState(false);

  // Biometric / WebAuthn settings state
  const [isBiometricSupported, setIsBiometricSupported] = useState(false);
  const [hasBiometric, setHasBiometric] = useState(() => hasRegisteredBiometric());
  const [biometricFeedback, setBiometricFeedback] = useState<string | null>(null);
  const [isRegisteringBiometric, setIsRegisteringBiometric] = useState(false);
  const [biometricToast, setBiometricToast] = useState<{
    message: string;
    type: 'success' | 'error' | 'info';
  } | null>(null);

  // Auto-dismiss biometric feedback toast
  useEffect(() => {
    if (biometricToast) {
      const timer = setTimeout(() => {
        setBiometricToast(null);
      }, 3500);
      return () => clearTimeout(timer);
    }
  }, [biometricToast]);

  // Two-step delete confirmation state for saved snapshots
  const [confirmDeleteSnapshotId, setConfirmDeleteSnapshotId] = useState<string | null>(null);

  useEffect(() => {
    if (!confirmDeleteSnapshotId) return;
    const timer = setTimeout(() => {
      setConfirmDeleteSnapshotId(null);
    }, 4000);
    return () => clearTimeout(timer);
  }, [confirmDeleteSnapshotId]);

  // Detect platform biometric authenticator support on mount
  useEffect(() => {
    let mounted = true;
    const detectSupport = async () => {
      try {
        if (!isWebAuthnSupported()) {
          if (mounted) setIsBiometricSupported(false);
          return;
        }
        const available = await isPlatformAuthenticatorAvailable();
        const registered = hasRegisteredBiometric();
        if (mounted) {
          // Biometric is supported if platform authenticator is available OR already registered
          setIsBiometricSupported(available || registered);
          setHasBiometric(registered);
        }
      } catch {
        if (mounted) setIsBiometricSupported(false);
      }
    };
    detectSupport();
    return () => {
      mounted = false;
    };
  }, []);

  // Sync biometric status whenever tools menu or mobile menu opens
  useEffect(() => {
    if (isToolsMenuOpen || isMobileMenuOpen) {
      setHasBiometric(hasRegisteredBiometric());
      setBiometricFeedback(null);
    }
  }, [isToolsMenuOpen, isMobileMenuOpen]);

  const handleRegisterBiometric = async () => {
    setIsRegisteringBiometric(true);
    setBiometricFeedback(null);
    try {
      const res = await registerBiometricCredential();
      if (res.success) {
        setHasBiometric(true);
        setIsBiometricSupported(true);
        const msg = 'Sidik jari berhasil didaftarkan di perangkat ini!';
        setBiometricFeedback(msg);
        setBiometricToast({ message: msg, type: 'success' });
      } else if (res.error) {
        setBiometricFeedback(res.error);
        setBiometricToast({ message: res.error, type: 'error' });
      }
    } catch {
      const errMsg = 'Gagal mendaftarkan sidik jari.';
      setBiometricFeedback(errMsg);
      setBiometricToast({ message: errMsg, type: 'error' });
    } finally {
      setIsRegisteringBiometric(false);
    }
  };

  const handleRevokeBiometric = async () => {
    const shouldRevoke =
      typeof window !== 'undefined' && typeof window.confirm === 'function'
        ? window.confirm('Hapus pendaftaran sidik jari di perangkat ini?')
        : true;

    if (shouldRevoke) {
      clearBiometricCredential();
      setHasBiometric(false);
      const msg = 'Pendaftaran sidik jari telah dihapus dari perangkat ini.';
      setBiometricFeedback(msg);
      setBiometricToast({ message: msg, type: 'info' });
      const avail = await isPlatformAuthenticatorAvailable();
      setIsBiometricSupported(avail);
    }
  };

  // Close tools dropdown & mobile drawer on click outside or Escape key
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        toolsMenuRef.current &&
        !toolsMenuRef.current.contains(e.target as Node)
      ) {
        setIsToolsMenuOpen(false);
      }
      if (
        exportMenuRef.current &&
        !exportMenuRef.current.contains(e.target as Node)
      ) {
        setIsExportMenuOpen(false);
      }
      if (
        helpMenuRef.current &&
        !helpMenuRef.current.contains(e.target as Node)
      ) {
        setIsHelpMenuOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsToolsMenuOpen(false);
        setIsExportMenuOpen(false);
        setIsHelpMenuOpen(false);
        setIsMobileMenuOpen(false);
      }
    };
    if (isToolsMenuOpen || isExportMenuOpen || isHelpMenuOpen || isMobileMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleKeyDown);
      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
        document.removeEventListener('keydown', handleKeyDown);
      };
    }
  }, [isToolsMenuOpen, isExportMenuOpen, isHelpMenuOpen, isMobileMenuOpen]);

  // Listen for programmatic toggle of tools menu & export menu (from interactive tour)
  useEffect(() => {
    const handleSetToolsMenu = (e: Event) => {
      const customEvent = e as CustomEvent<{ open?: boolean }>;
      const open = Boolean(customEvent.detail?.open);
      setIsToolsMenuOpen(open);
      if (!open) setIsExportMenuOpen(false);
    };
    const handleSetExportMenu = (e: Event) => {
      const customEvent = e as CustomEvent<{ open?: boolean }>;
      setIsExportMenuOpen(Boolean(customEvent.detail?.open));
    };
    window.addEventListener('quantporto:set-tools-menu', handleSetToolsMenu);
    window.addEventListener('quantporto:set-export-menu', handleSetExportMenu);
    return () => {
      window.removeEventListener('quantporto:set-tools-menu', handleSetToolsMenu);
      window.removeEventListener('quantporto:set-export-menu', handleSetExportMenu);
    };
  }, []);

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
    if (!dialog || 'closedBy' in HTMLDialogElement.prototype) return;

    let pressedOutside = false;
    const isOutside = (e: PointerEvent) => {
      const r = dialog.getBoundingClientRect();
      return (
        e.clientX < r.left ||
        e.clientX > r.right ||
        e.clientY < r.top ||
        e.clientY > r.bottom
      );
    };
    const handlePointerDown = (e: PointerEvent) => {
      pressedOutside = isOutside(e);
    };
    const handlePointerUp = (e: PointerEvent) => {
      if (pressedOutside && isOutside(e)) dialog.close();
      pressedOutside = false;
    };

    dialog.addEventListener('pointerdown', handlePointerDown);
    dialog.addEventListener('pointerup', handlePointerUp);
    return () => {
      dialog.removeEventListener('pointerdown', handlePointerDown);
      dialog.removeEventListener('pointerup', handlePointerUp);
    };
  }, []);

  const calmarRatio =
    activeMaxDrawdown > 0
      ? (activeCagr / Math.max(0.5, activeMaxDrawdown)).toFixed(2)
      : '0.00';

  return (
    <>
      {/* Floating Biometric Toast Notification */}
      {biometricToast && (
        <aside
          role="status"
          aria-live="polite"
          className={`fixed top-4 right-4 z-50 flex items-center gap-2.5 rounded-xl border px-4 py-3 shadow-md text-xs font-semibold transition max-w-sm ${
            biometricToast.type === 'success'
              ? 'border-emerald-500/40 bg-emerald-50 text-emerald-900 dark:bg-emerald-950/95 dark:text-emerald-200'
              : biometricToast.type === 'error'
              ? 'border-rose-500/40 bg-rose-50 text-rose-900 dark:bg-rose-950/95 dark:text-rose-200'
              : 'border-ui-border ui-card ui-text-main'
          }`}
        >
          <Fingerprint
            className={`h-4 w-4 shrink-0 ${
              biometricToast.type === 'success'
                ? 'text-emerald-400'
                : biometricToast.type === 'error'
                ? 'text-rose-400'
                : 'text-zinc-400'
            }`}
          />
          <span className="flex-1 leading-snug">{biometricToast.message}</span>
          <button
            type="button"
            onClick={() => setBiometricToast(null)}
            className="rounded p-1 hover:bg-white/10 transition"
            aria-label="Tutup notifikasi"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </aside>
      )}

      <header className="ui-card sticky top-0 z-30 border-x-0 border-t-0 shadow-2xs">
        <div className="mx-auto max-w-7xl px-3 py-2 sm:px-6 sm:py-2.5">
          <div className="flex items-center justify-between gap-2">
            {/* Minimalist Brand Title */}
            <div className="flex items-center gap-2 sm:gap-2.5">
              <BrandLogo className="h-7 w-7 shrink-0 sm:h-8 sm:w-8" />
              <div>
                <h1 className="ui-text-main text-sm font-bold tracking-tight sm:text-base leading-none">
                  QuantPorto
                </h1>
                <p className="ui-text-muted hidden text-[11px] sm:block mt-0.5 font-medium">
                  Risk Parity &amp; Rebalancing Engine
                </p>
              </div>
            </div>

            {/* Desktop Primary Navigation Tabs */}
            <nav
              id="tour-nav-tabs"
              aria-label="Utama (Desktop)"
              className="ui-subtle hidden items-center gap-1 rounded-lg p-1 lg:flex"
            >
              <button
                type="button"
                onClick={() => setActiveTab('builder')}
                title="Portfolio Builder (Shortcut: Alt+1)"
                className={`flex items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition ${
                  activeTab === 'builder'
                    ? 'ui-card ui-text-main font-semibold shadow-2xs'
                    : 'ui-text-muted hover:ui-text-main'
                }`}
              >
                <BarChart3 className="h-3.5 w-3.5" />
                <span>Builder</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('rebalancer')}
                title="Portfolio Rebalancer (Shortcut: Alt+2)"
                className={`flex items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition ${
                  activeTab === 'rebalancer'
                    ? 'ui-card ui-text-main font-semibold shadow-2xs'
                    : 'ui-text-muted hover:ui-text-main'
                }`}
              >
                <Scale className="h-3.5 w-3.5" />
                <span>Rebalancer</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('roadmap')}
                title="Wealth Simulator (Shortcut: Alt+3)"
                className={`flex items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition ${
                  activeTab === 'roadmap'
                    ? 'ui-card ui-text-main font-semibold shadow-2xs'
                    : 'ui-text-muted hover:ui-text-main'
                }`}
              >
                <TrendingUp className="h-3.5 w-3.5" />
                <span>Simulator</span>
              </button>
            </nav>

            {/* Right Action Bar: Clean Partitioned Hierarchy */}
            <div className="flex items-center gap-1.5">
              {/* Primary Advisory Action: Tanya Quant (Refined Emerald Accent) */}
              <button
                id="tour-tanya-quant"
                type="button"
                onClick={onOpenRecommender}
                title="Kuis Rekomendasi Portofolio: Jawab 4 pertanyaan profil risiko"
                className="flex items-center gap-1.5 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1.5 text-xs font-semibold text-emerald-700 dark:text-emerald-300 transition hover:bg-emerald-500/20"
              >
                <Compass className="h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
                <span>Tanya Quant</span>
              </button>

              {/* Interactive Help & Reference Popover Hub */}
              <div ref={helpMenuRef} className="relative hidden sm:block">
                <button
                  id="tour-guide-btn"
                  type="button"
                  aria-expanded={isHelpMenuOpen}
                  aria-haspopup="menu"
                  onClick={() => {
                    setIsHelpMenuOpen((prev) => !prev);
                    setIsExportMenuOpen(false);
                    setIsToolsMenuOpen(false);
                  }}
                  title="Panduan Interaktif, Video Referensi YouTube & Pintasan Keyboard (Shortcut: '?')"
                  className={`flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium transition ${
                    isHelpMenuOpen
                      ? 'border-emerald-500/50 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                      : 'ui-subtle ui-text-main hover:opacity-80'
                  }`}
                >
                  <HelpCircle className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                  <span>Panduan</span>
                  <ChevronDown
                    className={`h-3 w-3 transition-transform ${
                      isHelpMenuOpen ? 'rotate-180' : ''
                    }`}
                  />
                </button>

                {isHelpMenuOpen && (
                  <div className="ui-card border ui-border absolute right-0 z-50 mt-1.5 w-72 space-y-2 rounded-xl p-3 text-xs shadow-md">
                    <div className="ui-border flex items-center justify-between border-b pb-2">
                      <span className="ui-text-main font-bold">Bantuan &amp; Panduan</span>
                      <span className="ui-text-muted font-mono text-[10px]">QuantPorto</span>
                    </div>

                    {/* Option 1: Mulai Tur Interaktif */}
                    <button
                      type="button"
                      onClick={() => {
                        setIsHelpMenuOpen(false);
                        onStartInteractiveTour();
                      }}
                      className="ui-subtle ui-text-main flex w-full items-center justify-between rounded-lg p-2 text-xs transition hover:opacity-80"
                    >
                      <div className="flex items-center gap-1.5">
                        <HelpCircle className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                        <span>Mulai Tur Interaktif</span>
                      </div>
                      <kbd className="rounded bg-black/10 dark:bg-white/10 px-1.5 py-0.5 text-[10px] font-mono opacity-80">
                        ?
                      </kbd>
                    </button>

                    {/* Option 2: Video Referensi YouTube */}
                    <a
                      href="https://www.youtube.com/watch?v=O8PShy9d484"
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={() => setIsHelpMenuOpen(false)}
                      className="ui-subtle ui-text-main flex w-full items-center justify-between rounded-lg p-2 text-xs transition hover:opacity-80"
                    >
                      <div className="flex items-center gap-1.5">
                        <Video className="h-3.5 w-3.5 text-rose-500" />
                        <span>Video Edukasi (Leon &amp; Sander)</span>
                      </div>
                      <ExternalLink className="h-3 w-3 text-zinc-400" />
                    </a>

                    {/* Keyboard Shortcuts Cheat Sheet */}
                    <div className="ui-subtle rounded-lg p-2 space-y-1.5">
                      <div className="flex items-center gap-1.5 font-medium ui-text-secondary">
                        <Keyboard className="h-3.5 w-3.5 text-zinc-400" />
                        <span>Pintasan Keyboard</span>
                      </div>
                      <div className="space-y-1 text-[11px] pt-0.5">
                        <div className="flex items-center justify-between">
                          <span className="ui-text-muted">Portfolio Builder</span>
                          <kbd className="rounded bg-black/10 dark:bg-white/10 px-1 font-mono text-[9px]">Alt+1</kbd>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="ui-text-muted">Portfolio Rebalancer</span>
                          <kbd className="rounded bg-black/10 dark:bg-white/10 px-1 font-mono text-[9px]">Alt+2</kbd>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="ui-text-muted">Wealth Simulator</span>
                          <kbd className="rounded bg-black/10 dark:bg-white/10 px-1 font-mono text-[9px]">Alt+3</kbd>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="ui-text-muted">Mulai Tur Bantuan</span>
                          <kbd className="rounded bg-black/10 dark:bg-white/10 px-1 font-mono text-[9px]">?</kbd>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Desktop Menu 1: Ekspor & Dokumen */}
              <div ref={exportMenuRef} className="relative hidden lg:block">
                <button
                  id="tour-export-actions"
                  type="button"
                  aria-expanded={isExportMenuOpen}
                  aria-haspopup="menu"
                  onClick={() => {
                    setIsExportMenuOpen((prev) => !prev);
                    setIsToolsMenuOpen(false);
                    setIsHelpMenuOpen(false);
                  }}
                  className={`flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium transition ${
                    isExportMenuOpen
                      ? 'border-emerald-500/50 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                      : 'ui-subtle ui-text-secondary hover:opacity-80'
                  }`}
                  title="Ekspor Factsheet A4, Slip Order Broker, dan Cadangan Data"
                >
                  <Download className="h-3.5 w-3.5" />
                  <span>Ekspor</span>
                  <ChevronDown
                    className={`h-3 w-3 transition-transform ${
                      isExportMenuOpen ? 'rotate-180' : ''
                    }`}
                  />
                </button>

                {isExportMenuOpen && (
                  <div className="ui-card border ui-border absolute right-0 z-50 mt-1.5 w-72 space-y-2 rounded-xl p-3 text-xs shadow-md">
                    <div className="ui-border flex items-center justify-between border-b pb-2">
                      <span className="ui-text-main font-bold">
                        Dokumen &amp; Ekspor
                      </span>
                      <span className="ui-text-muted font-mono text-[10px]">
                        Laporan
                      </span>
                    </div>

                    {/* Factsheet Report */}
                    {onOpenFactsheet && (
                      <button
                        type="button"
                        onClick={() => {
                          setIsExportMenuOpen(false);
                          onOpenFactsheet();
                        }}
                        className="ui-subtle ui-text-main flex w-full items-center justify-between rounded-lg p-2 text-xs transition hover:opacity-80"
                      >
                        <div className="flex items-center gap-1.5">
                          <FileSpreadsheet className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                          <span>Factsheet Portofolio</span>
                        </div>
                        <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 font-mono text-[10px] font-bold text-emerald-600 dark:text-emerald-400">
                          A4 / PNG
                        </span>
                      </button>
                    )}

                    {/* Broker Order Slips */}
                    {onOpenOrderSlip && (
                      <button
                        type="button"
                        onClick={() => {
                          setIsExportMenuOpen(false);
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

                    {/* Share Link */}
                    <button
                      type="button"
                      onClick={() => {
                        onCopyShareUrl();
                        setTimeout(() => setIsExportMenuOpen(false), 800);
                      }}
                      className="ui-subtle ui-text-main flex w-full items-center justify-between rounded-lg p-2 text-xs transition hover:opacity-80"
                    >
                      <div className="flex items-center gap-1.5">
                        {shareCopied ? (
                          <Check className="h-3.5 w-3.5 text-emerald-600" />
                        ) : (
                          <Share2 className="h-3.5 w-3.5 text-emerald-600" />
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

                    {/* Transfer Data & Backup */}
                    {onOpenDataTransfer && (
                      <button
                        type="button"
                        onClick={() => {
                          setIsExportMenuOpen(false);
                          onOpenDataTransfer();
                        }}
                        className="ui-subtle ui-text-main flex w-full items-center justify-between rounded-lg p-2 text-xs transition hover:opacity-80 border border-emerald-500/30 bg-emerald-500/5 mt-1"
                      >
                        <div className="flex items-center gap-1.5">
                          <Database className="h-3.5 w-3.5 text-emerald-500" />
                          <span className="font-semibold">Transfer &amp; Backup Data</span>
                        </div>
                        <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 font-mono text-[10px] font-bold text-emerald-600 dark:text-emerald-400">
                          Teks / JSON
                        </span>
                      </button>
                    )}

                    {/* Quick Copy Config & File Backup */}
                    {onQuickCopyConfig && (
                      <button
                        type="button"
                        onClick={onQuickCopyConfig}
                        className="ui-subtle ui-text-secondary flex w-full items-center justify-between rounded-md p-1.5 text-[11px] hover:opacity-80 mt-1"
                        title="Salin seluruh konfigurasi aplikasi sebagai teks JSON ke clipboard"
                      >
                        <div className="flex items-center gap-1.5">
                          {quickCopyFeedback ? (
                            <Check className="h-3 w-3 text-emerald-500" />
                          ) : (
                            <Copy className="h-3 w-3" />
                          )}
                          <span>{quickCopyFeedback ? 'Config Tersalin!' : 'Salin Config Teks'}</span>
                        </div>
                        <span className="font-mono text-[10px] ui-text-muted">JSON</span>
                      </button>
                    )}

                    <div className="grid grid-cols-2 gap-1.5 pt-1 border-t ui-border">
                      <button
                        type="button"
                        onClick={onExportJson}
                        className="ui-subtle ui-text-secondary flex items-center justify-center gap-1 rounded-md py-1.5 text-[11px] hover:opacity-80"
                      >
                        <Download className="h-3 w-3" />
                        <span>Export File</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="ui-subtle ui-text-secondary flex items-center justify-center gap-1 rounded-md py-1.5 text-[11px] hover:opacity-80"
                      >
                        <Upload className="h-3 w-3" />
                        <span>Import File</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Desktop Menu 2: Pengaturan & Pasar */}
              <div ref={toolsMenuRef} className="relative hidden lg:block">
                <button
                  id="tour-tools-menu"
                  type="button"
                  aria-expanded={isToolsMenuOpen}
                  aria-haspopup="menu"
                  onClick={() => {
                    setIsToolsMenuOpen((prev) => !prev);
                    setIsExportMenuOpen(false);
                    setIsHelpMenuOpen(false);
                  }}
                  className={`flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium transition ${
                    isToolsMenuOpen || rdptPromoActive
                      ? 'border-emerald-500/50 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                      : 'ui-subtle ui-text-secondary hover:opacity-80'
                  }`}
                  title="Menu Kurs USD, Promo RDPT, Sinkronisasi Harga Live, Sidik Jari, dan Reset"
                >
                  <SlidersHorizontal className="h-3.5 w-3.5" />
                  <span>Pengaturan</span>
                  <ChevronDown
                    className={`h-3 w-3 transition-transform ${
                      isToolsMenuOpen ? 'rotate-180' : ''
                    }`}
                  />
                </button>

                {isToolsMenuOpen && (
                  <div className="ui-card border ui-border absolute right-0 z-50 mt-1.5 w-72 space-y-2.5 rounded-xl p-3 text-xs shadow-md">
                    <div className="ui-border flex items-center justify-between border-b pb-2">
                      <span className="ui-text-main font-bold">
                        Pengaturan &amp; Pasar
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
                        <TrendingUp className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                        <span>Promo RDPT (+3% Alpha)</span>
                      </div>
                      <span className="rounded bg-black/20 px-1.5 py-0.5 text-[10px]">
                        {rdptPromoActive ? 'ON' : 'OFF'}
                      </span>
                    </button>

                    {/* Live Market Price Sync */}
                    <div className="space-y-1">
                      <button
                        type="button"
                        onClick={onRefreshLivePrices}
                        disabled={isFetchingPrices}
                        className="ui-subtle ui-text-secondary flex w-full items-center justify-between rounded-lg p-2 text-xs transition hover:opacity-80 disabled:opacity-50"
                        title={priceSourceText ? `Sumber data: ${priceSourceText}` : 'Ambil harga live saham, ETF & crypto'}
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
                      {priceSourceText && (
                        <div
                          className="px-2 text-[10px] ui-text-muted truncate"
                          title={priceSourceText}
                        >
                          Sumber: {priceSourceText}
                        </div>
                      )}
                    </div>

                    <div className="ui-border space-y-1.5 border-t pt-2">
                      {/* WebAuthn Biometric / Fingerprint Settings */}
                      {isBiometricSupported && (
                        <div className="ui-subtle rounded-lg p-2 space-y-1.5">
                          <div className="flex items-center justify-between text-xs">
                            <div className="flex items-center gap-1.5 font-medium ui-text-secondary">
                              <Fingerprint className="h-3.5 w-3.5 text-emerald-500" />
                              <span>Login Sidik Jari</span>
                            </div>
                            <span
                              className={`rounded px-1.5 py-0.5 font-mono text-[10px] font-bold ${
                                hasBiometric
                                  ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                                  : 'bg-zinc-500/15 text-zinc-500'
                              }`}
                            >
                              {hasBiometric ? 'AKTIF' : 'NONAKTIF'}
                            </span>
                          </div>

                          <div className="flex items-center justify-between gap-1 text-[11px] pt-0.5">
                            <span className="ui-text-muted text-[10px] truncate max-w-[150px]">
                              {hasBiometric ? 'Terdaftar di perangkat' : 'Belum didaftarkan'}
                            </span>
                            {hasBiometric ? (
                              <button
                                type="button"
                                onClick={handleRevokeBiometric}
                                className="text-rose-500 hover:text-rose-400 underline font-medium text-[11px]"
                              >
                                Hapus
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={handleRegisterBiometric}
                                disabled={isRegisteringBiometric}
                                className="text-emerald-600 dark:text-emerald-400 hover:underline font-semibold text-[11px] disabled:opacity-50"
                              >
                                {isRegisteringBiometric ? 'Memindai...' : 'Daftarkan'}
                              </button>
                            )}
                          </div>

                          {biometricFeedback && (
                            <p className="text-[10px] text-amber-500 dark:text-amber-400 pt-0.5 leading-tight">
                              {biometricFeedback}
                            </p>
                          )}
                        </div>
                      )}

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

                      {/* Reset All to Initial Settings */}
                      {onOpenResetConfirm && (
                        <div className="ui-border border-t pt-2 mt-1">
                          <button
                            type="button"
                            onClick={() => {
                              setIsToolsMenuOpen(false);
                              onOpenResetConfirm();
                            }}
                            className="flex w-full items-center justify-between rounded-lg p-2 text-xs font-medium text-rose-600 dark:text-rose-400 hover:bg-rose-500/10 transition"
                            title="Reset seluruh portofolio, simpanan, dan pengaturan ke setelan awal"
                          >
                            <div className="flex items-center gap-1.5">
                              <RotateCcw className="h-3.5 w-3.5" />
                              <span>Reset ke Setelan Awal</span>
                            </div>
                            <span className="rounded border border-rose-500/30 bg-rose-500/10 px-1.5 py-0.5 font-mono text-[10px] font-bold uppercase text-rose-500 dark:text-rose-400">
                              Reset
                            </span>
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Unified Utility Button Group: Theme Toggle & Session Lock */}
              <div className="ui-subtle flex items-center rounded-md border ui-border p-0.5">
                <button
                  type="button"
                  onClick={handleToggleColorScheme}
                  title={
                    renderedScheme === 'dark'
                      ? 'Beralih ke Tema Terang (Light Mode)'
                      : 'Beralih ke Tema Gelap (Dark Mode)'
                  }
                  aria-label={
                    renderedScheme === 'dark'
                      ? 'Beralih ke tema terang'
                      : 'Beralih ke tema gelap'
                  }
                  className="flex h-7 w-7 items-center justify-center rounded transition hover:bg-black/5 dark:hover:bg-white/10"
                >
                  {renderedScheme === 'dark' ? (
                    <Sun className="h-3.5 w-3.5 text-amber-400" />
                  ) : (
                    <Moon className="h-3.5 w-3.5 text-zinc-700" />
                  )}
                </button>

                {onLockApp && (
                  <button
                    type="button"
                    onClick={onLockApp}
                    title="Kunci Layar (Keluar dari Sesi)"
                    aria-label="Kunci Layar"
                    className="flex h-7 w-7 items-center justify-center rounded transition hover:bg-amber-500/15 text-amber-500/80 hover:text-amber-500"
                  >
                    <Lock className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>

              {/* Mobile Tools Drawer Trigger (< lg) */}
              <button
                id="tour-mobile-menu-btn"
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

          {/* Categorized Mobile Tools & Navigation Drawer (< lg) */}
          {isMobileMenuOpen && (
            <div className="ui-border mt-2.5 space-y-3.5 border-t pt-3 lg:hidden max-h-[75vh] overflow-y-auto">
              {/* Category 1: Aksi Cepat & Navigasi */}
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider ui-text-muted px-1 block mb-1.5">
                  Aksi Cepat
                </span>
                <div className="grid grid-cols-3 gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      setIsMobileMenuOpen(false);
                      onOpenRecommender();
                    }}
                    className="flex items-center justify-center gap-1 rounded-lg bg-emerald-600 px-2 py-2 text-xs font-semibold text-white shadow-2xs"
                  >
                    <Compass className="h-3.5 w-3.5 shrink-0" />
                    <span>Tanya Quant</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setIsMobileMenuOpen(false);
                      onStartInteractiveTour();
                    }}
                    className="ui-subtle ui-text-main flex items-center justify-center gap-1 rounded-lg border px-2 py-2 text-xs font-medium"
                  >
                    <HelpCircle className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                    <span>Panduan</span>
                  </button>

                  {onLockApp && (
                    <button
                      type="button"
                      onClick={() => {
                        setIsMobileMenuOpen(false);
                        onLockApp();
                      }}
                      className="ui-subtle ui-text-main flex items-center justify-center gap-1 rounded-lg border px-2 py-2 text-xs font-medium text-amber-600 dark:text-amber-400"
                    >
                      <Lock className="h-3.5 w-3.5 shrink-0" />
                      <span>Kunci Sesi</span>
                    </button>
                  )}
                  <a
                    href="https://www.youtube.com/watch?v=O8PShy9d484"
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => setIsMobileMenuOpen(false)}
                    className="ui-subtle ui-text-main col-span-3 flex items-center justify-between rounded-lg border px-2.5 py-1.5 text-xs font-medium"
                  >
                    <div className="flex items-center gap-1.5">
                      <Video className="h-3.5 w-3.5 text-rose-500 shrink-0" />
                      <span>Video Edukasi (Leon &amp; Sander)</span>
                    </div>
                    <ExternalLink className="h-3 w-3 text-zinc-400" />
                  </a>
                </div>
              </div>

              {/* Category 2: Dokumen & Ekspor */}
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider ui-text-muted px-1 block mb-1.5">
                  Dokumen &amp; Ekspor
                </span>
                <div className="grid grid-cols-2 gap-2">
                  {onOpenFactsheet && (
                    <button
                      type="button"
                      onClick={() => {
                        setIsMobileMenuOpen(false);
                        onOpenFactsheet();
                      }}
                      className="ui-subtle ui-text-main flex items-center justify-between rounded-lg border px-2.5 py-2 text-xs font-medium"
                    >
                      <div className="flex items-center gap-1.5">
                        <FileSpreadsheet className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                        <span>Factsheet A4</span>
                      </div>
                      <span className="text-[10px] font-mono text-emerald-600 dark:text-emerald-400 font-bold">PNG</span>
                    </button>
                  )}

                  {onOpenOrderSlip && (
                    <button
                      type="button"
                      onClick={() => {
                        setIsMobileMenuOpen(false);
                        onOpenOrderSlip();
                      }}
                      className="ui-subtle ui-text-main flex items-center justify-between rounded-lg border px-2.5 py-2 text-xs font-medium"
                    >
                      <div className="flex items-center gap-1.5">
                        <Building2 className="h-3.5 w-3.5 text-sky-500" />
                        <span>Slip Broker</span>
                      </div>
                      <span className="text-[10px] font-mono text-sky-500 font-bold">App</span>
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={onCopyShareUrl}
                    className="ui-subtle ui-text-main flex items-center justify-between rounded-lg border px-2.5 py-2 text-xs font-medium"
                  >
                    <div className="flex items-center gap-1.5">
                      {shareCopied ? (
                        <Check className="h-3.5 w-3.5 text-emerald-600" />
                      ) : (
                        <Share2 className="h-3.5 w-3.5 text-emerald-600" />
                      )}
                      <span>{shareCopied ? 'Link Tersalin!' : 'Bagikan Link'}</span>
                    </div>
                    <span className="text-[10px] font-mono ui-text-muted">#porto</span>
                  </button>

                  {onOpenDataTransfer && (
                    <button
                      type="button"
                      onClick={() => {
                        setIsMobileMenuOpen(false);
                        onOpenDataTransfer();
                      }}
                      className="ui-subtle ui-text-main flex items-center justify-between rounded-lg border border-emerald-500/30 px-2.5 py-2 text-xs font-semibold"
                    >
                      <div className="flex items-center gap-1.5">
                        <Database className="h-3.5 w-3.5 text-emerald-500" />
                        <span>Transfer Data</span>
                      </div>
                      <span className="text-[10px] font-mono text-emerald-600 dark:text-emerald-400 font-bold">JSON</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Category 3: Pasar & Pengaturan */}
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider ui-text-muted px-1 block mb-1.5">
                  Pasar &amp; Pengaturan
                </span>
                <div className="grid grid-cols-2 gap-2">
                  {/* USD/IDR Input */}
                  <div className="ui-subtle flex items-center justify-between rounded-lg border px-2.5 py-1.5 text-xs">
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
                    className={`flex items-center justify-between rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition ${
                      rdptPromoActive
                        ? 'border-emerald-500/50 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                        : 'ui-subtle ui-text-secondary'
                    }`}
                  >
                    <div className="flex items-center gap-1.5">
                      <TrendingUp className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                      <span>Promo RDPT</span>
                    </div>
                    <span className="rounded bg-black/10 dark:bg-white/10 px-1 text-[10px]">
                      {rdptPromoActive ? '+3%' : 'OFF'}
                    </span>
                  </button>

                  {/* Sync Live Prices */}
                  <button
                    type="button"
                    onClick={onRefreshLivePrices}
                    disabled={isFetchingPrices}
                    className="ui-subtle ui-text-main flex items-center justify-between rounded-lg border px-2.5 py-1.5 text-xs font-medium disabled:opacity-50"
                    title={priceSourceText || undefined}
                  >
                    <div className="flex items-center gap-1.5">
                      <RefreshCw
                        className={`h-3.5 w-3.5 ${isFetchingPrices ? 'animate-spin text-emerald-600' : ''}`}
                      />
                      <span>Sync Harga</span>
                    </div>
                    <span className="text-[10px] font-mono ui-text-muted truncate max-w-[70px]">
                      {isFetchingPrices ? 'Syncing...' : lastUpdatedText || '5Y'}
                    </span>
                  </button>

                  {/* Saved Portfolios */}
                  <button
                    type="button"
                    onClick={() => {
                      setIsMobileMenuOpen(false);
                      dialogRef.current?.showModal();
                    }}
                    className="ui-subtle ui-text-main flex items-center justify-between rounded-lg border px-2.5 py-1.5 text-xs font-medium"
                  >
                    <div className="flex items-center gap-1.5">
                      <BookmarkCheck className="h-3.5 w-3.5 text-emerald-600" />
                      <span>Saved</span>
                    </div>
                    <span className="rounded bg-zinc-500/15 px-1.5 py-0.2 font-mono text-[10px] font-bold">
                      {savedPortfolios.length}
                    </span>
                  </button>

                  {/* WebAuthn Biometric Settings Mobile */}
                  {isBiometricSupported && (
                    <div className="col-span-2 ui-subtle rounded-lg border p-2.5 space-y-1.5">
                      <div className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-1.5">
                          <Fingerprint className="h-3.5 w-3.5 text-emerald-500" />
                          <span className="ui-text-main font-semibold">Login Sidik Jari:</span>
                        </div>
                        <span
                          className={`rounded px-1.5 py-0.5 font-mono text-[10px] font-bold ${
                            hasBiometric
                              ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                              : 'bg-zinc-500/15 text-zinc-500'
                          }`}
                        >
                          {hasBiometric ? 'AKTIF' : 'NONAKTIF'}
                        </span>
                      </div>

                      <div className="flex items-center justify-between text-xs pt-0.5">
                        <span className="ui-text-muted text-[11px]">
                          {hasBiometric ? 'Terdaftar di perangkat' : 'Belum didaftarkan'}
                        </span>
                        {hasBiometric ? (
                          <button
                            type="button"
                            onClick={handleRevokeBiometric}
                            className="text-rose-500 hover:text-rose-400 font-semibold underline text-xs"
                          >
                            Hapus Sidik Jari
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={handleRegisterBiometric}
                            disabled={isRegisteringBiometric}
                            className="text-emerald-600 dark:text-emerald-400 font-semibold hover:underline text-xs disabled:opacity-50"
                          >
                            {isRegisteringBiometric ? 'Memindai...' : 'Daftarkan'}
                          </button>
                        )}
                      </div>

                      {biometricFeedback && (
                        <p className="text-[10px] text-amber-500 dark:text-amber-400 pt-0.5 leading-tight">
                          {biometricFeedback}
                        </p>
                      )}
                    </div>
                  )}

                  {/* Reset All to Initial Settings Mobile */}
                  {onOpenResetConfirm && (
                    <button
                      type="button"
                      onClick={() => {
                        setIsMobileMenuOpen(false);
                        onOpenResetConfirm();
                      }}
                      className="col-span-2 flex items-center justify-center gap-1.5 rounded-lg border border-rose-500/30 bg-rose-500/10 px-2.5 py-2 text-xs font-semibold text-rose-600 dark:text-rose-400 hover:bg-rose-500/20 transition mt-0.5"
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                      <span>Reset Seluruh Aplikasi ke Kondisi Awal</span>
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Mini Active Portfolio Status Bar (Persistent when scrolling) */}
        <div className="ui-card border-t ui-border px-3 py-0.5 sm:px-6 sm:py-1">
          <div className="mx-auto flex max-w-7xl items-center justify-between gap-2 text-[11px]">
            <div className="flex min-w-0 items-center gap-1.5 sm:gap-2.5">
              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" />
              <span className="ui-text-main truncate max-w-[85px] sm:max-w-none font-semibold">
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

              {/* Feature 1: Live Drift Status Badge */}
              <button
                type="button"
                onClick={() => setActiveTab('rebalancer')}
                className={`inline-flex shrink-0 whitespace-nowrap items-center gap-1 rounded-full px-2 py-0.5 font-mono text-[10px] font-semibold transition hover:opacity-85 ${
                  (rebalanceBreachedCount ?? 0) > 0
                    ? 'border border-amber-500/40 bg-amber-500/15 text-amber-600 dark:text-amber-400'
                    : 'border border-emerald-500/40 bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                }`}
                title="Status Drift Portofolio — Klik untuk buka tab Rebalancer"
              >
                {(rebalanceBreachedCount ?? 0) > 0 ? (
                  <>
                    <span className="h-1.5 w-1.5 rounded-full bg-amber-500 shrink-0" />
                    <span className="sm:hidden">
                      {rebalanceBreachedCount} DRIFT
                    </span>
                    <span className="hidden sm:inline">
                      {rebalanceBreachedCount} ASET DRIFT
                      {rebalanceMaxDriftPercent !== undefined &&
                        ` (MAX: ±${rebalanceMaxDriftPercent.toFixed(1)}%)`}
                    </span>
                  </>
                ) : (
                  <>
                    <Check className="h-3 w-3 text-emerald-500 shrink-0" />
                    <span className="sm:hidden">SEIMBANG</span>
                    <span className="hidden sm:inline">PORTOFOLIO SEIMBANG</span>
                  </>
                )}
              </button>
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
              aria-label="Tutup dialog"
              className="ui-text-muted rounded p-1.5 hover:opacity-80"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="mt-4 space-y-4">
            <div className="ui-subtle rounded-lg p-3">
              <label htmlFor="save-portfolio-name-input" className="ui-text-secondary block text-xs font-medium">
                Simpan Portfolio Saat Ini (LocalStorage)
              </label>
              <div className="mt-2 flex gap-2">
                <input
                  id="save-portfolio-name-input"
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
                      {confirmDeleteSnapshotId === snap.id ? (
                        <button
                          type="button"
                          onClick={() => {
                            onDeleteSavedPortfolio(snap.id);
                            setConfirmDeleteSnapshotId(null);
                          }}
                          className="rounded bg-rose-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-rose-700"
                          title="Klik sekali lagi untuk menghapus permanen"
                        >
                          Yakin Hapus?
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteSnapshotId(snap.id)}
                          className="rounded bg-rose-500/10 px-2 py-1 text-xs text-rose-600 dark:text-rose-400 hover:bg-rose-500/20"
                          title="Hapus snapshot ini"
                        >
                          Hapus
                        </button>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>

            {onOpenDataTransfer && (
              <div className="ui-border border-t pt-3">
                <button
                  type="button"
                  onClick={() => {
                    dialogRef.current?.close();
                    setIsMobileMenuOpen(false);
                    onOpenDataTransfer();
                  }}
                  className="ui-subtle ui-text-main flex w-full items-center justify-between rounded-lg p-2.5 text-xs font-semibold"
                >
                  <div className="flex items-center gap-2">
                    <Database className="h-4 w-4 text-emerald-500" />
                    <span>Transfer & Backup Data (Teks / File)</span>
                  </div>
                  <span className="rounded bg-emerald-500/15 px-2 py-0.5 text-[10px] font-bold text-emerald-600 dark:text-emerald-400">
                    Buka
                  </span>
                </button>
              </div>
            )}

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

      {/* Thumb-Friendly Ergonomic 4-Tab Mobile Bottom Navigation Bar (< lg) */}
      <nav
        aria-label="Utama (Mobile)"
        className="ui-card ui-border fixed inset-x-0 bottom-0 z-40 border-t px-2 py-1 pb-[max(0.375rem,env(safe-area-inset-bottom))] shadow-md lg:hidden"
      >
        <div className="mx-auto grid max-w-md grid-cols-4 gap-1">
          <button
            type="button"
            onClick={() => {
              setActiveTab('builder');
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
            aria-current={activeTab === 'builder' ? 'page' : undefined}
            className={`flex flex-col items-center justify-center gap-0.5 rounded-lg py-1.5 text-[11px] font-medium transition ${
              activeTab === 'builder'
                ? 'bg-emerald-500/12 font-bold text-emerald-700 dark:text-emerald-300'
                : 'ui-text-muted hover:ui-text-main'
            }`}
          >
            <BarChart3 className="h-4 w-4" />
            <span>Builder</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveTab('rebalancer');
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
            aria-current={activeTab === 'rebalancer' ? 'page' : undefined}
            className={`relative flex flex-col items-center justify-center gap-0.5 rounded-lg py-1.5 text-[11px] font-medium transition ${
              activeTab === 'rebalancer'
                ? 'bg-emerald-500/12 font-bold text-emerald-700 dark:text-emerald-300'
                : 'ui-text-muted hover:ui-text-main'
            }`}
          >
            <div className="relative">
              <Scale className="h-4 w-4" />
              {(rebalanceBreachedCount ?? 0) > 0 && (
                <span
                  className="absolute -top-1 -right-2 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-amber-500 px-0.5 text-[8px] font-bold text-zinc-950 ring-2 ring-white dark:ring-zinc-900"
                  title={`${rebalanceBreachedCount} aset drift`}
                >
                  {rebalanceBreachedCount}
                </span>
              )}
            </div>
            <span>Rebalance</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveTab('roadmap');
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
            aria-current={activeTab === 'roadmap' ? 'page' : undefined}
            className={`flex flex-col items-center justify-center gap-0.5 rounded-lg py-1.5 text-[11px] font-medium transition ${
              activeTab === 'roadmap'
                ? 'bg-emerald-500/12 font-bold text-emerald-700 dark:text-emerald-300'
                : 'ui-text-muted hover:ui-text-main'
            }`}
          >
            <TrendingUp className="h-4 w-4" />
            <span>Simulator</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setIsMobileMenuOpen((prev) => !prev);
            }}
            aria-expanded={isMobileMenuOpen}
            aria-label="Buka menu pengaturan & dokumen"
            className={`flex flex-col items-center justify-center gap-0.5 rounded-lg py-1.5 text-[11px] font-medium transition ${
              isMobileMenuOpen
                ? 'bg-emerald-500/20 font-bold text-emerald-700 dark:text-emerald-300'
                : 'ui-text-muted hover:ui-text-main'
            }`}
          >
            <SlidersHorizontal className="h-4 w-4" />
            <span>Menu</span>
          </button>
        </div>
      </nav>
    </>
  );
};
