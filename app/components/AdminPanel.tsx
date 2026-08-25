'use client';

import { Ban, CheckCircle2, ClipboardList, UsersRound } from 'lucide-react';
import { useEffect, useState } from 'react';
import {
  adminReviewProfessional,
  listAdminOrders,
  listPendingProfessionals,
} from '../lib/api';
import type { Order, ProfessionalProfile, Profile } from '../lib/types';
import { ORDER_STATUS_LABEL } from '../lib/types';
import { StatusPill, toneForOrder, toneForProfessional } from './StatusPill';

type Props = {
  profile: Profile;
};

export default function AdminPanel({ profile }: Props) {
  const [professionals, setProfessionals] = useState<ProfessionalProfile[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function refresh() {
    try {
      const [pending, recentOrders] = await Promise.all([
        listPendingProfessionals(),
        listAdminOrders(),
      ]);
      setProfessionals(pending);
      setOrders(recentOrders);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : 'No se cargo administracion.',
      );
    }
  }

  useEffect(() => {
    if (profile.app_role === 'admin') {
      void Promise.resolve().then(refresh);
    }
  }, [profile.app_role]);

  async function review(
    professionalId: string,
    status: 'approved' | 'rejected',
  ) {
    setLoading(true);
    setError(null);
    try {
      await adminReviewProfessional(professionalId, status);
      await refresh();
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : 'No se pudo revisar perfil.',
      );
    } finally {
      setLoading(false);
    }
  }

  if (profile.app_role !== 'admin') {
    return (
      <section className="panel" aria-labelledby="admin-denied-title">
        <p className="pill red">
          <Ban size={14} aria-hidden="true" /> Acceso protegido
        </p>
        <h1 id="admin-denied-title">Panel administrativo</h1>
        <p className="muted">
          Para habilitar este panel, un administrador debe asignar
          <code>{"profiles.app_role = 'admin'"}</code> desde SQL seguro o
          backend.
        </p>
      </section>
    );
  }

  return (
    <div className="workspace admin">
      <section className="panel" aria-labelledby="admin-title">
        <p className="pill">
          <UsersRound size={14} aria-hidden="true" /> MANITO Admin
        </p>
        <h1 id="admin-title">Revision operativa</h1>
        <p className="muted">
          Usuarios, profesionales, pedidos y reclamos comparten RLS con chequeo
          de rol desde la base.
        </p>
        {error && <p className="alert">{error}</p>}
      </section>

      <section className="panel" aria-labelledby="professionals-title">
        <div className="section-title">
          <div>
            <h2 id="professionals-title">Profesionales pendientes</h2>
            <p>Solo aprobados reciben pedidos inmediatos.</p>
          </div>
        </div>

        {professionals.length === 0 && (
          <div className="empty">No hay perfiles en revision.</div>
        )}
        {professionals.map((professional) => (
          <article
            className="task-card"
            key={professional.id}
            style={{ marginBottom: 8 }}
          >
            <StatusPill tone={toneForProfessional(professional.status)}>
              {professional.status}
            </StatusPill>
            <h3>{professional.public_name}</h3>
            <p className="muted">
              {professional.city} · {professional.years_experience || 0} anos
            </p>
            <p>{professional.bio}</p>
            <div className="field-grid two">
              <button
                className="secondary-button"
                type="button"
                disabled={loading}
                onClick={() => review(professional.id, 'approved')}
              >
                <CheckCircle2 size={17} aria-hidden="true" /> Aprobar
              </button>
              <button
                className="danger-button"
                type="button"
                disabled={loading}
                onClick={() => review(professional.id, 'rejected')}
              >
                <Ban size={17} aria-hidden="true" /> Rechazar
              </button>
            </div>
          </article>
        ))}
      </section>

      <section className="panel" aria-labelledby="admin-orders-title">
        <div className="section-title">
          <div>
            <h2 id="admin-orders-title">Pedidos recientes</h2>
            <p>Vista de soporte para intervenir cuando haga falta.</p>
          </div>
        </div>

        {orders.length === 0 && <div className="empty">Sin pedidos.</div>}
        {orders.map((order) => (
          <article className="task-card" key={order.id} style={{ marginBottom: 8 }}>
            <StatusPill tone={toneForOrder(order.status)}>
              {ORDER_STATUS_LABEL[order.status]}
            </StatusPill>
            <h3>{order.problem_description}</h3>
            <p className="muted">
              <ClipboardList size={14} aria-hidden="true" /> {order.id}
            </p>
          </article>
        ))}
      </section>
    </div>
  );
}
