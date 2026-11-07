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
            {/* Minimalist Botanical Brand Title (Fraunces & DM Mono) */}
            <div className="flex items-center gap-2.5 sm:gap-3">
              <BrandLogo className="h-7 w-7 shrink-0 sm:h-8 sm:w-8" />
              <div>
                <div className="flex items-baseline gap-1.5">
                  <h1
                    className="ui-text-main text-base sm:text-lg leading-none"
                    style={{
                      fontFamily: 'var(--font-display)',
                      fontVariationSettings: '"opsz" 48, "SOFT" 10, "WONK" 0',
                      fontWeight: 400,
                    }}
                  >
                    QuantPorto
                  </h1>
                  <span className="hidden sm:inline-block font-mono text-[9px] uppercase tracking-wider text-[#21543D] dark:text-[#68B68E] bg-[#21543D]/10 dark:bg-[#68B68E]/15 px-1.5 py-0.5 rounded-[var(--radius-xs)] font-medium">
                    Rp10M Edition
                  </span>
                </div>
                <p className="ui-text-muted hidden text-[11px] sm:block mt-0.5 font-medium">
                  Risk Parity &amp; Botanical Rebalancing
                </p>
              </div>
            </div>

            {/* Desktop Primary Navigation Tabs (Tactile Segmented Control) */}
            <nav
              id="tour-nav-tabs"
              aria-label="Utama (Desktop)"
              className="ui-subtle hidden items-center gap-1 rounded-[var(--radius-sm)] p-1 lg:flex border border-[var(--border-subtle)]"
            >
              <button
                type="button"
                onClick={() => setActiveTab('builder')}
                title="Portfolio Builder (Shortcut: Alt+1)"
                className={`flex items-center justify-center gap-1.5 rounded-[6px] px-3.5 py-1.5 text-xs font-medium transition ${
                  activeTab === 'builder'
                    ? 'ui-card text-[#21543D] dark:text-[#68B68E] font-semibold shadow-2xs border border-[var(--border-default)]'
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
                className={`flex items-center justify-center gap-1.5 rounded-[6px] px-3.5 py-1.5 text-xs font-medium transition ${
                  activeTab === 'rebalancer'
                    ? 'ui-card text-[#21543D] dark:text-[#68B68E] font-semibold shadow-2xs border border-[var(--border-default)]'
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
                className={`flex items-center justify-center gap-1.5 rounded-[6px] px-3.5 py-1.5 text-xs font-medium transition ${
                  activeTab === 'roadmap'
                    ? 'ui-card text-[#21543D] dark:text-[#68B68E] font-semibold shadow-2xs border border-[var(--border-default)]'
                    : 'ui-text-muted hover:ui-text-main'
                }`}
              >
                <TrendingUp className="h-3.5 w-3.5" />
                <span>Simulator</span>
              </button>
            </nav>

            {/* Right Action Bar: Clean Partitioned Hierarchy */}
            <div className="flex items-center gap-1.5">
              {/* Primary Advisory Action: Tanya Quant */}
              <button
                id="tour-tanya-quant"
                type="button"
                onClick={onOpenRecommender}
                title="Tanya Quant: Kuis profil risiko"
                className="flex items-center gap-1.5 rounded-[var(--radius-sm)] border border-[#21543D]/30 bg-[#21543D]/10 px-2.5 py-1.5 text-xs font-semibold text-[#21543D] dark:border-[#68B68E]/30 dark:bg-[#68B68E]/10 dark:text-[#68B68E] transition hover:bg-[#21543D]/20 dark:hover:bg-[#68B68E]/20"
              >
                <Compass className="h-3.5 w-3.5 shrink-0 text-[#21543D] dark:text-[#68B68E]" />
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
                  title="Panduan & Pintasan (?)"
                  className={`flex items-center gap-1.5 rounded-[var(--radius-sm)] border px-2.5 py-1.5 text-xs font-medium transition ${
                    isHelpMenuOpen
                      ? 'border-[#21543D]/40 bg-[#21543D]/10 text-[#21543D] dark:border-[#68B68E]/40 dark:bg-[#68B68E]/10 dark:text-[#68B68E]'
                      : 'ui-subtle ui-text-main hover:opacity-80'
                  }`}
                >
                  <HelpCircle className="h-3.5 w-3.5 text-[#21543D] dark:text-[#68B68E]" />
                  <span>Panduan</span>
                  <ChevronDown
                    className={`h-3 w-3 transition-transform ${
                      isHelpMenuOpen ? 'rotate-180' : ''
                    }`}
                  />
                </button>

                {isHelpMenuOpen && (
                  <div className="ui-card border ui-border absolute right-0 z-50 mt-1.5 w-60 rounded-xl p-1.5 text-xs shadow-lg space-y-1">
                    <button
                      type="button"
                      onClick={() => {
                        setIsHelpMenuOpen(false);
                        onStartInteractiveTour();
                      }}
                      className="ui-subtle ui-text-main flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-xs transition hover:opacity-80"
                    >
                      <div className="flex items-center gap-2">
                        <HelpCircle className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                        <span>Tur Panduan</span>
                      </div>
                      <kbd className="rounded bg-black/10 dark:bg-white/10 px-1.5 py-0.5 text-[9px] font-mono opacity-70">
                        ?
                      </kbd>
                    </button>

                    <a
                      href="https://www.youtube.com/watch?v=O8PShy9d484"
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={() => setIsHelpMenuOpen(false)}
                      className="ui-subtle ui-text-main flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-xs transition hover:opacity-80"
                    >
                      <div className="flex items-center gap-2">
                        <Video className="h-3.5 w-3.5 text-rose-500" />
                        <span>Video Referensi</span>
                      </div>
                      <ExternalLink className="h-3 w-3 text-zinc-400" />
                    </a>

                    <div className="border-t ui-border pt-1.5 px-2 pb-0.5 space-y-1">
                      <div className="text-[10px] font-semibold uppercase tracking-wider ui-text-muted">
                        Pintasan
                      </div>
                      <div className="grid grid-cols-2 gap-x-2 gap-y-1 text-[11px]">
                        <div className="flex items-center justify-between">
                          <span className="ui-text-muted">Builder</span>
                          <kbd className="rounded bg-black/10 dark:bg-white/10 px-1 font-mono text-[9px]">Alt+1</kbd>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="ui-text-muted">Rebalance</span>
                          <kbd className="rounded bg-black/10 dark:bg-white/10 px-1 font-mono text-[9px]">Alt+2</kbd>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="ui-text-muted">Simulator</span>
                          <kbd className="rounded bg-black/10 dark:bg-white/10 px-1 font-mono text-[9px]">Alt+3</kbd>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="ui-text-muted">Bantuan</span>
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
                  className={`flex items-center gap-1.5 rounded-[var(--radius-sm)] border px-2.5 py-1.5 text-xs font-medium transition ${
                    isExportMenuOpen
                      ? 'border-[#21543D]/40 bg-[#21543D]/10 text-[#21543D] dark:border-[#68B68E]/40 dark:bg-[#68B68E]/10 dark:text-[#68B68E]'
                      : 'ui-subtle ui-text-secondary hover:opacity-80'
                  }`}
                  title="Ekspor & Dokumen"
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
                  <div className="ui-modal absolute right-0 z-50 mt-1.5 w-60 p-1.5 text-xs space-y-0.5">
                    {onOpenFactsheet && (
                      <button
                        type="button"
                        onClick={() => {
                          setIsExportMenuOpen(false);
                          onOpenFactsheet();
                        }}
                        className="ui-subtle ui-text-main flex w-full items-center justify-between rounded-[var(--radius-xs)] px-2.5 py-1.5 text-xs transition hover:opacity-80"
                      >
                        <div className="flex items-center gap-2">
                          <FileSpreadsheet className="h-3.5 w-3.5 text-[#21543D] dark:text-[#68B68E]" />
                          <span>Factsheet</span>
                        </div>
                        <span className="font-mono text-[10px] ui-text-muted">A4</span>
                      </button>
                    )}

                    {onOpenOrderSlip && (
                      <button
                        type="button"
                        onClick={() => {
                          setIsExportMenuOpen(false);
                          onOpenOrderSlip();
                        }}
                        className="ui-subtle ui-text-main flex w-full items-center justify-between rounded-[var(--radius-xs)] px-2.5 py-1.5 text-xs transition hover:opacity-80"
                      >
                        <div className="flex items-center gap-2">
                          <Building2 className="h-3.5 w-3.5 text-[#25586B] dark:text-[#6EB5C9]" />
                          <span>Slip Broker</span>
                        </div>
                        <span className="font-mono text-[10px] ui-text-muted">App</span>
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => {
                        onCopyShareUrl();
                        setTimeout(() => setIsExportMenuOpen(false), 800);
                      }}
                      className="ui-subtle ui-text-main flex w-full items-center justify-between rounded-[var(--radius-xs)] px-2.5 py-1.5 text-xs transition hover:opacity-80"
                    >
                      <div className="flex items-center gap-2">
                        {shareCopied ? (
                          <Check className="h-3.5 w-3.5 text-[#21543D] dark:text-[#68B68E]" />
                        ) : (
                          <Share2 className="h-3.5 w-3.5 text-[#21543D] dark:text-[#68B68E]" />
                        )}
                        <span>{shareCopied ? 'Tersalin' : 'Bagikan Link'}</span>
                      </div>
                      <span className="font-mono text-[10px] ui-text-muted">URL</span>
                    </button>

                    {onOpenDataTransfer && (
                      <button
                        type="button"
                        onClick={() => {
                          setIsExportMenuOpen(false);
                          onOpenDataTransfer();
                        }}
                        className="ui-subtle ui-text-main flex w-full items-center justify-between rounded-[var(--radius-xs)] px-2.5 py-1.5 text-xs transition hover:opacity-80"
                      >
                        <div className="flex items-center gap-2">
                          <Database className="h-3.5 w-3.5 text-[#21543D] dark:text-[#68B68E]" />
                          <span>Transfer Data</span>
                        </div>
                        <span className="font-mono text-[10px] ui-text-muted">JSON</span>
                      </button>
                    )}

                    {onQuickCopyConfig && (
                      <button
                        type="button"
                        onClick={onQuickCopyConfig}
                        className="ui-subtle ui-text-main flex w-full items-center justify-between rounded-[var(--radius-xs)] px-2.5 py-1.5 text-xs transition hover:opacity-80"
                        title="Salin konfigurasi sebagai teks JSON"
                      >
                        <div className="flex items-center gap-2">
                          {quickCopyFeedback ? (
                            <Check className="h-3.5 w-3.5 text-[#21543D] dark:text-[#68B68E]" />
                          ) : (
                            <Copy className="h-3.5 w-3.5" />
                          )}
                          <span>{quickCopyFeedback ? 'Tersalin' : 'Salin Config'}</span>
                        </div>
                        <span className="font-mono text-[10px] ui-text-muted">Teks</span>
                      </button>
                    )}

                    <div className="grid grid-cols-2 gap-1 pt-1 border-t ui-border">
                      <button
                        type="button"
                        onClick={onExportJson}
                        className="ui-subtle ui-text-secondary flex items-center justify-center gap-1.5 rounded-[var(--radius-xs)] py-1.5 text-xs hover:ui-text-main transition"
                      >
                        <Download className="h-3 w-3" />
                        <span>Export</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="ui-subtle ui-text-secondary flex items-center justify-center gap-1.5 rounded-[var(--radius-xs)] py-1.5 text-xs hover:ui-text-main transition"
                      >
                        <Upload className="h-3 w-3" />
                        <span>Import</span>
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
                  className={`flex items-center gap-1.5 rounded-[var(--radius-sm)] border px-2.5 py-1.5 text-xs font-medium transition ${
                    isToolsMenuOpen || rdptPromoActive
                      ? 'border-[#21543D]/40 bg-[#21543D]/10 text-[#21543D] dark:border-[#68B68E]/40 dark:bg-[#68B68E]/10 dark:text-[#68B68E]'
                      : 'ui-subtle ui-text-secondary hover:opacity-80'
                  }`}
                  title="Pengaturan & Pasar"
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
                  <div className="ui-modal absolute right-0 z-50 mt-1.5 w-64 p-2 text-xs space-y-2">
                    {/* Kurs USD */}
                    <div className="ui-subtle flex items-center justify-between rounded-[var(--radius-xs)] px-2.5 py-1.5">
                      <span className="ui-text-secondary text-xs">Kurs USD:</span>
                      <div className="flex items-center gap-1">
                        <span className="ui-text-muted font-mono text-[11px]">Rp</span>
                        <FormattedNumberInput
                          step={100}
                          min={1000}
                          value={usdIdrRate}
                          onChange={(val) => setUsdIdrRate(val)}
                          className="ui-text-main w-20 bg-transparent text-right font-mono font-bold focus:outline-none text-xs"
                          ariaLabel="USD to IDR Exchange Rate"
                        />
                      </div>
                    </div>

                    {/* Promo RDPT */}
                    <button
                      type="button"
                      onClick={() => setRdptPromoActive(!rdptPromoActive)}
                      className={`flex w-full items-center justify-between rounded-[var(--radius-xs)] px-2.5 py-1.5 text-xs transition ${
                        rdptPromoActive
                          ? 'border border-[#21543D]/40 bg-[#21543D]/15 font-semibold text-[#21543D] dark:border-[#68B68E]/40 dark:bg-[#68B68E]/15 dark:text-[#68B68E]'
                          : 'ui-subtle ui-text-secondary hover:ui-text-main'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <TrendingUp className="h-3.5 w-3.5 text-[#21543D] dark:text-[#68B68E]" />
                        <span>Promo RDPT (+3%)</span>
                      </div>
                      <span className="font-mono text-[10px] px-1.5 py-0.2 rounded bg-black/10 dark:bg-white/10">
                        {rdptPromoActive ? 'ON' : 'OFF'}
                      </span>
                    </button>

                    {/* Sync Harga Live */}
                    <button
                      type="button"
                      onClick={onRefreshLivePrices}
                      disabled={isFetchingPrices}
                      className="ui-subtle ui-text-main flex w-full items-center justify-between rounded-[var(--radius-xs)] px-2.5 py-1.5 text-xs transition hover:opacity-80 disabled:opacity-50"
                      title={priceSourceText ? `Sumber: ${priceSourceText}` : 'Perbarui harga pasar live'}
                    >
                      <div className="flex items-center gap-2">
                        <RefreshCw
                          className={`h-3.5 w-3.5 ${isFetchingPrices ? 'animate-spin text-[#21543D] dark:text-[#68B68E]' : ''}`}
                        />
                        <span>Sync Harga</span>
                      </div>
                      <span className="font-mono text-[10px] ui-text-muted truncate max-w-[80px]">
                        {isFetchingPrices ? 'Sync...' : lastUpdatedText || '5Y'}
                      </span>
                    </button>

                    {/* Biometrik / Sidik Jari */}
                    {isBiometricSupported && (
                      <div className="ui-subtle rounded-[var(--radius-xs)] px-2.5 py-1.5 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Fingerprint className="h-3.5 w-3.5 text-[#21543D] dark:text-[#68B68E]" />
                          <span className="ui-text-main">Biometrik</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className={`text-[10px] font-mono ${hasBiometric ? 'text-[#21543D] dark:text-[#68B68E] font-medium' : 'ui-text-muted'}`}>
                            {hasBiometric ? 'Aktif' : 'Nonaktif'}
                          </span>
                          {hasBiometric ? (
                            <button
                              type="button"
                              onClick={handleRevokeBiometric}
                              className="text-[10px] text-[#9E472A] dark:text-[#E08263] hover:underline ml-1"
                            >
                              Hapus
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={handleRegisterBiometric}
                              disabled={isRegisteringBiometric}
                              className="text-[10px] text-[#21543D] dark:text-[#68B68E] hover:underline font-semibold ml-1 disabled:opacity-50"
                            >
                              {isRegisteringBiometric ? '...' : 'Daftar'}
                            </button>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Saved Portfolios */}
                    <button
                      type="button"
                      onClick={() => {
                        setIsToolsMenuOpen(false);
                        dialogRef.current?.showModal();
                      }}
                      className="ui-subtle ui-text-main flex w-full items-center justify-between rounded-[var(--radius-xs)] px-2.5 py-1.5 text-xs transition hover:opacity-80"
                    >
                      <div className="flex items-center gap-2">
                        <BookmarkCheck className="h-3.5 w-3.5 text-[#21543D] dark:text-[#68B68E]" />
                        <span>Portofolio Tersimpan</span>
                      </div>
                      <span className="rounded bg-black/10 dark:bg-white/10 px-1.5 py-0.2 font-mono text-[10px] font-bold">
                        {savedPortfolios.length}
                      </span>
                    </button>

                    {/* Reset All to Initial Settings */}
                    {onOpenResetConfirm && (
                      <div className="border-t ui-border pt-1">
                        <button
                          type="button"
                          onClick={() => {
                            setIsToolsMenuOpen(false);
                            onOpenResetConfirm();
                          }}
                          className="flex w-full items-center justify-between rounded-[var(--radius-xs)] px-2.5 py-1.5 text-xs font-medium text-[#9E472A] dark:text-[#E08263] hover:bg-[#9E472A]/10 transition"
                          title="Reset konfigurasi ke setelan awal"
                        >
                          <div className="flex items-center gap-2">
                            <RotateCcw className="h-3.5 w-3.5" />
                            <span>Reset Setelan</span>
                          </div>
                          <span className="font-mono text-[9px] uppercase tracking-wider">Awal</span>
                        </button>
                      </div>
                    )}
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
          {/* Minimalist Mobile Menu Drawer (< lg) */}
          {isMobileMenuOpen && (
            <div className="ui-border mt-2 space-y-2 border-t pt-2 lg:hidden max-h-[75vh] overflow-y-auto">
              <div className="grid grid-cols-2 gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    setIsMobileMenuOpen(false);
                    onOpenRecommender();
                  }}
                  className="flex items-center justify-center gap-1.5 rounded-lg bg-emerald-600 px-2 py-2 text-xs font-semibold text-white shadow-2xs"
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
                  className="ui-subtle ui-text-main flex items-center justify-center gap-1.5 rounded-lg border px-2 py-2 text-xs font-medium"
                >
                  <HelpCircle className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                  <span>Panduan</span>
                </button>

                {onOpenFactsheet && (
                  <button
                    type="button"
                    onClick={() => {
                      setIsMobileMenuOpen(false);
                      onOpenFactsheet();
                    }}
                    className="ui-subtle ui-text-main flex items-center justify-between rounded-lg border px-2.5 py-1.5 text-xs font-medium"
                  >
                    <div className="flex items-center gap-1.5">
                      <FileSpreadsheet className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                      <span>Factsheet</span>
                    </div>
                    <span className="text-[10px] font-mono text-emerald-600 dark:text-emerald-400 font-bold">A4</span>
                  </button>
                )}

                {onOpenOrderSlip && (
                  <button
                    type="button"
                    onClick={() => {
                      setIsMobileMenuOpen(false);
                      onOpenOrderSlip();
                    }}
                    className="ui-subtle ui-text-main flex items-center justify-between rounded-lg border px-2.5 py-1.5 text-xs font-medium"
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
                  className="ui-subtle ui-text-main flex items-center justify-between rounded-lg border px-2.5 py-1.5 text-xs font-medium"
                >
                  <div className="flex items-center gap-1.5">
                    {shareCopied ? (
                      <Check className="h-3.5 w-3.5 text-emerald-600" />
                    ) : (
                      <Share2 className="h-3.5 w-3.5 text-emerald-600" />
                    )}
                    <span>{shareCopied ? 'Tersalin' : 'Bagikan Link'}</span>
                  </div>
                  <span className="text-[10px] font-mono ui-text-muted">URL</span>
                </button>

                {onOpenDataTransfer && (
                  <button
                    type="button"
                    onClick={() => {
                      setIsMobileMenuOpen(false);
                      onOpenDataTransfer();
                    }}
                    className="ui-subtle ui-text-main flex items-center justify-between rounded-lg border px-2.5 py-1.5 text-xs font-medium"
                  >
                    <div className="flex items-center gap-1.5">
                      <Database className="h-3.5 w-3.5 text-emerald-500" />
                      <span>Transfer Data</span>
                    </div>
                    <span className="text-[10px] font-mono text-emerald-600 dark:text-emerald-400 font-bold">JSON</span>
                  </button>
                )}

                {/* Kurs USD Mobile */}
                <div className="ui-subtle flex items-center justify-between rounded-lg border px-2.5 py-1.5 text-xs">
                  <span className="ui-text-muted">Kurs:</span>
                  <FormattedNumberInput
                    step={100}
                    min={1000}
                    value={usdIdrRate}
                    onChange={(val) => setUsdIdrRate(val)}
                    className="ui-text-main w-16 bg-transparent text-right font-mono font-bold focus:outline-none"
                    ariaLabel="USD to IDR Exchange Rate Mobile"
                  />
                </div>

                {/* RDPT Promo Mobile */}
                <button
                  type="button"
                  onClick={() => setRdptPromoActive(!rdptPromoActive)}
                  className={`flex items-center justify-between rounded-lg border px-2.5 py-1.5 text-xs font-medium transition ${
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

                {/* Sync Harga Mobile */}
                <button
                  type="button"
                  onClick={onRefreshLivePrices}
                  disabled={isFetchingPrices}
                  className="ui-subtle ui-text-main flex items-center justify-between rounded-lg border px-2.5 py-1.5 text-xs font-medium disabled:opacity-50"
                  title={priceSourceText || undefined}
                >
                  <div className="flex items-center gap-1.5">
                    <RefreshCw className={`h-3.5 w-3.5 ${isFetchingPrices ? 'animate-spin text-emerald-600' : ''}`} />
                    <span>Sync Harga</span>
                  </div>
                  <span className="text-[10px] font-mono ui-text-muted truncate max-w-[60px]">
                    {isFetchingPrices ? '...' : lastUpdatedText || '5Y'}
                  </span>
                </button>

                {/* Saved Portfolios Mobile */}
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

                {/* Biometrik Mobile */}
                {isBiometricSupported && (
                  <div className="col-span-2 ui-subtle rounded-lg border px-2.5 py-1.5 flex items-center justify-between text-xs">
                    <div className="flex items-center gap-1.5">
                      <Fingerprint className="h-3.5 w-3.5 text-emerald-500" />
                      <span>Biometrik:</span>
                      <span className={`font-mono text-[10px] font-bold ${hasBiometric ? 'text-emerald-600 dark:text-emerald-400' : 'ui-text-muted'}`}>
                        {hasBiometric ? 'Aktif' : 'Nonaktif'}
                      </span>
                    </div>
                    {hasBiometric ? (
                      <button
                        type="button"
                        onClick={handleRevokeBiometric}
                        className="text-rose-500 hover:underline font-medium text-[11px]"
                      >
                        Hapus
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={handleRegisterBiometric}
                        disabled={isRegisteringBiometric}
                        className="text-emerald-600 dark:text-emerald-400 font-semibold hover:underline text-[11px] disabled:opacity-50"
                      >
                        {isRegisteringBiometric ? '...' : 'Daftar'}
                      </button>
                    )}
                  </div>
                )}

                {/* Video Edukasi Mobile */}
                <a
                  href="https://www.youtube.com/watch?v=O8PShy9d484"
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => setIsMobileMenuOpen(false)}
                  className="ui-subtle ui-text-main col-span-2 flex items-center justify-between rounded-lg border px-2.5 py-1.5 text-xs font-medium"
                >
                  <div className="flex items-center gap-1.5">
                    <Video className="h-3.5 w-3.5 text-rose-500 shrink-0" />
                    <span>Video Referensi</span>
                  </div>
                  <ExternalLink className="h-3 w-3 text-zinc-400" />
                </a>

                {/* Reset Mobile */}
                {onOpenResetConfirm && (
                  <button
                    type="button"
                    onClick={() => {
                      setIsMobileMenuOpen(false);
                      onOpenResetConfirm();
                    }}
                    className="col-span-2 flex items-center justify-center gap-1.5 rounded-lg border border-rose-500/30 bg-rose-500/10 px-2.5 py-1.5 text-xs font-semibold text-rose-600 dark:text-rose-400 hover:bg-rose-500/20 transition"
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                    <span>Reset ke Setelan Awal</span>
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Mini Active Portfolio Status Bar (Persistent when scrolling) */}
        <div className="ui-card border-t ui-border px-3 py-1 sm:px-6">
          <div className="mx-auto flex max-w-7xl items-center justify-between gap-2 text-[11px]">
            <div className="flex min-w-0 items-center gap-1.5 sm:gap-2">
              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#21543D] dark:bg-[#68B68E]" />
              <span className="ui-text-main truncate max-w-[90px] sm:max-w-none font-medium">
                {activePortfolioName}
              </span>
              <span className="ui-text-muted hidden sm:inline">•</span>
              <span className="shrink-0 font-mono font-medium text-[#21543D] dark:text-[#68B68E]">
                +{activeCagr.toFixed(1)}%
              </span>
              <span className="shrink-0 font-mono font-medium text-[#9E472A] dark:text-[#E08263]">
                -{activeMaxDrawdown.toFixed(1)}%
              </span>
              <span className="ui-text-muted hidden shrink-0 font-mono md:inline">
                Calmar {calmarRatio}x
              </span>

              {/* Drift Status Pill */}
              <button
                type="button"
                onClick={() => setActiveTab('rebalancer')}
                className={`inline-flex shrink-0 whitespace-nowrap items-center gap-1 rounded-full px-2 py-0.2 font-mono text-[10px] font-medium transition hover:opacity-85 ${
                  (rebalanceBreachedCount ?? 0) > 0
                    ? 'border border-[#8F580A]/30 bg-[#8F580A]/10 text-[#8F580A] dark:border-[#E3A646]/30 dark:bg-[#E3A646]/10 dark:text-[#E3A646]'
                    : 'border border-[#21543D]/30 bg-[#21543D]/10 text-[#21543D] dark:border-[#68B68E]/30 dark:bg-[#68B68E]/10 dark:text-[#68B68E]'
                }`}
                title="Status Drift Portofolio — Klik untuk buka tab Rebalancer"
              >
                {(rebalanceBreachedCount ?? 0) > 0 ? (
                  <>
                    <span className="h-1.5 w-1.5 rounded-full bg-[#8F580A] dark:bg-[#E3A646] shrink-0" />
                    <span>{rebalanceBreachedCount} Drift</span>
                  </>
                ) : (
                  <>
                    <span className="h-1.5 w-1.5 rounded-full bg-[#21543D] dark:bg-[#68B68E] shrink-0" />
                    <span>Seimbang</span>
                  </>
                )}
              </button>
            </div>

            <button
              type="button"
              onClick={() =>
                setActiveTab(activeTab === 'builder' ? 'rebalancer' : 'builder')
              }
              className="flex shrink-0 items-center gap-1 font-medium text-[#21543D] dark:text-[#68B68E] hover:underline text-xs"
            >
              <span>
                {activeTab === 'builder' ? 'Eksekusi' : 'Ubah Bobot'}
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
          className="ui-card m-auto w-full max-w-md rounded-xl p-4 shadow-xl backdrop:bg-black/50"
        >
          <div className="ui-border flex items-center justify-between border-b pb-2.5">
            <h2 id="saved-modal-title" className="ui-text-main text-xs font-bold uppercase tracking-wider">
              Portofolio Tersimpan
            </h2>
            <button
              type="button"
              onClick={() => dialogRef.current?.close()}
              aria-label="Tutup dialog"
              className="ui-text-muted rounded p-1 hover:opacity-80"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>

          <div className="mt-3 space-y-3">
            <div className="ui-subtle rounded-lg p-2.5">
              <label htmlFor="save-portfolio-name-input" className="ui-text-secondary block text-xs font-medium">
                Simpan Portofolio Saat Ini
              </label>
              <div className="mt-1.5 flex gap-1.5">
                <input
                  id="save-portfolio-name-input"
                  type="text"
                  placeholder="Nama racikan..."
                  value={newSaveName}
                  onChange={(e) => setNewSaveName(e.target.value)}
                  className="ui-card ui-text-main flex-1 rounded-md px-2.5 py-1.5 text-xs focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => {
                    const name =
                      newSaveName.trim() ||
                      `Porto #${savedPortfolios.length + 1}`;
                    onSaveCurrentPortfolio(name);
                    setNewSaveName('');
                  }}
                  className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-500 transition"
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
              <div className="ui-border border-t pt-2.5">
                <button
                  type="button"
                  onClick={() => {
                    dialogRef.current?.close();
                    setIsMobileMenuOpen(false);
                    onOpenDataTransfer();
                  }}
                  className="ui-subtle ui-text-main flex w-full items-center justify-between rounded-lg p-2 text-xs font-medium"
                >
                  <div className="flex items-center gap-2">
                    <Database className="h-3.5 w-3.5 text-emerald-500" />
                    <span>Transfer &amp; Backup Data</span>
                  </div>
                  <span className="font-mono text-[10px] ui-text-muted">
                    Buka
                  </span>
                </button>
              </div>
            )}

            <div className="ui-border flex items-center justify-between border-t pt-2.5">
              <button
                type="button"
                onClick={onExportJson}
                className="ui-subtle ui-text-main flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium"
              >
                <Download className="h-3.5 w-3.5" />
                <span>Export JSON</span>
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
                className="ui-subtle ui-text-main flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium"
              >
                <Upload className="h-3.5 w-3.5" />
                <span>Import JSON</span>
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
            className={`flex flex-col items-center justify-center gap-0.5 rounded-[var(--radius-sm)] py-1.5 text-[11px] font-medium transition ${
              activeTab === 'builder'
                ? 'bg-[#21543D]/12 font-medium text-[#21543D] dark:bg-[#68B68E]/15 dark:text-[#68B68E]'
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
            className={`relative flex flex-col items-center justify-center gap-0.5 rounded-[var(--radius-sm)] py-1.5 text-[11px] font-medium transition ${
              activeTab === 'rebalancer'
                ? 'bg-[#21543D]/12 font-medium text-[#21543D] dark:bg-[#68B68E]/15 dark:text-[#68B68E]'
                : 'ui-text-muted hover:ui-text-main'
            }`}
          >
            <div className="relative">
              <Scale className="h-4 w-4" />
              {(rebalanceBreachedCount ?? 0) > 0 && (
                <span
                  className="absolute -top-1 -right-2 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-[#8F580A] dark:bg-[#E3A646] px-0.5 text-[8px] font-medium text-white ring-2 ring-[var(--bg-canvas)]"
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
            className={`flex flex-col items-center justify-center gap-0.5 rounded-[var(--radius-sm)] py-1.5 text-[11px] font-medium transition ${
              activeTab === 'roadmap'
                ? 'bg-[#21543D]/12 font-medium text-[#21543D] dark:bg-[#68B68E]/15 dark:text-[#68B68E]'
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
            className={`flex flex-col items-center justify-center gap-0.5 rounded-[var(--radius-sm)] py-1.5 text-[11px] font-medium transition ${
              isMobileMenuOpen
                ? 'bg-[#21543D]/20 font-medium text-[#21543D] dark:text-[#68B68E]'
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
