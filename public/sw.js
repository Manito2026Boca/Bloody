const WORKER_BUILD = {"schemaVersion":1,"protocolVersion":1,"appVersion":"0.1.0","buildId":"7e215818-441a-490f-acca-7f2c603b9bd8","commit":"7d6133bf74f3c1f6c7e0907c03df78c67afe5c79","builtAt":"2026-09-27T00:17:18.485Z"};
const CHANNEL = 'manito:pwa:update';
const CACHE_NAME = `manito-shell-${WORKER_BUILD.buildId}`;
const CHUNK_CACHE = `manito-chunks-${WORKER_BUILD.buildId}`;
const CORE_ASSETS = [
  '/offline.html',
  '/manifest.webmanifest',
  '/brand/manito-reference-horizontal.png',
  '/brand/manito-reference-app-icon.png',
  '/brand/manito-favicon-64.png',
  '/brand/manito-icon-192.png',
  '/brand/manito-icon-512.png',
  '/brand/manito-maskable-512.png',
  '/brand/apple-touch-icon.png',
];
const attempts = new Map();
const statusRequests = new Map();
const wire = (type, fields) => ({ channel: CHANNEL, protocolVersion: WORKER_BUILD.protocolVersion, type, ...fields });
const isWire = (message) => message?.channel === CHANNEL && message.protocolVersion === WORKER_BUILD.protocolVersion;
const isHashedChunk = (pathname) => pathname.startsWith('/_next/static/') && /[a-f0-9]{8,}/i.test(pathname);
const inScope = (client) => {
  const url = new URL(client.url);
  return url.origin === self.location.origin && url.pathname.startsWith(new URL(self.registration.scope).pathname);
};

async function release(attempt, clients) {
  await Promise.all(clients.map((client) => client.postMessage(wire('RELEASE', { attemptId: attempt }))));
}

async function negotiate(source, message) {
  const { attemptId, targetBuildId } = message;
  if (!attemptId || targetBuildId !== WORKER_BUILD.buildId) return;
  if (attempts.size) {
    source?.postMessage(wire('ACTIVATE_RESULT', { attemptId, result: 'deferred' }));
    return;
  }
  const attempt = { targetBuildId, pending: new Set(), blocked: false, finish: null };
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
    const currentClients = (await self.clients.matchAll({ type: 'window', includeUncontrolled: true })).filter(inScope);
    if (attempt.blocked || attempt.pending.size || Date.now() > expiresAt ||
        currentClients.length !== clients.length || currentClients.some((client) => !clients.some((voter) => voter.id === client.id))) {
      await release(attemptId, clients);
      source?.postMessage(wire('ACTIVATE_RESULT', { attemptId, result: 'deferred' }));
      return;
    }
    await self.skipWaiting();
    source?.postMessage(wire('ACTIVATE_RESULT', { attemptId, result: 'activated' }));
  } catch {
    await release(attemptId, clients).catch(() => undefined);
    source?.postMessage(wire('ACTIVATE_RESULT', { attemptId, result: 'failed' }));
  } finally {
    attempts.delete(attemptId);
  }
}

async function retireUnusedCaches() {
  const clients = (await self.clients.matchAll({ type: 'window', includeUncontrolled: true })).filter(inScope);
  const requests = clients.map((client) => new Promise((resolve) => {
    const requestId = `${WORKER_BUILD.buildId}:${client.id}:${Math.random()}`;
    const timer = setTimeout(() => { statusRequests.delete(requestId); resolve(null); }, 3000);
    statusRequests.set(requestId, { clientId: client.id, done: (build) => {
      clearTimeout(timer);
      statusRequests.delete(requestId);
      resolve(build);
    } });
    client.postMessage(wire('STATUS_REQUEST', { requestId }));
  }));
  const builds = await Promise.all(requests);
  if (builds.some((build) => !build)) return;
  const live = new Set([WORKER_BUILD.buildId, ...builds.map((build) => build.buildId)]);
  const keys = await caches.keys();
  await Promise.all(keys.filter((key) =>
    key.startsWith('manito-shell-') || key.startsWith('manito-chunks-'),
  ).filter((key) => ![...live].some((id) => key === `manito-shell-${id}` || key === `manito-chunks-${id}`))
    .map((key) => caches.delete(key)));
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(CORE_ASSETS)),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim().then(() => retireUnusedCaches().catch(() => undefined)));
});

self.addEventListener('message', (event) => {
  const message = event.data;
  if (!isWire(message)) return;
  if (message.type === 'STATUS_REQUEST' && typeof message.requestId === 'string') {
    event.source?.postMessage(wire('STATUS_REPLY', { requestId: message.requestId, build: WORKER_BUILD }));
  } else if (message.type === 'STATUS_REPLY') {
    const request = statusRequests.get(message.requestId);
    if (request?.clientId === event.source?.id && message.build?.buildId && message.build.protocolVersion === WORKER_BUILD.protocolVersion) {
      request.done(message.build);
    }
  } else if (message.type === 'ACTIVATE_REQUEST') {
    event.waitUntil(negotiate(event.source, message));
  } else if (message.type === 'PREPARE_REPLY') {
    const attempt = attempts.get(message.attemptId);
    if (!attempt || message.targetBuildId !== attempt.targetBuildId || !attempt.pending.has(event.source?.id)) return;
    attempt.pending.delete(event.source.id);
    if (message.result !== 'ready') attempt.blocked = true;
    if (attempt.blocked || !attempt.pending.size) attempt.finish?.();
  }
});

self.addEventListener('fetch', (event) => {
  const requestUrl = new URL(event.request.url);
  if (event.request.method !== 'GET' || requestUrl.origin !== self.location.origin) {
    return;
  }
  if (requestUrl.pathname.startsWith('/auth/') || requestUrl.pathname.startsWith('/api/')) {
    return;
  }
  if (event.request.headers?.get('RSC') || requestUrl.searchParams.has('_rsc')) return;
  const navigation = event.request.mode === 'navigate';
  const publicAsset = CORE_ASSETS.includes(requestUrl.pathname);
  const chunk = isHashedChunk(requestUrl.pathname);
  if (!navigation && !publicAsset && !chunk) return;

  event.respondWith((async () => {
    const cache = await caches.open(chunk ? CHUNK_CACHE : CACHE_NAME);
    if (chunk) {
      const saved = await cache.match(event.request);
      if (saved) return saved;
    }
    try {
      const response = await fetch(event.request);
      if ((chunk || publicAsset) && response.ok && response.type === 'basic') {
        event.waitUntil(cache.put(event.request, response.clone()).catch(() => undefined));
      }
      return response;
    } catch {
      if (navigation) return (await (await caches.open(CACHE_NAME)).match('/offline.html')) || new Response('', { status: 503 });
      return (await cache.match(event.request)) || new Response('', { status: 503, statusText: 'Offline' });
    }
  })());
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
