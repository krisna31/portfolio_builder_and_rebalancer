import React, { useMemo, useState, useEffect } from 'react';
import {
  AssetDefinition,
  HoldingEntry,
  RebalanceItemResult,
  RebalanceSummaryResult,
} from '../../lib/quant/types';
import { formatIdr, formatPercent, formatUsd } from '../../lib/formatters';
import { roundToIdxTick } from '../../lib/quant/rebalancerEngine';
import {
  X,
  Copy,
  Check,
  CheckSquare,
  Square,
  RotateCcw,
  Building2,
  TrendingUp,
  Globe,
  Coins,
  ShieldAlert,
  ArrowUpRight,
  ArrowDownRight,
  Minus,
  CircleDollarSign,
  ExternalLink,
  Share2,
} from 'lucide-react';

export interface BrokerOrderSlipModalProps {
  isOpen: boolean;
  onClose: () => void;
  rebalanceResult: RebalanceSummaryResult;
  allAssets: AssetDefinition[];
  holdings: Record<string, HoldingEntry>;
  usdIdrRate: number;
  activePortfolioName: string;
}

interface PlatformGroup {
  id: string;
  name: string;
  apps: string;
  icon: React.ReactNode;
  colorClass: string;
  badgeClass: string;
  note: string;
  items: RebalanceItemResult[];
}

