import React, { useEffect, useMemo, useState } from 'react';
import {
  X,
  Copy,
  Check,
  ClipboardPaste,
  FileSpreadsheet,
  AlertCircle,
  CheckCircle2,
  Sparkles,
  ArrowRight,
  HelpCircle,
  ListPlus,
  RotateCcw,
} from 'lucide-react';
import { AssetDefinition, HoldingEntry } from '../../lib/quant/types';
import {
  exportHoldingsToText,
  parseHoldingsText,
  ParsedHoldingItem,
} from '../../lib/quant/textDataParser';
import { formatIdr } from '../../lib/formatters';

export interface HoldingsTextImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  allAssets: AssetDefinition[];
  currentHoldings: Record<string, HoldingEntry>;
  usdIdrRate: number;
  onApplyHoldings: (
    parsedItems: ParsedHoldingItem[],
    strategy: 'merge' | 'replace'
  ) => void;
}

export const HoldingsTextImportModal: React.FC<HoldingsTextImportModalProps> = ({
  isOpen,
  onClose,
  allAssets,
  currentHoldings,
  usdIdrRate,
  onApplyHoldings,
}) => {
  const [activeTab, setActiveTab] = useState<'import' | 'export'>('import');
  const [inputText, setInputText] = useState('');
  const [defaultMode, setDefaultMode] = useState<'nominal' | 'units'>('nominal');
  const [strategy, setStrategy] = useState<'merge' | 'replace'>('merge');

  // Export state
  const [exportFormat, setExportFormat] = useState<'tsv' | 'csv' | 'summary'>('tsv');
  const [copiedExport, setCopiedExport] = useState(false);

  // Parse live input
  const parseResult = useMemo(() => {
    if (!inputText.trim()) return null;
    return parseHoldingsText(inputText, allAssets, defaultMode, usdIdrRate);
  }, [inputText, allAssets, defaultMode, usdIdrRate]);

  // Export current holdings
  const exportText = useMemo(() => {
    return exportHoldingsToText(currentHoldings, allAssets, exportFormat, usdIdrRate);
  }, [currentHoldings, allAssets, exportFormat, usdIdrRate]);

  useEffect(() => {
    if (isOpen) {
      setCopiedExport(false);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handlePasteFromClipboard = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) setInputText(text);
    } catch {
      alert('Tidak dapat membaca clipboard otomatis. Silakan gunakan Ctrl+V / Cmd+V.');
    }
  };

  const handleCopyExport = async () => {
    try {
      await navigator.clipboard.writeText(exportText);
      setCopiedExport(true);
      setTimeout(() => setCopiedExport(false), 2500);
    } catch (err) {
      console.error('Failed to copy', err);
    }
  };

  const handleLoadSampleTsv = () => {
    const sample = [
      'Symbol\tNama Aset\tNilai Holding',
      'BBCA\tBank Central Asia\t10 lot',
      'RDPT\tSucorinvest Stable Fund\t25.000.000',
      'GLD\tSPDR Gold Trust\t15.000.000',
      'BTC\tBitcoin\t0.025',
      'SPY\tSPDR S&P 500 ETF\t10.000.000',
    ].join('\n');
    setInputText(sample);
  };

  const handleLoadSampleFreeform = () => {
    const sample = [
      '# Portofolio Real Saya',
      'BBCA 25jt',
      'RDPT Rp 30.000.000',
      'BTC 0.05 BTC',
      'GLD 15jt',
      'ETH 1.5 unit',
    ].join('\n');
    setInputText(sample);
  };

  const handleApply = () => {
    if (!parseResult || parseResult.items.length === 0) return;
    onApplyHoldings(parseResult.items, strategy);
    onClose();
  };

  const validItems = parseResult?.items.filter((i) => i.isRecognized && i.isValid) || [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="ui-card ui-border relative flex max-h-[92vh] w-full max-w-3xl flex-col rounded-2xl border shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="ui-border flex items-center justify-between border-b px-5 py-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
              <FileSpreadsheet className="h-5 w-5" />
            </div>
            <div>
              <h2 className="ui-text-main text-base font-bold sm:text-lg">
                Import / Export Saldo Holding (Teks & Excel)
              </h2>
              <p className="ui-text-muted text-xs">
                Salin-tempel daftar aset dari Excel, Google Sheets, atau teks bebas tanpa perlu input satu per satu
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="ui-subtle ui-text-muted hover:ui-text-main rounded-lg p-1.5 transition"
            aria-label="Tutup"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Navigation Tabs */}
        <div className="ui-border flex border-b px-5 pt-3 gap-2">
          <button
            type="button"
            onClick={() => setActiveTab('import')}
            className={`flex items-center gap-2 border-b-2 px-3 py-2 text-xs sm:text-sm font-semibold transition ${
              activeTab === 'import'
                ? 'border-emerald-500 text-emerald-600 dark:text-emerald-400'
                : 'border-transparent ui-text-muted hover:ui-text-main'
            }`}
          >
            <ListPlus className="h-4 w-4" />
            <span>Import Saldo (Tempel Teks)</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('export')}
            className={`flex items-center gap-2 border-b-2 px-3 py-2 text-xs sm:text-sm font-semibold transition ${
              activeTab === 'export'
                ? 'border-emerald-500 text-emerald-600 dark:text-emerald-400'
                : 'border-transparent ui-text-muted hover:ui-text-main'
            }`}
          >
            <Copy className="h-4 w-4" />
            <span>Export Saldo (Salin ke Excel/Teks)</span>
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {activeTab === 'import' ? (
            /* IMPORT TAB */
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <label className="ui-text-main text-xs font-semibold">
                  Tempelkan Baris Aset (Excel / CSV / Teks Bebas):
                </label>
                <div className="flex flex-wrap items-center gap-1.5">
                  <button
                    type="button"
                    onClick={handlePasteFromClipboard}
                    className="ui-subtle ui-border ui-text-main flex items-center gap-1 rounded-lg border px-2.5 py-1 text-xs font-medium hover:opacity-80"
                  >
                    <ClipboardPaste className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                    <span>Tempel Clipboard</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleLoadSampleTsv}
                    className="ui-subtle ui-border ui-text-muted hover:ui-text-main flex items-center gap-1 rounded-lg border px-2 py-1 text-xs"
                    title="Contoh format copy dari spreadsheet"
                  >
                    <Sparkles className="h-3 w-3 text-emerald-500" />
                    <span>Contoh Excel</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleLoadSampleFreeform}
                    className="ui-subtle ui-border ui-text-muted hover:ui-text-main flex items-center gap-1 rounded-lg border px-2 py-1 text-xs"
                    title="Contoh format teks cepat misal 'BBCA 25jt'"
                  >
                    <Sparkles className="h-3 w-3 text-amber-500" />
                    <span>Contoh Teks Bebas</span>
                  </button>

                  {inputText && (
                    <button
                      type="button"
                      onClick={() => setInputText('')}
                      className="ui-subtle ui-text-muted hover:text-rose-500 rounded p-1 text-xs"
                      title="Bersihkan teks"
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </div>

              {/* Textarea */}
              <div className="relative">
                <textarea
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  placeholder="Contoh format yang didukung:&#10;BBCA 10 lot&#10;RDPT Rp 25.000.000&#10;BTC 0.05&#10;Atau salin tabel dari Excel/Google Sheets..."
                  rows={6}
                  className="ui-subtle ui-border ui-text-main w-full rounded-xl border p-3 font-mono text-[11px] leading-relaxed focus:border-emerald-500 focus:outline-none"
                  spellCheck={false}
                />
              </div>

              {/* Mode & Strategy Selectors */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                {/* Default Mode */}
                <div className="ui-subtle rounded-xl p-3 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="ui-text-main font-semibold">Tafsirkan Angka Tanpa Label:</span>
                  </div>
                  <div className="grid grid-cols-2 gap-1 font-medium">
                    <button
                      type="button"
                      onClick={() => setDefaultMode('nominal')}
                      className={`rounded-lg py-1.5 px-2 text-center transition ${
                        defaultMode === 'nominal'
                          ? 'bg-emerald-600 text-white font-bold'
                          : 'ui-card ui-border border ui-text-muted hover:ui-text-main'
                      }`}
                    >
                      Nominal Rupiah (IDR)
                    </button>
                    <button
                      type="button"
                      onClick={() => setDefaultMode('units')}
                      className={`rounded-lg py-1.5 px-2 text-center transition ${
                        defaultMode === 'units'
                          ? 'bg-emerald-600 text-white font-bold'
                          : 'ui-card ui-border border ui-text-muted hover:ui-text-main'
                      }`}
                    >
                      Unit / Lembar / Lot
                    </button>
                  </div>
                </div>

                {/* Merge vs Replace */}
                <div className="ui-subtle rounded-xl p-3 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="ui-text-main font-semibold">Strategi Pembaruan:</span>
                  </div>
                  <div className="grid grid-cols-2 gap-1 font-medium">
                    <button
                      type="button"
                      onClick={() => setStrategy('merge')}
                      className={`rounded-lg py-1.5 px-2 text-center transition ${
                        strategy === 'merge'
                          ? 'bg-emerald-600 text-white font-bold'
                          : 'ui-card ui-border border ui-text-muted hover:ui-text-main'
                      }`}
                    >
                      Gabungkan (Update Aset)
                    </button>
                    <button
                      type="button"
                      onClick={() => setStrategy('replace')}
                      className={`rounded-lg py-1.5 px-2 text-center transition ${
                        strategy === 'replace'
                          ? 'bg-rose-600 text-white font-bold'
                          : 'ui-card ui-border border ui-text-muted hover:ui-text-main'
                      }`}
                    >
                      Gantikan Semua Holding
                    </button>
                  </div>
                </div>
              </div>

              {/* Live Parsed Preview Table */}
              {parseResult && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <span className="font-bold ui-text-main">Hasil Parsing Live:</span>
                      <span className="rounded bg-emerald-500/15 px-2 py-0.5 font-mono text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
                        {validItems.length} dari {parseResult.items.length} aset teridentifikasi
                      </span>
                    </div>
                    <div className="font-mono text-xs font-bold text-emerald-600 dark:text-emerald-400">
                      Total: {formatIdr(parseResult.totalNominalIdr)}
                    </div>
                  </div>

                  {parseResult.items.length > 0 ? (
                    <div className="ui-border max-h-56 overflow-y-auto rounded-xl border">
                      <table className="w-full border-separate border-spacing-0 text-left text-xs">
                        <thead className="ui-subtle text-[11px] font-semibold sticky top-0 z-10">
                          <tr>
                            <th className="ui-border border-b px-3 py-2">Symbol</th>
                            <th className="ui-border border-b px-3 py-2">Nama Aset</th>
                            <th className="ui-border border-b px-3 py-2 text-right">Nilai IDR</th>
                            <th className="ui-border border-b px-3 py-2 text-right">Unit / Lot</th>
                            <th className="ui-border border-b px-3 py-2 text-center">Status</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800 font-mono text-[11px]">
                          {parseResult.items.map((item, idx) => (
                            <tr
                              key={idx}
                              className={
                                !item.isRecognized
                                  ? 'bg-rose-500/5 text-rose-600 dark:text-rose-400'
                                  : 'hover:bg-zinc-50 dark:hover:bg-zinc-800/50'
                              }
                            >
                              <td className="px-3 py-2 font-bold">{item.rawTicker}</td>
                              <td className="px-3 py-2 font-sans">{item.assetName}</td>
                              <td className="px-3 py-2 text-right font-bold">
                                {formatIdr(item.nominalIdr)}
                              </td>
                              <td className="px-3 py-2 text-right text-zinc-500 dark:text-zinc-400">
                                {item.lots !== undefined
                                  ? `${item.lots} Lot`
                                  : `${item.units.toLocaleString('id-ID')} unit`}
                              </td>
                              <td className="px-3 py-2 text-center">
                                {item.isRecognized ? (
                                  <span className="inline-flex items-center gap-1 rounded bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">
                                    <Check className="h-3 w-3" /> Valid
                                  </span>
                                ) : (
                                  <span
                                    className="inline-flex items-center gap-1 rounded bg-rose-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-rose-600 dark:text-rose-400"
                                    title={item.warning}
                                  >
                                    <AlertCircle className="h-3 w-3" /> Unknown
                                  </span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="ui-subtle rounded-xl p-4 text-center text-xs ui-text-muted">
                      Tidak ada baris yang valid terdeteksi. Silakan periksa format teks yang ditempel.
                    </div>
                  )}

                  {parseResult.invalidLines.length > 0 && (
                    <div className="text-[11px] text-amber-600 dark:text-amber-400">
                      ⚠️ {parseResult.invalidLines.length} baris dilewati karena tidak memiliki nilai numerik yang valid.
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : (
            /* EXPORT TAB */
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-1.5">
                  <span className="ui-text-main text-xs font-semibold">Format Export:</span>
                  <div className="ui-subtle ui-border flex rounded-lg border p-0.5 text-xs">
                    <button
                      type="button"
                      onClick={() => setExportFormat('tsv')}
                      className={`rounded px-2.5 py-1 font-medium transition ${
                        exportFormat === 'tsv'
                          ? 'bg-emerald-600 text-white shadow-xs'
                          : 'ui-text-muted hover:ui-text-main'
                      }`}
                    >
                      Excel / Sheets (TSV)
                    </button>
                    <button
                      type="button"
                      onClick={() => setExportFormat('csv')}
                      className={`rounded px-2.5 py-1 font-medium transition ${
                        exportFormat === 'csv'
                          ? 'bg-emerald-600 text-white shadow-xs'
                          : 'ui-text-muted hover:ui-text-main'
                      }`}
                    >
                      File CSV
                    </button>
                    <button
                      type="button"
                      onClick={() => setExportFormat('summary')}
                      className={`rounded px-2.5 py-1 font-medium transition ${
                        exportFormat === 'summary'
                          ? 'bg-emerald-600 text-white shadow-xs'
                          : 'ui-text-muted hover:ui-text-main'
                      }`}
                    >
                      Ringkasan Catatan
                    </button>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleCopyExport}
                  className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-emerald-700 transition"
                >
                  {copiedExport ? (
                    <>
                      <Check className="h-3.5 w-3.5" />
                      <span>Tersalin ke Clipboard!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="h-3.5 w-3.5" />
                      <span>Salin Semua Teks</span>
                    </>
                  )}
                </button>
              </div>

              <div className="relative">
                <textarea
                  readOnly
                  value={exportText}
                  rows={10}
                  className="ui-subtle ui-border ui-text-main w-full rounded-xl border p-3 font-mono text-[11px] leading-relaxed focus:outline-none"
                  spellCheck={false}
                />
              </div>

              <div className="ui-subtle rounded-xl p-3 text-xs ui-text-muted flex items-start gap-2">
                <HelpCircle className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                <span>
                  <strong>Tip:</strong> Format <em>TSV</em> dapat langsung Anda tempel (Ctrl+V) ke Microsoft Excel atau Google Sheets dan langsung terpisah rapi ke dalam kolom-kolom.
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="ui-border flex items-center justify-between border-t px-5 py-3.5 bg-black/5 dark:bg-white/5">
          <button
            type="button"
            onClick={onClose}
            className="ui-subtle ui-border ui-text-secondary rounded-lg border px-4 py-2 text-xs font-semibold hover:opacity-80"
          >
            Tutup
          </button>

          {activeTab === 'import' && (
            <button
              type="button"
              disabled={validItems.length === 0}
              onClick={handleApply}
              className={`flex items-center gap-1.5 rounded-lg px-4 py-2 text-xs font-bold transition shadow-sm ${
                validItems.length > 0
                  ? strategy === 'replace'
                    ? 'bg-rose-600 hover:bg-rose-700 text-white'
                    : 'bg-emerald-600 hover:bg-emerald-700 text-white'
                  : 'bg-zinc-400/30 text-zinc-400 cursor-not-allowed'
              }`}
            >
              <span>
                {strategy === 'replace'
                  ? `Gantikan Semua (${validItems.length} Aset)`
                  : `Terapkan ke Portofolio (${validItems.length} Aset)`}
              </span>
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          )}

          {activeTab === 'export' && (
            <button
              type="button"
              onClick={handleCopyExport}
              className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-emerald-700 transition"
            >
              <Copy className="h-3.5 w-3.5" />
              <span>{copiedExport ? 'Tersalin!' : 'Salin ke Clipboard'}</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
