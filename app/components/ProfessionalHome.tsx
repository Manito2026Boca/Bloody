'use client';

import {
  Check,
  Clock,
  Handshake,
  MapPin,
  ShieldAlert,
  Star,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import {
  acceptOrder,
  getProfessionalProfile,
  listAssignedOrders,
  listCategories,
  listOpenOrders,
  removeChannel,
  setProfessionalAvailability,
  submitProfessionalProfile,
  subscribeToOrders,
} from '../lib/api';
import type { Category, Order, ProfessionalProfile, Profile } from '../lib/types';
import { ORDER_STATUS_LABEL } from '../lib/types';
import ChatPanel from './ChatPanel';
import OrderTracker from './OrderTracker';
import { StatusPill, toneForOrder, toneForProfessional } from './StatusPill';

type Props = {
  profile: Profile;
  userId: string;
};

export default function ProfessionalHome({ profile, userId }: Props) {
  const [categories, setCategories] = useState<Category[]>([]);
  const [professional, setProfessional] = useState<ProfessionalProfile | null>(
    null,
  );
  const [openOrders, setOpenOrders] = useState<Order[]>([]);
  const [assignedOrders, setAssignedOrders] = useState<Order[]>([]);
  const [activeOrder, setActiveOrder] = useState<Order | null>(null);
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [bio, setBio] = useState('Trabajo prolijo, puntual y con garantia.');
  const [city, setCity] = useState('Mar del Plata');
  const [radiusKm, setRadiusKm] = useState(12);
  const [yearsExperience, setYearsExperience] = useState(5);
  const [visitPrice, setVisitPrice] = useState(8000);
  const [priceFrom, setPriceFrom] = useState(18500);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const publicName =
    `${profile.first_name} ${profile.last_name}`.trim() || 'Profesional MANITO';

  const refresh = useCallback(() => {
    Promise.all([
      getProfessionalProfile(userId),
      listOpenOrders(),
      listAssignedOrders(userId),
    ])
      .then(([pro, open, assigned]) => {
        setProfessional(pro);
        setOpenOrders(open);
        setAssignedOrders(assigned);
        setActiveOrder((current) => current ?? assigned[0] ?? null);
      })
      .catch((caught) =>
        setError(
          caught instanceof Error
            ? caught.message
            : 'No se cargo el panel profesional.',
        ),
      );
  }, [userId]);

  useEffect(() => {
    listCategories()
      .then((items) => {
        setCategories(items);
        setSelectedCategories((current) =>
          current.length ? current : items.slice(0, 1).map((item) => item.id),
        );
      })
      .catch((caught) =>
        setError(
          caught instanceof Error
            ? caught.message
            : 'No se cargaron categorias.',
        ),
      );

    refresh();
    const channel = subscribeToOrders(refresh);
    return () => removeChannel(channel);
  }, [refresh]);

  function toggleCategory(categoryId: string) {
    setSelectedCategories((current) =>
      current.includes(categoryId)
        ? current.filter((item) => item !== categoryId)
        : [...current, categoryId],
    );
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const updated = await submitProfessionalProfile({
        publicName,
        bio,
        yearsExperience,
        city,
        radiusKm,
        categoryIds: selectedCategories,
        priceFromCents: priceFrom * 100,
        visitPriceCents: visitPrice * 100,
      });
      setProfessional(updated);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : 'No se envio la postulacion.',
      );
    } finally {
      setLoading(false);
    }
  }

  async function handleAvailability() {
    if (!professional) return;
    setLoading(true);
    setError(null);
    try {
      const updated = await setProfessionalAvailability(
        !professional.is_available,
      );
      setProfessional(updated);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : 'No se pudo cambiar disponibilidad.',
      );
    } finally {
      setLoading(false);
    }
  }

  async function handleAccept(orderId: string) {
    setLoading(true);
    setError(null);
    try {
      const order = await acceptOrder(orderId);
      setActiveOrder(order);
      refresh();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : 'El pedido fue tomado por otro profesional.',
      );
      refresh();
    } finally {
      setLoading(false);
    }
  }

  if (!professional || professional.status !== 'approved') {
    return (
      <div className="workspace pro">
        <section className="panel" aria-labelledby="onboarding-title">
          <div className="section-title">
            <div>
              <h1 id="onboarding-title">Alta profesional</h1>
              <p>
                MANITO revisa el perfil antes de habilitar pedidos inmediatos.
              </p>
            </div>
            {professional && (
              <StatusPill tone={toneForProfessional(professional.status)}>
                {professional.status}
              </StatusPill>
            )}
          </div>

          <form className="field-grid" onSubmit={handleSubmit}>
            <label className="field">
              <span>Nombre publico</span>
              <input className="input" value={publicName} disabled />
            </label>
            <label className="field">
              <span>Descripcion profesional</span>
              <textarea
                className="input"
                value={bio}
                onChange={(event) => setBio(event.target.value)}
                required
              />
            </label>
            <div className="field-grid two">
              <label className="field">
                <span>Ciudad</span>
                <input
                  className="input"
                  value={city}
                  onChange={(event) => setCity(event.target.value)}
                  required
                />
              </label>
              <label className="field">
                <span>Radio km</span>
                <input
                  className="input"
                  type="number"
                  min={1}
                  value={radiusKm}
                  onChange={(event) => setRadiusKm(Number(event.target.value))}
                  required
                />
              </label>
              <label className="field">
                <span>Anos de experiencia</span>
                <input
                  className="input"
                  type="number"
                  min={0}
                  value={yearsExperience}
                  onChange={(event) =>
                    setYearsExperience(Number(event.target.value))
                  }
                  required
                />
              </label>
              <label className="field">
                <span>Visita ARS</span>
                <input
                  className="input"
                  type="number"
                  min={0}
                  value={visitPrice}
                  onChange={(event) => setVisitPrice(Number(event.target.value))}
                  required
                />
              </label>
              <label className="field">
                <span>Precio desde ARS</span>
                <input
                  className="input"
                  type="number"
                  min={0}
                  value={priceFrom}
                  onChange={(event) => setPriceFrom(Number(event.target.value))}
                  required
                />
              </label>
            </div>

            <div className="field">
              <span>Servicios</span>
              <div className="category-grid">
                {categories.map((category) => (
                  <button
                    className="category-button"
                    type="button"
                    key={category.id}
                    aria-pressed={selectedCategories.includes(category.id)}
                    onClick={() => toggleCategory(category.id)}
                  >
                    {category.name}
                  </button>
                ))}
              </div>
            </div>

            {error && <p className="alert">{error}</p>}

            <button className="secondary-button" type="submit" disabled={loading}>
              <ShieldAlert size={18} aria-hidden="true" />
              {loading ? 'Enviando...' : 'Enviar a revision MANITO'}
            </button>
          </form>
        </section>

        <section className="panel">
          <p className="pill orange">Documentacion</p>
          <h2>Validacion pendiente</h2>
          <p className="muted">
            La migracion crea buckets privados para DNI, matriculas, seguros y
            certificaciones. En este MVP, el admin aprueba desde el panel.
          </p>
        </section>
      </div>
    );
  }

  return (
    <div className="workspace pro">
      <section className="panel" aria-labelledby="pro-home-title">
        <div className="availability">
          <div>
            <h1 id="pro-home-title">MANITO PRO</h1>
            <p className="muted">{professional.public_name}</p>
          </div>
          <button
            className="switch"
            type="button"
            aria-label="Disponibilidad"
            aria-pressed={professional.is_available}
            onClick={handleAvailability}
            disabled={loading}
          />
        </div>

        <div className="metrics" style={{ marginTop: 16 }}>
          <div className="metric">
            <strong>{assignedOrders.length}</strong>
            <span className="muted">trabajos</span>
          </div>
          <div className="metric">
            <strong>${assignedOrders.length * 18500}</strong>
            <span className="muted">ingresos</span>
          </div>
          <div className="metric">
            <strong>{professional.rating_avg.toFixed(1)}</strong>
            <span className="muted">rating</span>
          </div>
        </div>

        <p className="pill" style={{ marginTop: 14 }}>
          <Star size={14} aria-hidden="true" />
          {professional.manito_pro ? 'MANITO PRO' : 'Camino a MANITO PRO'}
        </p>
      </section>

      <section className="panel" aria-labelledby="near-orders-title">
        <div className="section-title">
          <div>
            <h2 id="near-orders-title">Pedidos cerca tuyo</h2>
            <p>Solo ves pedidos compatibles con tus servicios y RLS.</p>
          </div>
        </div>

        {error && <p className="alert">{error}</p>}
        {openOrders.length === 0 && (
          <div className="empty">No hay pedidos inmediatos disponibles.</div>
        )}
        {openOrders.map((order) => (
          <article className="task-card" key={order.id} style={{ marginBottom: 8 }}>
            <p className="pill orange">
              <MapPin size={14} aria-hidden="true" /> {order.city || 'Zona'} ·
              match por categoria
            </p>
            <h3>{order.problem_description}</h3>
            <p className="muted">{order.address_line}</p>
            <p>
              Precio estimado:{' '}
              <strong>
                {order.estimated_price_cents
                  ? `$${Math.round(order.estimated_price_cents / 100)}`
                  : 'a definir'}
              </strong>
            </p>
            <div className="field-grid two">
              <button
                className="danger-button"
                type="button"
                disabled={loading}
              >
                <X size={17} aria-hidden="true" /> Rechazar
              </button>
              <button
                className="secondary-button"
                type="button"
                onClick={() => handleAccept(order.id)}
                disabled={loading}
              >
                <Check size={17} aria-hidden="true" /> Aceptar
              </button>
            </div>
          </article>
        ))}
      </section>

      <section className="panel" aria-labelledby="active-jobs-title">
        <div className="section-title">
          <div>
            <h2 id="active-jobs-title">Trabajos activos</h2>
            <p>Estado y chat del pedido adjudicado.</p>
          </div>
        </div>
        {assignedOrders.length === 0 && (
          <div className="empty">Todavia no aceptaste trabajos.</div>
        )}
        {assignedOrders.map((order) => (
          <button
            className="task-card"
            type="button"
            key={order.id}
            onClick={() => setActiveOrder(order)}
            style={{ width: '100%', textAlign: 'left', marginBottom: 8 }}
          >
            <StatusPill tone={toneForOrder(order.status)}>
              {ORDER_STATUS_LABEL[order.status]}
            </StatusPill>
            <strong style={{ display: 'block', marginTop: 8 }}>
              {order.problem_description}
            </strong>
            <span className="muted">
              <Clock size={14} aria-hidden="true" /> {order.address_line}
            </span>
          </button>
        ))}
      </section>

      {activeOrder && (
        <>
          <OrderTracker
            order={activeOrder}
            userRole="professional"
            onOrderChange={setActiveOrder}
          />
          <ChatPanel orderId={activeOrder.id} userId={userId} />
        </>
      )}

      <section className="panel">
        <p className="pill">
          <Handshake size={14} aria-hidden="true" /> Reputacion
        </p>
        <p className="muted">
          El matching considera distancia, rating, trabajos, aceptacion,
          cancelaciones, puntualidad, favoritos y nivel MANITO PRO.
        </p>
      </section>
    </div>
  );
}
