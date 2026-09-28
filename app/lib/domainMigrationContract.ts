export const PUBLIC_ORIGIN = 'https://manitoapp.com.ar';

export const LEGACY_AUTH_ORIGINS = [
  PUBLIC_ORIGIN,
  'https://bloody-eta.vercel.app',
] as const;

export const LEGACY_RESERVED_PATHS = [
  '/auth/callback',
  '/auth/confirm',
  '/admin',
  '/continuar',
  '/sw.js',
  '/pwa-version.json',
  '/manifest.webmanifest',
  '/offline.html',
] as const;

export const LEGACY_ENTRY_QUERY_KEYS = ['source', 'notification'] as const;

export type DomainOrigins = {
  publicOrigin: typeof PUBLIC_ORIGIN;
  appOrigin: string;
  legacyAuthOrigins: readonly string[];
};

export type ServiceIntentMode = 'ahora' | 'programar' | 'presupuestar';

export type DomainIntent =
  | { kind: 'service'; service: string; mode?: ServiceIntentMode }
  | { kind: 'professional' }
  | { kind: 'order'; orderId: string }
  | { kind: 'workroom'; orderId: string }
  | { kind: 'notification'; notificationId: string };

export type IntentContext = {
  origins: DomainOrigins;
  knownServices: ReadonlySet<string>;
};

export type ParsedDomainIntent =
  | { ok: true; intent: DomainIntent }
  | { ok: false; reason: 'not-intent' | 'invalid' | 'untrusted-origin' };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SERVICE_SLUG = /^[a-z0-9]+(?:[_-][a-z0-9]+)*$/;
const SERVICE_MODES: readonly ServiceIntentMode[] = ['ahora', 'programar', 'presupuestar'];

function normalizeOrigin(value: string, environment: 'development' | 'production' | 'test'): string {
  const url = new URL(value);
  const local = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
  if (
    (url.protocol !== 'https:' && !(environment !== 'production' && local && url.protocol === 'http:')) ||
    url.username || url.password || url.pathname !== '/' || url.search || url.hash
  ) {
    throw new Error('APP_ORIGIN debe ser un origen HTTPS valido, sin ruta ni credenciales.');
  }
  return url.origin;
}

export function resolveDomainOrigins(input: {
  configuredAppOrigin?: string;
  runtimeOrigin?: string;
  environment: 'development' | 'production' | 'test';
}): DomainOrigins {
  const configured = input.configuredAppOrigin?.trim();
  if (!configured && input.environment === 'production') {
    throw new Error('NEXT_PUBLIC_APP_URL es obligatoria en produccion.');
  }
  const appOrigin = normalizeOrigin(
    configured || input.runtimeOrigin || 'http://localhost:3000',
    input.environment,
  );
  return { publicOrigin: PUBLIC_ORIGIN, appOrigin, legacyAuthOrigins: LEGACY_AUTH_ORIGINS };
}

export function authReturnOrigin(currentOrigin: string, origins: DomainOrigins): string {
  const current = new URL(currentOrigin);
  if (current.href !== `${current.origin}/`) throw new Error('Origen Auth no valido.');
  if (current.origin === origins.appOrigin || origins.legacyAuthOrigins.includes(current.origin)) {
    return current.origin;
  }
  throw new Error('Origen Auth no permitido.');
}

export function isReservedLegacyPath(pathname: string): boolean {
  return LEGACY_RESERVED_PATHS.some((path) => pathname === path || pathname === `${path}/`);
}

function validService(slug: string, knownServices: ReadonlySet<string>): boolean {
  return slug.length <= 64 && SERVICE_SLUG.test(slug) && knownServices.has(slug);
}

function onlyKeys(params: URLSearchParams, keys: readonly string[]): boolean {
  return [...params.keys()].every((key) => keys.includes(key) && params.getAll(key).length === 1);
}

export function parseDomainIntent(
  input: string | URL,
  context: IntentContext,
  source: 'app' | 'public' = 'app',
): ParsedDomainIntent {
  let url: URL;
  try { url = new URL(input); } catch { return { ok: false, reason: 'invalid' }; }
  if (url.origin !== (source === 'app' ? context.origins.appOrigin : context.origins.publicOrigin)) {
    return { ok: false, reason: 'untrusted-origin' };
  }
  if (url.pathname !== '/' || url.hash) return { ok: false, reason: 'invalid' };
  const params = url.searchParams;
  if (!params.has('intent') && !params.has('notification')) return { ok: false, reason: 'not-intent' };
  const type = params.get('intent');
  if (!type && params.has('notification') && onlyKeys(params, ['notification'])) {
    const notificationId = params.get('notification') || '';
    return UUID.test(notificationId)
      ? { ok: true, intent: { kind: 'notification', notificationId } }
      : { ok: false, reason: 'invalid' };
  }
  if (type === 'service' && onlyKeys(params, ['intent', 'service', 'mode'])) {
    const service = params.get('service') || '';
    const mode = params.get('mode');
    if (validService(service, context.knownServices) &&
      (!params.has('mode') || SERVICE_MODES.includes(mode as ServiceIntentMode))) {
      return { ok: true, intent: { kind: 'service', service, ...(mode ? { mode: mode as ServiceIntentMode } : {}) } };
    }
  }
  if (type === 'professional' && onlyKeys(params, ['intent'])) {
    return { ok: true, intent: { kind: 'professional' } };
  }
  if ((type === 'order' || type === 'workroom') && onlyKeys(params, ['intent', 'order'])) {
    const orderId = params.get('order') || '';
    if (UUID.test(orderId)) return { ok: true, intent: { kind: type, orderId } };
  }
  return { ok: false, reason: 'invalid' };
}

export function buildAppIntentUrl(intent: DomainIntent, context: IntentContext): string {
  const url = new URL('/', context.origins.appOrigin);
  if (intent.kind === 'service') {
    if (!validService(intent.service, context.knownServices)) throw new Error('Servicio no valido.');
    if (intent.mode && !SERVICE_MODES.includes(intent.mode)) throw new Error('Modalidad no valida.');
    url.searchParams.set('intent', 'service');
    url.searchParams.set('service', intent.service);
    if (intent.mode) url.searchParams.set('mode', intent.mode);
  } else if (intent.kind === 'professional') {
    url.searchParams.set('intent', 'professional');
  } else if (intent.kind === 'notification') {
    if (!UUID.test(intent.notificationId)) throw new Error('Notificacion no valida.');
    url.searchParams.set('notification', intent.notificationId);
  } else {
    if (!UUID.test(intent.orderId)) throw new Error('Pedido no valido.');
    url.searchParams.set('intent', intent.kind);
    url.searchParams.set('order', intent.orderId);
  }
  return url.toString();
}
