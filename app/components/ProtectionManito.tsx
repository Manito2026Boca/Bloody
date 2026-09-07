'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { FileText, RefreshCw, Send, ShieldCheck, Upload } from 'lucide-react';
import { addV6Complaint, getV6MediaSignedUrl, listV6Complaints, removeV6Channel, reviewV6OrderComplaint } from '../lib/v6Api';
import { getV6ComplaintContext, listV6ComplaintEvidence, respondToV6Complaint, subscribeV6Complaints, uploadV6ComplaintEvidence } from '../lib/v6ProtectionApi';
import { canOpenProtection, claimLabels, complaintStatusLabels, isMonetaryResolution, isTerminalComplaint, protectionDeadline, resolutionLabels } from '../lib/v6Protection';
import type { V6AdminComplaintReview, V6ClaimType, V6Complaint, V6ComplaintContext, V6ComplaintEvidence, V6Order, V6OrderPhoto, V6Profile, V6ResolutionType } from '../lib/v6Types';

const date = (value: string | number) => new Date(value).toLocaleString('es-AR');
const amount = (value: number | null | undefined) => value == null ? 'Sin dato histórico' : new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(value);
const message = (error: unknown) => error instanceof Error ? error.message : 'No pudimos actualizar el caso. Probá nuevamente.';

function EvidenceLinks({ files }: { files: Array<V6ComplaintEvidence | V6OrderPhoto> }) {
  const [error, setError] = useState('');
  const [link, setLink] = useState<{ path: string; url: string } | null>(null);
  async function open(file: V6ComplaintEvidence | V6OrderPhoto) {
    setError(''); setLink(null);
    try {
      const url = await getV6MediaSignedUrl(file.file_path);
      if (!url) throw new Error('No pudimos abrir el archivo privado.');
      setLink({ path: file.file_path, url });
    } catch (caught) { setError(message(caught)); }
  }
  return <div className="v6-protection-files">
    {!files.length && <p className="v6-muted">Sin archivos adjuntos.</p>}
    {files.map((file) => <div key={file.id}>
      <button type="button" className="v6-text-button" onClick={() => void open(file)}>
        <FileText size={16} aria-hidden="true" /> {file.file_name || file.caption || 'Ver evidencia'}
        {'stage' in file && ` · ${{ before: 'Antes', during: 'Durante', after: 'Trabajo terminado' }[file.stage]}`}
      </button>
      {link?.path === file.file_path && <a href={link.url} target="_blank" rel="noopener noreferrer">Abrir archivo</a>}
    </div>)}
    {error && <p role="alert">{error}</p>}
  </div>;
}

function CaseSummary({ item }: { item: V6Complaint }) {
  return <>
    <div className="v6-section-head compact"><strong>{item.claim_type ? claimLabels[item.claim_type] : item.reason}</strong><span>{complaintStatusLabels[item.status]}</span></div>
    <small>{date(item.created_at)}</small>
    <p className="v6-protection-text">{item.detail}</p>
    {item.professional_response && <div><strong>Respuesta del profesional</strong><p className="v6-protection-text">{item.professional_response}</p><small>{date(item.professional_responded_at!)}</small></div>}
    {item.resolution_type && <div><strong>{resolutionLabels[item.resolution_type]}</strong><p className="v6-protection-text">{item.resolution_note}</p>
      {isMonetaryResolution(item.resolution_type) && <p>{amount(item.resolution_amount)} · Decisión registrada, pendiente de ejecución.</p>}
      {item.resolved_at && <small>{date(item.resolved_at)}</small>}
    </div>}
  </>;
}

