const CACHE_NAME = 'manito-shell-brand-reference-v1';
const CORE_ASSETS = [
  '/',
  '/manifest.webmanifest',
  '/brand/manito-reference-horizontal.png',
  '/brand/manito-reference-app-icon.png',
  '/brand/manito-favicon-64.png',
  '/brand/manito-icon-192.png',
  '/brand/manito-icon-512.png',
  '/brand/manito-maskable-512.png',
  '/brand/apple-touch-icon.png',
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

self.addEventListener('push', (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = {};
  }
  const title = typeof payload.title === 'string' ? payload.title : 'Novedad en MANITO';
  const body = typeof payload.body === 'string' ? payload.body : 'Abrí MANITO para ver el detalle.';
  const url = typeof payload.url === 'string' && payload.url.startsWith('/') ? payload.url : '/';
  const tag = typeof payload.tag === 'string' ? payload.tag : 'manito-notification';
  event.waitUntil(self.registration.showNotification(title, {
    body,
    tag,
    renotify: false,
    icon: '/brand/manito-icon-192.png',
    badge: '/brand/manito-favicon-64.png',
    data: { url },
  }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const relativeUrl = event.notification.data?.url || '/';
  const destination = new URL(relativeUrl, self.location.origin);
  if (destination.origin !== self.location.origin) return;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(async (windows) => {
      const existing = windows.find((client) => new URL(client.url).origin === self.location.origin);
      if (existing) {
        await existing.navigate(destination.href);
        return existing.focus();
      }
      return self.clients.openWindow(destination.href);
    }),
  );
});
