(() => {
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
