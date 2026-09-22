import { Camera, CheckCircle2, CreditCard, ShieldCheck, Star } from 'lucide-react';
import { approvedExtrasTotal, orderServiceTotal } from '../lib/economics';
import type { V6Order, V6OrderExtra, V6OrderPhoto, V6Payment, V6Rating } from '../lib/v6Types';

const money = (value: number | null) => value == null
  ? 'Importe no disponible'
  : new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(value);

function paymentState(payments: V6Payment[]) {
  const latest = payments[0];
  if (!latest) return 'Todavia no se informo un pago';
  if (latest.status === 'confirmed' || latest.status === 'approved') return 'Pago confirmado';
  if (latest.status === 'reported') return 'Pago informado, esperando confirmacion';
  if (latest.status === 'disputed' || latest.status === 'rejected') return 'Pago en revision';
  return 'Pago pendiente';
}

export function ClosureCheckpoint({
  order,
  extras,
  photos,
}: {
  order: V6Order;
  extras: V6OrderExtra[];
  photos: V6OrderPhoto[];
}) {
  const approved = extras.filter((extra) => extra.status === 'approved');
  const total = orderServiceTotal(order, approved);
  const afterEvidence = photos.filter((photo) => photo.stage === 'after').length;
  const evidenceRequired = Boolean(order.service?.requires_completion_evidence);

  return (
    <section className="v6-closure-checkpoint" aria-label="Revision antes de finalizar">
      <div className="v6-section-head compact">
        <div><small>ANTES DE FINALIZAR</small><h2>Revisen el cierre del trabajo</h2></div>
        <ShieldCheck size={19} aria-hidden="true" />
      </div>
      <p>{order.agreed_scope || 'El alcance acordado se conserva en la ficha del acuerdo.'}</p>
      <dl className="v6-closure-values">
        <div><dt>Precio acordado</dt><dd>{money(order.agreed_price ?? null)}</dd></div>
        <div><dt>Adicionales aprobados</dt><dd>{approved.length ? `${approved.length} · ${money(approvedExtrasTotal(approved))}` : 'Sin adicionales'}</dd></div>
        <div className="total"><dt>Total del servicio</dt><dd>{money(total)}</dd></div>
        <div><dt>Evidencia final</dt><dd>{afterEvidence ? `${afterEvidence} archivo${afterEvidence === 1 ? '' : 's'}` : evidenceRequired ? 'Falta cargar' : 'Opcional'}</dd></div>
      </dl>
      <p className="v6-closure-note">El PIN final confirma que el trabajo termino. El pago se registra por separado.</p>
    </section>
  );
}

export function CompletedWorkSummary({
  order,
  extras,
  photos,
  payments,
  rating,
  counterpart,
}: {
  order: V6Order;
  extras: V6OrderExtra[];
  photos: V6OrderPhoto[];
  payments: V6Payment[];
  rating: V6Rating | null;
  counterpart: string;
}) {
  const approved = extras.filter((extra) => extra.status === 'approved');
  const total = orderServiceTotal(order, approved);
  const before = photos.filter((photo) => photo.stage === 'before').length;
  const during = photos.filter((photo) => photo.stage === 'during').length;
  const after = photos.filter((photo) => photo.stage === 'after').length;

  return (
    <section className="v6-closure-summary" aria-label="Constancia final del trabajo">
      <header>
        <span><CheckCircle2 size={18} aria-hidden="true" /> TRABAJO FINALIZADO</span>
        <strong>Constancia MANITO</strong>
        <p>El acuerdo, los cambios aprobados y el historial quedan asociados a este pedido.</p>
      </header>
      <dl className="v6-closure-values final">
        <div><dt>Servicio</dt><dd>{order.service?.name || 'Servicio MANITO'}</dd></div>
        <div><dt>Con</dt><dd>{counterpart}</dd></div>
        <div className="wide"><dt>Alcance acordado</dt><dd>{order.agreed_scope || 'Sin alcance historico detallado'}</dd></div>
        <div><dt>Precio acordado</dt><dd>{money(order.agreed_price ?? null)}</dd></div>
        <div><dt>Adicionales aprobados</dt><dd>{approved.length ? `${approved.length} · ${money(approvedExtrasTotal(approved))}` : 'Sin adicionales'}</dd></div>
        <div className="total"><dt>Total del servicio</dt><dd>{money(total)}</dd></div>
        <div><dt>Finalizacion</dt><dd>PIN final validado</dd></div>
        <div><dt>Evidencia</dt><dd>{before} antes · {during} durante · {after} final</dd></div>
        <div><dt><CreditCard size={14} aria-hidden="true" /> Pago</dt><dd>{paymentState(payments)}</dd></div>
        <div><dt><Star size={14} aria-hidden="true" /> Calificacion</dt><dd>{rating ? `${rating.stars} estrellas` : 'Pendiente'}</dd></div>
      </dl>
      <p className="v6-closure-note"><Camera size={15} aria-hidden="true" /> La evidencia y el Workroom quedan disponibles como historial.</p>
    </section>
  );
}
