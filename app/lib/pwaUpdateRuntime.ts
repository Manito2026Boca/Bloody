import {
  PWA_UPDATE_CHANNEL,
  PWA_UPDATE_PROTOCOL,
  type PwaActivationResult,
  type PwaBuildIdentity,
  type PwaCheckReason,
  type PwaPrepareResult,
  type PwaUpdateHandlers,
  type PwaUpdatePort,
  type PwaUpdateSnapshot,
  type PwaWireMessage,
} from './pwaUpdateContract';

const VERSION_URL = '/pwa-version.json';
const WORKER_URL = '/sw.js';
const CHECK_INTERVAL_MS = 15 * 60 * 1000;
const BURST_THROTTLE_MS = 60 * 1000;
const REQUEST_TIMEOUT_MS = 12000;

function validBuild(value: unknown): value is PwaBuildIdentity {
  if (!value || typeof value !== 'object') return false;
  const build = value as Partial<PwaBuildIdentity>;
  return build.schemaVersion === 1 && build.protocolVersion === PWA_UPDATE_PROTOCOL &&
    [build.appVersion, build.buildId, build.commit, build.builtAt].every((field) => typeof field === 'string' && field.length > 0);
}

function isWire(value: unknown): value is PwaWireMessage {
  return !!value && typeof value === 'object' &&
    (value as PwaWireMessage).channel === PWA_UPDATE_CHANNEL &&
    (value as PwaWireMessage).protocolVersion === PWA_UPDATE_PROTOCOL;
}

