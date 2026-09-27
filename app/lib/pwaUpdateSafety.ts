import type { PwaPrepareRequest, PwaPrepareResult, PwaReadinessLevel, PwaUpdateSnapshot } from './pwaUpdateContract';

const priority: Record<PwaReadinessLevel, number> = { unknown: 1, clean: 0, dirty: 2, saving: 3, critical: 4 };

export class PwaUpdateSafetyRegistry {
  private reasons = new Map<string, PwaReadinessLevel>();
  private orphaned = new Set<string>();
  private reviewable = new Set<string>();
  private reconciled = new Set<string>();
  private listeners = new Set<() => void>();
  private hold: { attemptId: string; expiresAt: number } | null = null;
  private holdTimer: ReturnType<typeof setTimeout> | null = null;
  private initialized = false;
  private version = 0;

  initialize() { this.initialized = true; this.emit(); }
  register(reason: string, level: PwaReadinessLevel = 'unknown') {
    if (!this.reasons.has(reason)) this.reasons.set(reason, level);
    this.orphaned.delete(reason);
    this.reconciled.delete(reason);
    this.emit();
    return () => {
      const current = this.reasons.get(reason);
      if (current === 'saving' || current === 'critical') this.orphaned.add(reason);
      else { this.reasons.delete(reason); this.orphaned.delete(reason); this.reviewable.delete(reason); }
      this.emit();
    };
  }
  set(reason: string, level: PwaReadinessLevel) {
    if (!this.reasons.has(reason)) {
      if (this.reconciled.has(reason)) return;
      throw new Error(`Unregistered PWA safety reason: ${reason}`);
    }
    if (level === 'clean' && this.orphaned.has(reason)) { this.reasons.delete(reason); this.orphaned.delete(reason); this.reviewable.delete(reason); this.emit(); return; }
    const clearedReview = this.reviewable.delete(reason);
    if (this.reasons.get(reason) === level) { if (clearedReview) this.emit(); return; }
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
  markReviewable(reason: string) {
    if (!this.reasons.has(reason)) throw new Error(`Unregistered PWA safety reason: ${reason}`);
    if (this.reasons.get(reason) !== 'dirty' && this.reasons.get(reason) !== 'critical') return;
    if (this.reviewable.has(reason)) return;
    this.reviewable.add(reason);
    this.emit();
  }
  reasonLevel(reason: string) { return this.reasons.get(reason); }
  unresolvedCount() {
    return new Set([...this.orphaned, ...this.reviewable].filter((reason) => {
      const level = this.reasons.get(reason);
      return level === 'dirty' || level === 'critical';
    })).size;
  }
  canReconcile() { return this.reasons.get('untracked-form') === 'clean' && this.unresolvedCount() > 0; }
  reconcileOrphans() {
    for (const reason of new Set([...this.orphaned, ...this.reviewable])) {
      const level = this.reasons.get(reason);
      if (level !== 'dirty' && level !== 'critical') continue;
      if (this.orphaned.has(reason)) { this.reasons.delete(reason); this.reconciled.add(reason); }
      else this.reasons.set(reason, 'clean');
      this.orphaned.delete(reason);
      this.reviewable.delete(reason);
    }
    this.emit();
  }
  private emit() { this.version += 1; this.listeners.forEach((listener) => listener()); }
}

type UntrackedTarget = Pick<Element, 'isConnected'>;

export class PwaUntrackedEditTracker {
  private targets = new Set<UntrackedTarget>();

  constructor(private registry: PwaUpdateSafetyRegistry) {}

  edit(target: UntrackedTarget) {
    this.targets.add(target);
    this.registry.set('untracked-edit', 'dirty');
  }

  scanDetached() {
    for (const target of this.targets) if (!target.isConnected) this.targets.delete(target);
    if (!this.targets.size && this.registry.reasonLevel('untracked-edit') === 'dirty') this.registry.markReviewable('untracked-edit');
  }
}

export function syncUntrackedFormSafety(registry: PwaUpdateSafetyRegistry, mounted: boolean) {
  if (registry.reasonLevel('untracked-form') !== 'critical') registry.set('untracked-form', mounted ? 'unknown' : 'clean');
}

export function holdUntrackedSubmit(registry: PwaUpdateSafetyRegistry) {
  registry.set('untracked-form', 'critical');
}

export class PwaFormSafetyController {
  private pending = 0;
  private failedState = false;
  private changedWhileSaving = false;

  constructor(private setLevel: (level: PwaReadinessLevel) => void) {}

  dirty() {
    if (this.pending) { this.changedWhileSaving = true; return; }
    if (this.failedState) return;
    this.setLevel('dirty');
  }

  begin() {
    if (this.pending++ === 0) {
      this.failedState = false;
      this.changedWhileSaving = false;
      this.setLevel('saving');
    }
  }

  saved() {
    if (!this.pending || --this.pending) return;
    this.setLevel(this.failedState ? 'critical' : this.changedWhileSaving ? 'dirty' : 'clean');
    this.changedWhileSaving = false;
  }

  failed() {
    if (!this.pending) return;
    this.pending -= 1;
    this.failedState = true;
    this.changedWhileSaving = false;
    this.setLevel('critical');
  }

  discard() {
    if (this.pending || this.failedState) return;
    this.changedWhileSaving = false;
    this.setLevel('clean');
  }
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

export function attemptPwaReload(
  expectedTarget: string,
  read: () => { snapshot: PwaUpdateSnapshot; level: PwaReadinessLevel; held: boolean; visible: boolean; online: boolean },
  storage: Pick<Storage, 'getItem' | 'setItem'>,
  reload: () => void,
) : 'reloaded' | 'deferred' | 'storage-failed' {
  const current = read();
  if (pwaReloadTarget(current.snapshot, current.level, current.held, current.visible, current.online) !== expectedTarget) return 'deferred';
  if (!authorizePwaReload(expectedTarget, current.snapshot.runningBuild.buildId, storage)) return 'storage-failed';
  reload();
  return 'reloaded';
}
