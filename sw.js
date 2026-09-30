const CACHE_NAME = 'aathi-moi-chromebook-offline-v8';
const OFFLINE_ASSETS = [
  './',
  './index.html',
  './pwa-manifest.json',
  './website-logo.jpg',
  './logo.png',
  './customer-receipt-logo.png',
  './css/style.css',
  './js/defaultDb.js',
  './js/tamilTransliterate.js',
  './js/tamilWords.js',
  './js/activation.js',
  './js/app.js',
  './js/lib/tailwind.min.js',
  './js/lib/lucide.min.js',
  './js/lib/qrcode.min.js',
  './js/lib/xlsx.full.min.js',
  './assets/cover_bg.jpg',
  './assets/icon.svg',
  './assets/icon-16.png',
  './assets/icon-32.png',
  './assets/icon-48.png',
  './assets/icon-128.png',
  './assets/icon-192.png',
  './assets/icon-512.png',
  './fonts/MuktaMalar-Regular.ttf',
  './fonts/MuktaMalar-SemiBold.ttf',
  './fonts/MuktaMalar-Bold.ttf',
  './fonts/MuktaMalar-ExtraBold.ttf'
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      Promise.allSettled(OFFLINE_ASSETS.map((url) => cache.add(new Request(url, { cache: 'reload' }))))
    )
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      const oldKeys = keys.filter((k) => k !== CACHE_NAME);
      await Promise.all(oldKeys.map((k) => caches.delete(k)));
      await self.clients.claim();
      if (oldKeys.length > 0) {
        const windowClients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
        for (const client of windowClients) {
          try {
            client.postMessage({ type: 'AATHI_SW_UPDATED', cacheName: CACHE_NAME });
            if ('navigate' in client) {
              await client.navigate(client.url);
            }
          } catch (e) {}
        }
      }
    })()
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const reqUrl = new URL(event.request.url);
  if (reqUrl.pathname.startsWith('/api/')) return;

  // Network-First with Offline Cache Fallback:
  // Always serves the latest online files when internet/localhost is available,
  // and seamlessly falls back to cached assets when offline.
  event.respondWith(
    fetch(event.request)
      .then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200 && reqUrl.origin === self.location.origin) {
          const clone = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, clone).catch(() => {});
          });
        }
        return networkResponse;
      })
      .catch(() =>
        caches.match(event.request, { ignoreSearch: true }).then((cachedResponse) => {
          if (cachedResponse) return cachedResponse;
          if (event.request.mode === 'navigate') {
            return caches.match('./index.html', { ignoreSearch: true });
          }
          return Response.error();
        })
      )
  );
});
