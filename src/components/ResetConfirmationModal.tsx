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
      <div className="relative w-full max-w-md bg-slate-950 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden text-slate-100">
        {/* Header with warning accent */}
        <div className="flex items-center justify-between p-5 border-b border-slate-800 bg-rose-950/20">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-rose-500/20 text-rose-400 border border-rose-500/30 flex items-center justify-center">
              <AlertTriangle className="w-5 h-5 text-rose-400" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">
                Reset Semua ke Kondisi Awal?
              </h2>
              <p className="text-xs text-rose-300/80">
                Kembali ke setelan pabrik (seperti pertama kali buka)
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg transition-colors hover:bg-slate-800"
            aria-label="Tutup dialog"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body content */}
        <div className="p-6 space-y-4 text-xs">
          <p className="text-slate-300 leading-relaxed">
            Tindakan ini akan menghapus seluruh data kustom yang tersimpan di browser Anda dan mengembalikan konfigurasi QuantPorto ke awal:
          </p>

          <div className="p-3.5 rounded-xl bg-slate-900 border border-slate-800 space-y-2 text-slate-300">
            <div className="flex items-start gap-2">
              <span className="text-rose-400 font-bold">•</span>
              <span>
                <strong>Portofolio Aktif:</strong> Kembali ke preset default <em>Optimal 4: Risk Budgeting BTC 90%</em>.
              </span>
            </div>
            <div className="flex items-start gap-2">
              <span className="text-rose-400 font-bold">•</span>
              <span>
                <strong>Asumsi Keuangan:</strong> Modal awal Rp 100 Jt, Target Rp 10 Miliar, DCA Rp 5 Jt/bln, Kurs USD Rp 18.000.
              </span>
            </div>
            <div className="flex items-start gap-2">
              <span className="text-rose-400 font-bold">•</span>
              <span>
                <strong>Hapus Simpanan:</strong> Seluruh daftar portofolio tersimpan di perangkat ini akan dibersihkan.
              </span>
            </div>
            <div className="flex items-start gap-2">
              <span className="text-rose-400 font-bold">•</span>
              <span>
                <strong>Hapus Riwayat:</strong> Jurnal transaksi rebalancing, slot aset swap kustom, dan baris tabel yang dipin akan di-reset.
              </span>
            </div>
          </div>

          <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-300 flex items-center gap-2 text-[11px]">
            <ShieldAlert className="w-4 h-4 shrink-0 text-amber-400" />
            <span>
              Tindakan ini tidak dapat dibatalkan setelah dieksekusi.
            </span>
          </div>
        </div>

        {/* Actions Footer */}
        <div className="p-4 bg-slate-900/90 border-t border-slate-800 flex items-center justify-end gap-2.5">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-medium text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-lg transition-colors border border-slate-700"
          >
            Batal
          </button>

          <button
            type="button"
            onClick={onConfirmReset}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-rose-600 hover:bg-rose-500 rounded-lg transition-all shadow-sm shadow-rose-600/30 active:scale-95"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Ya, Reset Semua Data</span>
          </button>
        </div>
      </div>
    </div>
  );
};
