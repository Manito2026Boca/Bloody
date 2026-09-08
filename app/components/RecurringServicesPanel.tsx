'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowRight, Pause, Play, Pencil, Save, X, RefreshCw } from 'lucide-react';
import { createV6RecurringServicePlan, listV6PublicProfessionals } from '../lib/v6Api';
import { changeRecurringPlanStatus, listRecurringPlans, updateRecurringPlan, listAdminRecurringPlans, type AdminRecurringPlan } from '../lib/v6RecurringApi';
import type { V6Order, V6PublicProfessional, V6RecurringServicePlan } from '../lib/v6Types';
import styles from './RecurringServicesPanel.module.css';

const frequencies = { weekly: 'Cada semana', biweekly: 'Cada 2 semanas', monthly: 'Cada mes' };
const states = { active: 'Activo', paused: 'Pausado', cancelled: 'Cancelado' };
const dateLabel = (date: string | null) => date ? new Date(date).toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires', dateStyle: 'medium', timeStyle: 'short' }) : 'Sin fecha';

export function RecurringAdminPanel() {
  const [plans, setPlans] = useState<AdminRecurringPlan[]>([]);
  const [error, setError] = useState('');
  useEffect(() => {
    let alive = true;
    listAdminRecurringPlans().then(value => { if (alive) setPlans(value); })
      .catch(caught => { if (alive) setError(caught.message); });
    return () => { alive = false; };
  }, []);
  return <section className={styles.panel}>
    <h2>Servicios recurrentes · revisión</h2>
    {error && <p role="alert">{error}</p>}
    {!error && plans.length === 0 && <p>Sin planes registrados.</p>}
    <div className={styles.list}>{plans.map(plan => <article className={styles.plan} key={plan.id}>
      <strong>{plan.service_name} · {plan.client_name}</strong>
      <p>{states[plan.status]} · Próxima solicitud: {dateLabel(plan.next_scheduled_at)}</p>
      <p>Último pedido: {plan.latest_order_id || 'Sin pedido'}</p>
      {plan.generation_error && <p role="alert">{plan.generation_error}</p>}
    </article>)}</div>
  </section>;
}