export function createPwaUpdatePort(runningBuild: PwaBuildIdentity): PwaUpdatePort {
  let state: PwaUpdateSnapshot = {
    phase: 'idle', runningBuild, publishedBuild: null, activeWorkerBuildId: null,
    waitingWorkerBuildId: null, lastCheckedAt: null, error: null,
  };
  let registration: ServiceWorkerRegistration | null = null;
  let handlers: PwaUpdateHandlers | null = null;
  let started = false;
  let interval: ReturnType<typeof setInterval> | null = null;
  let targetInFlight: string | null = null;
  let lastCheckStartedAt = 0;
  const listeners = new Set<(snapshot: PwaUpdateSnapshot) => void>();
  const pending = new Map<string, (message: PwaWireMessage | null) => void>();
  const guarded = new Map<string, string>();
  const released = new Set<string>();

  const publish = (patch: Partial<PwaUpdateSnapshot>) => {
    state = { ...state, ...patch };
    listeners.forEach((listener) => listener(state));
  };

  function request(worker: ServiceWorker, message: PwaWireMessage, id: string): Promise<PwaWireMessage | null> {
    return new Promise((resolve) => {
      const timer = setTimeout(() => { pending.delete(id); resolve(null); }, REQUEST_TIMEOUT_MS);
      pending.set(id, (reply) => { clearTimeout(timer); pending.delete(id); resolve(reply); });
      worker.postMessage(message);
    });
  }

  async function workerBuild(worker: ServiceWorker | null): Promise<PwaBuildIdentity | null> {
    if (!worker) return null;
    const requestId = crypto.randomUUID();
    const reply = await request(worker, {
      channel: PWA_UPDATE_CHANNEL, protocolVersion: PWA_UPDATE_PROTOCOL,
      type: 'STATUS_REQUEST', requestId,
    }, requestId);
    return reply?.type === 'STATUS_REPLY' && reply.requestId === requestId && validBuild(reply.build) ? reply.build : null;
  }

  async function refreshWorkers() {
    if (!registration) return;
    const [active, waiting] = await Promise.all([
      workerBuild(navigator.serviceWorker.controller || registration.active),
      workerBuild(registration.waiting),
    ]);
    publish({ activeWorkerBuildId: active?.buildId || null, waitingWorkerBuildId: waiting?.buildId || null });
    const preparedForActive = [...guarded.values()].some((target) => target === active?.buildId);
    if ((targetInFlight === active?.buildId || preparedForActive) && navigator.serviceWorker.controller) {
      for (const [attemptId, target] of guarded) {
        if (target === active?.buildId) {
          handlers?.release(attemptId);
          guarded.delete(attemptId);
        }
      }
      publish({ phase: 'ready-to-reload', error: null });
      targetInFlight = null;
    } else if (waiting && waiting.buildId !== runningBuild.buildId && state.phase !== 'activating') {
      publish({ phase: 'waiting', error: null });
    }
  }

  async function onMessage(event: MessageEvent) {
    const message = event.data;
    if (!isWire(message)) return;
    if (message.type === 'STATUS_REQUEST' && typeof message.requestId === 'string') {
      (event.source as ServiceWorker | null)?.postMessage({
        channel: PWA_UPDATE_CHANNEL, protocolVersion: PWA_UPDATE_PROTOCOL,
        type: 'STATUS_REPLY', requestId: message.requestId, build: runningBuild,
      } satisfies PwaWireMessage);
    }
    if (message.type === 'STATUS_REPLY') pending.get(message.requestId)?.(message);
    if (message.type === 'ACTIVATE_RESULT') pending.get(message.attemptId)?.(message);
    if (message.type === 'RELEASE') {
      released.add(message.attemptId);
      if (guarded.delete(message.attemptId)) handlers?.release(message.attemptId);
    }
    const prepareHandlers = handlers;
    if (message.type !== 'PREPARE' || !prepareHandlers) return;
    const { request: preparation } = message;
    if (!preparation || !preparation.attemptId || !preparation.targetBuildId ||
      preparation.expiresAt <= Date.now() || event.source !== registration?.waiting) return;
    let result: PwaPrepareResult = 'blocked';
    try {
      result = await prepareHandlers.prepare(preparation);
      if (result === 'ready' && started && preparation.expiresAt > Date.now() && !released.has(preparation.attemptId)) {
        guarded.set(preparation.attemptId, preparation.targetBuildId);
      }
      else {
        if (result === 'ready') prepareHandlers.release(preparation.attemptId);
        result = 'blocked';
      }
    } catch { result = 'blocked'; }
    (event.source as ServiceWorker).postMessage({
      channel: PWA_UPDATE_CHANNEL, protocolVersion: PWA_UPDATE_PROTOCOL,
      type: 'PREPARE_REPLY', attemptId: preparation.attemptId,
      targetBuildId: preparation.targetBuildId, result,
    } satisfies PwaWireMessage);
  }

  const onControllerChange = () => { void refreshWorkers(); };
  const onForeground = () => { if (document.visibilityState === 'visible') void port.check('foreground'); };
  const onReconnect = () => { void port.check('reconnect'); };
  const onUpdateFound = () => {
    publish({ phase: 'downloading' });
    registration?.installing?.addEventListener('statechange', () => {
      if (registration?.waiting) void refreshWorkers();
    });
  };

  const port: PwaUpdatePort = {
    async start(nextHandlers) {
      if (started) return;
      handlers = nextHandlers;
      if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) {
        publish({ phase: 'failed', error: 'unsupported' });
        return;
      }
      started = true;
      navigator.serviceWorker.addEventListener('message', onMessage);
      navigator.serviceWorker.addEventListener('controllerchange', onControllerChange);
      document.addEventListener('visibilitychange', onForeground);
      window.addEventListener('online', onReconnect);
      try {
        registration = await navigator.serviceWorker.register(WORKER_URL, { updateViaCache: 'none' });
        if (!started) return;
        registration.addEventListener('updatefound', onUpdateFound);
        interval = setInterval(() => { void port.check('interval'); }, CHECK_INTERVAL_MS);
        await port.check('startup');
      } catch {
        publish({ phase: 'failed', error: 'startup-failed' });
      }
    },
    stop() {
      if (!started) return;
      started = false;
      if (interval) clearInterval(interval);
      interval = null;
      registration?.removeEventListener('updatefound', onUpdateFound);
      navigator.serviceWorker.removeEventListener('message', onMessage);
      navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange);
      document.removeEventListener('visibilitychange', onForeground);
      window.removeEventListener('online', onReconnect);
      for (const resolve of pending.values()) resolve(null);
      pending.clear();
      for (const id of guarded.keys()) handlers?.release(id);
      guarded.clear();
      released.clear();
      targetInFlight = null;
      handlers = null;
    },
    snapshot() { return state; },
    subscribe(listener) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    async check(_reason: PwaCheckReason) {
      if (!registration) return;
      if ((_reason === 'interval' || _reason === 'foreground' || _reason === 'reconnect') &&
        (document.visibilityState !== 'visible' || !navigator.onLine)) return;
      if ((_reason === 'foreground' || _reason === 'reconnect') &&
        Date.now() - lastCheckStartedAt < BURST_THROTTLE_MS) return;
      lastCheckStartedAt = Date.now();
      if (!navigator.onLine) { publish({ phase: 'failed', error: 'offline' }); return; }
      const readyToReload = state.phase === 'ready-to-reload';
      if (!readyToReload) publish({ phase: 'checking', error: null });
      try {
        const response = await fetch(VERSION_URL, { cache: 'no-store', credentials: 'same-origin' });
        if (!response.ok) throw new Error('version');
        const build: unknown = await response.json();
        if (!validBuild(build)) {
          publish({ phase: 'failed', error: 'protocol-mismatch' });
          return;
        }
        publish({ publishedBuild: build, lastCheckedAt: new Date().toISOString() });
        try {
          await registration.update();
        } catch {
          publish({ phase: 'failed', error: 'download-failed' });
          return;
        }
        await refreshWorkers();
        if (state.phase === 'checking') publish({ phase: 'idle' });
        if (readyToReload) publish({ phase: 'ready-to-reload' });
      } catch { publish({ phase: 'failed', error: 'version-unavailable' }); }
    },
    async activate(targetBuildId): Promise<PwaActivationResult> {
      if (!registration?.waiting || !state.publishedBuild || state.publishedBuild.buildId !== targetBuildId ||
        state.waitingWorkerBuildId !== targetBuildId) return 'deferred';
      const candidate = await workerBuild(registration.waiting);
      if (candidate?.buildId !== targetBuildId) return 'deferred';
      const attemptId = crypto.randomUUID();
      targetInFlight = targetBuildId;
      publish({ phase: 'activating', error: null });
      const reply = await request(registration.waiting, {
        channel: PWA_UPDATE_CHANNEL, protocolVersion: PWA_UPDATE_PROTOCOL,
        type: 'ACTIVATE_REQUEST', attemptId, targetBuildId,
      }, attemptId);
      const result = reply?.type === 'ACTIVATE_RESULT' && reply.attemptId === attemptId ? reply.result : 'failed';
      if (result !== 'activated') {
        targetInFlight = null;
        publish({ phase: result === 'deferred' ? 'deferred' : 'failed', error: result === 'deferred' ? 'activation-blocked' : 'download-failed' });
      }
      return result;
    },
  };
  return port;
}