function ParticipantCase({ item, order, profile, refresh, notify }: {
  item: V6Complaint; order: V6Order; profile: V6Profile; refresh: () => Promise<void>; notify: (text: string) => void;
}) {
  const [files, setFiles] = useState<V6ComplaintEvidence[]>([]);
  const [response, setResponse] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const reloadFiles = useCallback(async () => { setFiles(await listV6ComplaintEvidence(item.id)); }, [item.id]);
  useEffect(() => {
    void reloadFiles().catch((caught) => setError(message(caught)));
    const channel = subscribeV6Complaints(order.id, () => { void reloadFiles().catch((caught) => setError(message(caught))); });
    return () => removeV6Channel(channel);
  }, [order.id, reloadFiles]);
  async function submit(event: FormEvent, action: 'respond' | 'upload') {
    event.preventDefault(); if (busy) return; setBusy(true); setError('');
    try {
      if (action === 'respond') await respondToV6Complaint(item.id, response);
      else if (file) { await uploadV6ComplaintEvidence(item.id, profile.id, file); setFile(null); await reloadFiles(); }
      await refresh(); notify(action === 'respond' ? 'Tu respuesta quedó registrada.' : 'Evidencia agregada al caso.');
    } catch (caught) { setError(message(caught)); } finally { setBusy(false); }
  }
  return <article className="v6-protection-case">
    {order.professional_id === profile.id && <p>El cliente reportó un problema.</p>}
    <CaseSummary item={item} />
    <EvidenceLinks files={files} />
    {!isTerminalComplaint(item.status) && order.professional_id === profile.id && !item.professional_responded_at &&
      <form className="v6-inline-form" onSubmit={(event) => void submit(event, 'respond')}>
        <label className="v6-field"><span>Tu respuesta</span><textarea required minLength={10} maxLength={5000} value={response} onChange={(event) => setResponse(event.target.value)} /></label>
        <button className="v6-secondary" disabled={busy} type="submit"><Send size={16} aria-hidden="true" /> Enviar respuesta</button>
      </form>}
    {!isTerminalComplaint(item.status) && order.client_id === profile.id && files.length < 6 &&
      <form className="v6-inline-form" onSubmit={(event) => void submit(event, 'upload')}>
        <label className="v6-field"><span>Evidencia del problema</span><input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" required onChange={(event) => setFile(event.target.files?.[0] || null)} /></label>
        <button className="v6-secondary" type="submit" disabled={busy || !file}><Upload size={16} aria-hidden="true" /> Agregar evidencia</button>
      </form>}
    {error && <p role="alert">{error}</p>}
  </article>;
}

