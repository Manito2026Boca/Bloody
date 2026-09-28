const WORKER_BUILD = {"schemaVersion":1,"protocolVersion":1,"appVersion":"legacy-bridge-1","buildId":"domain-migration-001-legacy-bridge-1","commit":"70fc13189ec2b27aa40177bbae17cb2d71f844f4","builtAt":"2026-09-28T00:00:00.000Z"};
const CHANNEL = 'manito:pwa:update';
const CACHE_NAME = `manito-legacy-shell-${WORKER_BUILD.buildId}`;
const attempts = new Map();
const isChunk = (path) => path.startsWith('/_next/static/') && /[a-f0-9]{8,}/i.test(path) && /\.(js|css)$/i.test(path);
const validChunk = (response, path) => {
  if (!response?.ok) return false;
  const mime = response.headers.get('content-type')?.split(';', 1)[0].trim().toLowerCase();
  return path.endsWith('.css') ? mime === 'text/css' : mime === 'text/javascript' || mime === 'application/javascript';
};
const wire = (type, fields) => ({ channel: CHANNEL, protocolVersion: 1, type, ...fields });
const isWire = (value) => value?.channel === CHANNEL && value.protocolVersion === 1;
const inScope = (client) => {
  try { return new URL(client.url).origin === self.location.origin; } catch { return false; }
};

async function negotiate(source, message) {
  const { attemptId, targetBuildId } = message;
  if (!attemptId || targetBuildId !== WORKER_BUILD.buildId) return;
  if (attempts.size) { source?.postMessage(wire('ACTIVATE_RESULT', { attemptId, result: 'deferred' })); return; }
  const attempt = { pending: new Set(), blocked: false, finish: null };
  attempts.set(attemptId, attempt);
  let clients = [];
  try {
    clients = (await self.clients.matchAll({ type: 'window', includeUncontrolled: true })).filter(inScope);
    attempt.pending = new Set(clients.map((client) => client.id));
    const expiresAt = Date.now() + 10000;
    for (const client of clients) client.postMessage(wire('PREPARE', { request: { attemptId, targetBuildId, expiresAt } }));
    if (attempt.pending.size) await Promise.race([
      new Promise((resolve) => { attempt.finish = resolve; }),
      new Promise((resolve) => setTimeout(resolve, 10000)),
    ]);
    const current = (await self.clients.matchAll({ type: 'window', includeUncontrolled: true })).filter(inScope);
    if (attempt.blocked || attempt.pending.size || Date.now() > expiresAt ||
      current.length !== clients.length || current.some((client) => !clients.some((voter) => voter.id === client.id))) {
      for (const client of clients) client.postMessage(wire('RELEASE', { attemptId }));
      source?.postMessage(wire('ACTIVATE_RESULT', { attemptId, result: 'deferred' }));
      return;
    }
    await self.skipWaiting();
    source?.postMessage(wire('ACTIVATE_RESULT', { attemptId, result: 'activated' }));
  } catch {
    for (const client of clients) client.postMessage(wire('RELEASE', { attemptId }));
    source?.postMessage(wire('ACTIVATE_RESULT', { attemptId, result: 'failed' }));
  } finally { attempts.delete(attemptId); }
}

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(['/offline.html'])));
});
self.addEventListener('activate', (event) => { event.waitUntil(self.clients.claim()); });
self.addEventListener('message', (event) => {
  const value = event.data;
  if (!isWire(value)) return;
  if (value.type === 'STATUS_REQUEST' && typeof value.requestId === 'string') {
    event.source?.postMessage(wire('STATUS_REPLY', { requestId: value.requestId, build: WORKER_BUILD }));
  } else if (value.type === 'ACTIVATE_REQUEST') {
    event.waitUntil(negotiate(event.source, value));
  } else if (value.type === 'PREPARE_REPLY') {
    const attempt = attempts.get(value.attemptId);
    if (!attempt || value.targetBuildId !== WORKER_BUILD.buildId || !attempt.pending.has(event.source?.id)) return;
    attempt.pending.delete(event.source.id);
    if (value.result !== 'ready') attempt.blocked = true;
    if (attempt.blocked || !attempt.pending.size) attempt.finish?.();
  }
});
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin ||
      url.pathname.startsWith('/auth/') || url.pathname.startsWith('/api/')) return;
  if (event.request.mode === 'navigate') {
    event.respondWith(fetch(event.request).catch(async () =>
      (await caches.open(CACHE_NAME)).match('/offline.html') || new Response('', { status: 503 })));
  } else if (isChunk(url.pathname)) {
    event.respondWith((async () => {
      const saved = await caches.match(event.request);
      if (validChunk(saved, url.pathname)) return saved;
      try {
        const response = await fetch(event.request);
        if (!validChunk(response, url.pathname)) return new Response('', { status: response.status >= 400 ? response.status : 502 });
        return response;
      } catch { return new Response('', { status: 503 }); }
    })());
  }
});
self.addEventListener('push', (event) => {
  let payload = {};
  try { payload = event.data?.json() || {}; } catch { /* Keep a generic notification. */ }
  const notification = typeof payload.notificationId === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(payload.notificationId)
    ? payload.notificationId : null;
  const url = notification ? `/continuar?notification=${notification}` : '/continuar';
  event.waitUntil(self.registration.showNotification(
    typeof payload.title === 'string' ? payload.title : 'Novedad en MANITO',
    { body: typeof payload.body === 'string' ? payload.body : 'Abrí MANITO para ver el detalle.',
      icon: '/brand/manito-icon-192.png', badge: '/brand/manito-favicon-64.png',
      tag: typeof payload.tag === 'string' ? payload.tag : 'manito-notification', data: { url } },
  ));
});
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const destination = new URL(event.notification.data?.url || '/continuar', self.location.origin);
  if (destination.origin !== self.location.origin || destination.pathname !== '/continuar') return;
  event.waitUntil(self.clients.openWindow(destination.href));
});
