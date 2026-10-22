import { driver, DriveStep } from 'driver.js';
import 'driver.js/dist/driver.css';

export interface TourGuideOptions {
  onTabSwitch?: (tab: 'builder' | 'rebalancer' | 'roadmap') => void;
  onComplete?: () => void;
}

export function startInteractiveTour(options?: TourGuideOptions) {
  // Ensure we start on the Builder tab for steps 1-6
  if (options?.onTabSwitch) {
    options.onTabSwitch('builder');
  }

  const steps: DriveStep[] = [
    {
      element: '#tour-nav-tabs',
      popover: {
        title: '🧭 1. Navigasi 3 Modul Utama',
        description:
          'QuantPorto memiliki 3 menu utama: <strong>1. Builder</strong> (meracik portfolio & riset aset), <strong>2. Rebalancer</strong> (eksekusi order jual/beli, pembulatan Lot BEI, & jaring crash), serta <strong>3. Simulator</strong> (compounding target Rp 10M & kebebasan finansial).',
        side: 'bottom',
        align: 'center',
      },
    },
    {
      element: '#tour-tanya-quant',
      popover: {
        title: '🤖 2. Tanya Quant (Kuis Rekomendasi Cerdas)',
        description:
          'Bingung menentukan pilihan? Klik tombol <strong>Tanya Quant</strong> untuk menjawab 4 pertanyaan profil risiko singkat. Algoritma akan merekomendasikan strategi terbaik yang sesuai gaya investasi Anda.',
        side: 'bottom',
        align: 'end',
      },
    },
    {
      element: '#tour-tools-menu',
      popover: {
        title: '⚙️ 3. Menu Alat, Kurs USD, & Simpan',
        description:
          'Pusat pengaturan ringkas: atur asumsi <strong>Kurs USD (Rp 18.000)</strong>, aktifkan <strong>Promo RDPT +3%</strong>, sinkronkan harga live market, simpan snapshot portofolio, dan buat tautan <strong>Share Link</strong> lengkap.',
        side: 'bottom',
        align: 'end',
      },
    },
    {
      element: '#tour-table-section',
      popover: {
        title: '📊 4. Tabel 15 Portfolio Optimal Pareto',
        description:
          'Daftar 15 portfolio terefisien (return tertinggi pada tingkat drawdown yang sama). Anda dapat mengganti instrumen di header kolom (contoh: <strong>BBCA ➔ PTBA</strong>) untuk menghitung ulang seluruh baris secara otomatis!',
        side: 'top',
        align: 'center',
      },
    },
    {
      element: '#tour-table-pin',
      popover: {
        title: '📌 5. Pin / Bookmark Baris Favorit',
        description:
          'Klik ikon <strong>Pin 📌</strong> di samping nama strategi untuk menyematkan baris pilihan Anda ke posisi teratas tabel. Baris tersemat akan selalu melayang di urutan paling atas untuk memudahkan perbandingan.',
        side: 'right',
        align: 'start',
      },
    },
    {
      element: '#tour-quick-dca',
      popover: {
        title: '💰 6. Kalkulator Compounding & DCA Bulanan',
        description:
          'Ketik modal awal Anda saat ini dan nilai investasi rutin (DCA). Grafik dan kartu estimasi akan langsung memperlihatkan berapa tahun dibutuhkan untuk mencapai <strong>Rp 1 Miliar hingga Rp 10 Miliar Pertama</strong>!',
        side: 'top',
        align: 'start',
      },
    },
  ];

  const driverObj = driver({
    showProgress: true,
    animate: true,
    overlayOpacity: 0.78,
    smoothScroll: true,
    stagePadding: 6,
    stageRadius: 10,
    allowClose: true,
    nextBtnText: 'Lanjut ➔',
    prevBtnText: '⬅ Kembali',
    doneBtnText: 'Selesai & Mulai Eksplorasi 🎉',
    progressText: 'Langkah {{current}} dari {{total}}',
    steps,
    onDestroyStarted: () => {
      driverObj.destroy();
      if (options?.onComplete) options.onComplete();
    },
  });

  driverObj.drive();
}
