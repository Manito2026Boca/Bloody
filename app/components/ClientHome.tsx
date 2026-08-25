'use client';

import {
  Bell,
  BriefcaseBusiness,
  CalendarClock,
  Clock,
  Droplets,
  MapPin,
  Search,
  Send,
  ShieldCheck,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  createOrder,
  listCategories,
  listClientOrders,
  removeChannel,
  subscribeToOrders,
} from '../lib/api';
import { classifyNeed } from '../lib/classify';
import type { Category, Order, Profile, ServiceMode } from '../lib/types';
import { ORDER_STATUS_LABEL, SERVICE_MODE_LABEL } from '../lib/types';
import ChatPanel from './ChatPanel';
import OrderTracker from './OrderTracker';
import { StatusPill, toneForOrder } from './StatusPill';

type Props = {
  profile: Profile;
  userId: string;
};

export default function ClientHome({ profile, userId }: Props) {
  const [categories, setCategories] = useState<Category[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [activeOrder, setActiveOrder] = useState<Order | null>(null);
  const [description, setDescription] = useState('Necesito un plomero.');
  const [categoryId, setCategoryId] = useState('');
  const [serviceMode, setServiceMode] = useState<ServiceMode>('immediate');
  const [addressLine, setAddressLine] = useState('Av. Constitucion 4580');
  const [city, setCity] = useState('Mar del Plata');
  const [scheduledFor, setScheduledFor] = useState('');
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const refreshOrders = useCallback(() => {
    listClientOrders(userId)
      .then((items) => {
        setOrders(items);
        setActiveOrder((current) => current ?? items[0] ?? null);
      })
      .catch((caught) =>
        setError(
          caught instanceof Error ? caught.message : 'No se cargaron pedidos.',
        ),
      );
  }, [userId]);

  useEffect(() => {
    listCategories()
      .then((items) => {
        setCategories(items);
        const defaultCategory =
          items.find((item) => item.slug === 'plomeria') ?? items[0];
        if (defaultCategory) {
          setCategoryId(defaultCategory.id);
          setServiceMode(
            defaultCategory.supports_immediate ? 'immediate' : 'scheduled',
          );
        }
      })
      .catch((caught) =>
        setError(
          caught instanceof Error
            ? caught.message
            : 'No se cargaron categorias.',
        ),
      );

    refreshOrders();
    const channel = subscribeToOrders(refreshOrders);
    return () => removeChannel(channel);
  }, [refreshOrders]);

  useEffect(() => {
    if (!navigator.geolocation) return;

    navigator.geolocation.getCurrentPosition(
      (position) =>
        setCoords({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        }),
      () => undefined,
      { enableHighAccuracy: true, timeout: 9000 },
    );
  }, []);

  const classification = useMemo(() => classifyNeed(description), [description]);
  const selectedCategory = categories.find((item) => item.id === categoryId);
  const estimatedPriceCents = selectedCategory?.base_visit_price_cents ?? null;

  async function handleCreateOrder(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!categoryId) {
      setError('Elegi una categoria antes de pedir.');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const order = await createOrder({
        userId,
        categoryId,
        serviceMode,
        description,
        addressLine,
        city,
        lat: coords?.lat ?? null,
        lng: coords?.lng ?? null,
        scheduledFor: serviceMode === 'scheduled' ? scheduledFor || null : null,
        estimatedPriceCents,
      });
      setActiveOrder(order);
      setOrders((current) => [order, ...current]);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'No se creo el pedido.');
    } finally {
      setLoading(false);
    }
  }

  function handleDescriptionChange(value: string) {
    setDescription(value);
    const suggestion = classifyNeed(value);
    const found = categories.find((item) => item.slug === suggestion.categorySlug);
    if (found) {
      setCategoryId(found.id);
      setServiceMode(suggestion.suggestedMode);
    }
  }

  return (
    <div className="workspace client">
      <section className="client-hero" aria-labelledby="client-home-title">
        <div className="section-title">
          <div>
            <span className="address-chip">
              <MapPin size={16} aria-hidden="true" />
              Casa · {addressLine}
            </span>
            <h1 id="client-home-title" className="hero-greeting">
              Hola {profile.first_name || 'Jeremias'}
            </h1>
          </div>
          <button
            className="icon-button"
            type="button"
            title="Notificaciones"
            aria-label="Notificaciones"
          >
            <Bell size={20} aria-hidden="true" />
          </button>
        </div>

        <form className="search-box" onSubmit={handleCreateOrder}>
          <div className="search-row">
            <Search size={22} aria-hidden="true" />
            <label>
              <span className="visually-hidden">Que necesitas solucionar</span>
              <textarea
                value={description}
                onChange={(event) => handleDescriptionChange(event.target.value)}
                placeholder="Que necesitas solucionar?"
                required
              />
            </label>
          </div>

          <div className="mode-tabs">
            {(['immediate', 'scheduled', 'quote'] as const).map((mode) => (
              <button
                type="button"
                key={mode}
                aria-pressed={serviceMode === mode}
                onClick={() => setServiceMode(mode)}
              >
                {mode === 'immediate' && <Clock size={15} aria-hidden="true" />}
                {mode === 'scheduled' && (
                  <CalendarClock size={15} aria-hidden="true" />
                )}
                {mode === 'quote' && (
                  <BriefcaseBusiness size={15} aria-hidden="true" />
                )}
                {SERVICE_MODE_LABEL[mode]}
              </button>
            ))}
          </div>

          <div className="field-grid two">
            <label className="field">
              <span>Direccion</span>
              <input
                className="input"
                value={addressLine}
                onChange={(event) => setAddressLine(event.target.value)}
                required
              />
            </label>
            <label className="field">
              <span>Ciudad</span>
              <input
                className="input"
                value={city}
                onChange={(event) => setCity(event.target.value)}
                required
              />
            </label>
          </div>

          {serviceMode === 'scheduled' && (
            <label className="field">
              <span>Fecha y horario</span>
              <input
                className="input"
                type="datetime-local"
                value={scheduledFor}
                onChange={(event) => setScheduledFor(event.target.value)}
                required
              />
            </label>
          )}

          <div className="field">
            <span>Categorias</span>
            <div className="category-grid">
              {categories.map((category) => (
                <button
                  className="category-button"
                  type="button"
                  key={category.id}
                  aria-pressed={category.id === categoryId}
                  onClick={() => setCategoryId(category.id)}
                >
                  <Droplets size={16} aria-hidden="true" /> {category.name}
                </button>
              ))}
            </div>
          </div>

          {classification.categoryName && (
            <p className="pill orange">
              {Math.round(classification.confidence * 100)}% match ·{' '}
              {classification.categoryName}
            </p>
          )}

          {error && <p className="alert">{error}</p>}

          <button
            className="primary-button"
            type="submit"
            disabled={loading || categories.length === 0}
          >
            <Send size={18} aria-hidden="true" />
            {loading ? 'Creando pedido...' : 'Pedir MANITO'}
          </button>
        </form>
      </section>

      <div className="workspace">
        {activeOrder ? (
          <>
            <OrderTracker
              order={activeOrder}
              userRole="client"
              onOrderChange={setActiveOrder}
            />
            <ChatPanel orderId={activeOrder.id} userId={userId} />
          </>
        ) : (
          <section className="panel">
            <p className="pill">
              <ShieldCheck size={14} aria-hidden="true" /> Flujo real
            </p>
            <h2>Tu primer pedido aparece aca</h2>
            <p className="muted">
              Cuando confirmes, se guarda en Supabase y llega al panel de
              profesionales aprobados por realtime.
            </p>
          </section>
        )}

        <section className="panel" aria-labelledby="history-title">
          <div className="section-title">
            <div>
              <h2 id="history-title">Pedidos</h2>
              <p>Historial asociado a tu usuario.</p>
            </div>
          </div>
          {orders.length === 0 && <div className="empty">Sin pedidos aun.</div>}
          {orders.map((order) => (
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
              <span className="muted">{order.address_line}</span>
            </button>
          ))}
        </section>
      </div>
    </div>
  );
}