export function RecurringServicesPanel({ clientOrders, onOrders, onClose }: {
  clientOrders: V6Order[]; onOrders: () => void; onClose: () => void;
}) {
  const root = useRef<HTMLElement>(null);
  const [plans, setPlans] = useState<V6RecurringServicePlan[]>([]);
  const [professionals, setProfessionals] = useState<V6PublicProfessional[]>([]);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const [confirmCancel, setConfirmCancel] = useState<string | null>(null);
  const [source, setSource] = useState('');
  const [frequency, setFrequency] = useState<V6RecurringServicePlan['frequency']>('weekly');
  const reload = useCallback(async () => setPlans(await listRecurringPlans()), []);
  useEffect(() => {
    root.current?.scrollIntoView({ block: 'start', behavior: 'smooth' });
    let alive = true;
    listRecurringPlans().then(value => { if (alive) setPlans(value); })
      .catch(error => { if (alive) setMessage(error.message); })
      .finally(() => { if (alive) setLoading(false); });
    listV6PublicProfessionals().then(value => { if (alive) setProfessionals(value); }).catch(() => undefined);
    return () => { alive = false; };
  }, []);
  async function run(action: () => Promise<unknown>, success: string) {
    if (busy) return;
    setBusy(true); setMessage('');
    try { await action(); setMessage(success); setEditing(null); setConfirmCancel(null); await reload(); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'No pudimos actualizar el plan.'); }
    finally { setBusy(false); }
  }
  const sources = clientOrders.filter(o => o.mode === 'scheduled' &&
    !['cancelled', 'matching_failed'].includes(o.status) && o.service?.supports_recurring &&
    !plans.some(p => p.source_order_id === o.id));
  return <section ref={root} className={styles.panel} aria-labelledby="recurring-heading">
    <header className={styles.header}>
      <h2 id="recurring-heading">Mis servicios recurrentes</h2>
      <button type="button" title="Cerrar" aria-label="Cerrar servicios recurrentes" onClick={onClose}><X size={20} /></button>
    </header>
    {message && <p role="status">{message}</p>}
    {loading ? <p>Cargando servicios...</p> : plans.length === 0 && <p>No tenés servicios recurrentes.</p>}
    <button type="button" disabled={busy} title="Actualizar" onClick={() => run(reload, '')}><RefreshCw size={16} /> Actualizar</button>
    {sources.length > 0 && <form className={styles.form} onSubmit={event => {
      event.preventDefault();
      if (source) void run(() => createV6RecurringServicePlan({ sourceOrderId: source, frequency }),
        'Plan creado. Cada visita necesita aceptación profesional; no se cobra automáticamente.');
    }}>
      <label>Repetir un servicio<select required value={source} onChange={e => setSource(e.target.value)}>
        <option value="">Elegí un pedido programado</option>
        {sources.map(o => <option key={o.id} value={o.id}>{o.service?.name} · {dateLabel(o.scheduled_at)}</option>)}
      </select></label>
      <label>Frecuencia<select value={frequency} onChange={e => setFrequency(e.target.value as typeof frequency)}>
        {Object.entries(frequencies).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
      </select></label>
      <button disabled={busy || !source} type="submit"><RefreshCw size={16} /> Crear plan</button>
    </form>}
    <div className={styles.list}>{plans.map(plan => <article className={styles.plan} key={plan.id}>
      <header className={styles.header}><h3>{plan.service_name}</h3><span>{states[plan.status]}</span></header>
      <p>{frequencies[plan.frequency]} · {plan.preferred_professional_name || (plan.preferred_professional_id ? 'Profesional no disponible' : 'Sin preferido')}</p>
      <p>{plan.address}</p>
      {plan.status !== 'cancelled' && <p>Próxima solicitud: {dateLabel(plan.next_scheduled_at)}</p>}
      {plan.generation_error && <p role="alert">No se pudo generar la visita. Revisá los datos del plan.</p>}
      {plan.latest_order && <button type="button" onClick={onOrders}>
        <ArrowRight size={16} /> Ver pedido · {dateLabel(plan.latest_order.scheduled_at)}
      </button>}
      {plan.latest_order && !['completed', 'cancelled'].includes(plan.latest_order.status) &&
        <p>La visita ya creada sigue vigente aunque pauses o canceles el plan.</p>}
      {plan.status !== 'cancelled' && <div className={styles.actions}>
        <button type="button" disabled={busy} onClick={() => run(() => changeRecurringPlanStatus(plan.id, plan.status === 'active' ? 'pause' : 'resume'),
          plan.status === 'active' ? 'Plan pausado. Los pedidos ya creados siguen vigentes.' : 'Plan reanudado sin visitas atrasadas.')}>
          {plan.status === 'active' ? <Pause size={16} /> : <Play size={16} />}{plan.status === 'active' ? 'Pausar' : 'Reanudar'}
        </button>
        <button type="button" disabled={busy} onClick={() => setEditing(editing === plan.id ? null : plan.id)}><Pencil size={16} /> Editar</button>
        <button type="button" disabled={busy} onClick={() => setConfirmCancel(plan.id)}><X size={16} /> Cancelar</button>
      </div>}
      {confirmCancel === plan.id && <div role="group" aria-label="Confirmar cancelación">
        <p>¿Cancelar el plan? Los pedidos ya creados no se cancelan.</p>
        <button type="button" disabled={busy} onClick={() => run(() => changeRecurringPlanStatus(plan.id, 'cancel'), 'Plan cancelado. Conservamos los pedidos y el historial.')}>Confirmar cancelación</button>
        <button type="button" onClick={() => setConfirmCancel(null)}>Volver</button>
      </div>}
      {editing === plan.id && <form className={styles.form} onSubmit={event => {
        event.preventDefault(); const data = new FormData(event.currentTarget);
        const preferred = String(data.get('preferred') || '');
        const date = String(data.get('date') || '');
        const address = String(data.get('address'));
        void run(() => updateRecurringPlan(plan.id, {
          frequency: data.get('frequency') as V6RecurringServicePlan['frequency'],
          description: String(data.get('description')), address,
          estimated_duration_minutes: Number(data.get('duration')),
          ...(preferred !== (plan.preferred_professional_id || '') ? { preferred_professional_id: preferred || null } : {}),
          ...(address !== plan.address ? { client_lat: null, client_lng: null } : {}),
          ...(date ? { scheduled_at: new Date(date + ':00-03:00').toISOString() } : {}),
        }), 'Plan actualizado. Los pedidos ya creados no cambiaron.');
      }}>
        <label>Frecuencia<select name="frequency" defaultValue={plan.frequency}>{Object.entries(frequencies).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label>
        <label>Nuevo día y horario (Argentina)<input name="date" type="datetime-local" /></label>
        <label>Duración estimada (minutos)<input name="duration" type="number" min="1" max="1440" required defaultValue={plan.estimated_duration_minutes} /></label>
        <label>Descripción<textarea name="description" required minLength={2} defaultValue={plan.description} /></label>
        <label>Dirección y ciudad<input name="address" required minLength={2} defaultValue={plan.address} /></label>
        <label>Profesional preferido<select name="preferred" defaultValue={plan.preferred_professional_id || ''}>
          <option value="">Sin preferido</option>
          {plan.preferred_professional_id && !professionals.some(p => p.profile.id === plan.preferred_professional_id) &&
            <option value={plan.preferred_professional_id}>{plan.preferred_professional_name || 'Preferido actual no disponible'}</option>}
          {professionals.filter(p => p.services.some(s => s.service_id === plan.service_id)).map(p => <option key={p.profile.id} value={p.profile.id}>{p.profile.full_name}</option>)}
        </select></label>
        <button disabled={busy} type="submit"><Save size={16} /> Guardar cambios futuros</button>
      </form>}
    </article>)}</div>
  </section>;
}
