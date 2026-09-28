import { describe, expect, it } from 'vitest';
import { formatPwaDiagnostic } from '../app/lib/pwaDiagnostics';
import type { PwaBuildIdentity, PwaUpdateSnapshot } from '../app/lib/pwaUpdateContract';
import { attemptPwaReload, pwaAuthenticatedRouteReadiness, pwaUpdateAction, PwaFormSafetyController, PwaUpdateSafetyRegistry } from '../app/lib/pwaUpdateSafety';

const old: PwaBuildIdentity = { schemaVersion: 1, protocolVersion: 1, appVersion: '0.1.0', buildId: 'old', commit: 'old', builtAt: '2026-09-27T00:00:00Z' };
const newer = { ...old, buildId: 'new', commit: 'new' };
const waiting: PwaUpdateSnapshot = {
  phase: 'waiting', runningBuild: old, publishedBuild: newer,
  activeWorkerBuildId: old.buildId, waitingWorkerBuildId: newer.buildId,
  lastCheckedAt: '2026-09-27T01:00:00Z', error: null,
};

describe('PWA-UPDATE-001B', () => {
  it('allows a loaded Admin account to become clean without trusting an incomplete session', () => {
    const registry = new PwaUpdateSafetyRegistry();
    registry.initialize();
    registry.register('app-route:root', 'unknown');
    registry.register('account-draft:private-user-id:form', 'clean');
    expect(pwaAuthenticatedRouteReadiness(true, false, true, true)).toBe('unknown');
    expect(pwaAuthenticatedRouteReadiness(false, true, true, true)).toBe('unknown');
    expect(pwaAuthenticatedRouteReadiness(false, false, false, true)).toBe('unknown');
    registry.set('app-route:root', pwaAuthenticatedRouteReadiness(false, false, true, true));
    expect(registry.level()).toBe('clean');
    expect(registry.blockers()).toEqual([]);
  });

  it('releases a discarded or saved draft on unmount and keeps an unresolved write protected', () => {
    const registry = new PwaUpdateSafetyRegistry();
    registry.initialize();
    const unregister = registry.register('specialties:private-user-id:form', 'clean');
    const form = new PwaFormSafetyController((level) => registry.set('specialties:private-user-id:form', level));
    form.dirty();
    form.discard();
    unregister();
    expect(registry.level()).toBe('clean');

    const removeSaved = registry.register('workroom-message:private-order-id:form', 'clean');
    const saved = new PwaFormSafetyController((level) => registry.set('workroom-message:private-order-id:form', level));
    saved.dirty();
    saved.begin();
    saved.saved();
    removeSaved();
    expect(registry.level()).toBe('clean');

    const removePending = registry.register('order-evidence:private-order-id:form', 'clean');
    const pending = new PwaFormSafetyController((level) => registry.set('order-evidence:private-order-id:form', level));
    pending.begin();
    removePending();
    expect(registry.level()).toBe('saving');
    expect(registry.blockers()[0]).toMatchObject({ surface: 'Evidencia', level: 'saving', detached: true });
    pending.saved();
    expect(registry.level()).toBe('clean');
  });

  it('reaches a clean Account after editor discard, editor save, Workroom save, or role switch', () => {
    for (const surface of ['specialties', 'profile-public', 'workroom-message', 'request']) {
      const registry = new PwaUpdateSafetyRegistry();
      registry.initialize();
      registry.register('app-route:root', 'clean');
      const unregister = registry.register(`${surface}:private-id:form`, 'dirty');
      const form = new PwaFormSafetyController((level) => registry.set(`${surface}:private-id:form`, level));
      if (surface === 'specialties') form.discard();
      else { form.begin(); form.saved(); }
      unregister();
      registry.register('account-draft:private-id:form', 'clean');
      expect(registry.level(), surface).toBe('clean');
      expect(pwaUpdateAction(waiting, registry.level(), false, true, true)).toBe('activate');
    }
  });

  it('reports sanitised blockers with timestamps and no profile or order IDs', () => {
    const registry = new PwaUpdateSafetyRegistry();
    registry.initialize();
    registry.register('account-draft:private-user-id:form', 'dirty');
    const blockers = registry.blockers();
    expect(blockers).toHaveLength(1);
    expect(blockers[0].registeredAt).toBeTruthy();
    expect(JSON.stringify(blockers)).not.toContain('private-user-id');
    const copied = formatPwaDiagnostic(waiting, blockers);
    expect(copied).toContain('Datos de cuenta');
    expect(copied).not.toContain('private-user-id');
    expect(copied).not.toContain('access_token');
  });

  it('distinguishes published-only, waiting, blocked and activated states', () => {
    expect(pwaUpdateAction({ ...waiting, phase: 'idle', waitingWorkerBuildId: null }, 'clean', false, true, true)).toBe('discover');
    expect(pwaUpdateAction(waiting, 'dirty', false, true, true)).toBe('blocked');
    expect(pwaUpdateAction(waiting, 'clean', false, true, true)).toBe('activate');
    expect(pwaUpdateAction({ ...waiting, phase: 'failed' }, 'clean', false, true, true)).toBe('discover');
    expect(pwaUpdateAction({ ...waiting, phase: 'ready-to-reload', activeWorkerBuildId: newer.buildId, waitingWorkerBuildId: null }, 'dirty', false, true, true)).toBe('blocked');
    expect(pwaUpdateAction({ ...waiting, phase: 'ready-to-reload', activeWorkerBuildId: newer.buildId, waitingWorkerBuildId: null }, 'clean', false, true, true)).toBe('open');
    expect(pwaUpdateAction({ ...waiting, phase: 'ready-to-reload', publishedBuild: { ...newer, buildId: 'newest' }, activeWorkerBuildId: newer.buildId, waitingWorkerBuildId: null }, 'clean', false, true, true)).toBe('discover');
  });

  it('reactivates after dirty becomes clean and reloads once without touching session data', () => {
    const registry = new PwaUpdateSafetyRegistry();
    registry.initialize();
    registry.register('request:private-user-id:form', 'dirty');
    expect(pwaUpdateAction(waiting, registry.level(), false, true, true)).toBe('blocked');
    registry.set('request:private-user-id:form', 'clean');
    expect(pwaUpdateAction(waiting, registry.level(), false, true, true)).toBe('activate');
    const active = { ...waiting, phase: 'ready-to-reload' as const, activeWorkerBuildId: newer.buildId, waitingWorkerBuildId: null };
    const values = new Map<string, string>();
    const storage = { getItem: (key: string) => values.get(key) || null, setItem: (key: string, value: string) => { values.set(key, value); } };
    const session = { access: 'preserved' };
    let reloads = 0;
    const read = () => ({ snapshot: active, level: registry.level(), held: false, visible: true, online: true });
    expect(attemptPwaReload(newer.buildId, read, storage, () => { reloads += 1; })).toBe('reloaded');
    expect(attemptPwaReload(newer.buildId, read, storage, () => { reloads += 1; })).toBe('storage-failed');
    expect(reloads).toBe(1);
    expect(session.access).toBe('preserved');
  });
});
