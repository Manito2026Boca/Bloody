'use client';

import { AlertCircle, Copy, Download, RefreshCw, X } from 'lucide-react';
import { createContext, useCallback, useContext, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import type { PwaReadinessLevel, PwaUpdatePort, PwaUpdateSnapshot } from '../lib/pwaUpdateContract';
import { formatPwaDiagnostic, pwaUpdateStatus } from '../lib/pwaDiagnostics';
import { attemptPwaReload, holdUntrackedSubmit, pwaActivationTarget, pwaPrepareEligible, pwaReloadTarget, PWA_RELOAD_MARKER, PwaFormSafetyController, PwaUntrackedEditTracker, PwaUpdateSafetyRegistry, syncUntrackedFormSafety } from '../lib/pwaUpdateSafety';

type SafetyContext = { registry: PwaUpdateSafetyRegistry; port: PwaUpdatePort };
const Context = createContext<SafetyContext | null>(null);

export function usePwaSafety() {
  const context = useContext(Context);
  if (!context) throw new Error('PwaUpdateProvider is required');
  return context.registry;
}

export function usePwaSurface(reason: string, initial: PwaReadinessLevel = 'clean') {
  const registry = usePwaSafety();
  const id = useId();
  const key = `${reason}:${id}`;
  useLayoutEffect(() => registry.register(key, initial), [registry, key, initial]);
  return useMemo(() => ({
    set: (level: PwaReadinessLevel) => registry.set(key, level),
    blocked: () => registry.isHeld(),
  }), [registry, key]);
}

export function usePwaForm(reason: string) {
  const surface = usePwaSurface(reason, 'clean');
  return useMemo(() => Object.assign(new PwaFormSafetyController(surface.set), { blocked: surface.blocked }), [surface]);
}

export function pwaWaitingMessage(phase: PwaUpdateSnapshot['phase'], level: PwaReadinessLevel) {
  if (level !== 'clean') return 'Terminá o guardá tus cambios antes de actualizar MANITO.';
  return phase === 'deferred' ? 'La actualización espera a que terminen los cambios abiertos.' : 'Hay una nueva versión disponible.';
}

function PwaUpdateUI({ port, registry }: SafetyContext) {
  const [snapshot, setSnapshot] = useState<PwaUpdateSnapshot>(() => port.snapshot());
  const [localError, setLocalError] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState<string | null>(null);
  const [pageVisible, setPageVisible] = useState(false);
  const [online, setOnline] = useState(true);
  useSyncExternalStore((notify) => registry.subscribe(notify), () => registry.revision(), () => 0);
  const level = registry.level();
  const activationRef = useRef({ key: '', pending: false });
  useEffect(() => port.subscribe(setSnapshot), [port]);
  useEffect(() => {
    const refresh = () => { setPageVisible(document.visibilityState === 'visible'); setOnline(navigator.onLine); };
    refresh();
    document.addEventListener('visibilitychange', refresh);
    window.addEventListener('online', refresh);
    window.addEventListener('offline', refresh);
    return () => { document.removeEventListener('visibilitychange', refresh); window.removeEventListener('online', refresh); window.removeEventListener('offline', refresh); };
  }, []);
  const target = snapshot.phase === 'ready-to-reload' ? snapshot.activeWorkerBuildId : snapshot.waitingWorkerBuildId || snapshot.publishedBuild?.buildId || null;
  const newer = Boolean(target && target !== snapshot.runningBuild.buildId);
  const versionMismatch = snapshot.phase === 'ready-to-reload' && !!target && !!snapshot.publishedBuild && snapshot.publishedBuild.buildId !== target;
  const visible = snapshot.phase === 'failed' || snapshot.phase === 'deferred' || snapshot.phase === 'waiting' || snapshot.phase === 'ready-to-reload' || (newer && snapshot.phase !== 'activating');
  const activationTarget = pwaActivationTarget(snapshot, level, registry.isHeld(), pageVisible, online);
  const canReload = !!target && pwaReloadTarget(snapshot, level, registry.isHeld(), pageVisible, online) === target;
  const requestActivation = useCallback(async (targetId: string, manual: boolean) => {
    if (activationRef.current.pending || pwaActivationTarget(snapshot, registry.level(), registry.isHeld(), pageVisible, online) !== targetId) return;
    const key = `${targetId}:${snapshot.phase}:${snapshot.lastCheckedAt || ''}`;
    if (!manual && activationRef.current.key === key) return;
    activationRef.current = { key, pending: true };
    try {
      const result = await port.activate(targetId);
      if (result === 'failed') setLocalError('No se pudo activar.');
    } catch { setLocalError('No se pudo activar.'); }
    finally { activationRef.current.pending = false; }
  }, [port, snapshot, registry, pageVisible, online]);
  useEffect(() => {
    if (!activationTarget) { if (level !== 'clean' || !pageVisible || !online) activationRef.current.key = ''; return; }
    let active = true;
    queueMicrotask(() => { if (active) void requestActivation(activationTarget, false); });
    return () => { active = false; };
  }, [activationTarget, requestActivation, level, pageVisible, online]);
  useEffect(() => {
    if (snapshot.phase === 'ready-to-reload' && target && snapshot.activeWorkerBuildId === target) registry.clearHold();
  }, [snapshot.phase, snapshot.activeWorkerBuildId, target, registry]);
  const reloadIfSafe = useCallback((expectedTarget: string) => {
    const result = attemptPwaReload(expectedTarget, () => ({
      snapshot: port.snapshot(),
      level: document.querySelector('form:not([data-pwa-tracked])') ? 'unknown' : registry.level(),
      held: registry.isHeld(),
      visible: document.visibilityState === 'visible',
      online: navigator.onLine,
    }), sessionStorage, () => window.location.reload());
    if (result === 'storage-failed') setLocalError('No se pudo autorizar la recarga.');
  }, [port, registry]);
  useEffect(() => {
    if (!canReload || !target || !pageVisible || !online) return;
    let active = true;
    queueMicrotask(() => { if (active) reloadIfSafe(target); });
    return () => { active = false; };
  }, [canReload, target, pageVisible, online, reloadIfSafe]);
  const message = registry.unresolvedCount() > 0 ? 'Hay una operación sin verificar. Revisá su resultado antes de actualizar.' : versionMismatch ? 'La versión publicada cambió durante la actualización. Comprobá de nuevo antes de abrirla.' : snapshot.phase === 'failed' || localError
    ? 'No pudimos completar la actualización. Podés volver a comprobarla.'
    : snapshot.phase === 'ready-to-reload'
      ? level === 'clean' ? 'Nueva versión lista para abrir.' : 'Nueva versión lista. Terminá o guardá tus cambios antes de abrirla.'
      : pwaWaitingMessage(snapshot.phase, level);
  if (!visible || (dismissed === target && snapshot.phase !== 'failed')) return null;
  return <aside className="pwa-update-notice" role="status" aria-live="polite">
    {snapshot.phase === 'failed' || localError ? <AlertCircle size={19} /> : <Download size={19} />}
    <div><strong>Actualización de MANITO</strong><p>{message}</p><small>En uso: {snapshot.runningBuild.appVersion} · Publicada: {snapshot.publishedBuild?.appVersion || 'sin verificar'}</small><details><summary>Detalles de versión</summary><small>Build en uso: {snapshot.runningBuild.buildId}<br />Build publicado: {snapshot.publishedBuild?.buildId || 'sin verificar'}<br />Worker activo: {snapshot.activeWorkerBuildId || 'sin controlar'}<br />Última comprobación: {snapshot.lastCheckedAt ? new Date(snapshot.lastCheckedAt).toLocaleString('es-AR') : 'pendiente'}{snapshot.error ? <><br />Estado: {snapshot.error}</> : null}</small></details></div>
    <div className="pwa-update-actions">
      {registry.canReconcile() && <button type="button" onClick={() => {
        syncUntrackedFormSafety(registry, !!document.querySelector('form:not([data-pwa-tracked])'));
        if (!registry.canReconcile()) return;
        if (window.confirm('¿Verificaste el resultado de la operación pendiente? Al continuar, MANITO podrá actualizarse.')) {
          syncUntrackedFormSafety(registry, !!document.querySelector('form:not([data-pwa-tracked])'));
          if (registry.canReconcile()) registry.reconcileOrphans();
        }
      }}>Ya revisé</button>}
      {canReload ? <button type="button" onClick={() => {
        if (target) reloadIfSafe(target);
      }}><RefreshCw size={16} /> Abrir versión</button> : activationTarget ? <button type="button" onClick={() => { void requestActivation(activationTarget, true); }}>Actualizar</button> : null}
      <button type="button" onClick={() => { setLocalError(null); void port.check('manual').catch(() => setLocalError('No se pudo comprobar.')); }} aria-label="Comprobar versión" title="Comprobar versión"><RefreshCw size={16} /></button>
      <button type="button" onClick={() => setDismissed(target)} aria-label="Cerrar aviso" title="Cerrar aviso"><X size={16} /></button>
    </div>
  </aside>;
}

export function PwaVersionDetails() {
  const context = useContext(Context);
  if (!context) throw new Error('PwaUpdateProvider is required');
  const { port } = context;
  const [snapshot, setSnapshot] = useState<PwaUpdateSnapshot>(() => port.snapshot());
  const [open, setOpen] = useState(false);
  const [copyStatus, setCopyStatus] = useState('');
  useEffect(() => port.subscribe(setSnapshot), [port]);
  useEffect(() => {
    if (!open) return;
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false); };
    document.addEventListener('keydown', closeOnEscape);
    return () => document.removeEventListener('keydown', closeOnEscape);
  }, [open]);
  const close = () => { setOpen(false); setCopyStatus(''); };
  return <>
    <button className="pwa-version-link" type="button" onClick={() => setOpen(true)} aria-label={`Información técnica de MANITO, versión ${snapshot.runningBuild.appVersion}`}>
      MANITO · v{snapshot.runningBuild.appVersion}
    </button>
    {open && <div className="v6-modal pwa-diagnostics-modal" role="presentation" onClick={(event) => { if (event.target === event.currentTarget) close(); }}>
      <section className="v6-sheet pwa-diagnostics-sheet" role="dialog" aria-modal="true" aria-label="Información técnica">
        <div className="pwa-diagnostics-head"><h2>Información técnica</h2><button className="v6-icon-button" type="button" title="Cerrar" aria-label="Cerrar información técnica" onClick={close}><X size={20} /></button></div>
        <dl>
          <div><dt>Versión</dt><dd>{snapshot.runningBuild.appVersion}</dd></div>
          <div><dt>Build</dt><dd>{snapshot.runningBuild.buildId.slice(0, 8)}</dd></div>
          <div><dt>Commit</dt><dd>{snapshot.runningBuild.commit.slice(0, 7)}</dd></div>
          <div><dt>Worker</dt><dd>{snapshot.activeWorkerBuildId ? 'Activo' : 'Sin controlar'}</dd></div>
          <div><dt>Estado</dt><dd>{pwaUpdateStatus(snapshot)}</dd></div>
          <div><dt>Comprobado</dt><dd>{snapshot.lastCheckedAt ? new Date(snapshot.lastCheckedAt).toLocaleString('es-AR') : 'Pendiente'}</dd></div>
        </dl>
        <button className="v6-secondary" type="button" onClick={() => {
          if (!navigator.clipboard?.writeText) { setCopyStatus('No pudimos copiar el diagnóstico.'); return; }
          void navigator.clipboard.writeText(formatPwaDiagnostic(snapshot))
            .then(() => setCopyStatus('Diagnóstico copiado.'))
            .catch(() => setCopyStatus('No pudimos copiar el diagnóstico.'));
        }}><Copy size={16} aria-hidden="true" /> Copiar diagnóstico</button>
        {copyStatus && <p role="status" className="v6-muted">{copyStatus}</p>}
      </section>
    </div>}
  </>;
}