export function ProtectionPanel({ order, profile, notify }: { order: V6Order; profile: V6Profile; notify: (text: string) => void }) {
  const [cases, setCases] = useState<V6Complaint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [type, setType] = useState<V6ClaimType>('work_quality');
  const [detail, setDetail] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(Date.now());
  const refresh = useCallback(async () => { setCases(await listV6Complaints(order.id)); setLoading(false); }, [order.id]);
  useEffect(() => {
    void refresh().catch((caught) => { setError(message(caught)); setLoading(false); });
    const channel = subscribeV6Complaints(order.id, () => { void refresh().catch((caught) => setError(message(caught))); });
    const timer = window.setInterval(() => setNow(Date.now()), 30000);
    return () => { removeV6Channel(channel); window.clearInterval(timer); };
  }, [order.id, refresh]);
  const deadline = protectionDeadline(order);
  async function open(event: FormEvent) {
    event.preventDefault(); if (busy) return; setBusy(true); setError('');
    let created = false;
    try {
      const item = await addV6Complaint({ orderId: order.id, reason: type, detail });
      created = true; setCases((current) => [item, ...current]); setDetail('');
      if (file) { await uploadV6ComplaintEvidence(item.id, profile.id, file); setFile(null); }
      notify('Estamos revisando tu caso.');
      await refresh();
    } catch (caught) { setError(`${created ? 'El caso quedó abierto. Podés volver a adjuntar la evidencia desde el caso. ' : ''}${message(caught)}`); }
    finally { setBusy(false); }
  }
  return <section className="v6-protection compact">
    <div className="v6-section-head compact"><h2>Protección MANITO</h2><ShieldCheck size={18} aria-hidden="true" /></div>
    <p>{deadline !== null ? (deadline > now ? `Protección disponible hasta ${date(deadline)}.` : `El plazo para abrir un caso terminó el ${date(deadline)}.`) : 'No hay una ventana de Protección registrada para este pedido.'}</p>
    {loading && <p role="status">Cargando casos...</p>}
    {cases.map((item) => <ParticipantCase key={item.id} item={item} order={order} profile={profile} refresh={refresh} notify={notify} />)}
    {!loading && !error && canOpenProtection(order, profile.id, cases, now) &&
      <form className="v6-inline-form" onSubmit={(event) => void open(event)}>
        <h3>Reportar un problema</h3>
        <label className="v6-field"><span>Tipo de problema</span><select value={type} onChange={(event) => setType(event.target.value as V6ClaimType)}>{Object.entries(claimLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
        <label className="v6-field"><span>Qué pasó</span><textarea required minLength={type === 'other' ? 20 : 10} maxLength={5000} value={detail} onChange={(event) => setDetail(event.target.value)} /></label>
        <label className="v6-field"><span>Evidencia opcional</span><input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" onChange={(event) => setFile(event.target.files?.[0] || null)} /></label>
        <button className="v6-secondary" type="submit" disabled={busy}><ShieldCheck size={16} aria-hidden="true" /> {busy ? 'Enviando...' : 'Reportar un problema'}</button>
      </form>}
    {error && <div role="alert"><p>{error}</p><button className="v6-text-button" type="button" onClick={() => { setError(''); void refresh().catch((caught) => setError(message(caught))); }}><RefreshCw size={16} /> Reintentar</button></div>}
  </section>;
}

function InvestigationContext({ context }: { context: V6ComplaintContext }) {
  return <div className="v6-protection-context">
    <h4>Contrato</h4>
    <p>Finalizado: {context.order.completed_at ? date(context.order.completed_at) : 'Sin fecha'} · {amount(context.order.agreed_price)}</p>
    <p className="v6-protection-text">{context.order.agreed_scope || 'Sin alcance contractual histórico registrado.'}</p>
    {context.order.contract_snapshot && <details><summary>Detalle del contrato aceptado</summary><pre>{JSON.stringify(context.order.contract_snapshot, null, 2)}</pre></details>}
    <h4>Propuesta aceptada</h4>
    {context.proposal ? <p>Mano de obra: {amount(context.proposal.labor_price)} · Materiales: {amount(context.proposal.materials_price)} · Visita: {amount(context.proposal.visit_price)} · {context.proposal.observation}</p> : <p>Sin propuesta asociada.</p>}
    <h4>Adicionales</h4>
    {context.extras.map((extra) => <p key={extra.id}>{extra.title} · {amount(extra.amount)} · {extra.status === 'approved' ? 'Aprobado' : extra.status === 'rejected' ? 'Rechazado' : 'Pendiente'}</p>)}
    {!context.extras.length && <p>Sin adicionales.</p>}
    <h4>Evidencia del trabajo</h4><EvidenceLinks files={context.order_evidence} />
    <h4>Evidencia del reclamo</h4><EvidenceLinks files={context.complaint_evidence} />
    <h4>Pago</h4>
    {context.payments.map((payment) => <p key={payment.id}>{amount(payment.amount)} · {payment.status} · {date(payment.created_at)}</p>)}
    {!context.payments.length && <p>Sin pagos registrados.</p>}
    {context.payment_events.map((event) => <p key={event.id}>{event.event_type} · {date(event.created_at)}</p>)}
    <details><summary>Chat del pedido ({context.messages.length})</summary>
      {context.messages.map((msg) => <p className="v6-protection-text" key={msg.id}><small>{msg.sender_id.slice(0, 8)} · {date(msg.created_at)}</small><br />{msg.body}</p>)}
    </details>
    <h4>Calificación</h4>{context.ratings.map((rating) => <p key={rating.id}>{rating.stars} estrellas · {rating.comment}</p>)}
    {!context.ratings.length && <p>Sin calificación.</p>}
    {context.order.cancelled_at && <p>Cancelación: {date(context.order.cancelled_at)} · {context.order.cancellation_reason}</p>}
    <details><summary>Historial del caso</summary>{context.events.map((event) => <p key={event.id}>{complaintStatusLabels[event.to_status]} · {date(event.created_at)} · {event.actor_id?.slice(0, 8) || 'Sistema'}</p>)}</details>
  </div>;
}

export function ProtectionAdminCase({ item, refresh, notify }: { item: V6AdminComplaintReview; refresh: () => Promise<void>; notify: (text: string) => void }) {
  const [context, setContext] = useState<V6ComplaintContext | null>(null);
  const [type, setType] = useState<V6ResolutionType>('correction');
  const [note, setNote] = useState('');
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [expanded, setExpanded] = useState(false);
  useEffect(() => {
    if (!expanded) return;
    let active = true;
    void getV6ComplaintContext(item.id).then((data) => { if (active) setContext(data); }).catch((caught) => { if (active) setError(message(caught)); });
    return () => { active = false; };
  }, [expanded, item.id, item.updated_at]);
  async function review(status: V6Complaint['status']) {
    if (busy) return; setBusy(true); setError('');
    const terminal = isTerminalComplaint(status);
    try {
      await reviewV6OrderComplaint({ complaintId: item.id, status,
        resolutionNote: terminal ? note : null,
        resolutionType: status === 'rejected' ? 'rejected' : terminal ? type : null,
        resolutionAmount: status === 'resolved' && isMonetaryResolution(type) ? (value.trim() ? Number(value) : null) : null,
      });
      await refresh(); notify('Caso actualizado.');
    } catch (caught) { setError(message(caught)); } finally { setBusy(false); }
  }
  return <article className="v6-admin-review-card v6-protection-case">
    <h3>{item.service_name}</h3>
    <p>{item.client_name} · Profesional: {item.professional_name || 'Sin dato'}</p>
    <CaseSummary item={item} />
    <button className="v6-text-button" type="button" onClick={() => setExpanded(!expanded)}>{expanded ? 'Ocultar detalle' : 'Revisar contrato y evidencia'}</button>
    {expanded && (context ? <InvestigationContext context={context} /> : <p role="status">Cargando detalle...</p>)}
    {!isTerminalComplaint(item.status) && <>
      <div className="v6-actions-row compact">
        <button className="v6-secondary" type="button" disabled={busy} onClick={() => void review('under_review')}>En revisión</button>
        <button className="v6-secondary" type="button" disabled={busy || !!item.professional_responded_at} onClick={() => void review('awaiting_professional')}>Solicitar respuesta</button>
      </div>
      <label className="v6-field"><span>Resolución</span><select value={type} onChange={(event) => setType(event.target.value as V6ResolutionType)}>{Object.entries(resolutionLabels).filter(([key]) => key !== 'rejected').map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
      {isMonetaryResolution(type) && <label className="v6-field"><span>Monto de la decisión (no ejecuta un pago)</span><input type="number" min="0" step="0.01" value={value} onChange={(event) => setValue(event.target.value)} /></label>}
      <label className="v6-field"><span>Nota de resolución, visible para ambas partes</span><textarea minLength={10} maxLength={5000} value={note} onChange={(event) => setNote(event.target.value)} /></label>
      <div className="v6-actions-row compact">
        <button className="v6-primary" type="button" disabled={busy || note.trim().length < 10} onClick={() => void review('resolved')}>Resolver y cerrar</button>
        <button className="v6-danger" type="button" disabled={busy || note.trim().length < 10} onClick={() => void review('rejected')}>Rechazar y cerrar</button>
      </div>
    </>}
    {error && <p role="alert">{error}</p>}
  </article>;
}
