import React, { useState } from 'react';
import {
  CycleIndicatorState,
  AssetIndicatorConfluence,
  ComparisonOperator,
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
}

export const CoinMarketCapIndicatorTable: React.FC<
  CoinMarketCapIndicatorTableProps
> = ({
  confluence,
  onUpdateIndicatorOverride,
  onResetAssetOverrides,
  readOnly = false,
}) => {
  const [editingIndicatorId, setEditingIndicatorId] = useState<string | null>(
    null
  );
  const [editCurrentVal, setEditCurrentVal] = useState<string>('');
  const [editRefVal, setEditRefVal] = useState<string>('');
  const [tooltipIndicatorId, setTooltipIndicatorId] = useState<string | null>(
    null
  );

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

  const handleResetSingle = (indicatorId: string) => {
    if (onUpdateIndicatorOverride) {
      onUpdateIndicatorOverride(confluence.assetId, indicatorId, null);
    }
  };

  return (
    <div className="space-y-3.5">
      {/* Header & Confluence Status Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 rounded-xl border ui-border p-3.5 bg-black/5 dark:bg-white/5">
        <div>
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs font-bold text-emerald-500 uppercase tracking-wide">
              {confluence.symbol}
            </span>
            <span className="text-xs ui-text-muted">•</span>
            <h4 className="text-xs sm:text-sm font-bold ui-text-main">
              Indikator Siklus &amp; Valuasi Pasar (CMC Style)
            </h4>
          </div>
          <p className="text-[11px] ui-text-muted mt-0.5">
            Keputusan aksi Smart DCA ditentukan 100% dari jumlah aturan
            indikator yang berstatus <strong>Triggered (✅)</strong>.
          </p>
        </div>

        {/* Confluence Pill & Action Multiplier */}
        <div className="flex items-center gap-2 shrink-0">
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
                <th className="py-3 px-3.5 min-w-[200px]">Indicator</th>
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
                    <td className="py-3 px-3.5 text-center font-mono text-[11px] ui-text-muted">
                      {idx + 1}
                    </td>

                    {/* Indicator Name + Tooltip */}
                    <td className="py-3 px-3.5">
                      <div className="flex items-center gap-1.5 group">
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
                            <div className="absolute left-0 bottom-full mb-1.5 z-50 w-64 p-2.5 rounded-lg border ui-border bg-zinc-900 text-zinc-100 text-[11px] leading-relaxed shadow-xl backdrop-blur-md">
                              <p className="font-semibold text-emerald-400 mb-1">
                                {ind.name}
                              </p>
                              <p>{ind.description}</p>
                              <div className="mt-2 pt-1.5 border-t border-zinc-800 flex items-center justify-between text-[10px] text-zinc-400">
                                <span>
                                  Acuan Beli: {ind.formattedReference}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => setTooltipIndicatorId(null)}
                                  className="text-zinc-300 hover:text-white"
                                >
                                  Tutup
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </td>

                    {/* Current Value (Clickable to Edit) */}
                    <td className="py-3 px-3.5 text-right font-mono font-bold">
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
                    <td className="py-3 px-3.5 text-right font-mono text-[11px] font-semibold">
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
                    <td className="py-3 px-3.5 text-right font-mono text-[11px]">
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
                    <td className="py-3 px-3.5 text-center">
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
      </div>
    </div>
  );
};
