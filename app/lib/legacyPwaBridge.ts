import { buildAppIntentUrl, parseDomainIntent, type IntentContext } from './domainMigrationContract';

export type LegacyEntry = { showBridge: boolean; destination: string | null };

export function legacyEntry(input: string | URL, context: IntentContext, standalone = false): LegacyEntry {
  let url: URL;
  try { url = new URL(input); } catch { return { showBridge: false, destination: null }; }
  if (url.origin !== context.origins.publicOrigin || url.hash) return { showBridge: false, destination: null };
  if (url.pathname === '/admin' && !url.search) {
    return { showBridge: true, destination: new URL('/admin', context.origins.appOrigin).toString() };
  }
  if (url.pathname !== '/' && url.pathname !== '/continuar' && url.pathname !== '/continuar/') return { showBridge: false, destination: null };
  const params = url.searchParams;
  if (url.pathname === '/' && params.size === 1 && params.get('source') === 'pwa') {
    return { showBridge: true, destination: new URL('/', context.origins.appOrigin).toString() };
  }
  if ((url.pathname === '/continuar' || url.pathname === '/continuar/') && !params.size) {
    return { showBridge: true, destination: new URL('/', context.origins.appOrigin).toString() };
  }
  const intentUrl = new URL(url);
  intentUrl.pathname = '/';
  const parsed = parseDomainIntent(intentUrl, context, 'public');
  if (parsed.ok) return { showBridge: true, destination: buildAppIntentUrl(parsed.intent, context) };
  if (url.pathname === '/' && !params.size && standalone) {
    return { showBridge: true, destination: new URL('/', context.origins.appOrigin).toString() };
  }
  return { showBridge: url.pathname === '/continuar' || url.pathname === '/continuar/', destination: null };
}
