import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, expect, it, vi } from 'vitest';

const source = readFileSync('public/sw.js', 'utf8');
const version = JSON.parse(readFileSync('public/pwa-version.json', 'utf8'));
const message = (type: string, data: Record<string, unknown> = {}) => ({
  channel: 'manito:pwa:update', protocolVersion: 1, type, ...data,
});

function harness(clientCount = 1, schedule?: (callback: () => void, delay: number) => void) {
  const handlers: Record<string, (event: unknown) => void> = {};
  const skipWaiting = vi.fn().mockResolvedValue(undefined);
  const deleteCache = vi.fn().mockResolvedValue(true);
  const clients = Array.from({ length: clientCount }, (_, index) => ({
    id: `tab-${index}`, url: 'https://manito.test/', postMessage: vi.fn(),
  }));
  runInNewContext(source, {
    self: {
      location: { origin: 'https://manito.test' }, registration: { scope: 'https://manito.test/' },
      clients: { matchAll: vi.fn().mockImplementation(async () => clients), claim: vi.fn().mockResolvedValue(undefined) },
      skipWaiting, addEventListener: (name: string, fn: (event: unknown) => void) => { handlers[name] = fn; },
    }, URL, Response, Date, Map, Set, Promise, setTimeout: schedule || setTimeout,
    caches: {
      open: vi.fn().mockResolvedValue({ addAll: vi.fn().mockResolvedValue(undefined) }),
      keys: vi.fn().mockResolvedValue(['manito-shell-obsolete', `manito-shell-${version.buildId}`]),
      delete: deleteCache,
    }, fetch: vi.fn(),
  });
  return { handlers, clients, skipWaiting, deleteCache };
}

describe('PWA-UPDATE-001 worker', () => {
  it('embeds exactly the published build and waits on installation', () => {
    const { handlers, skipWaiting } = harness();
    expect(source).toContain(`"buildId":"${version.buildId}"`);
    handlers.install({ waitUntil: vi.fn() });
    expect(skipWaiting).not.toHaveBeenCalled();
  });

  it('requires every client to vote ready for the same candidate', async () => {
    const { handlers, clients, skipWaiting } = harness(2);
    const sourceClient = { postMessage: vi.fn() };
    let completion!: Promise<void>;
    handlers.message({ data: message('ACTIVATE_REQUEST', { attemptId: 'a', targetBuildId: version.buildId }),
      source: sourceClient, waitUntil: (promise: Promise<void>) => { completion = promise; } });
    await vi.waitFor(() => expect(clients[0].postMessage).toHaveBeenCalled());
    for (const client of clients) {
      handlers.message({ data: message('PREPARE_REPLY', {
        attemptId: 'a', targetBuildId: version.buildId, result: 'ready',
      }), source: client });
    }
    await completion;
    expect(skipWaiting).toHaveBeenCalledOnce();
    expect(sourceClient.postMessage).toHaveBeenCalledWith(expect.objectContaining({ type: 'ACTIVATE_RESULT', result: 'activated' }));
  });

  it('defers when a client blocks and releases prepared clients', async () => {
    const { handlers, clients, skipWaiting } = harness(2);
    const sourceClient = { postMessage: vi.fn() };
    let completion!: Promise<void>;
    handlers.message({ data: message('ACTIVATE_REQUEST', { attemptId: 'b', targetBuildId: version.buildId }),
      source: sourceClient, waitUntil: (promise: Promise<void>) => { completion = promise; } });
    await vi.waitFor(() => expect(clients[0].postMessage).toHaveBeenCalled());
    handlers.message({ data: message('PREPARE_REPLY', {
      attemptId: 'b', targetBuildId: version.buildId, result: 'blocked',
    }), source: clients[0] });
    await completion;
    expect(skipWaiting).not.toHaveBeenCalled();
    expect(clients[1].postMessage).toHaveBeenCalledWith(expect.objectContaining({ type: 'RELEASE', attemptId: 'b' }));
    expect(sourceClient.postMessage).toHaveBeenCalledWith(expect.objectContaining({ result: 'deferred' }));
  });

  it('replies deferred to a concurrent request while the first vote is pending', async () => {
    const { handlers, clients, skipWaiting } = harness();
    const first = { postMessage: vi.fn() };
    const second = { postMessage: vi.fn() };
    let completion!: Promise<void>;
    handlers.message({ data: message('ACTIVATE_REQUEST', { attemptId: 'first', targetBuildId: version.buildId }),
      source: first, waitUntil: (promise: Promise<void>) => { completion = promise; } });
    handlers.message({ data: message('ACTIVATE_REQUEST', { attemptId: 'second', targetBuildId: version.buildId }),
      source: second, waitUntil: vi.fn() });
    expect(second.postMessage).toHaveBeenCalledWith(expect.objectContaining({
      type: 'ACTIVATE_RESULT', attemptId: 'second', result: 'deferred',
    }));
    await vi.waitFor(() => expect(clients[0].postMessage).toHaveBeenCalled());
    handlers.message({ data: message('PREPARE_REPLY', {
      attemptId: 'first', targetBuildId: version.buildId, result: 'ready',
    }), source: clients[0] });
    await completion;
    expect(skipWaiting).toHaveBeenCalledOnce();
  });

  it('defers a silent client when the 10-second prepare window expires', async () => {
    const timers: Array<{ callback: () => void; delay: number }> = [];
    const { handlers, clients, skipWaiting } = harness(1, (callback, delay) => { timers.push({ callback, delay }); });
    const sourceClient = { postMessage: vi.fn() };
    let completion!: Promise<void>;
    handlers.message({ data: message('ACTIVATE_REQUEST', { attemptId: 'silent', targetBuildId: version.buildId }),
      source: sourceClient, waitUntil: (promise: Promise<void>) => { completion = promise; } });
    await vi.waitFor(() => expect(clients[0].postMessage).toHaveBeenCalled());
    const timeout = timers.find(({ delay }) => delay === 10000);
    expect(timeout).toBeDefined();
    timeout!.callback();
    await completion;
    expect(skipWaiting).not.toHaveBeenCalled();
    expect(sourceClient.postMessage).toHaveBeenCalledWith(expect.objectContaining({ result: 'deferred' }));
    expect(clients[0].postMessage).toHaveBeenCalledWith(expect.objectContaining({ type: 'RELEASE' }));
  });

  it('retires obsolete caches when no open tab needs them', async () => {
    const { handlers, deleteCache } = harness(0);
    let completion!: Promise<void>;
    handlers.activate({ waitUntil: (promise: Promise<void>) => { completion = promise; } });
    await completion;
    expect(deleteCache).toHaveBeenCalledWith('manito-shell-obsolete');
    expect(deleteCache).not.toHaveBeenCalledWith(`manito-shell-${version.buildId}`);
  });
});
