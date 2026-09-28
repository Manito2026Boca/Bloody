(() => {
  const status = document.getElementById('connection');
  const link = document.getElementById('open-app');
  const appOrigin = document.body.dataset.appOrigin;
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  let destination = null;
  try {
    const target = new URL(appOrigin);
    if (target.protocol !== 'https:' || target.origin !== appOrigin || target.origin === location.origin) throw new Error('origin');
    const url = new URL(location.href);
    if (url.pathname !== '/continuar' || url.hash) throw new Error('route');
    const keys = [...url.searchParams.keys()];
    if (keys.length === 1 && keys[0] === 'notification' && uuid.test(url.searchParams.get('notification') || '')) {
      target.searchParams.set('notification', url.searchParams.get('notification'));
    } else if (keys.length !== 0) throw new Error('intent');
    destination = target.href;
  } catch { status.textContent = 'Este enlace no se pudo verificar. Abrí MANITO desde el acceso nuevo.'; }
  const refresh = () => {
    if (!destination) return;
    link.hidden = !navigator.onLine;
    link.href = destination;
    status.textContent = navigator.onLine ? '' : 'Necesitás conexión para abrir la nueva app.';
  };
  refresh();
  addEventListener('online', refresh);
  addEventListener('offline', refresh);
  const channel = 'manito:pwa:update';
  navigator.serviceWorker?.addEventListener('message', (event) => {
    const message = event.data;
    if (message?.channel !== channel || message.protocolVersion !== 1 || message.type !== 'PREPARE') return;
    const request = message.request;
    const ready = document.visibilityState === 'visible' && navigator.onLine &&
      !document.querySelector('form, [contenteditable]') && request?.expiresAt > Date.now();
    event.source?.postMessage({ channel, protocolVersion: 1, type: 'PREPARE_REPLY',
      attemptId: request?.attemptId, targetBuildId: request?.targetBuildId, result: ready ? 'ready' : 'blocked' });
  });
  const requestStatus = (worker) => new Promise((resolve) => {
    const requestId = crypto.randomUUID();
    const timer = setTimeout(() => { navigator.serviceWorker.removeEventListener('message', reply); resolve(null); }, 3000);
    const reply = (event) => {
      if (event.source !== worker || event.data?.channel !== channel || event.data.type !== 'STATUS_REPLY' ||
          event.data.requestId !== requestId) return;
      clearTimeout(timer);
      navigator.serviceWorker.removeEventListener('message', reply);
      resolve(event.data.build);
    };
    navigator.serviceWorker.addEventListener('message', reply);
    worker.postMessage({ channel, protocolVersion: 1, type: 'STATUS_REQUEST', requestId });
  });
  async function checkExistingWorker() {
    if (!navigator.serviceWorker?.controller || !navigator.onLine) return;
    const registration = await navigator.serviceWorker.getRegistration('/');
    if (!registration) return;
    await registration.update();
    const waiting = registration.waiting;
    if (!waiting) return;
    const response = await fetch('/pwa-version.json', { cache: 'no-store' });
    if (!response.ok) return;
    const published = await response.json();
    const candidate = await requestStatus(waiting);
    if (published?.protocolVersion !== 1 || published.buildId !== candidate?.buildId) return;
    waiting.postMessage({ channel, protocolVersion: 1, type: 'ACTIVATE_REQUEST',
      attemptId: crypto.randomUUID(), targetBuildId: candidate.buildId });
  }
  void checkExistingWorker().catch(() => undefined);
})();
