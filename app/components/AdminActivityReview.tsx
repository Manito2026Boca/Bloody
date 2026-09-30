'use client';

import { useEffect, useRef, useState } from 'react';
import { activityDocumentLabels, transportChecks, type ActivityReview } from '../lib/providerActivity';
import type { ActivityRequirement } from '../lib/providerIdentity';
import type { V6ProfessionalDocument } from '../lib/v6Types';
import { listV6ProfessionalDocuments } from '../lib/v6Api';
import { getProviderActivityReviews, reviewProviderActivityDocument } from '../lib/providerIdentityApi';
import { usePwaForm } from './PwaUpdateProvider';

export function AdminActivityReview({ professionalId, activities, serviceNames }: {
  professionalId: string; activities: ActivityRequirement[]; serviceNames: Record<number, string>;
}) {
  const [documents, setDocuments] = useState<V6ProfessionalDocument[]>([]);
  const [reviews, setReviews] = useState<ActivityReview[]>([]);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    setDocuments([]); setReviews([]); setError('');
    void Promise.all([listV6ProfessionalDocuments(professionalId), getProviderActivityReviews(professionalId)])
      .then(([docs, rows]) => { if (active) { setDocuments(docs); setReviews(rows); } })
      .catch(() => { if (active) setError('No pudimos cargar las credenciales de actividad.'); });
    return () => { active = false; };
  }, [professionalId]);
  const keys = new Set<string>();
  const requirements = activities.flatMap((item) => item.credential_kinds.map((kind) => ({ serviceId: item.service_id, kind })))
    .filter((item) => { const key = `${item.serviceId}:${item.kind}`;
      if (!activityDocumentLabels[item.kind] || keys.has(key)) return false;
      keys.add(key); return true;
    });
  return <section className="admin-detail-section"><h3>Credenciales de actividad</h3>
    {error && <p role="alert">{error}</p>}
    {requirements.map((item) => <CredentialReview key={`${professionalId}:${item.serviceId}:${item.kind}`}
      professionalId={professionalId} serviceId={item.serviceId} kind={item.kind}
      serviceName={serviceNames[item.serviceId] || 'Servicio'}
      document={documents.find((doc) => doc.kind === item.kind && doc.status === 'approved')}
      review={reviews.find((row) => row.kind === item.kind && row.service_id === item.serviceId)} />)}
  </section>;
}

function CredentialReview({ professionalId, serviceId, kind, serviceName, document, review }: {
  professionalId: string; serviceId: number; kind: string; serviceName: string;
  document?: V6ProfessionalDocument; review?: ActivityReview;
}) {
  const [fields, setFields] = useState<Record<string, string>>({});
  const [checks, setChecks] = useState<Record<string, { applicable: boolean; verified: boolean; reference: string }>>({});
  const [responsible, setResponsible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [status, setStatus] = useState<ActivityReview['status']>('NEEDS_REVIEW');
  const writing = useRef(false);
  const safety = usePwaForm(`sector:${professionalId}:${serviceId}:${kind}`);
  const transport = kind === 'transport_vehicle_review';
  const pest = kind === 'pest_control_authorization';
  const textField = (key: string, label: string, maxLength = 200) => <label className="v6-field" key={key}>
    <span>{label}</span><input disabled={busy} value={fields[key] || ''} maxLength={maxLength}
      onChange={(event) => setFields((current) => ({ ...current, [key]: event.target.value }))} required />
  </label>;
  return <form className="v6-stack" data-pwa-tracked onChangeCapture={() => safety.dirty()} onSubmit={async (event) => {
    event.preventDefault(); if (!document || writing.current || safety.blocked()) return;
    writing.current = true; setBusy(true); setMessage(''); safety.begin();
    const details = { ...fields, ...(pest ? { technical_responsible_applicable: responsible } : {}),
      ...(transport ? { checks: Object.fromEntries(transportChecks.map(({ key }) => [key, checks[key] || { applicable: false, verified: false, reference: '' }])) } : {}) };
    try { await reviewProviderActivityDocument(professionalId, serviceId, kind, document.id, status, details);
      safety.saved(); setMessage('Revisión registrada.');
    } catch { safety.failed(); setMessage('No se registró la revisión. Completá los datos y comprobá el documento antes de reintentar.'); }
    finally { writing.current = false; setBusy(false); }
  }}>
    <h4>{serviceName} · {activityDocumentLabels[kind]}</h4>
    {review && <p>Última revisión: {review.status === 'APPROVED' ? 'Aprobada' : review.status === 'REJECTED' ? 'Rechazada' : 'Pendiente'} · {new Date(review.verified_at).toLocaleString('es-AR')}</p>}
    {review && <details><summary>Datos de la última revisión</summary><pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{JSON.stringify(review.details, null, 2)}</pre></details>}
    {!document && <p>Primero aprobá el documento de esta actividad en Documentación y volvé a abrir el perfil.</p>}
    {transport ? textField('vehicle_scope', 'Vehículo y alcance de transporte revisados', 400) : textField('registration_number', 'Número de matrícula / documento / registro', 120)}
    {!transport && !pest && textField('registry', 'Organismo o registro')}
    {pest && <>{textField('municipal_framework', 'Encuadre / habilitación municipal', 300)}
      <label><input type="checkbox" checked={responsible} disabled={busy} onChange={(event) => setResponsible(event.target.checked)} /> Corresponde Responsable Técnico</label>
      {responsible ? textField('technical_responsible', 'Responsable Técnico y referencia') : textField('technical_responsible_reason', 'Motivo de no aplicación', 300)}</>}
    {transport && transportChecks.map(({ key, label }) => {
      const check = checks[key] || { applicable: false, verified: false, reference: '' };
      const update = (patch: Partial<typeof check>) => setChecks((current) => ({ ...current, [key]: { ...check, ...patch } }));
      return <fieldset key={key} disabled={busy}><legend>{label}</legend>
        <label><input type="checkbox" checked={check.applicable} onChange={(event) => update({ applicable: event.target.checked, verified: false })} /> Corresponde a este vehículo / alcance</label>
        {check.applicable && <label><input type="checkbox" checked={check.verified} onChange={(event) => update({ verified: event.target.checked })} /> Documento verificado</label>}
        <label className="v6-field"><span>{check.applicable ? 'Referencia documental revisada' : 'Motivo de no aplicación'}</span>
          <input value={check.reference} maxLength={300} required onChange={(event) => update({ reference: event.target.value })} /></label>
      </fieldset>;
    })}
    {textField('observation', 'Observación de revisión', 1000)}
    <label className="v6-field"><span>Decisión</span><select value={status} disabled={busy} onChange={(event) => setStatus(event.target.value as ActivityReview['status'])}>
      <option value="NEEDS_REVIEW">Requiere revisión</option><option value="APPROVED">Aprobada</option><option value="REJECTED">Rechazada</option>
    </select></label>
    <button className="v6-secondary" type="submit" disabled={busy || !document}>{busy ? 'Registrando...' : 'Registrar revisión sectorial'}</button>
    {message && <p role="status">{message}</p>}
  </form>;
}
