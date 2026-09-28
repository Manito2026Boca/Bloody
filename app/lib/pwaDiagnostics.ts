import type { PwaUpdateSnapshot } from './pwaUpdateContract';
import type { PwaSafeBlocker } from './pwaUpdateSafety';

export function pwaUpdateStatus(snapshot: PwaUpdateSnapshot): string {
  if (snapshot.phase === 'failed') return 'No se pudo comprobar';
  if (snapshot.phase === 'ready-to-reload') return 'Lista para abrir';
  if (['downloading', 'waiting', 'activating', 'deferred'].includes(snapshot.phase)) return 'Pendiente';
  if (!snapshot.publishedBuild) return 'Sin verificar';
  return snapshot.publishedBuild.buildId === snapshot.runningBuild.buildId ? 'Al día' : 'Pendiente';
}

export function formatPwaDiagnostic(snapshot: PwaUpdateSnapshot, blockers: PwaSafeBlocker[] = []): string {
  return JSON.stringify({
    appVersion: snapshot.runningBuild.appVersion,
    buildId: snapshot.runningBuild.buildId,
    commit: snapshot.runningBuild.commit,
    builtAt: snapshot.runningBuild.builtAt,
    activeWorkerBuildId: snapshot.activeWorkerBuildId,
    waitingWorkerBuildId: snapshot.waitingWorkerBuildId,
    publishedBuildId: snapshot.publishedBuild?.buildId ?? null,
    updatePhase: snapshot.phase,
    updatePending: snapshot.phase === 'ready-to-reload' ||
      ['downloading', 'waiting', 'activating', 'deferred'].includes(snapshot.phase) ||
      Boolean(snapshot.publishedBuild && snapshot.publishedBuild.buildId !== snapshot.runningBuild.buildId),
    updateStatus: pwaUpdateStatus(snapshot),
    lastCheckedAt: snapshot.lastCheckedAt,
    blockerCount: blockers.length,
    blockers: blockers.map(({ surface, level, registeredAt, detached }) => ({ surface, level, registeredAt, detached })),
  }, null, 2);
}
