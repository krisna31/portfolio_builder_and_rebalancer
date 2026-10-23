import { driver, DriveStep } from 'driver.js';
import 'driver.js/dist/driver.css';

export interface TourGuideOptions {
  onTabSwitch?: (tab: 'builder' | 'rebalancer' | 'roadmap') => void;
  onComplete?: () => void;
  startStepIndex?: number;
}

let activeDriverInstance: ReturnType<typeof driver> | null = null;

export function stopInteractiveTour() {
  if (activeDriverInstance) {
    try {
      activeDriverInstance.destroy();
    } catch {
      // Ignore
    }
    activeDriverInstance = null;
  }
}

export function startInteractiveTour(options?: TourGuideOptions) {
  stopInteractiveTour();
  let activeTourTab: 'builder' | 'rebalancer' | 'roadmap' = 'builder';

  // Ensure we start on the Builder tab initially
  if (options?.onTabSwitch) {
    options.onTabSwitch('builder');
  }

  const rawSteps: DriveStep[] = [
    // ==========================================
    // BAB 1: ARSITEKTUR UTAMA & NAVIGASI HEADER
    // ==========================================
    {
      element: '#tour-nav-tabs',
      data: { tab: 'builder' },
      popover: {
        title: '🧭 1. Arsitektur 3 Modul QuantPorto',
        description: `
          QuantPorto adalah platform kuantitatif terpadu untuk membangun dan menjaga kekayaan jangka panjang (reverse-engineered dari video edukasi Leon Hartono & Sander).
          <br/><br/>
          Sistem ini terbagi dalam <strong>3 modul kerja berkesinambungan:</strong>
          <ul style="margin-top: 6px; padding-left: 18px; list-style-type: disc;">
            <li><strong>1. Builder:</strong> Riset alokasi, simulasi 15 portofolio Pareto, & solver risiko.</li>
            <li><strong>2. Rebalancer:</strong> Eksekusi order disiplin, pembulatan Lot BEI, & jaring serok krisis.</li>
            <li><strong>3. Simulator:</strong> Peta jalan compounding menuju Rp 10 Miliar & dana pensiun.</li>
          </ul>
        `,
        side: 'bottom',
        align: 'center',
      },
    },
    {
      element: '#tour-tanya-quant',
      data: { tab: 'builder' },
      popover: {
        title: '🤖 2. Tanya Quant (Kuis Rekomendasi Cerdas)',
        description: `
          Bingung memilih strategi mana yang paling tepat untuk situasi finansial Anda?
          <br/><br/>
          Klik tombol <strong>Tanya Quant</strong> untuk menjawab 4 pertanyaan profil risiko singkat. Algoritma akan langsung menganalisis toleransi kejatuhan (*drawdown*) dan merekomendasikan racikan terbaik dari 15 portofolio optimal.
        `,
        side: 'bottom',
        align: 'end',
      },
    },
    {
      element: '#tour-tools-menu',
      data: { tab: 'builder' },
      popover: {
        title: '⚙️ 3. Pengaturan Pasar, Kurs USD & Cloud Sync',
        description: `
          Pusat kendali parameter eksternal:
          <ul style="margin-top: 6px; padding-left: 18px; list-style-type: disc;">
            <li><strong>Kurs USD/IDR:</strong> Atur asumsi nilai tukar rupiah (default Rp 16.500).</li>
            <li><strong>Promo RDPT +3%:</strong> Aktifkan simulasi promo kupon reksa dana.</li>
            <li><strong>Sync Harga Live:</strong> Ambil harga terkini saham BEI, ETF AS via Yahoo Finance, & kripto via CoinGecko.</li>
            <li><strong>Simpan &amp; Share:</strong> Simpan racikan ke browser atau bagikan via tautan URL.</li>
          </ul>
        `,
        side: 'bottom',
        align: 'end',
      },
    },

    // ==========================================
    // BAB 2: MENU 1 - BUILDER & QUANT SOLVER
    // ==========================================
    {
      element: '#tour-quick-dca',
      data: { tab: 'builder' },
      popover: {
        title: '💰 4. Target Modal Awal & Compounding DCA',
        description: `
          Langkah pertama: ketikkan modal awal investasi Anda dan komitmen tabungan rutin bulanan (*Dollar-Cost Averaging*).
          <br/><br/>
          Kalkulator ini seketika menghitung proyeksi berapa tahun yang dibutuhkan untuk menembus milestone <strong>Rp 100 Juta, Rp 1 Miliar, hingga Rp 10 Miliar Pertama</strong>.
        `,
        side: 'top',
        align: 'start',
      },
    },
    {
      element: '#tour-table-section',
      data: { tab: 'builder' },
      popover: {
        title: '📊 5. Tabel 15 Portofolio Optimal Pareto',
        description: `
          Daftar 15 racikan portofolio paling efisien secara matematis (memberikan return majemuk tertinggi pada batas penurunan risiko tertentu).
          <br/><br/>
          💡 <strong>Fitur Kustomisasi Slot:</strong> Anda dapat mengganti benchmark di header kolom (misal: <em>BBCA ➔ PTBA atau AADI</em>) dan ke-15 baris otomatis dihitung ulang secara real-time!
        `,
        side: 'top',
        align: 'center',
      },
    },
    {
      element: '#tour-table-pin',
      data: { tab: 'builder' },
      popover: {
        title: '📌 6. Pinning / Sematkan Baris Favorit',
        description: `
          Tertarik dengan strategi tertentu? Klik ikon <strong>Pin 📌</strong> di samping nama portofolio untuk menyematkannya di bagian paling atas tabel.
          <br/><br/>
          Baris yang di-pin akan tetap melayang di urutan teratas sehingga memudahkan Anda membandingkan racikan aktif Anda terhadap benchmark.
        `,
        side: 'right',
        align: 'start',
      },
    },
    {
      element: '#tour-builder-sliders',
      data: { tab: 'builder' },
      popover: {
        title: '🎛️ 7. Custom Quant Lab & Solver Risiko',
        description: `
          Laboratorium kuantitatif mandiri:
          <ul style="margin-top: 6px; padding-left: 18px; list-style-type: disc;">
            <li><strong>Risk Parity:</strong> Membagi rata kontribusi risiko volatilitas ke seluruh aset.</li>
            <li><strong>Risk Budgeting:</strong> Fokus porsi risiko pada aset jagoan (misal BTC atau ETH 70–90%).</li>
            <li><strong>Cari Ticker Baru:</strong> Masukkan kode saham apa saja (contoh: <em>AADI, BMRI, NVDA</em>) untuk diuji risikonya.</li>
          </ul>
        `,
        side: 'top',
        align: 'start',
      },
    },
    {
      element: '#tour-pareto-chart',
      data: { tab: 'builder' },
      popover: {
        title: '📈 8. Spektrum Return vs Risiko (Pareto Frontier)',
        description: `
          Visualisasi kurva batas efisiensi investasi:
          <ul style="margin-top: 6px; padding-left: 18px; list-style-type: disc;">
            <li><strong>Titik Hijau:</strong> 15 Portofolio Optimal (Pareto Efficient).</li>
            <li><strong>Titik Merah:</strong> Portofolio Terdominasi (kalah efisien dibanding kombinasi lain).</li>
            <li><strong>Titik Biru:</strong> Posisi racikan portofolio Anda saat ini.</li>
          </ul>
          <em>Tips: Klik titik mana saja di grafik untuk langsung menerapkan portofolio tersebut!</em>
        `,
        side: 'top',
        align: 'center',
      },
    },
    {
      element: '#tour-correlation-section',
      data: { tab: 'builder' },
      popover: {
        title: '🧬 9. Matriks Korelasi & Heatmap Diversifikasi',
        description: `
          Korelasi rendah adalah satu-satunya <em>"free lunch"</em> dalam dunia finansial.
          <br/><br/>
          Matriks ini membuktikan mengapa memadukan aset independen (seperti Emas vs Saham, atau Obligasi vs Kripto) sanggup meredam kejatuhan pasar tanpa memotong potensi imbal hasil jangka panjang. Klik sel mana saja untuk meneliti dinamika makronya!
        `,
        side: 'top',
        align: 'center',
      },
    },
    {
      element: '#tour-comparator-section',
      data: { tab: 'builder' },
      popover: {
        title: '⚔️ 10. Head-to-Head Portfolio Comparator',
        description: `
          Fitur tanding portofolio: adu racikan aktif Anda secara <em>head-to-head</em> melawan portofolio lain.
          <br/><br/>
          Bandingkan perbedaan CAGR tahunan, selisih drawdown terburuk, ketahanan Calmar Ratio, hingga estimasi percepatan tahun menuju kemandirian finansial.
        `,
        side: 'top',
        align: 'center',
      },
    },

    // ==========================================
    // BAB 3: MENU 2 - REBALANCER & MARKET CRASH
    // ==========================================
    {
      element: '#tour-rebalance-table',
      data: { tab: 'rebalancer' },
      popover: {
        title: '⚖️ 11. Portofolio Aktual & Deteksi Drift',
        description: `
          Selamat datang di <strong>Menu 2: Rebalancer</strong>!
          <br/><br/>
          Di sini Anda memasukkan saldo riil portofolio saat ini. Sistem secara otomatis membandingkan porsi nyata terhadap target Menu 1 dan mendeteksi apakah aset sudah menyimpang (*drift*) melampaui batas toleransi.
        `,
        side: 'top',
        align: 'center',
      },
    },
    {
      element: '#tour-stress-scenarios',
      data: { tab: 'rebalancer' },
      popover: {
        title: '⚡ 12. Simulasi Krisis Pasar Video (Stress-Test)',
        description: `
          Uji ketahanan mental dan portofolio Anda menggunakan skenario krisis nyata dari video:
          <ul style="margin-top: 6px; padding-left: 18px; list-style-type: disc;">
            <li><strong>Skenario 1 (Bull Run 3x):</strong> Kripto melonjak +200% &rarr; rebalancing menyarankan ambil untung (*profit taking*).</li>
            <li><strong>Skenario 2 (Crash -50%):</strong> Kripto ambles separuh harga &rarr; rebalancing menyarankan serok diskon (*buy the dip*).</li>
          </ul>
        `,
        side: 'bottom',
        align: 'center',
      },
      onDeselected: () => {
        // Automatically close rebalance options dropdown when moving away from step 12
        if (typeof window !== 'undefined') {
          window.dispatchEvent(
            new CustomEvent('quantporto:set-rebalance-options', { detail: { open: false } })
          );
        }
      },
    },
    {
      element: '#tour-crash-ladder',
      data: { tab: 'rebalancer' },
      popover: {
        title: '🪜 13. Jaring Beli Bertahap (Crash Limit Order Ladder)',
        description: `
          Kunci sukses kuantitatif adalah memasang antrean limit order <strong>sebelum</strong> kepanikan terjadi di pasar.
          <br/><br/>
          Tabel ini merinci harga pasang beli bertingkat pada penurunan <strong>-10%, -20%, -35%, dan -50%</strong> lengkap dengan nominal modal cadangan yang harus disiapkan.
        `,
        side: 'top',
        align: 'center',
      },
    },
    {
      element: '#tour-rebalance-actions',
      data: { tab: 'rebalancer' },
      popover: {
        title: '📋 14. Eksekusi Order & Pembulatan Lot Saham BEI',
        description: `
          Sistem menyusun daftar instruksi eksekusi:
          <ul style="margin-top: 6px; padding-left: 18px; list-style-type: disc;">
            <li>Saham Indonesia otomatis dibulatkan ke kelipatan <strong>100 Lembar (1 Lot BEI)</strong>.</li>
            <li>Aset kripto dan ETF AS dihitung presisi hingga unit fraksional.</li>
            <li>Sisa kas kembalian dialihkan otomatis ke instrumen pasar uang/RDPT.</li>
            <li>Tersedia 4 strategi fleksibel: <strong>🎯 Jual Untung Saja (Selective Trim)</strong>, <strong>🛡️ Prioritas RDPT Dulu</strong>, <strong>⚖️ Jual Rata</strong>, dan <strong>💰 DCA Saja</strong>, plus filter otomatis transaksi receh (Anti-Dust).</li>
          </ul>
        `,
        side: 'bottom',
        align: 'end',
      },
    },
    {
      element: '#tour-rebalance-journal',
      data: { tab: 'rebalancer' },
      popover: {
        title: '📓 15. Jurnal Audit & Riwayat Rebalancing',
        description: `
          Setiap kali selesai mengeksekusi rebalancing di aplikasi sekuritas, simpan catatan ke dalam jurnal audit ini.
          <br/><br/>
          Jurnal ini merekam tanggal, total kekayaan bersih (*net worth*), dan catatan pribadi agar histori disiplin portofolio Anda terdokumentasi rapi.
        `,
        side: 'top',
        align: 'center',
      },
    },

    // ==========================================
    // BAB 4: MENU 3 - ROADMAP, BACKTEST & PENSIUN
    // ==========================================
    {
      element: '#tour-roadmap-calculator',
      data: { tab: 'roadmap' },
      popover: {
        title: '🎯 16. Peta Jalan Menuju Rp 10 Miliar Pertama',
        description: `
          Selamat datang di <strong>Menu 3: Simulator Kekayaan</strong>!
          <br/><br/>
          Lihat grafik eksponensial *compounding* kekayaan Anda tahun demi tahun. Dilengkapi simulasi <strong>Monte Carlo</strong> untuk mengukur probabilitas keberhasilan di skenario pasar terburuk (*bear market*) maupun terbaik.
        `,
        side: 'top',
        align: 'center',
      },
    },
    {
      element: '#tour-backtest-frequency',
      data: { tab: 'roadmap' },
      popover: {
        title: '🔄 17. Backtest Historis Frekuensi Rebalancing',
        description: `
          Pembuktian nyata menit 16:08 video:
          <br/><br/>
          Bandingkan hasil kinerja 5 tahun historis antara <strong>Rebalance Kuartalan (tiap 3 bulan)</strong> vs <strong>Bulanan</strong> vs <strong>Tahunan</strong> vs <strong>Buy &amp; Hold murni tanpa rebalance</strong>. Rebalancing kuartalan terbukti memanen volatilitas bull run sekaligus melindungi modal saat crash.
        `,
        side: 'top',
        align: 'center',
      },
    },
    {
      element: '#tour-dividend-retirement',
      data: { tab: 'roadmap' },
      popover: {
        title: '🌴 18. Estimator Dividen & Pensiun Mandiri (4% SWR)',
        description: `
          Kapan portofolio Anda mampu membiayai seluruh kebutuhan hidup bulanan tanpa harus bekerja aktif lagi?
          <br/><br/>
          Modul ini memproyeksikan arus kas dividen kas bersih (setelah pajak) dan menghitung target modal pensiun aman menggunakan kaidah <em>4% Safe Withdrawal Rate</em> (Trinity Study).
        `,
        side: 'top',
        align: 'center',
      },
    },

    // ==========================================
    // BAB 5: DOKUMEN EKSPOR & SELESAI
    // ==========================================
    {
      element: '#tour-export-actions',
      data: { tab: 'builder' },
      popover: {
        title: '🖨️ 19. Dokumen Ekspor Factsheet & Slip Order',
        description: `
          Bagian akhir: Anda dapat mengunduh dokumen profesional siap pakai:
          <ul style="margin-top: 6px; padding-left: 18px; list-style-type: disc;">
            <li><strong>Factsheet A4 (PDF/PNG):</strong> Laporan ringkasan portofolio berstandar manajer investasi.</li>
            <li><strong>Slip Order Broker:</strong> Salin instruksi order yang sudah dikelompokkan sesuai aplikasi broker (Stockbit, Pluang, Reku, Makmur) dengan 1 klik!</li>
          </ul>
          <br/>
          <em>Selamat bereksplorasi! Anda dapat menekan tombol <strong>'?'</strong> di keyboard kapan saja untuk membuka kembali panduan ini.</em>
        `,
        side: 'bottom',
        align: 'end',
      },
      onDeselected: () => {
        // Automatically close tools menu when moving away from step 19
        if (typeof window !== 'undefined') {
          window.dispatchEvent(
            new CustomEvent('quantporto:set-tools-menu', { detail: { open: false } })
          );
        }
      },
    },
  ];

  // Transform each step so that element resolution proactively triggers tab switching
  // BEFORE Driver.js evaluates the DOM, allowing React to mount the component smoothly
  const steps: DriveStep[] = rawSteps.map((step) => {
    const rawElement = step.element;
    const targetTab = step.data?.tab as ('builder' | 'rebalancer' | 'roadmap') | undefined;

    return {
      ...step,
      element: () => {
        // Proactive Tab Switch: when Driver looks for this step, ensure the target tab is activated FIRST
        if (targetTab && options?.onTabSwitch && activeTourTab !== targetTab) {
          activeTourTab = targetTab;
          options.onTabSwitch(targetTab);
        }

        if (typeof rawElement === 'function') {
          return rawElement();
        }

        if (typeof rawElement === 'string') {
          // Special handling for Step 19 Export Actions:
          // In desktop, opening "Alat & Pengaturan" menu exposes #tour-export-actions.
          // In mobile, header tools dropdown is hidden so we point to #tour-mobile-menu-btn.
          if (rawElement === '#tour-export-actions') {
            const isMobile =
              typeof window !== 'undefined' &&
              (window.innerWidth < 1024 || !document.querySelector('#tour-tools-menu'));

            if (isMobile) {
              const mobileBtn = document.querySelector('#tour-mobile-menu-btn');
              if (mobileBtn) return mobileBtn as HTMLElement;
            }

            // Desktop handling:
            const directEl = document.querySelector(rawElement) as HTMLElement | null;
            if (directEl) return directEl;

            // Signal Header to expand the tools dropdown
            if (typeof window !== 'undefined') {
              window.dispatchEvent(
                new CustomEvent('quantporto:set-tools-menu', { detail: { open: true } })
              );
            }

            // Re-check if element is immediately present
            const recheckEl = document.querySelector(rawElement) as HTMLElement | null;
            if (recheckEl) return recheckEl;

            // Safe fallback: highlight tools menu button if dropdown hasn't rendered yet
            const toolsMenuBtn = document.querySelector('#tour-tools-menu') as HTMLElement | null;
            if (toolsMenuBtn) return toolsMenuBtn;
          }

          // Special handling for Step 12 Rebalancer Stress Scenarios (inside Options menu):
          if (rawElement === '#tour-stress-scenarios') {
            const directEl = document.querySelector(rawElement) as HTMLElement | null;
            if (directEl && directEl.offsetParent !== null) return directEl;

            // Signal Rebalancer to expand options menu
            if (typeof window !== 'undefined') {
              window.dispatchEvent(
                new CustomEvent('quantporto:set-rebalance-options', { detail: { open: true } })
              );
            }

            const recheckEl = document.querySelector(rawElement) as HTMLElement | null;
            if (recheckEl && recheckEl.offsetParent !== null) return recheckEl;

            const optionsBtn = document.querySelector('#tour-rebalance-options-btn') as HTMLElement | null;
            if (optionsBtn) return optionsBtn;
          }

          const directEl = document.querySelector(rawElement) as HTMLElement | null;
          if (directEl) return directEl;

          // Fallbacks for rebalancer views (desktop table vs mobile cards vs container)
          if (rawElement === '#tour-rebalance-table') {
            const fallback =
              document.querySelector('#tour-rebalance-cards') ||
              document.querySelector('#tour-rebalance-table-container');
            if (fallback) return fallback as HTMLElement;
          }
        }

        return undefined as unknown as Element;
      },
    };
  });

  const driverObj = driver({
    showProgress: true,
    animate: true,
    overlayOpacity: 0.78,
    smoothScroll: true,
    stagePadding: 6,
    stageRadius: 10,
    allowClose: true,
    waitForElement: 3000,
    nextBtnText: 'Lanjut ➔',
    prevBtnText: '⬅ Kembali',
    doneBtnText: 'Selesai & Eksplorasi 🎉',
    progressText: 'Langkah {{current}} dari {{total}}',
    steps,
    onHighlightStarted: (_element, step) => {
      const targetTab = step.data?.tab as ('builder' | 'rebalancer' | 'roadmap') | undefined;
      if (targetTab && options?.onTabSwitch && activeTourTab !== targetTab) {
        activeTourTab = targetTab;
        options.onTabSwitch(targetTab);
      }

      // Ensure tools menu dropdown is closed when highlighting other steps
      if (step.element !== '#tour-export-actions' && typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent('quantporto:set-tools-menu', { detail: { open: false } })
        );
      }
    },
    onHighlighted: (_element, _step, opts) => {
      // Refresh popover and stage cutout position in case of scroll or dynamic tab height
      window.requestAnimationFrame(() => {
        opts.driver.refresh();
      });
    },
    onDestroyStarted: () => {
      try {
        localStorage.setItem('quantporto_tour_seen_v2', 'true');
        if (typeof window !== 'undefined') {
          window.dispatchEvent(
            new CustomEvent('quantporto:set-tools-menu', { detail: { open: false } })
          );
        }
      } catch {
        // Ignore storage errors
      }
      driverObj.destroy();
      activeDriverInstance = null;
      if (options?.onComplete) options.onComplete();
    },
  });

  activeDriverInstance = driverObj;
  const startIndex = options?.startStepIndex ?? 0;
  driverObj.drive(startIndex);
}
