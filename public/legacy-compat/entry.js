(() => {
  navigator.serviceWorker?.addEventListener('message', (event) => {
    const message = event.data;
    if (message?.channel !== 'manito:pwa:update' || message.protocolVersion !== 1 ||
        message.type !== 'PREPARE') return;
    const request = message.request;
    const ready = document.visibilityState === 'visible' && navigator.onLine &&
      !location.pathname.startsWith('/auth/') &&
      !document.querySelector('form, [contenteditable]') && request?.expiresAt > Date.now();
    event.source?.postMessage({
      channel: 'manito:pwa:update', protocolVersion: 1, type: 'PREPARE_REPLY',
      attemptId: request?.attemptId, targetBuildId: request?.targetBuildId,
      result: ready ? 'ready' : 'blocked',
    });
  });
  const url = new URL(location.href);
  if (url.pathname !== '/') return;
  const keys = [...url.searchParams.keys()];
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const pwa = keys.length === 1 && url.searchParams.get('source') === 'pwa';
  const notification = keys.length === 1 && uuid.test(url.searchParams.get('notification') || '');
  const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  if (!pwa && !notification && !(standalone && keys.length === 0)) return;
  const target = new URL('/continuar', url.origin);
  if (notification) target.searchParams.set('notification', url.searchParams.get('notification'));
  location.replace(target.href);
})();
