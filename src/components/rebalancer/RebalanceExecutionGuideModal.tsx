import React, { useState, useEffect } from 'react';
import {
  X,
  HelpCircle,
  Coins,
  Scale,
  TrendingDown,
  ArrowRight,
  CheckCircle2,
  AlertTriangle,
  Lightbulb,
  Building2,
  FileSpreadsheet,
  ArrowUpRight,
  ShieldCheck,
  Calendar,
  Layers,
  Lock,
} from 'lucide-react';
import { formatIdr } from '../../lib/formatters';

export interface RebalanceExecutionGuideModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialCapitalMenu1Idr: number;
  activePortfolioName?: string;
  onSetupInitialBuy: () => void;
  onOpenOrderSlip?: () => void;
  onOpenTextImport?: () => void;
}

type GuideTab = 'initial-buy' | 'routine-rebalance' | 'crash-ladder';

export const RebalanceExecutionGuideModal: React.FC<
  RebalanceExecutionGuideModalProps
> = ({
  isOpen,
  onClose,
  initialCapitalMenu1Idr,
  activePortfolioName = 'Portofolio Aktif',
  onSetupInitialBuy,
  onOpenOrderSlip,
  onOpenTextImport,
}) => {
  const [activeTab, setActiveTab] = useState<GuideTab>('initial-buy');

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

  const handleActionSetupInitialBuy = () => {
    onSetupInitialBuy();
    onClose();
  };

  const handleActionOpenOrderSlip = () => {
    onClose();
    onOpenOrderSlip?.();
  };

  const handleActionOpenTextImport = () => {
    onClose();
    onOpenTextImport?.();
  };

  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 md:p-6 bg-black/75 backdrop-blur-sm animate-in fade-in duration-200"
      role="dialog"
      aria-modal="true"
      aria-labelledby="guide-modal-title"
    >
      <div className="relative w-full max-w-3xl max-h-[90vh] flex flex-col rounded-xl border ui-border ui-card ui-text-main shadow-lg overflow-hidden">
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b ui-border px-5 py-3.5 ui-subtle shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
              <Lightbulb className="h-5 w-5" />
            </div>
            <div>
              <h2
                id="guide-modal-title"
                className="text-base sm:text-lg font-bold text-white flex items-center gap-2"
              >
                <span>Buku Panduan & SOP Eksekusi Rebalancer</span>
              </h2>
              <p className="text-xs ui-text-muted">
                Panduan praktis berstandar kuantitatif untuk belanja perdana maupun rebalancing berkala.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 ui-text-muted hover:ui-subtle hover:ui-text-main transition"
            aria-label="Tutup panduan"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Tab Switcher */}
        <div className="flex border-b ui-border ui-subtle px-5 pt-2 gap-1.5 shrink-0 overflow-x-auto">
          <button
            type="button"
            onClick={() => setActiveTab('initial-buy')}
            className={`flex items-center gap-2 px-3.5 py-2.5 text-xs font-semibold rounded-t-lg transition border-b-2 -mb-px whitespace-nowrap ${
              activeTab === 'initial-buy' ? 'border-emerald-500 ui-card text-emerald-600 dark:text-emerald-400' : 'border-transparent ui-text-muted hover:ui-text-main hover:ui-subtle'
            }`}
          >
            <Coins className="h-4 w-4" />
            <span>1. Investasi Perdana (Mulai Rp 0)</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('routine-rebalance')}
            className={`flex items-center gap-2 px-3.5 py-2.5 text-xs font-semibold rounded-t-lg transition border-b-2 -mb-px whitespace-nowrap ${
              activeTab === 'routine-rebalance' ? 'border-emerald-500 ui-card text-emerald-600 dark:text-emerald-400' : 'border-transparent ui-text-muted hover:ui-text-main hover:ui-subtle'
            }`}
          >
            <Scale className="h-4 w-4" />
            <span>2. Rebalancing Rutin Portofolio</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('crash-ladder')}
            className={`flex items-center gap-2 px-3.5 py-2.5 text-xs font-semibold rounded-t-lg transition border-b-2 -mb-px whitespace-nowrap ${
              activeTab === 'crash-ladder' ? 'border-emerald-500 ui-card text-emerald-600 dark:text-emerald-400' : 'border-transparent ui-text-muted hover:ui-text-main hover:ui-subtle'
            }`}
          >
            <TrendingDown className="h-4 w-4" />
            <span>3. Jaring Serok Krisis (Buy the Dip)</span>
          </button>
        </div>

        {/* Modal Scrollable Body */}
        <div className="p-5 sm:p-6 overflow-y-auto space-y-5 text-sm ui-text-secondary leading-relaxed">
          {/* TAB 1: INVESTASI PERDANA */}
          {activeTab === 'initial-buy' && (
            <div className="space-y-5 animate-in fade-in duration-150">
              <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4">
                <div className="flex items-start gap-3">
                  <Coins className="h-5 w-5 text-emerald-400 shrink-0 mt-0.5" />
                  <div>
                    <h3 className="text-sm font-bold text-emerald-300">
                      Baru Mau Mulai Belanja Aset dari Kas Rp 0?
                    </h3>
                    <p className="text-xs ui-text-secondary mt-1">
                      Menu Rebalancer tidak hanya untuk investor lama. Jika Anda baru mulai dari nol,
                      sistem akan menyusun <strong>daftar belanja perdana yang presisi</strong> sesuai bobot
                      target racikan <strong className="text-white">{activePortfolioName}</strong> dengan modal{' '}
                      <strong className="text-white">{formatIdr(initialCapitalMenu1Idr)}</strong>.
                    </p>
                  </div>
                </div>
              </div>

              {/* 4 Steps Timeline */}
              <div className="space-y-4">
                <h4 className="text-xs font-bold uppercase tracking-wider ui-text-muted">
                  Langkah-Langkah Eksekusi Beli Perdana:
                </h4>

                <div className="grid gap-3.5 sm:grid-cols-2">
                  {/* Step 1 */}
                  <div className="rounded-xl border ui-border ui-subtle p-4 space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-400 font-mono text-xs font-bold">
                        1
                      </span>
                      <h5 className="font-semibold text-white text-xs">
                        Tentukan Bobot & Modal di Menu 1
                      </h5>
                    </div>
                    <p className="text-xs ui-text-muted">
                      Pastikan Anda sudah memilih racikan portofolio yang disukai di Menu 1 (Builder)
                      dan mengisi kolom Modal Awal.
                    </p>
                  </div>

                  {/* Step 2 */}
                  <div className="rounded-xl border ui-border ui-subtle p-4 space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-400 font-mono text-xs font-bold">
                        2
                      </span>
                      <h5 className="font-semibold text-white text-xs">
                        Klik Tombol "Beli Perdana dari Rp 0"
                      </h5>
                    </div>
                    <p className="text-xs ui-text-muted">
                      Sistem mengosongkan seluruh aset ke Rp 0, mengalirkan modal awal sebagai Kas Baru,
                      dan mengaktifkan mode <strong>Beli Saja (DCA)</strong> tanpa instruksi jual.
                    </p>
                  </div>

                  {/* Step 3 */}
                  <div className="rounded-xl border ui-border ui-subtle p-4 space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-400 font-mono text-xs font-bold">
                        3
                      </span>
                      <h5 className="font-semibold text-white text-xs">
                        Pembulatan Otomatis Lot Saham BEI
                      </h5>
                    </div>
                    <p className="text-xs ui-text-muted">
                      Saham Indonesia otomatis dibulatkan ke kelipatan <strong>100 Lembar (1 Lot)</strong>.
                      Sisa kembalian pecahan lot dialihkan ke Pasar Uang/RDPT agar tidak ada dana mengendap.
                    </p>
                  </div>

                  {/* Step 4 */}
                  <div className="rounded-xl border ui-border ui-subtle p-4 space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-400 font-mono text-xs font-bold">
                        4
                      </span>
                      <h5 className="font-semibold text-white text-xs">
                        Buka Slip Order Broker & Belanja
                      </h5>
                    </div>
                    <p className="text-xs ui-text-muted">
                      Gunakan fitur <strong>Slip Order Broker</strong> untuk checklist belanja per aplikasi
                      (Ajaib, Stockbit, Pluang, Indodax, dll) yang siap dicentang saat order.
                    </p>
                  </div>
                </div>

                {/* Pro Tip: Staged Buying & Auto-Subtract */}
                <div className="rounded-xl border border-sky-500/30 bg-sky-500/10 p-4 space-y-1.5 mt-3">
                  <div className="flex items-center gap-2 text-sky-400 font-semibold text-xs">
                    <Lock className="h-4 w-4 shrink-0" />
                    <span>💡 Tips Beli Bertahap &amp; Auto-Subtract Sisa Kas:</span>
                  </div>
                  <p className="text-xs ui-text-secondary leading-relaxed">
                    Jika Anda membeli aset secara bertahap (misal hari ini baru mengeksekusi{' '}
                    <strong className="text-white">RDPT Rp 9 Juta</strong> dari total anggaran{' '}
                    <strong className="text-white">Rp 25 Juta</strong>), sistem QuantPorto otomatis mengaktifkan fitur{' '}
                    <strong className="text-emerald-400">🔒 Kunci Total Anggaran</strong>.
                  </p>
                  <p className="text-xs ui-text-muted leading-relaxed">
                    Begitu saldo RDPT Anda isi, sisa Kas Baru akan <strong>otomatis terpotong menjadi Rp 16 Juta</strong>,
                    sehingga rekomendasi pembelian untuk aset lain (BBCA, Emas, Saham AS, Kripto) dihitung pas dari sisa uang Anda tanpa risiko <em>overbudget</em>!
                  </p>
                </div>
              </div>

              {/* Action Buttons in Modal */}
              <div className="pt-2 flex flex-col sm:flex-row items-center gap-2.5">
                <button
                  type="button"
                  onClick={handleActionSetupInitialBuy}
                  className="w-full sm:w-auto flex-1 flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs py-2.5 px-4 rounded-xl shadow-lg transition"
                >
                  <ArrowUpRight className="h-4 w-4" />
                  <span>
                    Siapkan Beli Perdana Sekarang ({formatIdr(initialCapitalMenu1Idr, true)})
                  </span>
                </button>

                {onOpenOrderSlip && (
                  <button
                    type="button"
                    onClick={handleActionOpenOrderSlip}
                    className="w-full sm:w-auto flex items-center justify-center gap-1.5 border ui-border ui-card hover:ui-subtle ui-text-main font-semibold text-xs py-2.5 px-4 rounded-xl transition"
                  >
                    <Building2 className="h-4 w-4 text-sky-400" />
                    <span>Buka Slip Order Broker</span>
                  </button>
                )}
              </div>
            </div>
          )}

          {/* TAB 2: REBALANCING RUTIN */}
          {activeTab === 'routine-rebalance' && (
            <div className="space-y-5 animate-in fade-in duration-150">
              {/* Concept Banner */}
              <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4">
                <div className="flex items-start gap-3">
                  <Scale className="h-5 w-5 text-amber-400 shrink-0 mt-0.5" />
                  <div>
                    <h3 className="text-sm font-bold text-amber-300">
                      Prinsip Kuantitatif: Kapan Anda Harus Rebalance?
                    </h3>
                    <p className="text-xs ui-text-secondary mt-1">
                      <strong>Jangan rebalance setiap hari atau setiap minggu!</strong> Transaksi terlalu sering
                      hanya menghabiskan biaya broker dan pajak. Rebalancing ideal dilakukan ketika:
                    </p>
                    <ul className="list-disc list-inside text-xs ui-text-secondary mt-1.5 space-y-1">
                      <li>
                        <strong>Aturan 5% Drift Band:</strong> Ada aset yang bobotnya menyimpang &gt; 5% dari target.
                      </li>
                      <li>
                        <strong>Jadwal Kuartalan / Semesteran:</strong> Evaluasi berkala setiap 3 atau 6 bulan sekali.
                      </li>
                      <li>
                        <strong>Injeksi Kas Gaji / Bonus:</strong> Menggunakan dana segar bulanan untuk menyeimbangkan aset tanpa harus menjual.
                      </li>
                    </ul>
                  </div>
                </div>
              </div>

              {/* Step by step guide */}
              <div className="space-y-3.5">
                <h4 className="text-xs font-bold uppercase tracking-wider ui-text-muted">
                  Langkah-Langkah Rebalancing Berkala:
                </h4>

                <div className="space-y-3">
                  <div className="rounded-xl border ui-border ui-subtle p-3.5 flex items-start gap-3">
                    <span className="flex h-6 w-6 items-center justify-center rounded-full ui-card text-emerald-400 font-mono text-xs font-bold shrink-0 mt-0.5">
                      1
                    </span>
                    <div className="space-y-1">
                      <h5 className="font-semibold text-white text-xs">
                        Sinkronkan Harga Pasar Terkini
                      </h5>
                      <p className="text-xs ui-text-muted">
                        Klik tombol <strong>Sync Harga Pasar Live</strong> di Header untuk memperbarui harga saham,
                        obligasi, emas, ETF AS, dan kripto hari ini.
                      </p>
                    </div>
                  </div>

                  <div className="rounded-xl border ui-border ui-subtle p-3.5 flex items-start gap-3">
                    <span className="flex h-6 w-6 items-center justify-center rounded-full ui-card text-emerald-400 font-mono text-xs font-bold shrink-0 mt-0.5">
                      2
                    </span>
                    <div className="space-y-1">
                      <h5 className="font-semibold text-white text-xs">
                        Ketik Saldo Terkini atau Import dari Excel
                      </h5>
                      <p className="text-xs ui-text-muted">
                        Masukkan nominal saldo nyata yang ada di sekuritas/aplikasi Anda. Jika malas mengetik satu per satu,
                        gunakan tombol <strong>Import / Export Teks (Excel)</strong> untuk *copy-paste* langsung.
                      </p>
                    </div>
                  </div>

                  <div className="rounded-xl border ui-border ui-subtle p-3.5 flex items-start gap-3">
                    <span className="flex h-6 w-6 items-center justify-center rounded-full ui-card text-emerald-400 font-mono text-xs font-bold shrink-0 mt-0.5">
                      3
                    </span>
                    <div className="space-y-1">
                      <h5 className="font-semibold text-white text-xs">
                        Pilih 1 dari 4 Strategi Rebalance
                      </h5>
                      <div className="grid sm:grid-cols-2 gap-2 pt-1 text-[11px]">
                        <div className="p-2 rounded ui-card border ui-border">
                          <strong className="text-emerald-400">🎯 Jual Untung Saja:</strong> Hanya memangkas aset yang benar-benar untung/naik tinggi.
                        </div>
                        <div className="p-2 rounded ui-card border ui-border">
                          <strong className="text-sky-400">🛡️ Prioritas RDPT Dulu:</strong> Jual kas/obligasi dulu sebelum menyentuh aset volatil.
                        </div>
                        <div className="p-2 rounded ui-card border ui-border">
                          <strong className="text-amber-400">⚖️ Jual Rata:</strong> Menjual proporsional semua aset yang kegemukan.
                        </div>
                        <div className="p-2 rounded ui-card border ui-border">
                          <strong className="text-indigo-400">💰 DCA Beli Saja:</strong> Menyeimbangkan hanya dengan modal baru (tanpa jual & bebas pajak).
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-xl border ui-border ui-subtle p-3.5 flex items-start gap-3">
                    <span className="flex h-6 w-6 items-center justify-center rounded-full ui-card text-emerald-400 font-mono text-xs font-bold shrink-0 mt-0.5">
                      4
                    </span>
                    <div className="space-y-1">
                      <h5 className="font-semibold text-white text-xs">
                        Eksekusi Order & Catat ke Jurnal
                      </h5>
                      <p className="text-xs ui-text-muted">
                        Setelah melakukan pembelian/penjualan di broker, klik{' '}
                        <strong>Terapkan & Catat ke Jurnal</strong> agar riwayat audit rebalancing Anda tercatat permanen.
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Shortcut buttons */}
              {onOpenTextImport && (
                <div className="pt-2">
                  <button
                    type="button"
                    onClick={handleActionOpenTextImport}
                    className="flex items-center gap-1.5 border border-emerald-500/40 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 font-semibold text-xs py-2 px-3.5 rounded-lg transition"
                  >
                    <FileSpreadsheet className="h-4 w-4" />
                    <span>Buka Import / Export Teks (Excel)</span>
                  </button>
                </div>
              )}
            </div>
          )}

          {/* TAB 3: CRASH ORDER LADDER */}
          {activeTab === 'crash-ladder' && (
            <div className="space-y-5 animate-in fade-in duration-150">
              <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-4">
                <div className="flex items-start gap-3">
                  <TrendingDown className="h-5 w-5 text-rose-400 shrink-0 mt-0.5" />
                  <div>
                    <h3 className="text-sm font-bold text-rose-300">
                      Disiplin Serok Krisis: Pasang Jaring Sebelum Kepanikan Datang
                    </h3>
                    <p className="text-xs ui-text-secondary mt-1">
                      Di video edukasi Leon Hartono & Sander, rahasia imbal hasil kuantitatif yang mengalahkan pasar
                      bukanlah menebak kapan krisis terjadi, melainkan <strong>memasang limit order bertingkat sebelumnya</strong>.
                    </p>
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                <h4 className="text-xs font-bold uppercase tracking-wider ui-text-muted">
                  Tingkatan Jaring Beli Bertingkat:
                </h4>

                <div className="grid gap-2.5 sm:grid-cols-2">
                  <div className="rounded-xl border ui-border ui-subtle p-3.5 space-y-1">
                    <span className="text-[11px] font-mono font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded">
                      Level 1: Diskon -10%
                    </span>
                    <h5 className="font-semibold text-white text-xs mt-1">
                      Koreksi Normal Pasar
                    </h5>
                    <p className="text-xs ui-text-muted">
                      Pasang jaring beli pertama untuk menambah aset volatil saat pasar tertekan ringan.
                    </p>
                  </div>

                  <div className="rounded-xl border ui-border ui-subtle p-3.5 space-y-1">
                    <span className="text-[11px] font-mono font-bold text-sky-400 bg-sky-500/10 px-2 py-0.5 rounded">
                      Level 2: Diskon -20%
                    </span>
                    <h5 className="font-semibold text-white text-xs mt-1">
                      Batas Resmi Bear Market
                    </h5>
                    <p className="text-xs ui-text-muted">
                      Aset diskon besar. Eksekusi alokasi serok kedua secara proporsional.
                    </p>
                  </div>

                  <div className="rounded-xl border ui-border ui-subtle p-3.5 space-y-1">
                    <span className="text-[11px] font-mono font-bold text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded">
                      Level 3: Diskon -35%
                    </span>
                    <h5 className="font-semibold text-white text-xs mt-1">
                      Panic Selling / Geopolitik
                    </h5>
                    <p className="text-xs ui-text-muted">
                      Banyak retail kapok dan menjual rugi. Saat inilah kuantitatif menyerap barang murah.
                    </p>
                  </div>

                  <div className="rounded-xl border ui-border ui-subtle p-3.5 space-y-1">
                    <span className="text-[11px] font-mono font-bold text-rose-400 bg-rose-500/10 px-2 py-0.5 rounded">
                      Level 4: Diskon -50%
                    </span>
                    <h5 className="font-semibold text-white text-xs mt-1">
                      Krisis Finansial Global
                    </h5>
                    <p className="text-xs ui-text-muted">
                      Momen langka 5-10 tahunan. Eksekusi sisa kas cadangan di harga dasar.
                    </p>
                  </div>
                </div>
              </div>

              <div className="rounded-xl border ui-border ui-subtle p-4 text-xs ui-text-muted">
                <p>
                  👉 <strong>Cara Pakai di Menu Ini:</strong> Gulir ke bagian bawah tabel Rebalancer ke kartu{' '}
                  <strong className="ui-text-main">Jaring Beli Bertahap (Crash Limit Order Ladder)</strong>.
                  Pilih aset yang ingin Anda pantau (misal BBCA, BTC, atau SPY) untuk melihat harga rupiah limit order
                  dan modal cadangan yang harus disiapkan.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-between border-t ui-border px-5 py-3.5 ui-subtle shrink-0">
          <div className="flex items-center gap-1.5 text-xs ui-text-muted">
            <ShieldCheck className="h-4 w-4 text-emerald-500" />
            <span>QuantPorto Discipline Guide</span>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-lg ui-card hover:ui-subtle ui-text-main border ui-border px-3.5 py-1.5 text-xs font-medium transition"
          >
            Mengerti, Tutup Panduan
          </button>
        </div>
      </div>
    </div>
  );
};
