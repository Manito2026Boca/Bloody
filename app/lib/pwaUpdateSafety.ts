import type { PwaPrepareRequest, PwaPrepareResult, PwaReadinessLevel, PwaUpdateSnapshot } from './pwaUpdateContract';

const priority: Record<PwaReadinessLevel, number> = { unknown: 1, clean: 0, dirty: 2, saving: 3, critical: 4 };

export class PwaUpdateSafetyRegistry {
  private reasons = new Map<string, PwaReadinessLevel>();
  private orphaned = new Set<string>();
  private listeners = new Set<() => void>();
  private hold: { attemptId: string; expiresAt: number } | null = null;
  private holdTimer: ReturnType<typeof setTimeout> | null = null;
  private initialized = false;
  private version = 0;

  initialize() { this.initialized = true; this.emit(); }
  register(reason: string, level: PwaReadinessLevel = 'unknown') {
    if (!this.reasons.has(reason)) this.reasons.set(reason, level);
    this.orphaned.delete(reason);
    this.emit();
    return () => {
      const current = this.reasons.get(reason);
      if (current === 'saving' || current === 'critical') this.orphaned.add(reason);
      else { this.reasons.delete(reason); this.orphaned.delete(reason); }
      this.emit();
    };
  }
  set(reason: string, level: PwaReadinessLevel) {
    if (!this.reasons.has(reason)) throw new Error(`Unregistered PWA safety reason: ${reason}`);
    if (level === 'clean' && this.orphaned.has(reason)) { this.reasons.delete(reason); this.orphaned.delete(reason); this.emit(); return; }
    if (this.reasons.get(reason) === level) return;
    this.reasons.set(reason, level);
    this.emit();
  }
  level(): PwaReadinessLevel {
    if (!this.initialized) return 'unknown';
    return [...this.reasons.values()].reduce<PwaReadinessLevel>((worst, current) =>
      priority[current] > priority[worst] ? current : worst, 'clean');
  }
  isHeld() {
    if (this.hold && this.hold.expiresAt <= Date.now()) this.clearHold();
    return this.hold !== null;
  }
  prepare(request: PwaPrepareRequest, eligible: boolean): PwaPrepareResult {
    if (!request.attemptId || !request.targetBuildId || request.expiresAt <= Date.now()) return 'blocked';
    if (this.isHeld()) return 'blocked';
    // Guard edits before taking the readiness snapshot, in the same task.
    this.hold = { attemptId: request.attemptId, expiresAt: request.expiresAt };
    this.holdTimer = setTimeout(() => this.release(request.attemptId), Math.max(0, request.expiresAt - Date.now()));
    this.emit();
    if (!eligible || this.level() !== 'clean') { this.clearHold(); return 'blocked'; }
    return 'ready';
  }
  release(attemptId: string) {
    if (this.hold?.attemptId === attemptId) this.clearHold();
  }
  clearHold() { if (this.holdTimer) clearTimeout(this.holdTimer); this.holdTimer = null; this.hold = null; this.emit(); }
  subscribe(listener: () => void) { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; }
  revision() { return this.version; }
  unresolvedCount() { return [...this.orphaned].filter((reason) => this.reasons.get(reason) === 'critical').length; }
  reconcileOrphans() {
    for (const reason of this.orphaned) {
      if (this.reasons.get(reason) !== 'critical') continue;
      this.reasons.delete(reason);
      this.orphaned.delete(reason);
    }
    this.emit();
  }
  private emit() { this.version += 1; this.listeners.forEach((listener) => listener()); }
}

export const PWA_RELOAD_MARKER = 'manito:pwa:reload-target';

export function pwaPrepareEligible(snapshot: PwaUpdateSnapshot, targetBuildId: string, visible: boolean, online: boolean, startupSafe: boolean) {
  return visible && online && startupSafe && !!targetBuildId && targetBuildId !== snapshot.runningBuild.buildId;
}

export function pwaActivationTarget(snapshot: PwaUpdateSnapshot, level: PwaReadinessLevel, held: boolean, visible: boolean, online: boolean) {
  if (!visible || !online || held || level !== 'clean' || !['waiting', 'deferred'].includes(snapshot.phase)) return null;
  const target = snapshot.waitingWorkerBuildId;
  if (!target || target === snapshot.runningBuild.buildId) return null;
  if (snapshot.publishedBuild && snapshot.publishedBuild.buildId !== target) return null;
  return target;
}

export function pwaReloadTarget(snapshot: PwaUpdateSnapshot, level: PwaReadinessLevel, held: boolean, visible: boolean, online: boolean) {
  if (!visible || !online || held || level !== 'clean' || snapshot.phase !== 'ready-to-reload') return null;
  const target = snapshot.activeWorkerBuildId;
  if (!target || target === snapshot.runningBuild.buildId) return null;
  if (snapshot.publishedBuild && snapshot.publishedBuild.buildId !== target) return null;
  return target;
}

export function authorizePwaReload(targetBuildId: string, runningBuildId: string, storage: Pick<Storage, 'getItem' | 'setItem'>) {
  if (!targetBuildId || targetBuildId === runningBuildId) return false;
  try {
    if (storage.getItem(PWA_RELOAD_MARKER) === targetBuildId) return false;
    storage.setItem(PWA_RELOAD_MARKER, targetBuildId);
    return storage.getItem(PWA_RELOAD_MARKER) === targetBuildId;
  } catch { return false; }
}