export function PwaUpdateProvider({ port, children }: { port: PwaUpdatePort; children: ReactNode }) {
  const [registry] = useState(() => new PwaUpdateSafetyRegistry());
  const [startupError, setStartupError] = useState(false);
  useEffect(() => {
    let alive = true;
    registry.initialize();
    const onEdit = (event: Event) => {
      if (!registry.isHeld()) return;
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (target.closest('.pwa-update-notice, .pwa-update-startup')) return;
      if (target.closest('input, textarea, select, form, [contenteditable], button')) { event.preventDefault(); event.stopPropagation(); }
    };
    const untracked = new PwaUntrackedEditTracker(registry);
    const scanUntracked = () => {
      untracked.scanDetached();
      syncUntrackedFormSafety(registry, !!document.querySelector('form:not([data-pwa-tracked])'));
    };
    const observer = new MutationObserver(scanUntracked);
    observer.observe(document.body, { childList: true, subtree: true });
    const onUntrackedEdit = (event: Event) => {
      const target = event.target;
      if (event.defaultPrevented || !(target instanceof Element) || target.closest('[data-pwa-tracked], [data-pwa-ephemeral]')) return;
      if (!target.closest('input, textarea, select, [contenteditable]')) return;
      untracked.edit(target);
    };
    const onUntrackedSubmit = (event: Event) => {
      const target = event.target;
      if (event.defaultPrevented || !(target instanceof HTMLFormElement) || target.closest('[data-pwa-tracked]')) return;
      holdUntrackedSubmit(registry);
    };
    const unregister = registry.register('untracked-edit', 'clean');
    const unregisterForm = registry.register('untracked-form', 'unknown');
    scanUntracked();
    document.addEventListener('beforeinput', onEdit, true);
    document.addEventListener('change', onEdit, true);
    document.addEventListener('submit', onEdit, true);
    document.addEventListener('click', onEdit, true);
    document.addEventListener('input', onUntrackedEdit, true);
    document.addEventListener('change', onUntrackedEdit, true);
    document.addEventListener('submit', onUntrackedSubmit, true);
    const startupMarker = (() => { try { return sessionStorage.getItem(PWA_RELOAD_MARKER); } catch { return null; } })();
    const unregisterStartup = registry.register('startup-check', 'clean');
    if (startupMarker === port.snapshot().runningBuild.buildId) {
      try { sessionStorage.removeItem(PWA_RELOAD_MARKER); } catch { /* Future automatic reloads remain disabled. */ }
    } else if (startupMarker) { registry.set('startup-check', 'critical'); queueMicrotask(() => { if (alive) setStartupError(true); }); }
    void port.start({
      prepare: (request) => {
        scanUntracked();
        const current = port.snapshot();
        return registry.prepare(request, pwaPrepareEligible(current, request.targetBuildId, document.visibilityState === 'visible', navigator.onLine, !startupMarker || startupMarker === current.runningBuild.buildId));
      },
      release: (attemptId) => registry.release(attemptId),
    }).catch(() => { if (alive) { registry.set('startup-check', 'critical'); setStartupError(true); } });
    return () => { alive = false; port.stop(); observer.disconnect(); registry.clearHold(); unregister(); unregisterForm(); unregisterStartup(); document.removeEventListener('beforeinput', onEdit, true); document.removeEventListener('change', onEdit, true); document.removeEventListener('submit', onEdit, true); document.removeEventListener('click', onEdit, true); document.removeEventListener('input', onUntrackedEdit, true); document.removeEventListener('change', onUntrackedEdit, true); document.removeEventListener('submit', onUntrackedSubmit, true); };
  }, [port, registry]);
  return <Context.Provider value={{ registry, port }}>{children}<PwaUpdateUI port={port} registry={registry} />{startupError && <div className="pwa-update-startup" role="alert">La nueva versión no pudo abrirse. Comprobá la conexión y recargá manualmente cuando sea seguro.</div>}</Context.Provider>;
}
