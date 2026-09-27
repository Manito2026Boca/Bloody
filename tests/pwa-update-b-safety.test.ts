import { afterEach, describe, expect, it, vi } from 'vitest';
import { createPwaUpdatePortFixture } from './fixtures/pwaUpdatePort';
import type { PwaBuildIdentity, PwaUpdateSnapshot } from '../app/lib/pwaUpdateContract';
import { attemptPwaReload, authorizePwaReload, pwaActivationTarget, pwaPrepareEligible, pwaReloadTarget, PwaUntrackedEditTracker, PwaUpdateSafetyRegistry } from '../app/lib/pwaUpdateSafety';

const build: PwaBuildIdentity = {
  schemaVersion: 1, protocolVersion: 1, appVersion: '1', buildId: 'old', commit: 'c0', builtAt: '2026-09-26T00:00:00Z',
};
const initial: PwaUpdateSnapshot = {
  phase: 'waiting', runningBuild: build, publishedBuild: { ...build, buildId: 'new' },
  activeWorkerBuildId: 'old', waitingWorkerBuildId: 'new', lastCheckedAt: null, error: null,
};

afterEach(() => vi.useRealTimers());

describe('Package B update safety', () => {
  it('keeps uninitialized and independent dirty, saving, critical reasons protected', () => {
    const safety = new PwaUpdateSafetyRegistry();
    expect(safety.level()).toBe('unknown');
    safety.initialize();
    const removeA = safety.register('draft', 'dirty');
    const removeB = safety.register('upload', 'saving');
    expect(safety.level()).toBe('saving');
    safety.set('draft', 'critical');
    expect(safety.level()).toBe('critical');
    removeA();
    expect(safety.level()).toBe('critical');
    removeB();
    expect(safety.level()).toBe('critical');
    expect(safety.unresolvedCount()).toBe(1);
    safety.reconcileOrphans();
    expect(safety.level()).toBe('saving');
  });

  it('releases a saved reason on unmount but retains an uncertain mutation', () => {
    const safety = new PwaUpdateSafetyRegistry();
    safety.initialize();
    const releaseDraft = safety.register('saved', 'dirty');
    safety.set('saved', 'clean');
    releaseDraft();
    expect(safety.level()).toBe('clean');
    const releaseUpload = safety.register('upload', 'saving');
    releaseUpload();
    expect(safety.level()).toBe('saving');
    expect(safety.unresolvedCount()).toBe(0);
    safety.reconcileOrphans();
    expect(safety.level()).toBe('saving');
    safety.set('upload', 'dirty');
    expect(safety.level()).toBe('dirty');
    expect(safety.unresolvedCount()).toBe(1);
    safety.reconcileOrphans();
    expect(safety.level()).toBe('clean');
    safety.set('upload', 'critical'); // A late callback after explicit review cannot re-block the page.
    expect(safety.level()).toBe('clean');
    const releasePending = safety.register('pending', 'saving');
    releasePending();
    expect(safety.unresolvedCount()).toBe(0);
    safety.reconcileOrphans();
    expect(safety.level()).toBe('saving');
    safety.set('pending', 'dirty');
    expect(safety.level()).toBe('dirty');
    expect(safety.unresolvedCount()).toBe(1);
    safety.reconcileOrphans();
    expect(safety.level()).toBe('clean');
    const releaseAgain = safety.register('upload', 'clean');
    safety.set('upload', 'critical');
    releaseAgain();
    expect(safety.unresolvedCount()).toBe(1);
    safety.reconcileOrphans();
    expect(safety.level()).toBe('clean');
  });

  it('keeps an untouched generic form clean, then protects its live edit and submit', () => {
    const safety = new PwaUpdateSafetyRegistry();
    safety.initialize();
    safety.register('untracked-edit', 'clean');
    const tracker = new PwaUntrackedEditTracker(safety);
    const field = { isConnected: true };
    const form = { isConnected: true };
    expect(safety.level()).toBe('clean');
    tracker.edit(field);
    expect(safety.level()).toBe('dirty');
    expect(safety.unresolvedCount()).toBe(0); // The draft is still on screen.
    safety.reconcileOrphans();
    expect(safety.level()).toBe('dirty');
    tracker.submit(form);
    expect(safety.level()).toBe('dirty');
    tracker.scanDetached();
    expect(safety.unresolvedCount()).toBe(0); // A live submission is never reviewable.
    safety.reconcileOrphans();
    expect(safety.level()).toBe('dirty');
    field.isConnected = false;
    form.isConnected = false;
    tracker.scanDetached();
    expect(safety.unresolvedCount()).toBe(1);
    safety.reconcileOrphans();
    expect(safety.level()).toBe('clean');
    expect(safety.unresolvedCount()).toBe(0);
  });

  it('revokes detached-draft review when another live edit arrives', () => {
    const safety = new PwaUpdateSafetyRegistry();
    safety.initialize();
    safety.register('untracked-edit', 'clean');
    safety.set('untracked-edit', 'dirty');
    safety.markReviewable('untracked-edit'); // The edited control was removed.
    expect(safety.unresolvedCount()).toBe(1);
    safety.set('untracked-edit', 'dirty'); // Input in a newly mounted live form.
    expect(safety.unresolvedCount()).toBe(0);
    safety.reconcileOrphans();
    expect(safety.level()).toBe('dirty');
    safety.set('untracked-edit', 'saving');
    safety.markReviewable('untracked-edit');
    expect(safety.unresolvedCount()).toBe(0);
    safety.reconcileOrphans();
    expect(safety.level()).toBe('saving');
  });

  it('keeps an autofilled untracked submit dirty, never saving, until its form detaches', () => {
    const safety = new PwaUpdateSafetyRegistry();
    safety.initialize();
    safety.register('untracked-edit', 'clean');
    const tracker = new PwaUntrackedEditTracker(safety);
    let connected = true;
    const form = { get isConnected() { return connected; } };
    expect(safety.level()).toBe('clean');
    tracker.submit(form);
    expect(safety.level()).toBe('dirty');
    tracker.scanDetached();
    expect(safety.unresolvedCount()).toBe(0);
    safety.reconcileOrphans();
    expect(safety.level()).toBe('dirty');
    connected = false;
    tracker.scanDetached();
    expect(safety.unresolvedCount()).toBe(1);
    safety.reconcileOrphans();
    expect(safety.level()).toBe('clean');
  });

  it('votes synchronously through the fixture port and holds edits until matching release', async () => {
    const fixture = createPwaUpdatePortFixture(initial);
    const safety = new PwaUpdateSafetyRegistry();
    safety.initialize();
    const remove = safety.register('workroom', 'clean');
    await fixture.port.start({ prepare: (request) => safety.prepare(request, true), release: (id) => safety.release(id) });
    const request = { attemptId: 'attempt-1', targetBuildId: 'new', expiresAt: Date.now() + 5000 };
    expect(fixture.handlers()?.prepare(request)).toBe('ready');
    expect(safety.isHeld()).toBe(true);
    fixture.handlers()?.release('other');
    expect(safety.isHeld()).toBe(true);
    fixture.handlers()?.release('attempt-1');
    expect(safety.isHeld()).toBe(false);
    safety.set('workroom', 'dirty');
    expect(fixture.handlers()?.prepare({ ...request, attemptId: 'attempt-2' })).toBe('blocked');
    expect(safety.isHeld()).toBe(false);
    remove();
    fixture.port.stop();
  });

  it('expires a hold without turning a blocked client ready', () => {
    vi.useFakeTimers();
    vi.setSystemTime(1000);
    const safety = new PwaUpdateSafetyRegistry();
    safety.initialize();
    expect(safety.prepare({ attemptId: 'a', targetBuildId: 'new', expiresAt: 1100 }, true)).toBe('ready');
    vi.advanceTimersByTime(101);
    expect(safety.isHeld()).toBe(false);
    expect(safety.prepare({ attemptId: 'late', targetBuildId: 'new', expiresAt: 1000 }, true)).toBe('blocked');
  });

  it('records reload authority only once for each target and fails closed on storage errors', () => {
    const values = new Map<string, string>();
    const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
    expect(authorizePwaReload('new', 'old', storage)).toBe(true);
    expect(authorizePwaReload('new', 'old', storage)).toBe(false);
    expect(authorizePwaReload('old', 'old', storage)).toBe(false);
    expect(authorizePwaReload('next', 'new', storage)).toBe(true);
    expect(authorizePwaReload('broken', 'new', { getItem: () => null, setItem: () => { throw new Error('denied'); } })).toBe(false);
  });

  it('reads live safety and port state before the marker and reload, even after a clean render', () => {
    const fixture = createPwaUpdatePortFixture({ ...initial, phase: 'ready-to-reload', activeWorkerBuildId: 'new', waitingWorkerBuildId: null });
    const safety = new PwaUpdateSafetyRegistry();
    safety.initialize();
    const release = safety.register('draft', 'clean');
    const order: string[] = [];
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => { order.push('get-marker'); return values.get(key) ?? null; },
      setItem: (key: string, value: string) => { order.push('set-marker'); values.set(key, value); },
    };
    const read = () => { order.push('read-live'); return { snapshot: fixture.port.snapshot(), level: safety.level(), held: safety.isHeld(), visible: true, online: true }; };
    const reload = () => { order.push('reload'); };
    expect(pwaReloadTarget(fixture.port.snapshot(), safety.level(), false, true, true)).toBe('new');
    safety.set('draft', 'dirty');
    expect(attemptPwaReload('new', read, storage, reload)).toBe('deferred');
    expect(order).toEqual(['read-live']);
    order.length = 0;
    safety.set('draft', 'clean');
    fixture.publish({ ...fixture.port.snapshot(), phase: 'deferred' });
    expect(attemptPwaReload('new', read, storage, reload)).toBe('deferred');
    expect(order).toEqual(['read-live']);
    order.length = 0;
    fixture.publish({ ...fixture.port.snapshot(), phase: 'ready-to-reload' });
    expect(attemptPwaReload('new', read, storage, reload)).toBe('reloaded');
    expect(order).toEqual(['read-live', 'get-marker', 'set-marker', 'get-marker', 'reload']);
    release();
  });

  it('rechecks a controlled page when hidden becomes visible', () => {
    const controlled = { ...initial, phase: 'ready-to-reload' as const, activeWorkerBuildId: 'new', waitingWorkerBuildId: null };
    expect(pwaReloadTarget(controlled, 'clean', false, false, true)).toBeNull();
    expect(pwaReloadTarget(controlled, 'clean', false, true, true)).toBe('new');
    expect(pwaReloadTarget(controlled, 'dirty', false, true, true)).toBeNull();
    expect(pwaReloadTarget(controlled, 'clean', true, true, true)).toBeNull();
    expect(pwaReloadTarget(controlled, 'clean', false, true, false)).toBeNull();
    expect(pwaReloadTarget({ ...controlled, activeWorkerBuildId: 'old' }, 'clean', false, true, true)).toBeNull();
    expect(pwaReloadTarget({ ...controlled, publishedBuild: { ...build, buildId: 'newer' } }, 'clean', false, true, true)).toBeNull();
  });

  it('activates only a waiting target at a local clean, visible, online point', () => {
    expect(pwaActivationTarget(initial, 'clean', false, false, true)).toBeNull();
    expect(pwaActivationTarget(initial, 'dirty', false, true, true)).toBeNull();
    expect(pwaActivationTarget(initial, 'saving', false, true, true)).toBeNull();
    expect(pwaActivationTarget(initial, 'critical', false, true, true)).toBeNull();
    expect(pwaActivationTarget(initial, 'clean', true, true, true)).toBeNull();
    expect(pwaActivationTarget(initial, 'clean', false, true, false)).toBeNull();
    expect(pwaActivationTarget(initial, 'clean', false, true, true)).toBe('new');
    expect(pwaActivationTarget({ ...initial, waitingWorkerBuildId: null }, 'clean', false, true, true)).toBeNull();
  });

  it('allows an otherwise clean peer to vote when its own port has no waiting ID', async () => {
    const fixture = createPwaUpdatePortFixture({ ...initial, waitingWorkerBuildId: null, publishedBuild: null });
    const safety = new PwaUpdateSafetyRegistry();
    safety.initialize();
    await fixture.port.start({
      prepare: (request) => safety.prepare(request, pwaPrepareEligible(fixture.port.snapshot(), request.targetBuildId, true, true, true)),
      release: (id) => safety.release(id),
    });
    const request = { attemptId: 'peer-attempt', targetBuildId: 'new', expiresAt: Date.now() + 1000 };
    expect(fixture.handlers()?.prepare(request)).toBe('ready');
    expect(safety.isHeld()).toBe(true);
    fixture.handlers()?.release(request.attemptId);
    expect(safety.isHeld()).toBe(false);
    fixture.port.stop();
  });
});
