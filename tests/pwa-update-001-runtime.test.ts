import { afterEach, describe, expect, it, vi } from 'vitest';
import { createPwaUpdatePort } from '../app/lib/pwaUpdateRuntime';
import { CURRENT_PWA_BUILD } from '../app/lib/pwaBuildIdentity';

const newer = { ...CURRENT_PWA_BUILD, buildId: 'new-build' };
const wire = (type: string, fields: Record<string, unknown>) => ({
  channel: 'manito:pwa:update', protocolVersion: 1, type, ...fields,
});
type MockEvent = { data?: unknown; source?: unknown };

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('PWA-UPDATE-001 runtime', () => {
  it('signals a prepared peer only when the target worker controls it', async () => {
    const intervalSpy = vi.spyOn(globalThis, 'setInterval');
    const foreground = vi.fn();
    const reconnect = vi.fn();
    const listeners = new Map<string, Set<(event: MockEvent) => void>>();
    const addEventListener = (name: string, listener: (event: MockEvent) => void) => {
      if (!listeners.has(name)) listeners.set(name, new Set());
      listeners.get(name)!.add(listener);
    };
    const removeEventListener = (name: string, listener: (event: MockEvent) => void) => listeners.get(name)?.delete(listener);
    const emit = (name: string, event: MockEvent = {}) => listeners.get(name)?.forEach((listener) => listener(event));
    const worker = (build: typeof CURRENT_PWA_BUILD) => ({
      postMessage: vi.fn((message: { type: string; requestId?: string }) => {
        if (message.type === 'STATUS_REQUEST') queueMicrotask(() => emit('message', {
          source: build.buildId === newer.buildId ? waiting : active,
          data: wire('STATUS_REPLY', { requestId: message.requestId, build }),
        }));
      }),
    });
    const active = worker(CURRENT_PWA_BUILD);
    const waiting = worker(newer);
    const registration = {
      active, waiting, update: vi.fn().mockResolvedValue(undefined),
      addEventListener: vi.fn(), removeEventListener: vi.fn(),
    };
    const serviceWorker = { controller: active, register: vi.fn().mockResolvedValue(registration), addEventListener, removeEventListener };
    vi.stubGlobal('navigator', { serviceWorker, onLine: true });
    vi.stubGlobal('window', { addEventListener: reconnect, removeEventListener: vi.fn() });
    vi.stubGlobal('document', { addEventListener: foreground, removeEventListener: vi.fn(), visibilityState: 'visible' });
    const fetchVersion = vi.fn().mockResolvedValue({ ok: true, json: async () => newer });
    vi.stubGlobal('fetch', fetchVersion);
    const release = vi.fn();
    const port = createPwaUpdatePort(CURRENT_PWA_BUILD);
    await port.start({ prepare: () => 'ready', release });
    expect(port.snapshot().phase).toBe('waiting');
    expect(intervalSpy).toHaveBeenCalledWith(expect.any(Function), 15 * 60 * 1000);
    foreground.mock.calls.find(([name]) => name === 'visibilitychange')?.[1]();
    reconnect.mock.calls.find(([name]) => name === 'online')?.[1]();
    expect(fetchVersion).toHaveBeenCalledTimes(1);
    emit('message', { source: waiting, data: wire('PREPARE', {
      request: { attemptId: 'peer-attempt', targetBuildId: newer.buildId, expiresAt: Date.now() + 10000 },
    }) });
    await vi.waitFor(() => expect(waiting.postMessage).toHaveBeenCalledWith(expect.objectContaining({ type: 'PREPARE_REPLY', result: 'ready' })));
    expect(port.snapshot().phase).toBe('waiting');
    serviceWorker.controller = waiting;
    emit('controllerchange');
    await vi.waitFor(() => expect(port.snapshot().phase).toBe('ready-to-reload'));
    expect(release).toHaveBeenCalledWith('peer-attempt');
    port.stop();
  });
});
