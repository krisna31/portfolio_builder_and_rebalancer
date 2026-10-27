import React, { useMemo, useState } from 'react';
import {
  AssetDefinition,
  HoldingEntry,
  RebalanceItemResult,
  RebalanceSummaryResult,
} from '../../lib/quant/types';
import { formatIdr, formatPercent, formatUsd } from '../../lib/formatters';
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
  Sparkles,
  ExternalLink,
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
        colorClass: 'border-emerald-500/30 bg-emerald-950/20',
        badgeClass: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
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
        colorClass: 'border-indigo-500/30 bg-indigo-950/20',
        badgeClass: 'bg-indigo-500/10 text-indigo-400 border-indigo-500/30',
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
        colorClass: 'border-sky-500/30 bg-sky-950/20',
        badgeClass: 'bg-sky-500/10 text-sky-400 border-sky-500/30',
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
        colorClass: 'border-amber-500/30 bg-amber-950/20',
        badgeClass: 'bg-amber-500/10 text-amber-400 border-amber-500/30',
        note: 'Pasar beroperasi 24/7. Dapat dibeli langsung dalam nominal Rupiah atau fraksi Satoshi.',
        items: groups.crypto,
      });
    }

    if (groups.gold.length > 0) {
      result.push({
        id: 'gold',
        name: 'Emas Digital & Fisik',
        apps: 'Pluang Emas / Pegadaian / Antam',
        icon: <Sparkles className="w-4 h-4 text-yellow-400" />,
        colorClass: 'border-yellow-500/30 bg-yellow-950/20',
        badgeClass: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/30',
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
        colorClass: 'border-purple-500/30 bg-purple-950/20',
        badgeClass: 'bg-purple-500/10 text-purple-400 border-purple-500/30',
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
          // Bug 15 fix: factor in shockPercent for spotPrice
          const rawPrice = (holdings?.[item.assetId]?.currentPrice && holdings[item.assetId].currentPrice > 0)
            ? holdings[item.assetId].currentPrice
            : def?.defaultPrice ?? 0;
          const shockMultiplier = Math.max(0, 1 + (holdings?.[item.assetId]?.shockPercent ?? 0) / 100);
          const unitPrice = Math.round(rawPrice * shockMultiplier);
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

  // If not open, do not render modal DOM
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/80 backdrop-blur-md overflow-y-auto">
      <div className="relative w-full max-w-4xl my-auto bg-slate-950 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-4 bg-slate-900 border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-indigo-500/20 text-indigo-400 border border-indigo-500/30 flex items-center justify-center">
              <Building2 className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-slate-100 flex items-center gap-2">
                <span>Multi-Platform Broker Order Slips</span>
                <span className="text-[11px] font-normal px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 border border-slate-700">
                  {platformGroups.length} Platform
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                Panduan eksekusi beli & jual dikelompokkan sesuai aplikasi broker di Indonesia
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => handleCopySlip()}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg shadow-sm transition-all shadow-indigo-500/20"
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
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-lg transition-colors"
              aria-label="Tutup modal"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Sub-header / Progress Bar */}
        <div className="px-6 py-3 bg-slate-900/60 border-b border-slate-800/80 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-3">
            <span className="text-slate-400">
              Progres Eksekusi: <strong className="text-white">{executedActionCount} / {totalActionCount}</strong> ({progressPercent}%)
            </span>
            <div className="w-32 h-2 bg-slate-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-indigo-500 rounded-full transition-all duration-300"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowAllItems((v) => !v)}
              className="text-[11px] text-slate-400 hover:text-slate-200 underline decoration-dotted"
            >
              {showAllItems ? 'Hanya Tampilkan Transaksi Aktif' : 'Tampilkan Semua Aset'}
            </button>

            <span className="text-slate-700">|</span>

            <button
              onClick={handleMarkAllExecuted}
              className="text-[11px] text-indigo-400 hover:text-indigo-300 font-medium"
            >
              Tandai Semua Selesai
            </button>

            <span className="text-slate-700">|</span>

            <button
              onClick={handleResetChecklist}
              className="text-[11px] text-slate-400 hover:text-rose-400 flex items-center gap-1"
              title="Reset centang checklist"
            >
              <RotateCcw className="w-3 h-3" />
              <span>Reset</span>
            </button>
          </div>
        </div>

        {/* Content Body: Platform Cards */}
        <div className="overflow-y-auto p-4 sm:p-6 space-y-4 bg-slate-950">
          {platformGroups.length === 0 ? (
            <div className="p-8 text-center text-slate-400 bg-slate-900/40 rounded-xl border border-slate-800">
              <Check className="w-8 h-8 text-emerald-400 mx-auto mb-2" />
              <div className="text-sm font-medium text-slate-200">
                Portofolio Sudah Seimbang Sesuai Target!
              </div>
              <p className="text-xs text-slate-400 mt-1">
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
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-800/80">
                  <div className="flex items-center gap-2">
                    <div className="p-1.5 rounded-lg bg-slate-900 border border-slate-800">
                      {group.icon}
                    </div>
                    <div>
                      <div className="font-semibold text-sm text-slate-100 flex items-center gap-2">
                        <span>{group.name}</span>
                        <span className={`text-[10px] px-2 py-0.5 rounded-full border ${group.badgeClass}`}>
                          {group.apps}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        {group.note}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 self-end sm:self-auto">
                    <button
                      onClick={() => handleCopySlip(group.id)}
                      className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium text-slate-300 bg-slate-900 hover:bg-slate-800 hover:text-white rounded border border-slate-700 transition-colors"
                      title={`Salin slip pesanan ${group.apps} saja`}
                    >
                      {copiedGroupId === group.id ? (
                        <>
                          <Check className="w-3 h-3 text-emerald-400" />
                          <span className="text-emerald-400">Slip Disalin!</span>
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
                <div className="divide-y divide-slate-800/60 mt-2">
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
                    const spotPrice = Math.round(rawPrice * shockMultiplier);

                    return (
                      <div
                        key={item.assetId}
                        onClick={() => handleToggleExecuted(item.assetId)}
                        className={`py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 cursor-pointer rounded-lg px-2 transition-colors ${
                          isDone
                            ? 'bg-emerald-950/20 opacity-65'
                            : 'hover:bg-slate-900/50'
                        }`}
                      >
                        {/* Left: Checkbox + Asset symbol + Action */}
                        <div className="flex items-center gap-3">
                          <button
                            type="button"
                            className="text-slate-400 hover:text-indigo-400 transition-colors flex-shrink-0"
                            aria-label={isDone ? 'Batal tandai selesai' : 'Tandai selesai'}
                          >
                            {isDone ? (
                              <CheckSquare className="w-5 h-5 text-emerald-400" />
                            ) : (
                              <Square className="w-5 h-5 text-slate-600" />
                            )}
                          </button>

                          <div className="flex items-center gap-2">
                            <span
                              className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                              style={{ backgroundColor: item.color }}
                            />
                            <div>
                              <div className="flex items-center gap-2">
                                <span className={`font-bold text-sm ${isDone ? 'line-through text-slate-400' : 'text-white'}`}>
                                  {item.symbol}
                                </span>
                                <span
                                  className={`inline-flex items-center gap-0.5 px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                                    isBuy
                                      ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                                      : isSell
                                      ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                                      : 'bg-slate-800 text-slate-400 border border-slate-700'
                                  }`}
                                >
                                  {isBuy && <ArrowUpRight className="w-3 h-3" />}
                                  {isSell && <ArrowDownRight className="w-3 h-3" />}
                                  {isHold && <Minus className="w-3 h-3" />}
                                  <span>{isBuy ? 'BELI' : isSell ? 'JUAL' : 'HOLD'}</span>
                                </span>
                              </div>
                              <div className="text-[11px] text-slate-400">
                                {item.name}
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* Right: Quantity / Lots / Nominal specifications */}
                        <div className="text-left sm:text-right pl-8 sm:pl-0">
                          {item.isNominalOnly || def?.isNominalOnly ? (
                            <div>
                              <div className="text-sm font-bold text-slate-100 flex items-center sm:justify-end gap-1.5">
                                <span className="text-emerald-300">
                                  {formatIdr(Math.abs(item.tradeAmountIdr))}
                                </span>
                              </div>
                              <div className="text-xs text-slate-400">
                                Reksa Dana / Nominal Bebas Lot
                              </div>
                            </div>
                          ) : isIdx ? (
                            <div>
                              <div className="text-sm font-bold text-slate-100 flex items-center sm:justify-end gap-1.5">
                                <span className="text-indigo-300">
                                  {lots} Lot
                                </span>
                                <span className="text-xs font-normal text-slate-400">
                                  ({shares.toLocaleString('id-ID')} lbr @ Rp {spotPrice.toLocaleString('id-ID')})
                                </span>
                              </div>
                              <div className="text-xs font-semibold text-emerald-400">
                                Nilai Order: {formatIdr(Math.abs(item.tradeAmountIdr))}
                              </div>
                              {item.tradeLotsRemainderIdr && Math.abs(item.tradeLotsRemainderIdr) > 0 ? (
                                <div className="text-[10px] text-slate-500">
                                  Sisa fraksional: {formatIdr(Math.abs(item.tradeLotsRemainderIdr))}
                                </div>
                              ) : null}
                            </div>
                          ) : group.id === 'us_etfs' ? (
                            <div>
                              <div className="text-sm font-bold text-slate-100">
                                {formatUsd(Math.abs(item.tradeAmountUsd))}
                              </div>
                              <div className="text-xs font-semibold text-emerald-400">
                                Ekuivalen {formatIdr(Math.abs(item.tradeAmountIdr))}
                              </div>
                              <div className="text-[10px] text-slate-400">
                                Estimasi ~{Math.abs(item.tradeUnits).toFixed(4)} unit
                              </div>
                            </div>
                          ) : group.id === 'crypto' ? (
                            <div>
                              <div className="text-sm font-bold text-slate-100">
                                {formatIdr(Math.abs(item.tradeAmountIdr))}
                              </div>
                              <div className="text-xs text-amber-400 font-medium">
                                ~{Math.abs(item.tradeUnits).toFixed(8)} {item.symbol}
                              </div>
                            </div>
                          ) : (
                            <div>
                              <div className="flex items-center gap-1.5">
                                <span className="text-sm font-bold text-slate-100">
                                  {formatIdr(Math.abs(item.tradeAmountIdr))}
                                </span>
                                {item.isNominalOnly && (
                                  <span className="rounded bg-sky-500/20 px-1 py-0.2 font-mono text-[9px] text-sky-400">
                                    Nominal Murni
                                  </span>
                                )}
                              </div>
                              <div className="text-[10px] text-slate-400">
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
        <div className="px-6 py-4 bg-slate-900 border-t border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
          <div className="text-slate-400 flex items-center gap-4">
            <div>
              Total Beli: <strong className="text-emerald-400">{formatIdr(rebalanceResult.totalBuyIdr)}</strong>
            </div>
            <div>
              Total Jual: <strong className="text-rose-400">{formatIdr(rebalanceResult.totalSellIdr)}</strong>
            </div>
          </div>

          <button
            onClick={onClose}
            className="w-full sm:w-auto px-5 py-2 text-xs font-semibold text-white bg-slate-800 hover:bg-slate-700 rounded-lg transition-colors border border-slate-700"
          >
            Selesai Meninjau Slip
          </button>
        </div>
      </div>
    </div>
  );
};
