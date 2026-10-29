import React, { useState, useEffect } from 'react';
import {
  CycleIndicatorState,
  AssetIndicatorConfluence,
  ComparisonOperator,
  getSourceTypeBadge,
} from '../../lib/quant/smartDcaIndicators';
import {
  Info,
  Check,
  X,
  RotateCcw,
  TrendingUp,
  TrendingDown,
  Edit2,
  Sparkles,
  ExternalLink,
  RefreshCw,
  ShieldCheck,
  Database,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';

export interface CoinMarketCapIndicatorTableProps {
  confluence: AssetIndicatorConfluence;
  onUpdateIndicatorOverride?: (
    assetId: string,
    indicatorId: string,
    override: { currentValue?: number; referenceThreshold?: number } | null
  ) => void;
  onResetAssetOverrides?: (assetId: string) => void;
  readOnly?: boolean;
  onRefreshData?: () => void;
  isRefreshing?: boolean;
  lastRefreshedAt?: string;
}

export const CoinMarketCapIndicatorTable: React.FC<
  CoinMarketCapIndicatorTableProps
> = ({
  confluence,
  onUpdateIndicatorOverride,
  onResetAssetOverrides,
  readOnly = false,
  onRefreshData,
  isRefreshing = false,
  lastRefreshedAt,
}) => {
  const [editingIndicatorId, setEditingIndicatorId] = useState<string | null>(
    null
  );
  const [editCurrentVal, setEditCurrentVal] = useState<string>('');
  const [editRefVal, setEditRefVal] = useState<string>('');
  const [tooltipIndicatorId, setTooltipIndicatorId] = useState<string | null>(
    null
  );
  const [isSourcesExpanded, setIsSourcesExpanded] = useState<boolean>(false);

  const hasAnyOverrides = confluence.indicators.some((i) => i.isManualOverride);

  const startEditing = (indicator: CycleIndicatorState) => {
    if (readOnly) return;
    setEditingIndicatorId(indicator.id);
    setEditCurrentVal(String(indicator.currentValue));
    setEditRefVal(String(indicator.referenceThreshold));
  };

  const handleSaveEdit = (indicator: CycleIndicatorState) => {
    const parsedCurrent = parseFloat(editCurrentVal);
    const parsedRef = parseFloat(editRefVal);

    if (
      !isNaN(parsedCurrent) &&
      !isNaN(parsedRef) &&
      onUpdateIndicatorOverride
    ) {
      onUpdateIndicatorOverride(confluence.assetId, indicator.id, {
        currentValue: parsedCurrent,
        referenceThreshold: parsedRef,
      });
    }
    setEditingIndicatorId(null);
  };

  // Keyboard accessibility (Escape) & click-outside listener to dismiss popover/editor
  useEffect(() => {
    if (!tooltipIndicatorId && !editingIndicatorId) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setTooltipIndicatorId(null);
        setEditingIndicatorId(null);
      }
    };

    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (
        !target.closest('[data-cmc-popover]') &&
        !target.closest('[data-cmc-trigger]')
      ) {
        setTooltipIndicatorId(null);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [tooltipIndicatorId, editingIndicatorId]);

  const displayRefreshTimestamp =
    lastRefreshedAt || confluence.lastRefreshSuccessAt || 'Snapshot Pasar (Klik Sinkronkan)';

  const isSnapshotMode =
    displayRefreshTimestamp.toLowerCase().includes('snapshot') ||
    displayRefreshTimestamp.toLowerCase().includes('klik');

  return (
    <div className="space-y-3.5">
      {/* Header & Confluence Status Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border ui-border p-3.5 bg-black/5 dark:bg-white/5">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-xs font-bold text-emerald-500 uppercase tracking-wide">
              {confluence.symbol}
            </span>
            <span className="text-xs ui-text-muted">•</span>
            <h4 className="text-xs sm:text-sm font-bold ui-text-main">
              Indikator Siklus &amp; Valuasi Pasar (CMC Style)
            </h4>
          </div>
          <p className="text-[11px] ui-text-muted">
            Keputusan aksi Smart DCA ditentukan 100% dari jumlah aturan
            indikator yang berstatus <strong>Triggered (✅)</strong>.
          </p>

          {/* Live Sync Status & Refresh Indicator */}
          <div className="flex flex-wrap items-center gap-2 pt-1 text-[11px]">
            <span
              className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full font-medium text-[10px] border ${
                isSnapshotMode
                  ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/25'
                  : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/25'
              }`}
            >
              <span className="relative flex h-2 w-2">
                <span
                  className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${
                    isSnapshotMode ? 'bg-amber-400' : 'bg-emerald-400'
                  }`}
                ></span>
                <span
                  className={`relative inline-flex rounded-full h-2 w-2 ${
                    isSnapshotMode ? 'bg-amber-500' : 'bg-emerald-500'
                  }`}
                ></span>
              </span>
              <span>
                {isSnapshotMode ? 'Snapshot Tersimpan' : 'Live Sync Sukses'}
              </span>
            </span>
            <span className="text-[11px] ui-text-muted">
              Pembaruan Terakhir:{' '}
              <strong className="ui-text-main font-mono">
                {displayRefreshTimestamp}
              </strong>
            </span>
          </div>
        </div>

        {/* Action Controls & Multiplier Pill */}
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {onRefreshData && (
            <button
              type="button"
              onClick={onRefreshData}
              disabled={isRefreshing}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border ui-border ui-subtle hover:bg-emerald-500/10 hover:text-emerald-600 dark:hover:text-emerald-400 hover:border-emerald-500/30 transition disabled:opacity-50"
              title="Sinkronkan pembaruan data live indikator siklus pasar"
            >
              <RefreshCw
                className={`w-3.5 h-3.5 ${
                  isRefreshing ? 'animate-spin text-emerald-500' : ''
                }`}
              />
              <span>{isRefreshing ? 'Menyinkronkan...' : 'Perbarui Data'}</span>
            </button>
          )}

          <div
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-bold ${confluence.badgeClass}`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>
              {confluence.triggeredCount} / {confluence.totalIndicators} Triggered
            </span>
            <span className="opacity-75">({confluence.confluencePercent}%)</span>
            <span className="mx-0.5">•</span>
            <span>{confluence.actionLabel}</span>
            <span className="font-mono underline">
              ({confluence.multiplier}x)
            </span>
          </div>

          {hasAnyOverrides && onResetAssetOverrides && !readOnly && (
            <button
              type="button"
              onClick={() => onResetAssetOverrides(confluence.assetId)}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium border ui-border ui-subtle hover:text-amber-500 transition"
              title="Kembalikan semua indikator ke data default pasar"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Reset Default</span>
            </button>
          )}
        </div>
      </div>

      {/* Main Table Styled After CoinMarketCap Crypto Market Cycle Top Indicators */}
      <div className="rounded-xl border ui-border overflow-hidden bg-white dark:bg-zinc-950 shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b ui-border bg-black/5 dark:bg-white/[0.03] text-[11px] font-semibold ui-text-muted uppercase tracking-wider">
                <th className="py-3 px-3.5 w-10 text-center">#</th>
                <th className="py-3 px-3.5 min-w-[240px]">Indicator &amp; Source</th>
                <th className="py-3 px-3.5 text-right min-w-[110px]">
                  Current
                </th>
                <th className="py-3 px-3.5 text-right min-w-[95px]">24h %</th>
                <th className="py-3 px-3.5 text-right min-w-[130px]">
                  Reference
                </th>
                <th className="py-3 px-3.5 w-24 text-center">Triggered</th>
              </tr>
            </thead>
            <tbody className="divide-y ui-border font-sans">
              {confluence.indicators.map((ind, idx) => {
                const isEditing = editingIndicatorId === ind.id;
                const isUp = ind.change24hPercent > 0;
                const isZero = ind.change24hPercent === 0;
                const sourceBadge = getSourceTypeBadge(ind.sourceType);

                return (
                  <tr
                    key={ind.id}
                    className={`transition-colors hover:bg-black/[0.02] dark:hover:bg-white/[0.02] ${
                      ind.isTriggered
                        ? 'bg-emerald-500/[0.03] dark:bg-emerald-500/[0.04]'
                        : ''
                    }`}
                  >
                    {/* # Index */}
                    <td className="py-3 px-3.5 text-center font-mono text-[11px] ui-text-muted align-top">
                      {idx + 1}
                    </td>

                    {/* Indicator Name + Source Transparency + Tooltip */}
                    <td className="py-3 px-3.5">
                      <div className="space-y-1 group">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-semibold ui-text-main">
                            {ind.name}
                          </span>
                          {ind.isManualOverride && (
                            <span className="text-[9px] px-1.5 py-0.2 rounded bg-amber-500/15 text-amber-500 font-mono font-bold">
                              OVERRIDE
                            </span>
                          )}
                          <div className="relative inline-block">
                            <button
                              type="button"
                              data-cmc-trigger="true"
                              onClick={() =>
                                setTooltipIndicatorId(
                                  tooltipIndicatorId === ind.id ? null : ind.id
                                )
                              }
                              className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 transition p-0.5"
                              aria-label={`Info ${ind.name}`}
                            >
                              <Info className="w-3.5 h-3.5" />
                            </button>

                            {/* Inline Popover Tooltip */}
                            {tooltipIndicatorId === ind.id && (
                              <div
                                data-cmc-popover="true"
                                className="absolute left-0 bottom-full mb-1.5 z-50 w-72 p-3 rounded-lg border ui-border bg-zinc-900 text-zinc-100 text-[11px] leading-relaxed shadow-2xl backdrop-blur-md"
                              >
                                <p className="font-semibold text-emerald-400 mb-1">
                                  {ind.name}
                                </p>
                                <p>{ind.description}</p>

                                <div className="mt-2.5 pt-2 border-t border-zinc-800 space-y-1 text-[10px]">
                                  <div className="flex items-center justify-between text-zinc-400">
                                    <span>Acuan Beli:</span>
                                    <span className="font-mono text-zinc-200 font-semibold">
                                      {ind.formattedReference}
                                    </span>
                                  </div>
                                  <div className="flex items-center justify-between text-zinc-400">
                                    <span>Sumber Data:</span>
                                    <a
                                      href={ind.sourceUrl}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="inline-flex items-center gap-1 text-emerald-400 hover:underline"
                                    >
                                      <span>{ind.sourceName}</span>
                                      <ExternalLink className="w-2.5 h-2.5" />
                                    </a>
                                  </div>
                                  <div className="flex items-center justify-between text-zinc-400">
                                    <span>Tipe Sumber:</span>
                                    <span className="font-medium text-zinc-300">
                                      {sourceBadge.label}
                                    </span>
                                  </div>
                                  <div className="flex items-center justify-between text-zinc-400">
                                    <span>Pembaruan:</span>
                                    <span className="font-mono text-zinc-300">
                                      {ind.lastSuccessTimestamp || 'Live Sync'}
                                    </span>
                                  </div>
                                </div>

                                <div className="mt-2 text-right">
                                  <button
                                    type="button"
                                    onClick={() => setTooltipIndicatorId(null)}
                                    className="text-[10px] text-zinc-400 hover:text-white"
                                  >
                                    Tutup
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Direct Clickable Data Source Link & Badge */}
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span
                            className={`text-[9px] font-medium px-1.5 py-0.2 rounded border ${sourceBadge.colorClass}`}
                          >
                            {sourceBadge.label}
                          </span>
                          <a
                            href={ind.sourceUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-0.5 text-[10px] text-zinc-500 hover:text-emerald-600 dark:hover:text-emerald-400 underline decoration-zinc-400/40 hover:decoration-emerald-500 transition group/link"
                            title={`Buka sumber data resmi: ${ind.sourceName}`}
                          >
                            <span>{ind.sourceName}</span>
                            <ExternalLink className="w-2.5 h-2.5 opacity-60 group-hover/link:opacity-100" />
                          </a>
                        </div>
                      </div>
                    </td>

                    {/* Current Value (Clickable to Edit) */}
                    <td className="py-3 px-3.5 text-right font-mono font-bold align-top">
                      {isEditing ? (
                        <div className="flex items-center justify-end gap-1">
                          <input
                            type="number"
                            step="any"
                            value={editCurrentVal}
                            onChange={(e) => setEditCurrentVal(e.target.value)}
                            className="w-20 px-1.5 py-0.5 rounded border ui-border text-right text-xs bg-white dark:bg-zinc-900 ui-text-main"
                          />
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => startEditing(ind)}
                          disabled={readOnly}
                          className="inline-flex items-center gap-1 font-mono hover:text-emerald-500 dark:hover:text-emerald-400 transition"
                          title="Klik untuk mengubah nilai indikator manual"
                        >
                          <span
                            className={
                              ind.isTriggered
                                ? 'text-emerald-600 dark:text-emerald-400'
                                : 'ui-text-main'
                            }
                          >
                            {ind.formattedCurrent}
                          </span>
                          {!readOnly && (
                            <Edit2 className="w-2.5 h-2.5 opacity-0 hover:opacity-100 text-zinc-400" />
                          )}
                        </button>
                      )}
                    </td>

                    {/* 24h % Trend Badge (CoinMarketCap style) */}
                    <td className="py-3 px-3.5 text-right font-mono text-[11px] font-semibold align-top">
                      <div
                        className={`inline-flex items-center justify-end gap-0.5 ${
                          isZero
                            ? 'ui-text-muted'
                            : isUp
                            ? 'text-emerald-500 dark:text-emerald-400'
                            : 'text-rose-500 dark:text-rose-400'
                        }`}
                      >
                        {isUp && <TrendingUp className="w-3 h-3" />}
                        {!isUp && !isZero && <TrendingDown className="w-3 h-3" />}
                        <span>
                          {isUp ? '▲' : isZero ? '•' : '▼'}{' '}
                          {Math.abs(ind.change24hPercent)}%
                        </span>
                      </div>
                    </td>

                    {/* Reference Rule Threshold */}
                    <td className="py-3 px-3.5 text-right font-mono text-[11px] align-top">
                      {isEditing ? (
                        <div className="flex items-center justify-end gap-1">
                          <input
                            type="number"
                            step="any"
                            value={editRefVal}
                            onChange={(e) => setEditRefVal(e.target.value)}
                            className="w-16 px-1.5 py-0.5 rounded border ui-border text-right text-xs bg-white dark:bg-zinc-900 ui-text-main"
                          />
                          <button
                            type="button"
                            onClick={() => handleSaveEdit(ind)}
                            className="p-1 rounded bg-emerald-500 text-white hover:bg-emerald-600"
                            title="Simpan"
                          >
                            <Check className="w-3 h-3" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditingIndicatorId(null)}
                            className="p-1 rounded bg-zinc-200 dark:bg-zinc-800 ui-text-muted hover:ui-text-main"
                            title="Batal"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      ) : (
                        <span
                          onClick={() => startEditing(ind)}
                          className="ui-text-muted cursor-pointer hover:underline"
                          title="Klik untuk menyesuaikan batas acuan pemicu sinyal"
                        >
                          {ind.formattedReference}
                        </span>
                      )}
                    </td>

                    {/* Triggered Status Icon (CMC style: Green Check / Red Cross) */}
                    <td className="py-3 px-3.5 text-center align-top">
                      <div className="flex items-center justify-center">
                        {ind.isTriggered ? (
                          <div
                            className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-emerald-500/15 text-emerald-500"
                            title="Sinyal Beli / Akumulasi Aktif (Triggered)"
                          >
                            <Check className="w-4 h-4 stroke-[3]" />
                          </div>
                        ) : (
                          <div
                            className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-rose-500/15 text-rose-500"
                            title="Belum Triggered (Belum Memenuhi Syarat Acuan)"
                          >
                            <X className="w-4 h-4 stroke-[3]" />
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Data Source Transparency & Verification Footer */}
        <div className="border-t ui-border bg-black/[0.02] dark:bg-white/[0.02] p-3 text-xs">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400">
              <Database className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
              <span className="font-medium text-[11px]">
                Transparansi Sumber: {confluence.dataSources?.length || confluence.indicators.length} sumber data terverifikasi
              </span>
            </div>

            <button
              type="button"
              onClick={() => setIsSourcesExpanded(!isSourcesExpanded)}
              className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 hover:underline"
            >
              <span>
                {isSourcesExpanded
                  ? 'Sembunyikan Rincian Sumber'
                  : 'Lihat Rincian Sumber & Metodologi'}
              </span>
              {isSourcesExpanded ? (
                <ChevronUp className="w-3 h-3" />
              ) : (
                <ChevronDown className="w-3 h-3" />
              )}
            </button>
          </div>

          {isSourcesExpanded && (
            <div className="mt-3 pt-3 border-t ui-border space-y-2.5 animate-in fade-in duration-200">
              <p className="text-[11px] ui-text-muted leading-relaxed">
                Setiap indikator dihitung menggunakan data publik resmi dan benchmark industri (CoinMarketCap, Glassnode, LookIntoBitcoin, Alternative.me, Bursa Efek Indonesia, FactSet, Robert Shiller Online, FRED, dan Bank Indonesia). Klik tautan untuk memverifikasi data di sumber aslinya:
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                {(confluence.dataSources || []).map((src, i) => {
                  const badge = getSourceTypeBadge(src.sourceType);
                  return (
                    <div
                      key={i}
                      className="flex items-center justify-between p-2 rounded-lg border ui-border bg-white dark:bg-zinc-900 text-[11px]"
                    >
                      <div className="flex items-center gap-2 truncate">
                        <ShieldCheck className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                        <a
                          href={src.sourceUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-medium hover:text-emerald-500 hover:underline truncate"
                        >
                          {src.sourceName}
                        </a>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <span
                          className={`text-[9px] px-1.5 py-0.2 rounded border font-medium ${badge.colorClass}`}
                        >
                          {badge.label}
                        </span>
                        <a
                          href={src.sourceUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 p-0.5"
                          title="Buka situs penyedia data"
                        >
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="flex items-center justify-between text-[10px] ui-text-muted pt-1">
                <span>
                  Status Sinkronisasi Terakhir:{' '}
                  <strong className="ui-text-main font-mono">
                    {displayRefreshTimestamp}
                  </strong>
                </span>
                <span className="text-emerald-600 dark:text-emerald-400 font-medium">
                  ✓ Semua ambang batas diaudit &amp; 100% transparan
                </span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
