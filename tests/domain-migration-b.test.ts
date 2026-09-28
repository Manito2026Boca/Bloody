import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, expect, it, vi } from 'vitest';
import { legacyEntry } from '../app/lib/legacyPwaBridge';
import { domainMigrationIntentContext, domainMigrationOrderId, domainMigrationOrigins } from './fixtures/domainMigration';

const asset = (name: string) => readFileSync(`public/legacy-compat/${name}`, 'utf8');

describe('legacy PWA bridge', () => {
  it('preserves only approved entry intents', () => {
    const root = domainMigrationOrigins.publicOrigin;
    expect(legacyEntry(`${root}/?source=pwa`, domainMigrationIntentContext)).toEqual({
      showBridge: true, destination: `${domainMigrationOrigins.appOrigin}/`,
    });
    expect(legacyEntry(`${root}/?notification=${domainMigrationOrderId}`, domainMigrationIntentContext).destination)
      .toBe(`${domainMigrationOrigins.appOrigin}/?notification=${domainMigrationOrderId}`);
    expect(legacyEntry(`${root}/?intent=order&order=${domainMigrationOrderId}`, domainMigrationIntentContext).destination)
      .toBe(`${domainMigrationOrigins.appOrigin}/?intent=order&order=${domainMigrationOrderId}`);
    expect(legacyEntry(`${root}/?next=https://evil.test`, domainMigrationIntentContext).showBridge).toBe(false);
    expect(legacyEntry(`${root}/`, domainMigrationIntentContext).showBridge).toBe(false);
    expect(legacyEntry(`${root}/`, domainMigrationIntentContext, true).showBridge).toBe(true);
    expect(legacyEntry('https://evil.test/?source=pwa', domainMigrationIntentContext).showBridge).toBe(false);
    expect(legacyEntry(`${root}/continuar/`, domainMigrationIntentContext).destination)
      .toBe(`${domainMigrationOrigins.appOrigin}/`);
    expect(asset('bridge.js')).toContain("url.pathname !== '/continuar/'");
  });

  it('keeps a separate legacy identity and a configurable static route', () => {
    const worker = asset('sw.js');
    const version = JSON.parse(asset('pwa-version.json'));
    expect(worker).toContain(`"buildId":"${version.buildId}"`);
    expect(readFileSync('public/pwa-version.json', 'utf8')).not.toContain(version.buildId);
    expect(asset('continuar.html')).toContain('__APP_ORIGIN__');
    expect(asset('entry.js')).not.toContain('serviceWorker.register');
    expect(worker).not.toContain('caches.delete');
    expect(worker).toContain("url.pathname.startsWith('/auth/')");
  });

  it('routes only recognized installed launch and notification entries from static web', () => {
    const run = (path: string, standalone = false) => {
      const replace = vi.fn();
      runInNewContext(asset('entry.js'), {
        location: { href: `${domainMigrationOrigins.publicOrigin}${path}`, replace },
        URL, navigator: { standalone: false }, matchMedia: () => ({ matches: standalone }),
      });
      return replace;
    };
    expect(run('/?source=pwa')).toHaveBeenCalledWith(`${domainMigrationOrigins.publicOrigin}/continuar`);
    expect(run(`/?notification=${domainMigrationOrderId}`)).toHaveBeenCalledWith(
      `${domainMigrationOrigins.publicOrigin}/continuar?notification=${domainMigrationOrderId}`,
    );
    expect(run('/', true)).toHaveBeenCalledWith(`${domainMigrationOrigins.publicOrigin}/continuar`);
    expect(run('/')).not.toHaveBeenCalled();
    expect(run('/?notification=bad')).not.toHaveBeenCalled();
    expect(run('/?source=pwa&next=https://evil.test')).not.toHaveBeenCalled();
  });

  it('requires every window to vote before activating, including unknown marketing windows', async () => {
    const handlers: Record<string, (event: any) => void> = {};
    const client = { id: 'marketing', url: `${domainMigrationOrigins.publicOrigin}/`, postMessage: vi.fn() };
    const skipWaiting = vi.fn().mockResolvedValue(undefined);
    runInNewContext(asset('sw.js'), {
      self: { location: { origin: domainMigrationOrigins.publicOrigin },
        clients: { matchAll: async () => [client], claim: async () => undefined },
        registration: { showNotification: vi.fn() }, skipWaiting,
        addEventListener: (name: string, handler: (event: any) => void) => { handlers[name] = handler; } },
      URL, Response, Date, Map, Set, Promise, setTimeout, caches: { open: vi.fn(), match: vi.fn() }, fetch: vi.fn(),
    });
    const version = JSON.parse(asset('pwa-version.json'));
    const requester = { postMessage: vi.fn() };
    let completion!: Promise<void>;
    handlers.message({ data: { channel: 'manito:pwa:update', protocolVersion: 1, type: 'ACTIVATE_REQUEST',
      attemptId: 'a', targetBuildId: version.buildId }, source: requester,
      waitUntil: (promise: Promise<void>) => { completion = promise; } });
    await vi.waitFor(() => expect(client.postMessage).toHaveBeenCalledWith(expect.objectContaining({ type: 'PREPARE' })));
    handlers.message({ data: { channel: 'manito:pwa:update', protocolVersion: 1, type: 'PREPARE_REPLY',
      attemptId: 'a', targetBuildId: version.buildId, result: 'blocked' }, source: client });
    await completion;
    expect(skipWaiting).not.toHaveBeenCalled();
    expect(requester.postMessage).toHaveBeenCalledWith(expect.objectContaining({ result: 'deferred' }));
  });

  it('retains historic origin as unknown and retires only an authenticated endpoint', () => {
    const sql = readFileSync('supabase/migrations/20260928000000_domain_migration_push_origin.sql', 'utf8');
    expect(sql).toContain("default 'unknown'");
    expect(sql).toContain('where user_id=auth.uid() and endpoint_hash=md5(p_endpoint)');
    expect(sql).toContain("installation_origin in ('legacy','unknown')");
    expect(sql).not.toContain('delete from public.push_subscriptions');
  });
});
