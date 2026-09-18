import type { V6Order, V6OrderExtra, V6OrderProposal } from '../lib/v6Types';
import { approvedExtrasTotal, orderEconomicPresentation } from '../lib/economics';

function amount(value: number | null | undefined, fallback = 'A definir') {
  if (value == null) return fallback;
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    maximumFractionDigits: 0,
  }).format(value);
}

function dateTime(value?: string | null) {
  if (!value) return 'Lo antes posible';
  return new Intl.DateTimeFormat('es-AR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

function snapshotText(snapshot: Record<string, unknown> | null | undefined, key: string) {
  const value = snapshot?.[key];
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function snapshotMaterialAmount(snapshot: Record<string, unknown> | null | undefined) {
  const components = snapshot?.components;
  if (!Array.isArray(components)) return null;
  const material = components.find((component) => {
    if (!component || typeof component !== 'object') return false;
    return (component as Record<string, unknown>).type === 'materials';
  });
  if (!material || typeof material !== 'object') return null;
  const value = Number((material as Record<string, unknown>).amount);
  return Number.isFinite(value) ? value : null;
}

function materialsText(order: V6Order, acceptedProposal?: V6OrderProposal | null) {
  const snapshotAmount = snapshotMaterialAmount(order.contract_snapshot);
  const materialAmount = acceptedProposal ? Number(acceptedProposal.materials_price) : snapshotAmount;
  if (materialAmount != null && materialAmount > 0) return `Incluidos · ${amount(materialAmount)}`;

  const scopeText = `${acceptedProposal?.observation || ''} ${order.agreed_scope || ''}`.toLowerCase();
  if (scopeText.includes('no incluye materiales') || scopeText.includes('materiales no incluidos')) {
    return 'No incluidos';
  }
  return 'Sin definir en el acuerdo';
}

function componentAmount(value: number | null | undefined) {
  return value != null && value > 0 ? amount(value) : 'Sin importe indicado';
}

export function AgreementSummary({
  order,
  extras = [],
  acceptedProposal = null,
}: {
  order: V6Order;
  extras?: V6OrderExtra[];
  acceptedProposal?: V6OrderProposal | null;
}) {
  const presentation = orderEconomicPresentation(order);
  const approvedExtras = extras.filter((extra) => extra.status === 'approved');
  const extrasTotal = approvedExtrasTotal(approvedExtras);
  const scope = presentation.kind === 'agreement'
    ? order.agreed_scope || snapshotText(order.contract_snapshot, 'agreed_scope')
    : order.description;
  const exclusions = snapshotText(order.contract_snapshot, 'exclusions');
  const agreedTotal = presentation.amount == null ? null : Number(presentation.amount) + extrasTotal;

  return (
    <section className={`v6-agreement-card ${presentation.kind}`} aria-label={presentation.kind === 'agreement' ? 'Acuerdo confirmado' : 'Estimación'}>
      <header className="v6-agreement-head">
        <div>
          <span className={`v6-agreement-state ${presentation.kind}`}>
            {presentation.kind === 'agreement' ? 'ACUERDO CONFIRMADO' : 'ESTIMACIÓN'}
          </span>
          <strong>{presentation.kind === 'agreement' ? 'Lo acordado para este trabajo' : 'Referencia antes de contratar'}</strong>
        </div>
        <b>{amount(presentation.amount, presentation.kind === 'agreement' ? 'Importe no disponible' : 'A definir')}</b>
      </header>

      <p className="v6-agreement-explainer">
        {presentation.kind === 'agreement'
          ? 'Este alcance y precio quedaron congelados al contratar.'
          : 'Es orientativa. Todavía no es un precio acordado ni genera una contratación.'}
      </p>

      <dl className="v6-agreement-grid">
        <div className="wide"><dt>{presentation.kind === 'agreement' ? 'Alcance acordado' : 'Necesidad publicada'}</dt><dd>{scope || 'Sin alcance registrado'}</dd></div>
        {presentation.kind === 'agreement' && <div className="wide"><dt>Exclusiones</dt><dd>{exclusions || 'No se registraron por separado.'}</dd></div>}
        <div><dt>Lugar</dt><dd>{order.address || 'A confirmar'}</dd></div>
        <div><dt>Fecha y horario</dt><dd>{dateTime(order.scheduled_at)}</dd></div>
        <div><dt>Materiales</dt><dd>{presentation.kind === 'agreement' ? materialsText(order, acceptedProposal) : 'Sin definir antes de contratar'}</dd></div>
        <div><dt>{presentation.kind === 'agreement' ? 'Precio acordado' : 'Importe estimado'}</dt><dd>{amount(presentation.amount)}</dd></div>
      </dl>

      {presentation.kind === 'agreement' && acceptedProposal && (
        <div className="v6-agreement-components" aria-label="Componentes del presupuesto aceptado">
          <span><small>Mano de obra</small><b>{componentAmount(acceptedProposal.labor_price)}</b></span>
          <span><small>Visita</small><b>{componentAmount(acceptedProposal.visit_price)}</b></span>
          <span><small>Otros conceptos</small><b>{componentAmount(acceptedProposal.manito_fee)}</b></span>
        </div>
      )}

      {presentation.kind === 'agreement' && (
        <div className="v6-agreement-modifications">
          <div>
            <span className="v6-agreement-state modifications">MODIFICACIONES APROBADAS</span>
            {approvedExtras.length ? (
              <ul>{approvedExtras.map((extra) => <li key={extra.id}><span>{extra.title}</span><b>{amount(extra.amount)}</b></li>)}</ul>
            ) : (
              <p>Sin adicionales aprobados.</p>
            )}
          </div>
          <div className="v6-agreement-total">
            <span>Total resultante</span>
            <strong>{amount(agreedTotal, 'Importe no disponible')}</strong>
          </div>
        </div>
      )}
    </section>
  );
}