export const BrokerOrderSlipModal: React.FC<BrokerOrderSlipModalProps> = ({
  isOpen,
  onClose,
  rebalanceResult,
  allAssets = [],
  holdings = {},
  usdIdrRate,
  activePortfolioName,
}) => {
  const [executedMap, setExecutedMap] = useState<Record<string, boolean>>({});
  const [showAllItems, setShowAllItems] = useState<boolean>(false);
  // Bug 15 fix: Track which specific platform slip (or 'all') was copied
  const [copiedGroupId, setCopiedGroupId] = useState<string | 'all' | null>(null);

  // Accessibility: Close modal on Escape key press
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const assetDefMap = useMemo(() => {
    const map = new Map<string, AssetDefinition>();
    for (const a of allAssets) map.set(a.id, a);
    return map;
  }, [allAssets]);

  // Filter items based on whether user wants all items or only active BUY/SELL trades
  const tradeItems = useMemo(() => {
    const items = rebalanceResult?.items ?? [];
    if (showAllItems) {
      return items;
    }
    const filtered = items.filter((item) => item.action !== 'HOLD');
    // If all items are HOLD, fallback to showing all items with target values
    return filtered.length > 0 ? filtered : items;
  }, [rebalanceResult?.items, showAllItems]);

  // Group items by Indonesian Broker Platforms
  const platformGroups = useMemo((): PlatformGroup[] => {
    const groups: Record<string, RebalanceItemResult[]> = {
      mutual_funds: [],
      idx_stocks: [],
      us_etfs: [],
      crypto: [],
      gold: [],
      custom: [],
    };

    for (const item of tradeItems) {
      const def = assetDefMap.get(item.assetId);
      const cat = def?.category ?? 'custom';

      if (item.isNominalOnly || def?.isNominalOnly || cat === 'money-market' || cat === 'bonds') {
        groups.mutual_funds.push(item);
      } else if (cat === 'idx-equity') {
        groups.idx_stocks.push(item);
      } else if (cat === 'us-equity') {
        groups.us_etfs.push(item);
      } else if (cat === 'crypto') {
        groups.crypto.push(item);
      } else if (cat === 'gold') {
        groups.gold.push(item);
      } else {
        groups.custom.push(item);
      }
    }

    const result: PlatformGroup[] = [];

    if (groups.mutual_funds.length > 0) {
      result.push({
        id: 'mutual_funds',
        name: 'Reksa Dana & Pasar Uang / Nominal',
        apps: 'Makmur / Bibit / Bareksa',
        icon: <Building2 className="w-4 h-4 text-emerald-400" />,
        colorClass: 'border-emerald-500/30 bg-emerald-500/5 dark:bg-emerald-950/20',
        badgeClass: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30',
        note: 'Makmur memiliki promo +3% p.a. untuk RDPT. Bibit/Bareksa ideal untuk likuiditas instan RDPU.',
        items: groups.mutual_funds,
      });
    }

    if (groups.idx_stocks.length > 0) {
      result.push({
        id: 'idx_stocks',
        name: 'Saham Bursa Efek Indonesia (IDX)',
        apps: 'Stockbit / Ajaib / IPOT / Mirae',
        icon: <TrendingUp className="w-4 h-4 text-indigo-400" />,
        colorClass: 'border-indigo-500/30 bg-indigo-500/5 dark:bg-indigo-950/20',
        badgeClass: 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/30',
        note: '1 Lot = 100 lembar saham. Gunakan fitur Order Pad / Limit Order pada jam bursa (09:00 - 15:50 WIB).',
        items: groups.idx_stocks,
      });
    }

    if (groups.us_etfs.length > 0) {
      result.push({
        id: 'us_etfs',
        name: 'US Tech & Global ETFs',
        apps: 'Pluang / Gotrade Indonesia / Nanovest',
        icon: <Globe className="w-4 h-4 text-sky-400" />,
        colorClass: 'border-sky-500/30 bg-sky-500/5 dark:bg-sky-950/20',
        badgeClass: 'bg-sky-500/10 text-sky-600 dark:text-sky-400 border-sky-500/30',
        note: 'Mendukung unit fraksional (pembelian mulai dari $1 / Rp 15.000). Jam pasar US: 20:30 - 03:00 WIB.',
        items: groups.us_etfs,
      });
    }

    if (groups.crypto.length > 0) {
      result.push({
        id: 'crypto',
        name: 'Aset Kripto Terdaftar Bappebti',
        apps: 'Indodax / Reku / Tokocrypto / Pintu',
        icon: <Coins className="w-4 h-4 text-amber-400" />,
        colorClass: 'border-amber-500/30 bg-amber-500/5 dark:bg-amber-950/20',
        badgeClass: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30',
        note: 'Pasar beroperasi 24/7. Dapat dibeli langsung dalam nominal Rupiah atau fraksi Satoshi.',
        items: groups.crypto,
      });
    }

    if (groups.gold.length > 0) {
      result.push({
        id: 'gold',
        name: 'Emas Digital & Fisik',
        apps: 'Pluang Emas / Pegadaian / Antam',
        icon: <CircleDollarSign className="w-4 h-4 text-yellow-500" />,
        colorClass: 'border-yellow-500/30 bg-yellow-500/5 dark:bg-yellow-950/20',
        badgeClass: 'bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 border-yellow-500/30',
        note: 'Instrumen lindung nilai (safe haven) dengan volatilitas rendah.',
        items: groups.gold,
      });
    }

    if (groups.custom.length > 0) {
      result.push({
        id: 'custom',
        name: 'Aset Kustom Lainnya',
        apps: 'Platform Terkait',
        icon: <ShieldAlert className="w-4 h-4 text-purple-400" />,
        colorClass: 'border-purple-500/30 bg-purple-500/5 dark:bg-purple-950/20',
        badgeClass: 'bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/30',
        note: 'Aset kustom yang ditambahkan secara manual.',
        items: groups.custom,
      });
    }

    return result;
  }, [tradeItems, assetDefMap]);

  // Toggle single item execution status
  const handleToggleExecuted = (assetId: string) => {
    setExecutedMap((prev) => ({
      ...prev,
      [assetId]: !prev[assetId],
    }));
  };

  // Reset all execution statuses
  const handleResetChecklist = () => {
    setExecutedMap({});
  };

  // Mark all as executed
  const handleMarkAllExecuted = () => {
    const next: Record<string, boolean> = {};
    for (const item of tradeItems) {
      next[item.assetId] = true;
    }
    setExecutedMap(next);
  };

  // Execution Progress
  const totalActionCount = tradeItems.filter((i) => i.action !== 'HOLD').length;
  const executedActionCount = tradeItems.filter(
    (i) => i.action !== 'HOLD' && executedMap[i.assetId]
  ).length;
  const progressPercent =
    totalActionCount > 0
      ? Math.round((executedActionCount / totalActionCount) * 100)
      : 100;

  // Generate plain-text slip for clipboard copy
  const generateSlipText = (filterGroupId?: string) => {
    const today = new Intl.DateTimeFormat('id-ID', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    }).format(new Date());

    const groupsToCopy = filterGroupId
      ? platformGroups.filter((g) => g.id === filterGroupId)
      : platformGroups;

    const lines: string[] = [
      `========================================`,
      `📋 SLIP ORDER EKSEKUSI PORTOFOLIO QUANTPORTO`,
      `Portofolio : ${activePortfolioName}`,
      `Tanggal    : ${today} | Kurs USD: Rp ${usdIdrRate.toLocaleString('id-ID')}`,
      `Strategi   : ${
        rebalanceResult?.rebalanceMode === 'selective-profit-trim'
          ? 'Jual Untung Saja (Selective Trim 🎯)'
          : rebalanceResult?.rebalanceMode === 'trim-defensive-first'
            ? 'Prioritas RDPT Dulu 🛡️'
            : rebalanceResult?.rebalanceMode === 'buy-only-dca'
              ? 'Buy-Only DCA 💰'
              : 'Full Sell + Buy (Jual Rata ⚖️)'
      }`,
      rebalanceResult?.suppressedDustTradesCount !== undefined &&
      rebalanceResult.suppressedDustTradesCount > 0
        ? `Anti-Dust  : ${rebalanceResult.suppressedDustTradesCount} order receh disaring jadi HOLD`
        : '',
      `========================================`,
      ``,
    ].filter(Boolean);

    for (const g of groupsToCopy) {
      const actionableItems = g.items.filter((item) => item.action !== 'HOLD');
      if (actionableItems.length === 0) continue;

      lines.push(`📱 ${g.name.toUpperCase()} (${g.apps})`);
      for (const item of actionableItems) {
        const def = assetDefMap.get(item.assetId);
        const isDone = executedMap[item.assetId] ? '[x]' : '[ ]';
        const actionStr = item.action === 'BUY' ? 'BELI' : 'JUAL';

        if (item.isNominalOnly || def?.isNominalOnly) {
          lines.push(
            `${isDone} ${actionStr} ${item.symbol} - ${formatIdr(Math.abs(item.tradeAmountIdr))}`
          );
        } else if (g.id === 'idx_stocks') {
          const lots = Math.abs(item.tradeLotsInteger ?? Math.round(item.tradeLots ?? 0));
          // Bug 15 fix: factor in shockPercent for spotPrice, Feature 1: apply BEI tick size rounding
          const rawPrice = (holdings?.[item.assetId]?.currentPrice && holdings[item.assetId].currentPrice > 0)
            ? holdings[item.assetId].currentPrice
            : def?.defaultPrice ?? 0;
          const shockMultiplier = Math.max(0, 1 + (holdings?.[item.assetId]?.shockPercent ?? 0) / 100);
          const unitPrice = roundToIdxTick(rawPrice * shockMultiplier, 'nearest');
          lines.push(
            `${isDone} ${actionStr} ${item.symbol} - ${lots} Lot (${(lots * 100).toLocaleString('id-ID')} lembar) @ Rp ${unitPrice.toLocaleString('id-ID')} = ${formatIdr(Math.abs(item.tradeAmountIdr))}`
          );
        } else if (g.id === 'us_etfs') {
          lines.push(
            `${isDone} ${actionStr} ${item.symbol} - ${formatUsd(Math.abs(item.tradeAmountUsd))} (${formatIdr(Math.abs(item.tradeAmountIdr))}) ~ ${Math.abs(item.tradeUnits).toFixed(4)} unit`
          );
        } else if (g.id === 'crypto') {
          lines.push(
            `${isDone} ${actionStr} ${item.symbol} - ${formatIdr(Math.abs(item.tradeAmountIdr))} ~ ${Math.abs(item.tradeUnits).toFixed(8)} ${item.symbol}`
          );
        } else {
          lines.push(
            `${isDone} ${actionStr} ${item.symbol} - ${formatIdr(Math.abs(item.tradeAmountIdr))}`
          );
        }
      }
      lines.push(``);
    }

    if (!filterGroupId) {
      lines.push(`Total Eksekusi Beli : ${formatIdr(rebalanceResult?.totalBuyIdr ?? 0)}`);
      lines.push(`Total Eksekusi Jual : ${formatIdr(rebalanceResult?.totalSellIdr ?? 0)}`);
      lines.push(`========================================`);
      lines.push(`Dibuat otomatis oleh QuantPorto Engine`);
    }

    return lines.join('\n');
  };

  const handleCopySlip = async (groupId?: string) => {
    const text = generateSlipText(groupId);
    try {
      await navigator.clipboard.writeText(text);
      setCopiedGroupId(groupId ?? 'all');
      setTimeout(() => setCopiedGroupId(null), 2500);
    } catch {
      setCopiedGroupId(null);
    }
  };

  const handleSendWhatsApp = (groupId?: string) => {
    const text = generateSlipText(groupId);
    const encoded = encodeURIComponent(text);
    window.open(`https://wa.me/?text=${encoded}`, '_blank', 'noopener,noreferrer');
  };

  // If not open, do not render modal DOM
  if (!isOpen) return null;

  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/60 dark:bg-black/80 backdrop-blur-md overflow-y-auto animate-in fade-in"
    >
      <div className="relative w-full max-w-4xl my-auto ui-card border ui-border rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-4 ui-subtle border-b ui-border">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-indigo-500/15 text-indigo-500 border border-indigo-500/30 flex items-center justify-center shadow-xs">
              <Building2 className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-bold ui-text-main flex items-center gap-2">
                <span>Multi-Platform Broker Order Slips</span>
                <span className="text-[11px] font-normal px-2 py-0.5 rounded-full ui-card ui-text-muted border ui-border">
                  {platformGroups.length} Platform
                </span>
              </h2>
              <p className="text-xs ui-text-muted mt-0.5">
                Panduan eksekusi beli &amp; jual dikelompokkan sesuai aplikasi broker di Indonesia
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => handleSendWhatsApp()}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-500 rounded-lg shadow-xs transition-all"
              title="Kirim seluruh instruksi order rebalance langsung via WhatsApp"
            >
              <Share2 className="w-3.5 h-3.5" />
              <span>Kirim ke WhatsApp</span>
            </button>

            <button
              type="button"
              onClick={() => handleCopySlip()}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg shadow-xs transition-all"
              title="Salin seluruh instruksi transaksi ke clipboard"
            >
              {copiedGroupId === 'all' ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-300" />
                  <span>Semua Slip Disalin!</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  <span>Salin Semua Slip</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:ui-text-main hover:bg-black/10 dark:hover:bg-white/10 rounded-lg transition-colors"
              aria-label="Tutup modal"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Sub-header / Progress Bar */}
        <div className="px-6 py-3 border-b ui-border flex flex-wrap items-center justify-between gap-3 text-xs bg-black/5 dark:bg-white/5">
          <div className="flex items-center gap-3">
            <span className="ui-text-muted">
              Progres Eksekusi: <strong className="ui-text-main">{executedActionCount} / {totalActionCount}</strong> ({progressPercent}%)
            </span>
            <div className="w-32 h-2 bg-black/10 dark:bg-white/10 rounded-full overflow-hidden">
              <div
                className="h-full bg-indigo-500 rounded-full transition-all duration-300"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowAllItems((v) => !v)}
              className="text-[11px] ui-text-muted hover:ui-text-main underline decoration-dotted"
            >
              {showAllItems ? 'Hanya Tampilkan Transaksi Aktif' : 'Tampilkan Semua Aset'}
            </button>

            <span className="ui-text-muted opacity-40">|</span>

            <button
              type="button"
              onClick={handleMarkAllExecuted}
              className="text-[11px] text-indigo-600 dark:text-indigo-400 hover:underline font-semibold"
            >
              Tandai Semua Selesai
            </button>

            <span className="ui-text-muted opacity-40">|</span>

            <button
              type="button"
              onClick={handleResetChecklist}
              className="text-[11px] ui-text-muted hover:text-rose-500 flex items-center gap-1"
              title="Reset centang checklist"
            >
              <RotateCcw className="w-3 h-3" />
              <span>Reset</span>
            </button>
          </div>
        </div>

        {/* Content Body: Platform Cards */}
        <div className="overflow-y-auto p-4 sm:p-6 space-y-4 bg-zinc-50/70 dark:bg-zinc-950/60">
          {platformGroups.length === 0 ? (
            <div className="p-8 text-center ui-text-muted ui-card rounded-xl border ui-border">
              <Check className="w-8 h-8 text-emerald-500 mx-auto mb-2" />
              <div className="text-sm font-semibold ui-text-main">
                Portofolio Sudah Seimbang Sesuai Target!
              </div>
              <p className="text-xs ui-text-muted mt-1">
                Tidak ada pesanan beli atau jual yang melampaui batas toleransi drift.
              </p>
            </div>
          ) : (
            platformGroups.map((group) => (
              <div
                key={group.id}
                className={`rounded-xl border p-4 sm:p-5 transition-all ${group.colorClass}`}
              >
                {/* Platform Header */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b ui-border">
                  <div className="flex items-center gap-2">
                    <div className="p-1.5 rounded-lg ui-card border ui-border shadow-2xs">
                      {group.icon}
                    </div>
                    <div>
                      <div className="font-bold text-sm ui-text-main flex items-center gap-2">
                        <span>{group.name}</span>
                        <span className={`text-[10px] px-2 py-0.5 rounded-full border ${group.badgeClass}`}>
                          {group.apps}
                        </span>
                      </div>
                      <p className="text-[11px] ui-text-muted mt-0.5">
                        {group.note}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 self-end sm:self-auto">
                    <button
                      type="button"
                      onClick={() => handleSendWhatsApp(group.id)}
                      className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold text-emerald-700 dark:text-emerald-300 bg-emerald-500/10 hover:bg-emerald-500/20 rounded border border-emerald-500/30 transition-colors"
                      title={`Kirim slip ${group.apps} ke WhatsApp`}
                    >
                      <Share2 className="w-3 h-3 text-emerald-500" />
                      <span>WhatsApp</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleCopySlip(group.id)}
                      className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold ui-text-main ui-card hover:bg-black/5 dark:hover:bg-white/5 rounded border ui-border transition-colors shadow-2xs"
                      title={`Salin slip pesanan ${group.apps} saja`}
                    >
                      {copiedGroupId === group.id ? (
                        <>
                          <Check className="w-3 h-3 text-emerald-500" />
                          <span className="text-emerald-500">Slip Disalin!</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3 h-3" />
                          <span>Salin Slip Platform</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>

                {/* Items in Platform */}
                <div className="divide-y ui-border mt-2">
                  {group.items.map((item) => {
                    const def = assetDefMap.get(item.assetId);
                    const isDone = Boolean(executedMap[item.assetId]);
                    const isBuy = item.action === 'BUY';
                    const isSell = item.action === 'SELL';
                    const isHold = item.action === 'HOLD';

                    // LOTS computation for IDX Stocks
                    const isIdx = group.id === 'idx_stocks';
                    const lots = Math.abs(item.tradeLotsInteger ?? Math.round(item.tradeLots ?? 0));
                    const shares = lots * 100;
                    // Bug 15 fix: factor in shockPercent for item spotPrice
                    const rawPrice = (holdings?.[item.assetId]?.currentPrice && holdings[item.assetId].currentPrice > 0)
                      ? holdings[item.assetId].currentPrice
                      : def?.defaultPrice ?? 0;
                    const shockMultiplier = Math.max(0, 1 + (holdings?.[item.assetId]?.shockPercent ?? 0) / 100);
                    const rawSpot = rawPrice * shockMultiplier;
                    const spotPrice = isIdx ? roundToIdxTick(rawSpot, 'nearest') : Math.round(rawSpot);

                    return (
                      <div
                        key={item.assetId}
                        onClick={() => handleToggleExecuted(item.assetId)}
                        className={`py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 cursor-pointer rounded-lg px-2 transition-colors ${
                          isDone
                            ? 'bg-emerald-500/10 opacity-70'
                            : 'hover:bg-black/5 dark:hover:bg-white/5'
                        }`}
                      >
                        {/* Left: Checkbox + Asset symbol + Action */}
                        <div className="flex items-center gap-3">
                          <button
                            type="button"
                            className="ui-text-muted hover:text-indigo-500 transition-colors flex-shrink-0"
                            aria-label={isDone ? 'Batal tandai selesai' : 'Tandai selesai'}
                          >
                            {isDone ? (
                              <CheckSquare className="w-5 h-5 text-emerald-500" />
                            ) : (
                              <Square className="w-5 h-5 text-slate-400 dark:text-slate-600" />
                            )}
                          </button>

                          <div className="flex items-center gap-2">
                            <span
                              className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                              style={{ backgroundColor: item.color }}
                            />
                            <div>
                              <div className="flex items-center gap-2">
                                <span className={`font-bold text-sm ${isDone ? 'line-through ui-text-muted' : 'ui-text-main'}`}>
                                  {item.symbol}
                                </span>
                                <span
                                  className={`inline-flex items-center gap-0.5 px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                                    isBuy
                                      ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30'
                                      : isSell
                                      ? 'bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-500/30'
                                      : 'bg-zinc-200 dark:bg-zinc-800 text-slate-600 dark:text-slate-400 border ui-border'
                                  }`}
                                >
                                  {isBuy && <ArrowUpRight className="w-3 h-3" />}
                                  {isSell && <ArrowDownRight className="w-3 h-3" />}
                                  {isHold && <Minus className="w-3 h-3" />}
                                  <span>{isBuy ? 'BELI' : isSell ? 'JUAL' : 'HOLD'}</span>
                                </span>
                              </div>
                              <div className="text-[11px] ui-text-muted mt-0.5">
                                {item.name}
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* Right: Quantity / Lots / Nominal specifications */}
                        <div className="text-left sm:text-right pl-8 sm:pl-0">
                          {item.isNominalOnly || def?.isNominalOnly ? (
                            <div>
                              <div className="text-sm font-bold ui-text-main flex items-center sm:justify-end gap-1.5">
                                <span className="text-emerald-600 dark:text-emerald-400">
                                  {formatIdr(Math.abs(item.tradeAmountIdr))}
                                </span>
                              </div>
                              <div className="text-xs ui-text-muted">
                                Reksa Dana / Nominal Bebas Lot
                              </div>
                            </div>
                          ) : isIdx ? (
                            <div>
                              <div className="text-sm font-bold ui-text-main flex items-center sm:justify-end gap-1.5">
                                <span className="text-indigo-600 dark:text-indigo-400">
                                  {lots} Lot
                                </span>
                                <span className="text-xs font-normal ui-text-muted">
                                  ({shares.toLocaleString('id-ID')} lbr @ Rp {spotPrice.toLocaleString('id-ID')})
                                </span>
                              </div>
                              <div className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                                Nilai Order: {formatIdr(Math.abs(item.tradeAmountIdr))}
                              </div>
                              {item.tradeLotsRemainderIdr && Math.abs(item.tradeLotsRemainderIdr) > 0 ? (
                                <div className="text-[10px] ui-text-muted">
                                  Sisa fraksional: {formatIdr(Math.abs(item.tradeLotsRemainderIdr))}
                                </div>
                              ) : null}
                            </div>
                          ) : group.id === 'us_etfs' ? (
                            <div>
                              <div className="text-sm font-bold ui-text-main">
                                {formatUsd(Math.abs(item.tradeAmountUsd))}
                              </div>
                              <div className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                                Ekuivalen {formatIdr(Math.abs(item.tradeAmountIdr))}
                              </div>
                              <div className="text-[10px] ui-text-muted">
                                Estimasi ~{Math.abs(item.tradeUnits).toFixed(4)} unit
                              </div>
                            </div>
                          ) : group.id === 'crypto' ? (
                            <div>
                              <div className="text-sm font-bold ui-text-main">
                                {formatIdr(Math.abs(item.tradeAmountIdr))}
                              </div>
                              <div className="text-xs text-amber-600 dark:text-amber-400 font-medium">
                                ~{Math.abs(item.tradeUnits).toFixed(8)} {item.symbol}
                              </div>
                            </div>
                          ) : (
                            <div>
                              <div className="flex items-center gap-1.5">
                                <span className="text-sm font-bold ui-text-main">
                                  {formatIdr(Math.abs(item.tradeAmountIdr))}
                                </span>
                                {item.isNominalOnly && (
                                  <span className="rounded bg-sky-500/15 border border-sky-500/30 px-1 py-0.2 font-mono text-[9px] text-sky-600 dark:text-sky-400">
                                    Nominal Murni
                                  </span>
                                )}
                              </div>
                              <div className="text-[10px] ui-text-muted">
                                Bobot Target: {formatPercent(item.targetWeightPercent)} (Drift: {formatPercent(item.absoluteDriftPercent)})
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))
          )}
        </div>

        {/* Bottom Action Footer */}
        <div className="px-6 py-4 ui-subtle border-t ui-border flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
          <div className="ui-text-muted flex items-center gap-4">
            <div>
              Total Beli: <strong className="text-emerald-600 dark:text-emerald-400 font-mono">{formatIdr(rebalanceResult.totalBuyIdr)}</strong>
            </div>
            <div>
              Total Jual: <strong className="text-rose-600 dark:text-rose-400 font-mono">{formatIdr(rebalanceResult.totalSellIdr)}</strong>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-full sm:w-auto px-5 py-2 text-xs font-semibold ui-text-main ui-card hover:bg-black/5 dark:hover:bg-white/5 rounded-lg transition-colors border ui-border shadow-2xs"
          >
            Selesai Meninjau Slip
          </button>
        </div>
      </div>
    </div>
  );
};
