import React from 'react';
import { AlertTriangle, RotateCcw, X, ShieldAlert } from 'lucide-react';

export interface ResetConfirmationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirmReset: () => void;
}

export const ResetConfirmationModal: React.FC<ResetConfirmationModalProps> = ({
  isOpen,
  onClose,
  onConfirmReset,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-md ui-card border ui-border rounded-xl shadow-lg overflow-hidden ui-text-main">
        {/* Header with warning accent */}
        <div className="flex items-center justify-between p-4 border-b ui-border bg-rose-500/10">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-rose-500/20 text-rose-500 border border-rose-500/30 flex items-center justify-center">
              <AlertTriangle className="w-4 h-4 text-rose-500" />
            </div>
            <div>
              <h2 className="text-sm font-semibold ui-text-main">
                Reset Semua ke Kondisi Awal?
              </h2>
              <p className="text-xs ui-text-muted">
                Kembali ke setelan awal (seperti pertama kali membuka aplikasi)
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 ui-text-muted hover:ui-text-main hover:ui-subtle rounded-md transition-colors"
            aria-label="Tutup dialog"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body content */}
        <div className="p-5 space-y-4 text-xs">
          <p className="ui-text-secondary leading-relaxed">
            Tindakan ini akan menghapus seluruh data kustom yang tersimpan di browser Anda dan mengembalikan konfigurasi QuantPorto ke awal:
          </p>

          <div className="p-3 rounded-lg ui-subtle border ui-border space-y-2 ui-text-muted">
            <div className="flex items-start gap-2">
              <span className="text-rose-500 font-bold">•</span>
              <span>
                <strong className="ui-text-main">Portofolio Aktif:</strong> Kembali ke preset default <em>Optimal 4: Risk Budgeting BTC 90%</em>.
              </span>
            </div>
            <div className="flex items-start gap-2">
              <span className="text-rose-500 font-bold">•</span>
              <span>
                <strong className="ui-text-main">Asumsi Keuangan:</strong> Modal awal Rp 100 Jt, Target Rp 10 Miliar, DCA Rp 5 Jt/bln, Kurs USD Rp 18.000.
              </span>
            </div>
            <div className="flex items-start gap-2">
              <span className="text-rose-500 font-bold">•</span>
              <span>
                <strong className="ui-text-main">Hapus Simpanan:</strong> Seluruh daftar portofolio tersimpan di perangkat ini akan dibersihkan.
              </span>
            </div>
            <div className="flex items-start gap-2">
              <span className="text-rose-500 font-bold">•</span>
              <span>
                <strong className="ui-text-main">Hapus Riwayat:</strong> Jurnal transaksi rebalancing, slot aset swap kustom, dan baris tabel yang dipin akan di-reset.
              </span>
            </div>
          </div>

          <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-700 dark:text-amber-300 flex items-center gap-2 text-[11px]">
            <ShieldAlert className="w-4 h-4 shrink-0 text-amber-500" />
            <span>
              Tindakan ini tidak dapat dibatalkan setelah dieksekusi.
            </span>
          </div>
        </div>

        {/* Actions Footer */}
        <div className="p-3.5 ui-subtle border-t ui-border flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-3.5 py-1.5 text-xs font-medium ui-text-secondary hover:ui-text-main ui-card hover:ui-subtle rounded-lg transition-colors border ui-border"
          >
            Batal
          </button>

          <button
            type="button"
            onClick={onConfirmReset}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-white bg-rose-600 hover:bg-rose-500 rounded-lg transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Ya, Reset Semua Data</span>
          </button>
        </div>
      </div>
    </div>
  );
};
