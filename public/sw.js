// QuantPorto Progressive Web App (PWA) Offline Service Worker
// Enables offline access to app shell, static assets, and cached snapshot data.

const CACHE_NAME = 'quantporto-v1';
const CORE_PRECACHE_URLS = [
  './',
  './index.html',
  './favicon.svg',
  './manifest.webmanifest',
  './data/market-data.json',
];

// Install: precache core shell assets and activate immediately
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(CORE_PRECACHE_URLS))
      .then(() => self.skipWaiting())
      .catch((err) => console.warn('[PWA SW] Precache error (non-fatal):', err))
  );
});

// Activate: clean up outdated caches and claim clients immediately
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((cacheNames) =>
        Promise.all(
          cacheNames.map((name) => {
            if (name !== CACHE_NAME) {
              return caches.delete(name);
            }
            return null;
          })
        )
      )
      .then(() => self.clients.claim())
  );
});

// Fetch: Strategy depending on request type
self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Only handle HTTP/HTTPS GET requests
  if (request.method !== 'GET' || !request.url.startsWith('http')) {
    return;
  }

  const url = new URL(request.url);

  // Bypass 3rd-party live market APIs (Yahoo Finance, CoinGecko, Alternative.me)
  // so spot prices stay live and fall back gracefully in app logic when offline
  if (
    url.hostname.includes('yahoo.com') ||
    url.hostname.includes('coingecko.com') ||
    url.hostname.includes('alternative.me') ||
    url.hostname.includes('corsproxy.io')
  ) {
    return;
  }

  // 1. Static hashed assets (/assets/*, fonts, images) -> Cache-First
  if (
    url.pathname.includes('/assets/') ||
    url.pathname.endsWith('.svg') ||
    url.pathname.endsWith('.png') ||
    url.pathname.endsWith('.woff2')
  ) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((networkRes) => {
          if (networkRes && networkRes.status === 200) {
            const clone = networkRes.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return networkRes;
        });
      })
    );
    return;
  }

  // 2. Navigation / HTML & Market Data Snapshot -> Network-First with Cache Fallback
  event.respondWith(
    fetch(request)
      .then((networkRes) => {
        if (networkRes && networkRes.status === 200) {
          const clone = networkRes.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
        }
        return networkRes;
      })
      .catch(async () => {
        const cached = await caches.match(request);
        if (cached) return cached;
        // Fallback to cached index.html for SPA client-side routes
        if (request.mode === 'navigate') {
          return caches.match('./index.html');
        }
        return new Response('Offline: Konten belum tersimpan di cache.', {
          status: 503,
          statusText: 'Service Unavailable',
          headers: { 'Content-Type': 'text/plain; charset=utf-8' },
        });
      })
  );
});
