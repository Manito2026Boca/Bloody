'use client';

import { CheckCircle2, MapPin, Navigation, Star, Wrench } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import {
  advanceOrder,
  getProfessionalProfile,
  removeChannel,
  subscribeToOrder,
} from '../lib/api';
import { statusOrder } from '../lib/categories';
import type {
  Order,
  OrderStatus,
  ProfessionalProfile,
  WorkspaceRole,
} from '../lib/types';
import { ORDER_STATUS_LABEL } from '../lib/types';
import { StatusPill, toneForOrder } from './StatusPill';

type Props = {
  order: Order;
  userRole: WorkspaceRole;
  onOrderChange: (order: Order) => void;
};

const proNext: Partial<Record<OrderStatus, OrderStatus>> = {
  confirmed: 'professional_en_route',
  professional_en_route: 'professional_arrived',
  professional_arrived: 'work_started',
  work_started: 'completed',
};

export default function OrderTracker({ order, userRole, onOrderChange }: Props) {
  const [professional, setProfessional] = useState<ProfessionalProfile | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [loadingStatus, setLoadingStatus] = useState(false);

  useEffect(() => {
    const channel = subscribeToOrder(order.id, onOrderChange);
    return () => removeChannel(channel);
  }, [order.id, onOrderChange]);

  useEffect(() => {
    if (!order.assigned_professional_id) {
      void Promise.resolve().then(() => setProfessional(null));
      return;
    }

    getProfessionalProfile(order.assigned_professional_id)
      .then(setProfessional)
      .catch(() => setProfessional(null));
  }, [order.assigned_professional_id]);

  const activeIndex = useMemo(
    () =>
      Math.max(0, (statusOrder as readonly OrderStatus[]).indexOf(order.status)),
    [order.status],
  );
  const nextStatus = proNext[order.status];

  async function handleAdvance() {
    if (!nextStatus) return;

    setLoadingStatus(true);
    setError(null);
    try {
      const updated = await advanceOrder(order.id, nextStatus);
      onOrderChange(updated);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : 'No se pudo avanzar el pedido.',
      );
    } finally {
      setLoadingStatus(false);
    }
  }

  return (
    <section className="panel" aria-labelledby="tracking-title">
      <div className="section-title">
        <div>
          <h2 id="tracking-title">
            {professional
              ? `${professional.public_name} acepto tu pedido`
              : 'Seguimiento'}
          </h2>
          <p>
            {order.status === 'searching_professional'
              ? 'Buscando profesional disponible cerca tuyo.'
              : 'El estado cambia en tiempo real sin refrescar.'}
          </p>
        </div>
        <StatusPill tone={toneForOrder(order.status)}>
          {ORDER_STATUS_LABEL[order.status]}
        </StatusPill>
      </div>

      <div className="map-preview" aria-label="Mapa de seguimiento">
        <span className="map-pin" title="Ubicacion cliente">
          <MapPin size={18} aria-hidden="true" />
        </span>
        {order.assigned_professional_id && (
          <span className="map-pro" title="Profesional">
            <Navigation size={18} aria-hidden="true" />
          </span>
        )}
      </div>

      {professional && (
        <div className="surface" style={{ marginTop: 12 }}>
          <p className="pill">
            <Star size={14} aria-hidden="true" />
            {professional.rating_avg.toFixed(1)} · {professional.jobs_completed}{' '}
            trabajos
          </p>
          <h3 style={{ margin: '10px 0 4px' }}>{professional.public_name}</h3>
          <p className="muted">{professional.bio || 'Profesional verificado'}</p>
          <p className="muted">Llega aproximadamente en 8-15 minutos.</p>
        </div>
      )}

      <div style={{ marginTop: 12 }}>
        {statusOrder.map((status, index) => (
          <div className="order-state" key={status}>
            <span
              className={index <= activeIndex ? 'dot done' : 'dot'}
              aria-hidden="true"
            />
            <div>
              <strong>{ORDER_STATUS_LABEL[status]}</strong>
              {status === order.status && <p className="muted">Estado actual</p>}
            </div>
          </div>
        ))}
      </div>

      {userRole === 'professional' && nextStatus && (
        <button
          className="secondary-button"
          style={{ marginTop: 12 }}
          onClick={handleAdvance}
          disabled={loadingStatus}
        >
          <Wrench size={18} aria-hidden="true" />
          {loadingStatus ? 'Actualizando...' : `Marcar: ${ORDER_STATUS_LABEL[nextStatus]}`}
        </button>
      )}

      {userRole === 'client' && order.status === 'completed' && (
        <div className="surface" style={{ marginTop: 12 }}>
          <p className="pill">
            <CheckCircle2 size={14} aria-hidden="true" /> Listo para calificar
          </p>
          <p className="muted">
            La tabla de reviews y sus policies ya estan listas para guardar la
            calificacion del cliente.
          </p>
        </div>
      )}

      {error && <p className="alert">{error}</p>}
    </section>
  );
}
