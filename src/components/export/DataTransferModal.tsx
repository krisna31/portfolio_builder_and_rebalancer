import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  X,
  Copy,
  Check,
  Download,
  Upload,
  ClipboardPaste,
  FileCode,
  Sparkles,
  AlertCircle,
  CheckCircle2,
  Database,
  ArrowRight,
  ShieldCheck,
  RefreshCw,
} from 'lucide-react';
import { QuantPortoBackupPayload } from '../../lib/quant/types';
import {
  parseBackupPayload,
  serializeBackupPayload,
} from '../../lib/quant/textDataParser';
import { formatIdr } from '../../lib/formatters';

export interface DataTransferModalProps {
  isOpen: boolean;
  onClose: () => void;
  exportPayload: QuantPortoBackupPayload;
  onImportPayload: (
    payload: QuantPortoBackupPayload,
    mode: 'overwrite' | 'merge'
  ) => void;
  onDownloadJsonFile: () => void;
}

export const DataTransferModal: React.FC<DataTransferModalProps> = ({
  isOpen,
  onClose,
  exportPayload,
  onImportPayload,
  onDownloadJsonFile,
}) => {
  const [activeTab, setActiveTab] = useState<'export' | 'import'>('export');
  const [exportFormat, setExportFormat] = useState<'json' | 'base64'>('json');
  const [copiedExport, setCopiedExport] = useState(false);

  // Import state
  const [importText, setImportText] = useState('');
  const [importMode, setImportMode] = useState<'overwrite' | 'merge'>('overwrite');
  const [confirmOverwritePrompt, setConfirmOverwritePrompt] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Auto-generate export text when format changes or modal opens
  const exportText = useMemo(() => {
    try {
      return serializeBackupPayload(exportPayload, exportFormat);
    } catch {
      return '';
    }
  }, [exportPayload, exportFormat]);

  // Live parsing & validation of import text
  const parseResult = useMemo(() => {
    if (!importText.trim()) return null;
    return parseBackupPayload(importText);
  }, [importText]);

  // Reset state when opening/closing
  useEffect(() => {
    if (isOpen) {
      setCopiedExport(false);
      setConfirmOverwritePrompt(false);
    }
  }, [isOpen]);

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

  if (!isOpen) return null;

  const handleCopyExport = async () => {
    try {
      await navigator.clipboard.writeText(exportText);
      setCopiedExport(true);
      setTimeout(() => setCopiedExport(false), 2500);
    } catch (err) {
      console.error('Failed to copy to clipboard', err);
    }
  };

  const handlePasteFromClipboard = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        setImportText(text);
      }
    } catch {
      alert('Tidak dapat mengakses clipboard. Silakan tempel (paste) manual dengan tombol Ctrl+V / Cmd+V.');
    }
  };

  const handleLoadSample = () => {
    const sample = serializeBackupPayload(exportPayload, 'json');
    setImportText(sample);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setImportText(String(reader.result || ''));
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleExecuteImport = () => {
    if (!parseResult?.success || !parseResult.data) return;
    if (importMode === 'overwrite' && !confirmOverwritePrompt) {
      setConfirmOverwritePrompt(true);
      return;
    }
    onImportPayload(parseResult.data, importMode);
    onClose();
  };

  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-200"
    >
      <div className="ui-card ui-border relative flex max-h-[92vh] w-full max-w-2xl flex-col rounded-2xl border shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="ui-border flex items-center justify-between border-b px-5 py-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
              <Database className="h-5 w-5" />
            </div>
            <div>
              <h2 className="ui-text-main text-base font-bold sm:text-lg">
                Transfer & Backup Data Portofolio
              </h2>
              <p className="ui-text-muted text-xs">
                Export & Import konfigurasi via teks langsung (JSON / Token Base64) atau file
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
            onClick={() => setActiveTab('export')}
            className={`flex items-center gap-2 border-b-2 px-3 py-2 text-xs sm:text-sm font-semibold transition ${
              activeTab === 'export'
                ? 'border-emerald-500 text-emerald-600 dark:text-emerald-400'
                : 'border-transparent ui-text-muted hover:ui-text-main'
            }`}
          >
            <Copy className="h-4 w-4" />
            <span>Export Data (Teks / Salin)</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('import')}
            className={`flex items-center gap-2 border-b-2 px-3 py-2 text-xs sm:text-sm font-semibold transition ${
              activeTab === 'import'
                ? 'border-emerald-500 text-emerald-600 dark:text-emerald-400'
                : 'border-transparent ui-text-muted hover:ui-text-main'
            }`}
          >
            <ClipboardPaste className="h-4 w-4" />
            <span>Import Data (Tempel / Pulihkan)</span>
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {activeTab === 'export' ? (
            /* EXPORT TAB */
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-1.5">
                  <span className="ui-text-main text-xs font-semibold">Format Teks:</span>
                  <div className="ui-subtle ui-border flex rounded-lg border p-0.5 text-xs">
                    <button
                      type="button"
                      onClick={() => setExportFormat('json')}
                      className={`rounded px-2.5 py-1 font-medium transition ${
                        exportFormat === 'json'
                          ? 'bg-emerald-600 text-white shadow-xs'
                          : 'ui-text-muted hover:ui-text-main'
                      }`}
                    >
                      JSON (Terstruktur)
                    </button>
                    <button
                      type="button"
                      onClick={() => setExportFormat('base64')}
                      className={`rounded px-2.5 py-1 font-medium transition ${
                        exportFormat === 'base64'
                          ? 'bg-emerald-600 text-white shadow-xs'
                          : 'ui-text-muted hover:ui-text-main'
                      }`}
                    >
                      Token Base64 (Ringkas)
                    </button>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={onDownloadJsonFile}
                    className="ui-subtle ui-border ui-text-secondary flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium hover:opacity-80"
                    title="Unduh sebagai file .json ke komputer"
                  >
                    <Download className="h-3.5 w-3.5" />
                    <span>Download File (.json)</span>
                  </button>

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
                        <span>Salin Seluruh Teks</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Textarea preview */}
              <div className="relative">
                <textarea
                  readOnly
                  value={exportText}
                  rows={11}
                  className="ui-subtle ui-border ui-text-main w-full rounded-xl border p-3 font-mono text-[11px] leading-relaxed focus:outline-none"
                  spellCheck={false}
                />
                <div className="absolute bottom-3 right-3 rounded bg-black/60 px-2 py-0.5 text-[10px] font-mono text-zinc-300 backdrop-blur-xs">
                  {exportText.length.toLocaleString('id-ID')} karakter
                </div>
              </div>

              <div className="ui-subtle rounded-xl p-3 text-xs ui-text-muted flex items-start gap-2">
                <ShieldCheck className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                <span>
                  <strong>Tip Transfer:</strong> Format <em>Token Base64</em> cocok untuk dikirim via WhatsApp atau disimpan di catatan tanpa risiko teks terpotong oleh karakter khusus. Format <em>JSON</em> cocok jika Anda ingin membaca isinya secara detail.
                </span>
              </div>
            </div>
          ) : (
            /* IMPORT TAB */
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <label className="ui-text-main text-xs font-semibold">
                  Tempelkan Teks Backup (JSON atau Token Base64):
                </label>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handlePasteFromClipboard}
                    className="ui-subtle ui-border ui-text-main flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-medium hover:opacity-80"
                  >
                    <ClipboardPaste className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                    <span>Tempel dari Clipboard</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleLoadSample}
                    className="ui-subtle ui-border ui-text-muted hover:ui-text-main flex items-center gap-1 rounded-lg border px-2 py-1 text-xs"
                    title="Muat data konfigurasi saat ini sebagai contoh"
                  >
                    <Sparkles className="h-3 w-3 text-amber-500" />
                    <span>Contoh Format</span>
                  </button>

                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".json"
                    className="hidden"
                    onChange={handleFileUpload}
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="ui-subtle ui-border ui-text-muted hover:ui-text-main flex items-center gap-1 rounded-lg border px-2 py-1 text-xs"
                    title="Pilih file backup dari komputer"
                  >
                    <Upload className="h-3 w-3" />
                    <span>Upload File</span>
                  </button>
                </div>
              </div>

              {/* Textarea for import */}
              <div className="relative">
                <textarea
                  value={importText}
                  onChange={(e) => {
                    setImportText(e.target.value);
                    setConfirmOverwritePrompt(false);
                  }}
                  placeholder="Tempel teks konfigurasi JSON atau kode Token Base64 di sini..."
                  rows={8}
                  className="ui-subtle ui-border ui-text-main w-full rounded-xl border p-3 font-mono text-[11px] leading-relaxed focus:border-emerald-500 focus:outline-none"
                  spellCheck={false}
                />
                {importText && (
                  <button
                    type="button"
                    onClick={() => {
                      setImportText('');
                      setConfirmOverwritePrompt(false);
                    }}
                    className="absolute top-2 right-2 rounded p-1 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
                    title="Kosongkan teks"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>

              {/* Live Validation & Summary Card */}
              {parseResult && (
                <div
                  className={`rounded-xl border p-3.5 text-xs transition ${
                    parseResult.success
                      ? 'border-emerald-500/30 bg-emerald-500/10'
                      : 'border-rose-500/30 bg-rose-500/10'
                  }`}
                >
                  {parseResult.success ? (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                          <span className="font-bold text-emerald-800 dark:text-emerald-300">
                            Format Valid ({parseResult.format.toUpperCase()} — Schema v{parseResult.version})
                          </span>
                        </div>
                        <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 dark:text-emerald-300">
                          Siap Dipulihkan
                        </span>
                      </div>

                      {parseResult.summary && (
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 font-mono text-[11px]">
                          <div className="rounded bg-black/10 dark:bg-white/5 p-2">
                            <div className="ui-text-muted text-[10px]">Aset Builder</div>
                            <div className="font-bold ui-text-main">{parseResult.summary.assetCount} aset aktif</div>
                          </div>
                          <div className="rounded bg-black/10 dark:bg-white/5 p-2">
                            <div className="ui-text-muted text-[10px]">Saldo Holding</div>
                            <div className="font-bold ui-text-main">{parseResult.summary.holdingsCount} aset terisi</div>
                          </div>
                          <div className="rounded bg-black/10 dark:bg-white/5 p-2">
                            <div className="ui-text-muted text-[10px]">Target Kekayaan</div>
                            <div className="font-bold ui-text-main">
                              {parseResult.summary.targetGoalIdr ? formatIdr(parseResult.summary.targetGoalIdr, true) : '-'}
                            </div>
                          </div>
                          <div className="rounded bg-black/10 dark:bg-white/5 p-2">
                            <div className="ui-text-muted text-[10px]">Portofolio Disimpan</div>
                            <div className="font-bold ui-text-main">{parseResult.summary.savedPortfoliosCount} snapshot</div>
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="flex items-start gap-2 text-rose-700 dark:text-rose-400">
                      <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                      <div>
                        <div className="font-bold">Format Tidak Valid</div>
                        <p className="mt-0.5 text-[11px] opacity-90">{parseResult.error}</p>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Strategy Selector (Overwrite vs Merge) */}
              {parseResult?.success && (
                <div className="ui-subtle rounded-xl p-3 space-y-2">
                  <div className="ui-text-main text-xs font-semibold">Strategi Pemulihan:</div>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <button
                      type="button"
                      onClick={() => {
                        setImportMode('overwrite');
                        setConfirmOverwritePrompt(false);
                      }}
                      className={`flex flex-col items-start rounded-lg border p-2.5 transition text-left ${
                        importMode === 'overwrite'
                          ? 'border-emerald-500 bg-emerald-500/10 ui-text-main font-semibold'
                          : 'ui-border ui-text-muted hover:ui-text-main'
                      }`}
                    >
                      <div className="font-bold">Timpa Seluruh Data (Overwrite)</div>
                      <div className="text-[10px] ui-text-muted mt-0.5">
                        Menggantikan seluruh konfigurasi saat ini dengan isi backup.
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setImportMode('merge');
                        setConfirmOverwritePrompt(false);
                      }}
                      className={`flex flex-col items-start rounded-lg border p-2.5 transition text-left ${
                        importMode === 'merge'
                          ? 'border-emerald-500 bg-emerald-500/10 ui-text-main font-semibold'
                          : 'ui-border ui-text-muted hover:ui-text-main'
                      }`}
                    >
                      <div className="font-bold">Gabungkan Data (Smart Merge)</div>
                      <div className="text-[10px] ui-text-muted mt-0.5">
                        Memperbarui aset yang ada dan menambahkan aset baru tanpa menghapus data lain.
                      </div>
                    </button>
                  </div>
                </div>
              )}

              {/* Overwrite Confirmation Alert */}
              {confirmOverwritePrompt && (
                <div className="rounded-xl border border-amber-500/40 bg-amber-500/15 p-3.5 text-xs text-amber-800 dark:text-amber-300 space-y-2">
                  <div className="flex items-center gap-2 font-bold">
                    <AlertCircle className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
                    <span>Konfirmasi: Timpa Seluruh Data Portofolio?</span>
                  </div>
                  <p className="text-[11px] leading-relaxed">
                    Pengaturan portofolio aktif, saldo holding, target kekayaan, dan riwayat rebalance Anda saat ini akan ditimpa dengan data backup ini.
                  </p>
                </div>
              )}
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
              disabled={!parseResult?.success}
              onClick={handleExecuteImport}
              className={`flex items-center gap-1.5 rounded-lg px-4 py-2 text-xs font-bold transition shadow-sm ${
                parseResult?.success
                  ? confirmOverwritePrompt
                    ? 'bg-amber-600 hover:bg-amber-700 text-white animate-pulse'
                    : 'bg-emerald-600 hover:bg-emerald-700 text-white'
                  : 'bg-zinc-400/30 text-zinc-400 cursor-not-allowed'
              }`}
            >
              <span>
                {confirmOverwritePrompt
                  ? 'Ya, Timpa & Pulihkan Sekarang'
                  : 'Terapkan & Pulihkan Data'}
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
