'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';
import { usePwaSafety } from './PwaUpdateProvider';
import { legacyEntry } from '../lib/legacyPwaBridge';
import type { IntentContext } from '../lib/domainMigrationContract';
import { retireLegacyWebPushForCurrentDevice } from '../lib/webPush';

export function LegacyMigrationBridge({ context, compact = false }: { context: IntentContext; compact?: boolean }) {
  const registry = usePwaSafety();
  useSyncExternalStore((notify) => registry.subscribe(notify), () => registry.revision(), () => 0);
  const [entry, setEntry] = useState<ReturnType<typeof legacyEntry> | null>(null);
  const [online, setOnline] = useState(true);
  const [newAppVerified, setNewAppVerified] = useState(false);
  const [retiring, setRetiring] = useState(false);
  const [retired, setRetired] = useState(false);
  const [browserRetirementIncomplete, setBrowserRetirementIncomplete] = useState(false);
  const [retirementError, setRetirementError] = useState<string | null>(null);
  useEffect(() => {
    const refresh = () => {
      const standalone = window.matchMedia('(display-mode: standalone)').matches ||
        (navigator as Navigator & { standalone?: boolean }).standalone === true;
      const parsed = legacyEntry(window.location.href, context, standalone);
      setEntry(compact && window.location.origin === context.origins.publicOrigin && window.location.pathname === '/' && !parsed.showBridge
        ? { showBridge: true, destination: new URL('/', context.origins.appOrigin).toString() }
        : parsed);
      setOnline(navigator.onLine);
    };
    refresh();
    window.addEventListener('online', refresh);
    window.addEventListener('offline', refresh);
    return () => { window.removeEventListener('online', refresh); window.removeEventListener('offline', refresh); };
  }, [context, compact]);
  if (!entry?.showBridge) return null;
  const safe = registry.level() === 'clean' && !registry.isHeld() && online;
  const retireCurrentAccess = async () => {
    if (!safe || !newAppVerified || retiring) return;
    setRetiring(true);
    setRetirementError(null);
    try {
      const outcome = await retireLegacyWebPushForCurrentDevice(true);
      if (outcome) {
        setRetired(true);
        setBrowserRetirementIncomplete(outcome === 'server-retired');
      }
      else setRetirementError('No encontramos avisos de este acceso para desactivar en este dispositivo.');
    } catch {
      setRetirementError('No pudimos desactivar los avisos de este acceso. Probá de nuevo más tarde.');
    } finally {
      setRetiring(false);
    }
  };
  return <aside aria-label="Acceso anterior a MANITO" role="status">
    <strong>Este es el acceso anterior a MANITO</strong>
    {!compact && <p>La nueva app usa tu misma cuenta. Es posible que tengas que iniciar sesión otra vez y crear un nuevo acceso en tu pantalla de inicio.</p>}
    {!safe && <p>{online ? 'Guardá o terminá tus cambios antes de continuar.' : 'Necesitás conexión para abrir la nueva app.'}</p>}
    {safe && entry.destination ? <a href={entry.destination} target="_blank" rel="noopener noreferrer">Abrir la nueva app</a> : null}
    {safe && entry.destination && !retired && <div>
      <label><input type="checkbox" checked={newAppVerified} onChange={(event) => setNewAppVerified(event.target.checked)} /> Ya ingresé y probé los avisos en la nueva app.</label>
      <button type="button" disabled={!newAppVerified || retiring} onClick={() => { void retireCurrentAccess(); }}>
        {retiring ? 'Desactivando avisos...' : 'Desactivar avisos de este acceso'}
      </button>
    </div>}
    {retired && <p>{browserRetirementIncomplete
      ? 'MANITO dejó de enviar avisos a este acceso. El navegador no pudo quitar la suscripción local.'
      : 'Los avisos de este acceso anterior quedaron desactivados.'}</p>}
    {retirementError && <p role="alert">{retirementError}</p>}
    {!compact && <p>Comprobá que la nueva app abre y que podés ingresar antes de quitar el acceso anterior.</p>}
  </aside>;
}
