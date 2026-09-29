'use client';

import { useEffect, useRef, useState } from 'react';
import { Eye } from 'lucide-react';
import type { ActivityRequirement, AdminProviderIdentity as Review, ArcaResult } from '../lib/providerIdentity';
import { ManualArcaVerifier } from '../lib/providerIdentityVerifier';
import { configureProviderActivity, getAdminProviderIdentity, revealProviderCuit, reviewProviderIdentity } from '../lib/providerIdentityApi';
import { usePwaForm } from './PwaUpdateProvider';

export function AdminProviderIdentity({ professionalId, serviceNames }: { professionalId: string; serviceNames: Record<number, string> }) {
  const [review, setReview] = useState<Review | null>(null);
  const [revealed, setRevealed] = useState<Record<string, string>>({});
  const [ownership, setOwnership] = useState<Record<string, boolean>>({});
  const [results, setResults] = useState<Record<string, ArcaResult>>({});
  const [working, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [refreshNeeded, setRefreshNeeded] = useState(false);
  const busy = working || refreshNeeded;
  const saving = useRef(false);
  const safety = usePwaForm(`admin-provider:${professionalId}`);
  useEffect(() => {
    let alive = true;
    setReview(null); setRevealed({}); setOwnership({}); setResults({}); setMessage('');
    void getAdminProviderIdentity(professionalId).then((next) => { if (alive) setReview(next); }).catch(() => { if (alive) setMessage('No pudimos cargar la identidad.'); });
    return () => { alive = false; };
  }, [professionalId]);
  async function write(operation: () => Promise<unknown>) {
    if (saving.current || refreshNeeded || safety.blocked()) return false;
    saving.current = true; setBusy(true); safety.begin(); setMessage('');
    let sent = false;
    try { await operation(); sent = true; setReview(await getAdminProviderIdentity(professionalId)); safety.saved(); setRevealed({}); setResults({}); setOwnership({}); setMessage('Decision registrada.'); return true; }
    catch { safety.failed(); setRefreshNeeded(sent); setMessage(sent ? 'Decision registrada; falta actualizar el estado. Comproba antes de seguir.' : 'No se pudo registrar. Revisa requisitos, documentacion y el perfil canonico.'); return false; }
    finally { saving.current = false; setBusy(false); }
  }
  return <section className="admin-detail-section">
    <h3>Identidad privada</h3>
    {message && <p role="status">{message}</p>}
    {refreshNeeded && <button className="v6-secondary" type="button" onClick={() => {
      if (saving.current || safety.blocked()) return;
      saving.current = true; setBusy(true); safety.begin();
      void getAdminProviderIdentity(professionalId).then((next) => { setReview(next); setRefreshNeeded(false); setRevealed({}); setResults({}); setOwnership({}); safety.saved(); setMessage('Estado actualizado.'); })
        .catch(() => { safety.failed(); setMessage('No pudimos actualizar el estado. Volve a comprobar.'); })
        .finally(() => { saving.current = false; setBusy(false); });
    }}>Comprobar estado</button>}
    {!review && !message && <p>Cargando identidad...</p>}
    {review && !review.claims.length && <p>No envio una solicitud de vinculacion de CUIT. Un dato fiscal anterior no equivale a verificacion.</p>}
    {review?.claims.map((claim) => <div key={claim.id} className="v6-stack">
      <strong>CUIT {revealed[claim.id] || claim.masked_cuit}</strong>
      <button className="v6-secondary" disabled={busy} type="button" onClick={() => {
        if (saving.current || refreshNeeded || safety.blocked()) return;
        saving.current = true; setBusy(true); safety.begin();
        void revealProviderCuit(claim.id).then((cuit) => { setRevealed((current) => ({ ...current, [claim.id]: cuit })); safety.saved(); })
          .catch(() => { safety.failed(); setMessage('No pudimos revelar el CUIT.'); })
          .finally(() => { saving.current = false; setBusy(false); });
      }}><Eye size={16} aria-hidden="true" /> Revelar para revision</button>
      <dl className="admin-fact-grid"><div><dt>Solicitud</dt><dd>{claim.status}</dd></div><div><dt>Fiscal</dt><dd>{claim.fiscal_status}</dd></div><div><dt>Operacion</dt><dd>{claim.operational_status}</dd></div><div><dt>Fuente</dt><dd>{claim.source || 'Sin consulta'}</dd></div><div><dt>Verificado</dt><dd>{claim.verified_at ? new Date(claim.verified_at).toLocaleString('es-AR') : 'Pendiente'}</dd></div><div><dt>Conflictos</dt><dd>{claim.conflicting_claims}</dd></div></dl>
      {claim.canonical_profile_id && claim.canonical_profile_id !== professionalId && <p>Ya existe un perfil canonico. Recuperar la cuenta original; no transferir reputacion ni habilitar otro perfil.</p>}
      <a href="https://seti.arca.gob.ar/padron-puc-constancia-internet/jsp/Constancia.jsp" target="_blank" rel="noopener noreferrer">Abrir consulta oficial ARCA</a>
      <label className="v6-field"><span>Resultado de la consulta fiscal</span><select disabled={busy} value={results[claim.id] || ''} onChange={(event) => { setResults((current) => ({ ...current, [claim.id]: event.target.value as ArcaResult })); safety.dirty(); }}><option value="" disabled>Seleccionar resultado</option><option value="FOUND">Encontrado y coincide</option><option value="NOT_FOUND">No encontrado</option><option value="MISMATCH">Datos no coinciden</option><option value="UNAVAILABLE">No se pudo consultar</option></select></label>
      <button className="v6-secondary" disabled={busy || !results[claim.id] || !revealed[claim.id]} type="button" onClick={() => void write(async () => {
        const outcome = await new ManualArcaVerifier({ result: results[claim.id], checkedAt: new Date().toISOString() }).verify({ normalizedCuit: revealed[claim.id] });
        await reviewProviderIdentity(claim.id, 'ARCA', outcome.result);
      })}>Registrar consulta ARCA</button>
      <label><input disabled={busy} type="checkbox" checked={ownership[claim.id] || false} onChange={(event) => { setOwnership((current) => ({ ...current, [claim.id]: event.target.checked })); safety.dirty(); }} /> Compare titularidad con los datos personales y documentos aprobados</label>
      <div className="v6-actions">
        <button className="v6-primary" disabled={busy || !ownership[claim.id] || claim.status === 'ACCEPTED'} onClick={() => void write(() => reviewProviderIdentity(claim.id, 'ACCEPT', null, ownership[claim.id]))} type="button">Vincular identidad</button>
        <button className="v6-secondary" disabled={busy || claim.status === 'ACCEPTED'} onClick={() => void write(() => reviewProviderIdentity(claim.id, 'NEEDS_REVIEW'))} type="button">Requiere revision</button>
        <button className="v6-danger" disabled={busy || claim.status === 'ACCEPTED'} onClick={() => void write(() => reviewProviderIdentity(claim.id, 'REJECT'))} type="button">Rechazar solicitud</button>
      </div>
      {claim.canonical_profile_id === professionalId && <div className="v6-actions">
        {(['ENABLE', 'RESTRICT', 'SUSPEND'] as const).map((action, index) => <button className="v6-secondary" disabled={busy} key={action} type="button" onClick={() => {
          if (window.confirm('Registrar esta decision operativa? No cambia el resultado fiscal.')) void write(() => reviewProviderIdentity(claim.id, action));
        }}>{['Habilitar operacion', 'Restringir', 'Suspender'][index]}</button>)}
      </div>}
      <details><summary>Historial privado de identidad</summary>{claim.events.map((event, index) => <p key={index}>{event.type} · {event.reason} · {new Date(event.at).toLocaleString('es-AR')} · operador {event.actor || 'Sistema'}</p>)}</details>
    </div>)}
    {review?.activities.map((activity) => <ActivityConfiguration key={`${activity.service_id}:${activity.specialty_id}:${activity.level}`} activity={activity} serviceName={serviceNames[activity.service_id] || 'Servicio'} busy={busy} save={(next) => write(() => configureProviderActivity(next))} />)}
  </section>;
}

function ActivityConfiguration({ activity, serviceName, busy, save }: { activity: ActivityRequirement; serviceName: string; busy: boolean; save: (value: ActivityRequirement) => Promise<boolean> }) {
  const [level, setLevel] = useState(activity.level || '');
  const [kinds, setKinds] = useState(activity.credential_kinds.join(', '));
  const safety = usePwaForm(`activity:${activity.service_id}:${activity.specialty_id}`);
  return <form className="v6-stack" data-pwa-tracked onChangeCapture={() => safety.dirty()} onSubmit={async (event) => {
    event.preventDefault(); if (!level || busy || safety.blocked()) return;
    // The parent owns the critical write/refresh safety; this surface owns only draft edits.
    try { const saved = await save({ ...activity, level: level as ActivityRequirement['level'], credential_kinds: level === 'LEVEL_2' ? kinds.split(',').map((kind) => kind.trim()).filter(Boolean) : [] }); if (saved) { safety.begin(); safety.saved(); } }
    catch { safety.dirty(); }
  }}>
    <h4>Requisitos · {serviceName}{activity.specialty_id ? ` · especialidad ${activity.specialty_id}` : ''}</h4>
    <label className="v6-field"><span>Nivel aprobado para piloto</span><select disabled={busy} value={level} onChange={(event) => setLevel(event.target.value)}><option value="">Sin clasificar: no habilitado</option><option value="LEVEL_1">Nivel 1 · Identidad y aprobacion</option><option value="LEVEL_2">Nivel 2 · Credencial especifica</option><option value="LEVEL_3">Nivel 3 · Fuera del piloto</option></select></label>
    {level === 'LEVEL_2' && <label className="v6-field"><span>Tipos documentales especificos, separados por coma (no seguro)</span><input disabled={busy} value={kinds} onChange={(event) => setKinds(event.target.value)} required /></label>}
    <button className="v6-secondary" disabled={busy || !level} type="submit">Guardar requisitos</button>
  </form>;
}
