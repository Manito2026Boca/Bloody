'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';
import { usePwaSafety } from './PwaUpdateProvider';
import { legacyEntry } from '../lib/legacyPwaBridge';
import type { IntentContext } from '../lib/domainMigrationContract';

export function LegacyMigrationBridge({ context, compact = false }: { context: IntentContext; compact?: boolean }) {
  const registry = usePwaSafety();
  useSyncExternalStore((notify) => registry.subscribe(notify), () => registry.revision(), () => 0);
  const [entry, setEntry] = useState<ReturnType<typeof legacyEntry> | null>(null);
  const [online, setOnline] = useState(true);
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
  return <aside aria-label="Acceso anterior a MANITO" role="status">
    <strong>Este es el acceso anterior a MANITO</strong>
    {!compact && <p>La nueva app usa tu misma cuenta. Es posible que tengas que iniciar sesión otra vez y crear un nuevo acceso en tu pantalla de inicio.</p>}
    {!safe && <p>{online ? 'Guardá o terminá tus cambios antes de continuar.' : 'Necesitás conexión para abrir la nueva app.'}</p>}
    {safe && entry.destination ? <a href={entry.destination} target="_blank" rel="noopener noreferrer">Abrir la nueva app</a> : null}
    {!compact && <p>Comprobá que la nueva app abre y que podés ingresar antes de quitar el acceso anterior.</p>}
  </aside>;
}
