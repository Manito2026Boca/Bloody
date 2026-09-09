const CACHE_NAME = 'manito-shell-v5';
const CORE_ASSETS = [
  '/',
  '/manifest.webmanifest',
  '/favicon.png',
  '/logo-main.jpg',
  '/logo-icon.png',
  '/icon-192.png',
  '/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(CORE_ASSETS)),
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
            .filter((key) => key.startsWith('manito-shell-') && key !== CACHE_NAME)
            .map((key) => caches.delete(key)),
        ),
      ),
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const requestUrl = new URL(event.request.url);
  if (event.request.method !== 'GET' || requestUrl.origin !== self.location.origin) {
    return;
  }
  if (requestUrl.pathname.startsWith('/auth/') || requestUrl.pathname.startsWith('/api/')) {
    return;
  }
  const navigation = event.request.mode === 'navigate';
  const staticAsset = CORE_ASSETS.includes(requestUrl.pathname) || requestUrl.pathname.startsWith('/_next/static/');
  if (!navigation && !staticAsset) return;

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (!response.ok || response.type !== 'basic') {
          return response;
        }
        const clone = response.clone();
        event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone)).catch(() => undefined));
        return response;
      })
      .catch(async () => (await caches.match(event.request)) ||
        (navigation ? await caches.match('/') : null) || new Response('', { status: 503, statusText: 'Offline' })),
  );
});
