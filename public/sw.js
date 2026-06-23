/* Wealth Navigator service worker.
 * Strategy:
 *   - Navigations: network-first, fall back to cached app shell when offline.
 *   - Static assets (script/style/image/font): stale-while-revalidate.
 *   - API requests (/api/*): never cached, always go to the network.
 * Bump CACHE_VERSION to invalidate old caches on the next activation.
 */
const CACHE_VERSION = 'v1';
const CACHE_NAME = `wealth-navigator-${CACHE_VERSION}`;
const APP_SHELL = '/index.html';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.add(APP_SHELL)),
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== CACHE_NAME)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Only handle GET; let the browser deal with the rest.
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Never cache cross-origin requests or the API (sensitive/dynamic data).
  if (url.origin !== self.location.origin || url.pathname.startsWith('/api')) {
    return;
  }

  // App shell: network-first so users get fresh HTML, offline fallback otherwise.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(APP_SHELL, copy));
          return response;
        })
        .catch(() => caches.match(APP_SHELL)),
    );
    return;
  }

  // Static assets: stale-while-revalidate.
  if (['script', 'style', 'image', 'font'].includes(request.destination)) {
    event.respondWith(
      caches.open(CACHE_NAME).then(async (cache) => {
        const cached = await cache.match(request);
        const network = fetch(request)
          .then((response) => {
            if (response && response.status === 200) {
              cache.put(request, response.clone());
            }
            return response;
          })
          .catch(() => cached);
        return cached || network;
      }),
    );
  }
});
